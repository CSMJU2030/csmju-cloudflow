import { Injectable } from '@nestjs/common';

import { Prisma, RequestStatus, ResourceStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { hasPermission, Permission } from '../auth/permissions';
import { pageArgs, paginated } from '../common/dto/pagination.dto';
import { conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAllocationDto, ListAllocationsDto, ReleaseAllocationDto } from './dto/allocation.dto';

const ALLOCATION_INCLUDE = {
  resource: { select: { id: true, serverName: true, hasGpu: true, status: true } },
  request: {
    select: {
      id: true,
      status: true,
      courseCode: true,
      reqCpu: true,
      reqRamGb: true,
      reqStorageGb: true,
      coreUserId: true,
      personCode: true,
    },
  },
} satisfies Prisma.AllocationInclude;

@Injectable()
export class AllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListAllocationsDto, user: CoreHubIdentity) {
    const where: Prisma.AllocationWhereInput = {
      ...(this.canReadAny(user) ? {} : { request: { coreUserId: user.id } }),
      ...(dto.active === true ? { releasedAt: null } : {}),
      ...(dto.active === false ? { releasedAt: { not: null } } : {}),
      ...(dto.resourceId ? { resourceId: dto.resourceId } : {}),
    };
    const { skip, take } = pageArgs(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.allocation.findMany({
        where,
        include: ALLOCATION_INCLUDE,
        orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.allocation.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  async findOne(id: string, user: CoreHubIdentity) {
    const alloc = await this.prisma.allocation.findUnique({ where: { id }, include: ALLOCATION_INCLUDE });
    if (!alloc) throw notFound('ไม่พบการจัดสรรที่ระบุ');
    if (!this.canReadAny(user) && alloc.request.coreUserId !== user.id) {
      throw forbidden('คุณไม่มีสิทธิ์ดูการจัดสรรนี้');
    }
    return alloc;
  }

  /**
   * จัดสรรเครื่องให้คำขอที่อนุมัติแล้ว — ทุกอย่างอยู่ใน transaction เดียว
   * ถ้าขั้นไหนพัง ทั้งชุดย้อนกลับหมด จะไม่มีคำขอที่ ALLOCATED โดยไม่มีเครื่องจริง
   */
  async create(dto: CreateAllocationDto, user: CoreHubIdentity) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: dto.requestId } });
      if (!request) throw notFound('ไม่พบคำขอที่ระบุ');
      if (request.status !== RequestStatus.APPROVED) {
        throw conflict('STATE_INVALID', `จัดสรรไม่ได้: คำขออยู่ในสถานะ ${request.status} (ต้อง APPROVED ก่อน)`);
      }

      const resource = await tx.resource.findUnique({ where: { id: dto.resourceId } });
      if (!resource) throw notFound('ไม่พบเครื่องที่ระบุ');
      if (resource.status === ResourceStatus.MAINTENANCE || resource.status === ResourceStatus.OFFLINE) {
        throw conflict('RESOURCE_UNAVAILABLE', `จัดสรรไม่ได้: เครื่อง ${resource.serverName} อยู่ในสถานะ ${resource.status}`);
      }
      if (request.isGpuRequired && !resource.hasGpu) {
        throw conflict('GPU_REQUIRED', `คำขอนี้ต้องใช้ GPU แต่เครื่อง ${resource.serverName} ไม่มี GPU`);
      }

      await this.assertCapacity(tx, dto.resourceId, request, resource);

      const portTaken = await tx.allocation.findFirst({
        where: { resourceId: dto.resourceId, port: dto.port, releasedAt: null },
        select: { id: true },
      });
      if (portTaken) throw conflict('PORT_IN_USE', `port ${dto.port} บนเครื่อง ${resource.serverName} ถูกใช้อยู่`);

      // อัปเดตคำขอ "ก่อน" สร้าง allocation — ไม่งั้นค่าที่ include กลับมาจะเป็นภาพเก่า
      await tx.request.update({ where: { id: request.id }, data: { status: RequestStatus.ALLOCATED } });

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
          coreUserId: user.id,
          action: 'ALLOCATION_CREATE',
          details: `จัดสรรคำขอ ${dto.requestId} ลงเครื่อง ${dto.resourceId} ${dto.ipAddress}:${dto.port}`,
        },
        tx,
      );
      return alloc;
    });
  }

  /** คืนเครื่อง — ไม่ลบแถว แค่ประทับ releasedAt เพื่อให้ประวัติยังอยู่และ port กลับมาใช้ได้ */
  async release(id: string, dto: ReleaseAllocationDto, user: CoreHubIdentity) {
    return this.prisma.$transaction(async (tx) => {
      const alloc = await tx.allocation.findUnique({ where: { id } });
      if (!alloc) throw notFound('ไม่พบการจัดสรรที่ระบุ');
      if (alloc.releasedAt) {
        throw conflict('ALREADY_RELEASED', `การจัดสรรนี้ถูกคืนไปแล้วเมื่อ ${alloc.releasedAt.toISOString()}`);
      }

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
        { coreUserId: user.id, action: 'ALLOCATION_RELEASE', details: `คืนเครื่องจากการจัดสรร ${id} (คำขอ ${alloc.requestId})` },
        tx,
      );
      return released;
    });
  }

  private canReadAny(user: CoreHubIdentity) {
    return hasPermission(user.permissions, Permission.ALLOCATION_READ_ANY);
  }

  /** เครื่องยังเหลือพอไหม — อ่านจากตารางจริงใน transaction เดียวกัน (view ไม่ล็อกแถว) */
  private async assertCapacity(
    tx: Prisma.TransactionClient,
    resourceId: string,
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
    if (used.cpu + request.reqCpu > resource.totalCpu) short.push(`CPU (เหลือ ${resource.totalCpu - used.cpu} · ขอ ${request.reqCpu})`);
    if (used.ram + request.reqRamGb > resource.totalRamGb) short.push(`RAM (เหลือ ${resource.totalRamGb - used.ram}GB · ขอ ${request.reqRamGb}GB)`);
    if (used.storage + request.reqStorageGb > resource.totalStorageGb) {
      short.push(`Storage (เหลือ ${resource.totalStorageGb - used.storage}GB · ขอ ${request.reqStorageGb}GB)`);
    }
    if (short.length > 0) {
      throw conflict('CAPACITY_EXCEEDED', `เครื่อง ${resource.serverName} ไม่พอ: ${short.join(' · ')}`);
    }
  }
}
