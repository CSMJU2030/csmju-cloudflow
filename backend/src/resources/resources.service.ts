import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaginationDto, pageArgs, paginated } from '../common/dto/pagination.dto';
import { conflict, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResourceDto, ListResourcesDto, UpdateResourceDto } from './dto/resource.dto';

export interface ResourceUsageRow {
  resourceId: string;
  serverName: string;
  status: string;
  hasGpu: boolean;
  totalCpu: number;
  totalRamGb: number;
  totalStorageGb: number;
  usedCpu: number;
  usedRamGb: number;
  usedStorageGb: number;
  freeCpu: number;
  freeRamGb: number;
  freeStorageGb: number;
  activeAllocations: number;
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
    const { skip, take } = pageArgs(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({ where, orderBy: [{ serverName: 'asc' }, { id: 'asc' }], skip, take }),
      this.prisma.resource.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  /**
   * ทรัพยากรคงเหลือ — อ่านจาก view resource_usage ซึ่งคำนวณสดทุกครั้ง
   * ไล่ชื่อคอลัมน์ทีละตัวแทน SELECT * กัน "cached plan must not change result type" เมื่อ view ถูกสร้างใหม่
   */
  async usage(dto: PaginationDto) {
    const { skip, take } = pageArgs(dto);
    const [rows, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<ResourceUsageRow[]>`
        SELECT
          "resource_id"::text AS "resourceId", "server_name" AS "serverName", "status"::text AS "status",
          "has_gpu" AS "hasGpu", "total_cpu" AS "totalCpu", "total_ram_gb" AS "totalRamGb",
          "total_storage_gb" AS "totalStorageGb", "used_cpu" AS "usedCpu", "used_ram_gb" AS "usedRamGb",
          "used_storage_gb" AS "usedStorageGb", "free_cpu" AS "freeCpu", "free_ram_gb" AS "freeRamGb",
          "free_storage_gb" AS "freeStorageGb", "active_allocations" AS "activeAllocations"
        FROM "resource_usage"
        ORDER BY "server_name" ASC, "resource_id" ASC
        OFFSET ${skip} LIMIT ${take}
      `,
      this.prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS "count" FROM "resource_usage"`,
    ]);
    return paginated(rows, count, dto);
  }

  async findOne(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: {
        allocations: {
          where: { releasedAt: null },
          select: { id: true, requestId: true, ipAddress: true, port: true, assignedAt: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!resource) throw notFound('ไม่พบเครื่องที่ระบุ');
    return resource;
  }

  async create(dto: CreateResourceDto, actor: string) {
    await this.assertNameFree(dto.serverName);
    const resource = await this.prisma.resource.create({ data: dto });
    await this.audit.log({ coreUserId: actor, action: 'RESOURCE_CREATE', details: `เพิ่มเครื่อง ${resource.id} ${resource.serverName}` });
    return resource;
  }

  async update(id: string, dto: UpdateResourceDto, actor: string) {
    await this.ensureExists(id);
    if (dto.serverName) await this.assertNameFree(dto.serverName, id);
    const resource = await this.prisma.resource.update({ where: { id }, data: dto });
    await this.audit.log({ coreUserId: actor, action: 'RESOURCE_UPDATE', details: `แก้ไขเครื่อง ${id} ${JSON.stringify(dto)}` });
    return resource;
  }

  async remove(id: string, actor: string) {
    await this.ensureExists(id);
    // FK เป็น RESTRICT อยู่แล้ว แต่ตรวจก่อนเพื่อให้ข้อความบอกทางออกได้
    const used = await this.prisma.allocation.count({ where: { resourceId: id } });
    if (used > 0) {
      throw conflict(
        'RESOURCE_IN_USE',
        `ลบไม่ได้: เครื่องนี้เคยถูกจัดสรรไปแล้ว ${used} ครั้ง — ถ้าเลิกใช้ ให้เปลี่ยน status เป็น OFFLINE แทน`,
      );
    }
    await this.prisma.resource.delete({ where: { id } });
    await this.audit.log({ coreUserId: actor, action: 'RESOURCE_DELETE', details: `ลบเครื่อง ${id}` });
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.resource.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw notFound('ไม่พบเครื่องที่ระบุ');
  }

  private async assertNameFree(serverName: string, exceptId?: string) {
    const dup = await this.prisma.resource.findUnique({ where: { serverName }, select: { id: true } });
    if (dup && dup.id !== exceptId) throw conflict('DUPLICATE_SERVER_NAME', `มีเครื่องชื่อ ${serverName} อยู่แล้ว`);
  }
}
