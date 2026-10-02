import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginated } from '../common/dto/pagination.dto';
import { CreateResourceDto, ListResourcesDto, UpdateResourceDto } from './dto/resource.dto';

export interface ResourceUsageRow {
  resource_id: number;
  server_name: string;
  status: string;
  has_gpu: boolean;
  total_cpu: number;
  total_ram_gb: number;
  total_storage_gb: number;
  used_cpu: number;
  used_ram_gb: number;
  used_storage_gb: number;
  free_cpu: number;
  free_ram_gb: number;
  free_storage_gb: number;
  active_allocations: number;
}

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListResourcesDto) {
    const where: Prisma.ResourceWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.hasGpu !== undefined ? { hasGpu: dto.hasGpu } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({ where, orderBy: { id: 'asc' }, skip: dto.skip, take: dto.limit }),
      this.prisma.resource.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  /**
   * ทรัพยากรคงเหลือ — อ่านจาก view resource_usage ซึ่งคำนวณสดทุกครั้ง
   * ไม่ได้เก็บคอลัมน์ "ที่เหลือ" ไว้ในตาราง เพราะวันหนึ่งมันจะไม่ตรงกับความจริง
   */
  async usage(): Promise<ResourceUsageRow[]> {
    // ไล่ชื่อคอลัมน์ทีละตัวแทน SELECT * — ถ้า view ถูกสร้างใหม่ระหว่างที่เซิร์ฟเวอร์ยังเปิดอยู่
    // prepared statement ที่ PostgreSQL แคชไว้จะพังด้วย "cached plan must not change result type"
    return this.prisma.$queryRaw<ResourceUsageRow[]>`
      SELECT
        "resource_id", "server_name", "status", "has_gpu",
        "total_cpu", "total_ram_gb", "total_storage_gb",
        "used_cpu", "used_ram_gb", "used_storage_gb",
        "free_cpu", "free_ram_gb", "free_storage_gb",
        "active_allocations"
      FROM "resource_usage"
      ORDER BY "resource_id" ASC
    `;
  }

  async findOne(id: number) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: {
        allocations: {
          where: { releasedAt: null },
          select: { id: true, requestId: true, ipAddress: true, port: true, assignedAt: true },
        },
      },
    });
    if (!resource) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบเครื่อง id ${id}` });
    return resource;
  }

  async create(dto: CreateResourceDto, actorId: number) {
    const resource = await this.prisma.resource.create({ data: dto });
    await this.audit.log({
      userId: actorId,
      action: 'RESOURCE_CREATE',
      details: `เพิ่มเครื่อง #${resource.id} ${resource.serverName}`,
    });
    return resource;
  }

  async update(id: number, dto: UpdateResourceDto, actorId: number) {
    await this.ensureExists(id);
    const resource = await this.prisma.resource.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: actorId,
      action: 'RESOURCE_UPDATE',
      details: `แก้ไขเครื่อง #${id} ${JSON.stringify(dto)}`,
    });
    return resource;
  }

  async remove(id: number, actorId: number) {
    await this.ensureExists(id);

    // FK เป็น RESTRICT อยู่แล้ว แต่ตรวจก่อนเพื่อให้ข้อความบอกทางออกได้
    const used = await this.prisma.allocation.count({ where: { resourceId: id } });
    if (used > 0) {
      throw new ConflictException({
        code: 'RESOURCE_IN_USE',
        message: `ลบไม่ได้: เครื่อง #${id} เคยถูกจัดสรรไปแล้ว ${used} ครั้ง — ถ้าเลิกใช้ ให้เปลี่ยน status เป็น OFFLINE แทน`,
      });
    }

    await this.prisma.resource.delete({ where: { id } });
    await this.audit.log({ userId: actorId, action: 'RESOURCE_DELETE', details: `ลบเครื่อง #${id}` });
    return { message: `ลบเครื่อง #${id} เรียบร้อย` };
  }

  private async ensureExists(id: number) {
    const found = await this.prisma.resource.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบเครื่อง id ${id}` });
  }
}
