import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus, ResourceStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginated } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateAllocationDto, ListAllocationsDto, ReleaseAllocationDto } from './dto/allocation.dto';

const ALLOCATION_INCLUDE = {
  resource: { select: { id: true, serverName: true, hasGpu: true, status: true } },
  request: {
    select: {
      id: true,
      status: true,
      subjectCode: true,
      reqCpu: true,
      reqRamGb: true,
      reqStorageGb: true,
      studentId: true,
      student: { select: { id: true, fullName: true, studentCode: true } },
    },
  },
} satisfies Prisma.AllocationInclude;

@Injectable()
export class AllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListAllocationsDto, actor: AuthUser) {
    const where: Prisma.AllocationWhereInput = {
      ...(actor.role === UserRole.ADMIN ? {} : { request: { studentId: actor.id } }),
      ...(dto.active === true ? { releasedAt: null } : {}),
      ...(dto.active === false ? { releasedAt: { not: null } } : {}),
      ...(dto.resourceId ? { resourceId: dto.resourceId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.allocation.findMany({
        where,
        include: ALLOCATION_INCLUDE,
        orderBy: { id: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.allocation.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  async findOne(id: number, actor: AuthUser) {
    const alloc = await this.prisma.allocation.findFirst({
      where: {
        id,
        ...(actor.role === UserRole.ADMIN ? {} : { request: { studentId: actor.id } }),
      },
      include: ALLOCATION_INCLUDE,
    });
    if (!alloc) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบการจัดสรร id ${id}` });
    return alloc;
  }

  /**
   * จัดสรรเครื่องให้คำขอที่อนุมัติแล้ว
   *
   * ทุกอย่างอยู่ใน transaction เดียว: ตรวจ → อัปเดตคำขอ → สร้าง allocation → เขียน log
   * ถ้าขั้นไหนพัง ทั้งชุดย้อนกลับหมด — จะไม่มีคำขอที่ ALLOCATED โดยไม่มีเครื่องจริง
   */
  async create(dto: CreateAllocationDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: dto.requestId } });
      if (!request) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${dto.requestId}` });
      }
      if (request.status !== RequestStatus.APPROVED) {
        throw new ConflictException({
          code: 'STATE_INVALID',
          message: `จัดสรรไม่ได้: คำขอ #${request.id} อยู่ในสถานะ ${request.status} (ต้อง APPROVED ก่อน)`,
        });
      }

      const resource = await tx.resource.findUnique({ where: { id: dto.resourceId } });
      if (!resource) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบเครื่อง id ${dto.resourceId}` });
      }
      if (resource.status === ResourceStatus.MAINTENANCE || resource.status === ResourceStatus.OFFLINE) {
        throw new ConflictException({
          code: 'RESOURCE_UNAVAILABLE',
          message: `จัดสรรไม่ได้: เครื่อง ${resource.serverName} อยู่ในสถานะ ${resource.status}`,
        });
      }
      if (request.reqGpu && !resource.hasGpu) {
        throw new ConflictException({
          code: 'GPU_REQUIRED',
          message: `คำขอ #${request.id} ขอ GPU แต่เครื่อง ${resource.serverName} ไม่มี GPU`,
        });
      }

      await this.assertCapacity(tx, dto.resourceId, request, resource);

      // อัปเดตคำขอ "ก่อน" สร้าง allocation — ไม่งั้นค่าที่ include กลับมาจะเป็นภาพเก่า (ยัง APPROVED อยู่)
      await tx.request.update({
        where: { id: request.id },
        data: { status: RequestStatus.ALLOCATED },
      });

      const alloc = await tx.allocation.create({
        data: {
          requestId: dto.requestId,
          resourceId: dto.resourceId,
          ipAddress: dto.ipAddress,
          port: dto.port,
          accessNote: dto.accessNote ?? null,
        },
        include: ALLOCATION_INCLUDE,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: 'ALLOCATION_CREATE',
          details: `จัดสรรคำขอ #${dto.requestId} ลงเครื่อง #${dto.resourceId} ${dto.ipAddress}:${dto.port}`,
        },
        tx,
      );

      return alloc;
    });
  }

  /** คืนเครื่อง — ไม่ลบแถว แค่ประทับ releasedAt เพื่อให้ประวัติยังอยู่และ port กลับมาใช้ได้ */
  async release(id: number, dto: ReleaseAllocationDto, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const alloc = await tx.allocation.findUnique({ where: { id } });
      if (!alloc) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบการจัดสรร id ${id}` });
      }
      if (alloc.releasedAt) {
        throw new ConflictException({
          code: 'ALREADY_RELEASED',
          message: `การจัดสรร #${id} ถูกคืนไปแล้วเมื่อ ${alloc.releasedAt.toISOString()}`,
        });
      }

      // ปิดคำขอ "ก่อน" อัปเดต allocation — ไม่งั้นค่าที่ include กลับมาจะเป็นภาพเก่า (ยัง ALLOCATED)
      // นับเฉพาะรายการอื่น เพราะรายการนี้กำลังจะถูกคืนอยู่แล้ว
      const othersActive = await tx.allocation.count({
        where: { requestId: alloc.requestId, releasedAt: null, id: { not: id } },
      });
      if (othersActive === 0) {
        await tx.request.updateMany({
          where: { id: alloc.requestId, status: RequestStatus.ALLOCATED },
          data: { status: RequestStatus.EXPIRED },
        });
      }

      const released = await tx.allocation.update({
        where: { id },
        data: {
          releasedAt: new Date(),
          accessNote: dto.note
            ? `${alloc.accessNote ? alloc.accessNote + '\n' : ''}[คืนเครื่อง] ${dto.note}`
            : alloc.accessNote,
        },
        include: ALLOCATION_INCLUDE,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: 'ALLOCATION_RELEASE',
          details: `คืนเครื่องจากการจัดสรร #${id} (คำขอ #${alloc.requestId})`,
        },
        tx,
      );

      return released;
    });
  }

  /**
   * ตรวจว่าเครื่องยังเหลือพอ — รวมของที่ active อยู่แล้วบวกกับที่กำลังจะขอ
   * อ่านจากตารางจริงใน transaction เดียวกัน ไม่ได้อ่านจาก view เพราะ view ไม่ล็อกแถว
   */
  private async assertCapacity(
    tx: Prisma.TransactionClient,
    resourceId: number,
    request: { reqCpu: number; reqRamGb: number; reqStorageGb: number },
    resource: { serverName: string; totalCpu: number; totalRamGb: number; totalStorageGb: number },
  ) {
    const active = await tx.allocation.findMany({
      where: { resourceId, releasedAt: null },
      select: { request: { select: { reqCpu: true, reqRamGb: true, reqStorageGb: true } } },
    });

    const used = active.reduce(
      (acc, a) => ({
        cpu: acc.cpu + a.request.reqCpu,
        ram: acc.ram + a.request.reqRamGb,
        storage: acc.storage + a.request.reqStorageGb,
      }),
      { cpu: 0, ram: 0, storage: 0 },
    );

    const short: string[] = [];
    if (used.cpu + request.reqCpu > resource.totalCpu) {
      short.push(`CPU (เหลือ ${resource.totalCpu - used.cpu} · ขอ ${request.reqCpu})`);
    }
    if (used.ram + request.reqRamGb > resource.totalRamGb) {
      short.push(`RAM (เหลือ ${resource.totalRamGb - used.ram}GB · ขอ ${request.reqRamGb}GB)`);
    }
    if (used.storage + request.reqStorageGb > resource.totalStorageGb) {
      short.push(
        `Storage (เหลือ ${resource.totalStorageGb - used.storage}GB · ขอ ${request.reqStorageGb}GB)`,
      );
    }

    if (short.length > 0) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        message: `เครื่อง ${resource.serverName} ไม่พอ: ${short.join(' · ')}`,
      });
    }
  }
}
