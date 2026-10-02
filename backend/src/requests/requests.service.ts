import { Injectable } from '@nestjs/common';

import { Prisma, RequestStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { hasPermission, Permission } from '../auth/permissions';
import { pageArgs, paginated } from '../common/dto/pagination.dto';
import { conflict, forbidden, notFound, validation } from '../common/errors';
import { CoreHubClient } from '../core-hub/core-hub.client';
import { PeopleService } from '../core-hub/people.service';
import { ReferenceDataService } from '../core-hub/reference-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto, ListRequestsDto, RejectRequestDto, UpdateRequestDto } from './dto/request.dto';
import { canCancel, canRead, canReview, canTransition, ALLOWED_TRANSITIONS, isOwner } from './request-rules';

const REQUEST_INCLUDE = {
  allocations: {
    select: {
      id: true,
      resourceId: true,
      ipAddress: true,
      port: true,
      accessNote: true,
      assignedAt: true,
      releasedAt: true,
      resource: { select: { serverName: true, hasGpu: true } },
    },
    orderBy: { assignedAt: 'desc' as const },
  },
} satisfies Prisma.RequestInclude;

/** ผู้เรียก + token (ใช้ถาม Core Hub ในนามผู้ใช้เท่านั้น) */
export interface Actor {
  user: CoreHubIdentity;
  token: string;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly people: PeopleService,
    private readonly reference: ReferenceDataService,
  ) {}

  // ───────────────────────── อ่าน ─────────────────────────

  async list(dto: ListRequestsDto, actor: Actor) {
    const scope = await this.scopeFor(actor);
    const where: Prisma.RequestWhereInput = {
      AND: [
        scope,
        dto.status ? { status: dto.status } : {},
        dto.courseCode ? { courseCode: dto.courseCode } : {},
        dto.coreUserId && hasPermission(actor.user.permissions, Permission.REQUEST_READ_ANY)
          ? { coreUserId: dto.coreUserId }
          : {},
      ],
    };
    const { skip, take } = pageArgs(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.request.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.request.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  async findOne(id: string, actor: Actor) {
    const req = await this.prisma.request.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!req) throw notFound('ไม่พบคำขอที่ระบุ');
    // มีอยู่จริงแต่ไม่ใช่ของผู้เรียก = 403 (มาตรฐานห้ามตอบ 404 แทน 403)
    if (!canRead(actor.user, req, await this.personCodeIfTeacher(actor))) {
      throw forbidden('คุณไม่มีสิทธิ์ดูคำขอนี้');
    }
    return req;
  }

  // ──────────────────────── เขียน ────────────────────────

  async create(dto: CreateRequestDto, actor: Actor) {
    assertDateRange(dto.startDate, dto.endDate);
    await this.assertCourse(dto.courseCode, actor.token);
    // personCode มาจาก Core Hub ตอนเกิดรายการ — ไม่รับจาก body (ปลอมได้)
    const me = await this.people.me(actor.token);

    return this.prisma.$transaction(async (tx) => {
      const req = await tx.request.create({
        data: {
          coreUserId: actor.user.id,
          personCode: me?.personCode ?? null,
          teacherPersonCode: dto.teacherPersonCode ?? null,
          courseCode: dto.courseCode,
          reqCpu: dto.reqCpu,
          reqRamGb: dto.reqRamGb,
          reqStorageGb: dto.reqStorageGb,
          isGpuRequired: dto.isGpuRequired ?? false,
          reason: dto.reason,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: RequestStatus.PENDING,
        },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log(
        {
          coreUserId: actor.user.id,
          action: 'REQUEST_CREATE',
          details: `ยื่นคำขอ ${req.id} วิชา ${req.courseCode} (cpu ${req.reqCpu} · ram ${req.reqRamGb}GB)`,
        },
        tx,
      );
      return req;
    });
  }

  async update(id: string, dto: UpdateRequestDto, actor: Actor) {
    const req = await this.mustExist(id);
    if (!isOwner(actor.user, req)) throw forbidden('แก้ไขได้เฉพาะคำขอของตัวเอง');
    if (req.status !== RequestStatus.PENDING) {
      throw conflict('STATE_INVALID', `แก้ไขไม่ได้: คำขออยู่ในสถานะ ${req.status} (แก้ได้เฉพาะ PENDING)`);
    }

    const startDate = dto.startDate ?? toDateString(req.startDate);
    const endDate = dto.endDate ?? toDateString(req.endDate);
    assertDateRange(startDate, endDate);
    if (dto.courseCode !== undefined && dto.courseCode !== req.courseCode) {
      await this.assertCourse(dto.courseCode, actor.token);
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        ...(dto.teacherPersonCode !== undefined ? { teacherPersonCode: dto.teacherPersonCode } : {}),
        ...(dto.courseCode !== undefined ? { courseCode: dto.courseCode } : {}),
        ...(dto.reqCpu !== undefined ? { reqCpu: dto.reqCpu } : {}),
        ...(dto.reqRamGb !== undefined ? { reqRamGb: dto.reqRamGb } : {}),
        ...(dto.reqStorageGb !== undefined ? { reqStorageGb: dto.reqStorageGb } : {}),
        ...(dto.isGpuRequired !== undefined ? { isGpuRequired: dto.isGpuRequired } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: REQUEST_INCLUDE,
    });
    await this.audit.log({ coreUserId: actor.user.id, action: 'REQUEST_UPDATE', details: `แก้ไขคำขอ ${id}` });
    return updated;
  }

  async approve(id: string, actor: Actor) {
    const req = await this.loadForReview(id, actor);
    assertTransition(req.status, RequestStatus.APPROVED, 'อนุมัติ');

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: { status: RequestStatus.APPROVED, rejectReason: null, reviewedAt: new Date(), reviewerCoreUserId: actor.user.id },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log({ coreUserId: actor.user.id, action: 'REQUEST_APPROVE', details: `อนุมัติคำขอ ${id}` }, tx);
      return r;
    });
  }

  async reject(id: string, dto: RejectRequestDto, actor: Actor) {
    const req = await this.loadForReview(id, actor);
    assertTransition(req.status, RequestStatus.REJECTED, 'ปฏิเสธ');

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.REJECTED,
          rejectReason: dto.rejectReason,
          reviewedAt: new Date(),
          reviewerCoreUserId: actor.user.id,
        },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log(
        { coreUserId: actor.user.id, action: 'REQUEST_REJECT', details: `ปฏิเสธคำขอ ${id} — ${dto.rejectReason}` },
        tx,
      );
      return r;
    });
  }

  async cancel(id: string, actor: Actor) {
    const req = await this.mustExist(id);
    if (!canCancel(actor.user, req)) throw forbidden('ยกเลิกได้เฉพาะคำขอของตัวเอง');
    assertTransition(req.status, RequestStatus.CANCELLED, 'ยกเลิก');

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: { status: RequestStatus.CANCELLED },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log({ coreUserId: actor.user.id, action: 'REQUEST_CANCEL', details: `ยกเลิกคำขอ ${id}` }, tx);
      return r;
    });
  }

  // ──────────────────────── ภายใน ────────────────────────

  /** request:read:any เห็นทุกใบ · อาจารย์เห็นใบที่ระบุตัวเองหรือไม่ระบุใคร · นักศึกษาเห็นของตัวเอง */
  private async scopeFor(actor: Actor): Promise<Prisma.RequestWhereInput> {
    const perms = actor.user.permissions;
    if (hasPermission(perms, Permission.REQUEST_READ_ANY)) return {};
    if (hasPermission(perms, Permission.REQUEST_REVIEW_OWN)) {
      const mine = await this.personCodeIfTeacher(actor);
      return mine ? { OR: [{ teacherPersonCode: mine }, { teacherPersonCode: null }] } : { teacherPersonCode: null };
    }
    return { coreUserId: actor.user.id };
  }

  /** personCode ของอาจารย์จาก Core Hub (ไม่ cache — ข้อมูลบุคคล) · บทบาทอื่นไม่ต้องถาม */
  private async personCodeIfTeacher(actor: Actor): Promise<string | null> {
    const perms = actor.user.permissions;
    if (!hasPermission(perms, Permission.REQUEST_REVIEW_OWN) || hasPermission(perms, Permission.REQUEST_REVIEW_ANY)) {
      return null;
    }
    return (await this.people.me(actor.token))?.personCode ?? null;
  }

  private async mustExist(id: string) {
    const req = await this.prisma.request.findUnique({ where: { id } });
    if (!req) throw notFound('ไม่พบคำขอที่ระบุ');
    return req;
  }

  private async loadForReview(id: string, actor: Actor) {
    const req = await this.mustExist(id);
    if (!canReview(actor.user, req, await this.personCodeIfTeacher(actor))) {
      throw forbidden('คำขอนี้ไม่ได้ระบุคุณเป็นอาจารย์ผู้รับรอง');
    }
    return req;
  }

  private async assertCourse(courseCode: string, token: string) {
    let ok: boolean;
    try {
      ok = await this.reference.isActiveCourse(courseCode, token);
    } catch (e) {
      return CoreHubClient.toHttp(e);
    }
    if (!ok) {
      throw validation('ไม่พบรายวิชานี้ในข้อมูลกลาง หรือรายวิชาถูกปิดใช้งาน', [`courseCode ${courseCode} ไม่มีใน Core Hub`]);
    }
  }
}

function assertDateRange(start: string, end: string) {
  if (end < start) throw validation('endDate ต้องไม่มาก่อน startDate', ['endDate ต้องไม่มาก่อน startDate']);
}

function assertTransition(from: RequestStatus, to: RequestStatus, verb: string) {
  if (!canTransition(from, to)) {
    throw conflict('STATE_INVALID', `${verb}ไม่ได้: คำขออยู่ในสถานะ ${from}`, { from, to, allowedNext: ALLOWED_TRANSITIONS[from] });
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
