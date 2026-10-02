import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginated } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateRequestDto, ListRequestsDto, RejectRequestDto, UpdateRequestDto } from './dto/request.dto';

const REQUEST_INCLUDE = {
  student: { select: { id: true, studentCode: true, fullName: true, email: true } },
  teacher: { select: { id: true, fullName: true, email: true } },
  allocations: {
    select: {
      id: true,
      resourceId: true,
      ipAddress: true,
      port: true,
      assignedAt: true,
      releasedAt: true,
      resource: { select: { serverName: true, hasGpu: true } },
    },
    orderBy: { id: 'desc' as const },
  },
} satisfies Prisma.RequestInclude;

/**
 * เส้นทางสถานะที่อนุญาต — ที่เดียวที่ตอบว่า "จากสถานะนี้ไปไหนได้บ้าง"
 * ถ้ากระจายเงื่อนไขไว้ตามเมธอด สุดท้ายมันจะขัดกันเองโดยไม่มีใครรู้
 */
const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ALLOCATED', 'CANCELLED'],
  REJECTED: [],
  ALLOCATED: ['EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
};

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── อ่าน ─────────────────────────

  async list(dto: ListRequestsDto, actor: AuthUser) {
    const where: Prisma.RequestWhereInput = {
      ...this.scopeFor(actor),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.subjectCode ? { subjectCode: dto.subjectCode } : {}),
      ...(dto.studentId && actor.role === UserRole.ADMIN ? { studentId: dto.studentId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.request.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { id: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.request.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  async findOne(id: number, actor: AuthUser) {
    const req = await this.prisma.request.findFirst({
      where: { id, ...this.scopeFor(actor) },
      include: REQUEST_INCLUDE,
    });
    // ของคนอื่นตอบ 404 ไม่ใช่ 403 — 403 บอกใบ้ว่า id นั้นมีอยู่จริง ซึ่งพอให้ไล่ยิงหาได้
    if (!req) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${id}` });
    return req;
  }

  // ──────────────────────── เขียน ────────────────────────

  async create(dto: CreateRequestDto, actor: AuthUser) {
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException({
        code: 'DATE_RANGE_INVALID',
        message: 'endDate ต้องไม่มาก่อน startDate',
      });
    }

    const teacher = await this.prisma.user.findUnique({ where: { id: dto.teacherId } });
    if (!teacher || teacher.role !== UserRole.TEACHER) {
      throw new BadRequestException({
        code: 'TEACHER_INVALID',
        message: `teacherId ${dto.teacherId} ไม่ใช่ผู้ใช้ที่มี role = TEACHER`,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const req = await tx.request.create({
        data: {
          // studentId มาจาก token เสมอ — ถ้ารับจาก body จะยื่นคำขอในนามคนอื่นได้
          studentId: actor.id,
          teacherId: dto.teacherId,
          subjectCode: dto.subjectCode,
          reqCpu: dto.reqCpu,
          reqRamGb: dto.reqRamGb,
          reqStorageGb: dto.reqStorageGb,
          reqGpu: dto.reqGpu ?? false,
          reason: dto.reason,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: RequestStatus.PENDING,
        },
        include: REQUEST_INCLUDE,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: 'REQUEST_CREATE',
          details: `ยื่นคำขอ #${req.id} วิชา ${req.subjectCode} (cpu ${req.reqCpu} · ram ${req.reqRamGb}GB)`,
        },
        tx,
      );
      return req;
    });

    return created;
  }

  async update(id: number, dto: UpdateRequestDto, actor: AuthUser) {
    const req = await this.findOne(id, actor);

    if (req.studentId !== actor.id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${id}` });
    }
    if (req.status !== RequestStatus.PENDING) {
      throw new ConflictException({
        code: 'STATE_INVALID',
        message: `แก้ไขไม่ได้: คำขออยู่ในสถานะ ${req.status} (แก้ได้เฉพาะ PENDING)`,
      });
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : req.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : req.endDate;
    if (endDate < startDate) {
      throw new BadRequestException({
        code: 'DATE_RANGE_INVALID',
        message: 'endDate ต้องไม่มาก่อน startDate',
      });
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.subjectCode !== undefined ? { subjectCode: dto.subjectCode } : {}),
        ...(dto.reqCpu !== undefined ? { reqCpu: dto.reqCpu } : {}),
        ...(dto.reqRamGb !== undefined ? { reqRamGb: dto.reqRamGb } : {}),
        ...(dto.reqStorageGb !== undefined ? { reqStorageGb: dto.reqStorageGb } : {}),
        ...(dto.reqGpu !== undefined ? { reqGpu: dto.reqGpu } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        startDate,
        endDate,
      },
      include: REQUEST_INCLUDE,
    });

    await this.audit.log({ userId: actor.id, action: 'REQUEST_UPDATE', details: `แก้ไขคำขอ #${id}` });
    return updated;
  }

  async approve(id: number, actor: AuthUser) {
    const req = await this.loadForReview(id, actor);
    this.assertTransition(req.status, RequestStatus.APPROVED, 'อนุมัติ');

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: { status: RequestStatus.APPROVED, rejectReason: null, reviewedAt: new Date() },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log(
        { userId: actor.id, action: 'REQUEST_APPROVE', details: `อนุมัติคำขอ #${id}` },
        tx,
      );
      return r;
    });
    return updated;
  }

  async reject(id: number, dto: RejectRequestDto, actor: AuthUser) {
    const req = await this.loadForReview(id, actor);
    this.assertTransition(req.status, RequestStatus.REJECTED, 'ปฏิเสธ');

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.REJECTED,
          rejectReason: dto.rejectReason,
          reviewedAt: new Date(),
        },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'REQUEST_REJECT',
          details: `ปฏิเสธคำขอ #${id} — ${dto.rejectReason}`,
        },
        tx,
      );
      return r;
    });
  }

  async cancel(id: number, actor: AuthUser) {
    const req = await this.findOne(id, actor);

    // ยกเลิกได้เฉพาะเจ้าของคำขอ (ADMIN ยกเลิกแทนได้)
    if (req.studentId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${id}` });
    }
    this.assertTransition(req.status, RequestStatus.CANCELLED, 'ยกเลิก');

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.request.update({
        where: { id },
        data: { status: RequestStatus.CANCELLED },
        include: REQUEST_INCLUDE,
      });
      await this.audit.log(
        { userId: actor.id, action: 'REQUEST_CANCEL', details: `ยกเลิกคำขอ #${id}` },
        tx,
      );
      return r;
    });
  }

  // ──────────────────────── ภายใน ────────────────────────

  /** ADMIN เห็นทุกใบ · TEACHER เห็นเฉพาะที่ตัวเองเป็นผู้รับรอง · STUDENT เห็นเฉพาะของตัวเอง */
  private scopeFor(actor: AuthUser): Prisma.RequestWhereInput {
    switch (actor.role) {
      case UserRole.ADMIN:
        return {};
      case UserRole.TEACHER:
        return { teacherId: actor.id };
      default:
        return { studentId: actor.id };
    }
  }

  private async loadForReview(id: number, actor: AuthUser) {
    const req = await this.prisma.request.findUnique({ where: { id } });
    if (!req) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${id}` });

    const isAssignedTeacher = actor.role === UserRole.TEACHER && req.teacherId === actor.id;
    if (!isAssignedTeacher && actor.role !== UserRole.ADMIN) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบคำขอ id ${id}` });
    }
    return req;
  }

  private assertTransition(from: RequestStatus, to: RequestStatus, verb: string) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException({
        code: 'STATE_INVALID',
        message: `${verb}ไม่ได้: คำขออยู่ในสถานะ ${from}`,
        details: { from, to, allowedNext: ALLOWED_TRANSITIONS[from] },
      });
    }
  }
}
