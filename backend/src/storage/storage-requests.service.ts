import { Inject, Injectable } from '@nestjs/common';

import { Prisma, StorageRequestStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { pageArgs, paginated } from '../common/dto/pagination.dto';
import { conflict, forbidden, notFound, unavailable, validation } from '../common/errors';
import { logEvent } from '../common/logger';
import { CoreHubClient } from '../core-hub/core-hub.client';
import { PeopleService } from '../core-hub/people.service';
import { ReferenceDataService } from '../core-hub/reference-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { isOwner, teacherScope } from '../requests/request-rules';
import type { Actor } from '../requests/requests.service';
import { CreateStorageRequestDto, ListStorageRequestsDto, RejectStorageRequestDto } from './dto/storage-request.dto';
import { checkReservation, fullSlotsLeft, gbToMib, mibToGb } from './pool-math';
import { STORAGE_PROVIDER, type StorageProvider } from './providers/storage-provider';
import { SECRET_BOX, type SecretBox } from './secret-box';
import {
  canMoveStorage,
  canReadStorage,
  canReviewStorage,
  hasStoragePermission,
  RESERVING_STATUSES,
  safeProviderError,
  StoragePermission as S,
  STORAGE_TRANSITIONS,
} from './storage-rules';

/** คอลัมน์ที่ส่งออกได้ — ไม่มี share_url_enc / share_password_enc เด็ดขาด (ลิงก์ดูได้ทาง revealLink เท่านั้น) */
const PUBLIC_SELECT = {
  id: true,
  poolId: true,
  coreUserId: true,
  personCode: true,
  teacherPersonCode: true,
  courseCode: true,
  quotaMib: true,
  reason: true,
  startDate: true,
  endDate: true,
  status: true,
  rejectReason: true,
  reviewerCoreUserId: true,
  reviewedAt: true,
  usedMib: true,
  usageSyncedAt: true,
  provisionAttempts: true,
  lastError: true,
  activatedAt: true,
  expiredAt: true,
  releasedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StorageRequestSelect;

const RESERVING = RESERVING_STATUSES as StorageRequestStatus[];
const DEFAULT_POOL = 'cs-cloud-01';

/**
 * ระบบยืมพื้นที่ cloud: ยื่นคำขอ → อาจารย์อนุมัติ (จองโควตา) → สร้างพื้นที่ที่ provider → ACTIVE พร้อมลิงก์
 *
 * จุดสำคัญ
 * - จองโควตาตอนอนุมัติ ภายใน transaction ที่ล็อกแถว pool (SELECT … FOR UPDATE)
 *   อนุมัติพร้อมกันหลายใบก็ไม่มีทางเกิน 1 TB
 * - เรียก provider นอก transaction (ช้าได้ ล้มได้) · ล้ม = PROVISION_FAILED และยังถือโควตาไว้ รอสั่งใหม่
 * - ลิงก์และรหัสเข้ารหัส AES-GCM ก่อนเก็บ · ไม่ log · ไม่ส่งอีเมล · ไม่อยู่ใน list/findOne
 */
@Injectable()
export class StorageRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly people: PeopleService,
    private readonly reference: ReferenceDataService,
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox | null,
  ) {}

  /** ยังไม่ตั้ง STORAGE_SECRET_KEY = ระบบยืมพื้นที่ปิดอยู่ (503) — ส่วนอื่นของแอปทำงานตามปกติ */
  private get box(): SecretBox {
    if (!this.secretBox) throw unavailable('ระบบยืมพื้นที่ยังไม่เปิดใช้งาน (ผู้ดูแลยังไม่ได้ตั้งค่า)', 300);
    return this.secretBox;
  }

  private assertEnabled() {
    void this.box;
  }

  // ───────────────────────── pool ─────────────────────────

  async poolSummary() {
    this.assertEnabled();
    const pool = await this.activePool();
    const u = await this.usageOf(pool.id);
    return {
      name: pool.name,
      provider: pool.provider,
      totalMib: u.totalMib,
      reservedMib: u.reservedMib,
      usedMib: u.usedMib,
      freeMib: u.freeMib,
      maxPerUserMib: u.maxPerUserMib,
      totalGb: mibToGb(u.totalMib),
      freeGb: mibToGb(u.freeMib),
      maxPerUserGb: mibToGb(u.maxPerUserMib),
      fullSlotsLeft: fullSlotsLeft({ totalMib: u.totalMib, maxPerUserMib: u.maxPerUserMib, reservedMib: u.reservedMib }),
      activeCount: u.activeCount,
      pendingCount: u.pendingCount,
    };
  }

  // ───────────────────────── อ่าน ─────────────────────────

  async list(dto: ListStorageRequestsDto, actor: Actor) {
    this.assertEnabled();
    const where: Prisma.StorageRequestWhereInput = {
      AND: [await this.scopeFor(actor), dto.status ? { status: dto.status } : {}],
    };
    const { skip, take } = pageArgs(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.storageRequest.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.storageRequest.count({ where }),
    ]);
    return paginated(rows, total, dto);
  }

  async findOne(id: string, actor: Actor) {
    this.assertEnabled();
    const row = await this.prisma.storageRequest.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!row) throw notFound('ไม่พบคำขอพื้นที่ที่ระบุ');
    if (!canReadStorage(actor.user, row, await this.personCodeIfTeacher(actor))) {
      throw forbidden('คุณไม่มีสิทธิ์ดูคำขอนี้');
    }
    return row;
  }

  /** ลิงก์ + รหัสของพื้นที่ตัวเอง — เจ้าของเท่านั้น · บันทึก audit ว่าเปิดดู (ไม่บันทึกตัวลิงก์) */
  async revealLink(id: string, actor: Actor) {
    this.assertEnabled();
    const row = await this.prisma.storageRequest.findUnique({ where: { id } });
    if (!row) throw notFound('ไม่พบคำขอพื้นที่ที่ระบุ');
    if (!hasStoragePermission(actor.user, S.LINK_READ_OWN) || !isOwner(actor.user, row)) {
      throw forbidden('ดูลิงก์ได้เฉพาะเจ้าของพื้นที่');
    }
    if (row.status !== StorageRequestStatus.ACTIVE || !row.shareUrlEnc) {
      throw conflict('STATE_INVALID', `ยังไม่มีลิงก์: คำขออยู่ในสถานะ ${row.status}`);
    }

    let shareUrl: string;
    let sharePassword: string | null;
    try {
      shareUrl = this.box.open(row.shareUrlEnc, row.id);
      sharePassword = row.sharePasswordEnc ? this.box.open(row.sharePasswordEnc, row.id) : null;
    } catch {
      logEvent('request.error', { path: 'storage.reveal_link', requestId: row.id, error: 'decrypt_failed' });
      throw unavailable('อ่านลิงก์ไม่ได้ชั่วคราว กรุณาแจ้งเจ้าหน้าที่', 60);
    }
    await this.audit.log({ coreUserId: actor.user.id, action: 'STORAGE_LINK_VIEW', details: `เปิดดูลิงก์พื้นที่ ${row.id}` });
    return { shareUrl, sharePassword, expiresOn: toDateString(row.endDate), quotaMib: row.quotaMib };
  }

  // ──────────────────────── เขียน ────────────────────────

  async create(dto: CreateStorageRequestDto, actor: Actor) {
    this.assertEnabled();
    if (!hasStoragePermission(actor.user, S.CREATE_OWN)) throw forbidden('บทบาทของคุณยื่นคำขอยืมพื้นที่ไม่ได้');
    if (dto.endDate < dto.startDate) throw validation('endDate ต้องไม่มาก่อน startDate', ['endDate ต้องไม่มาก่อน startDate']);

    const pool = await this.activePool();
    const quotaMib = gbToMib(dto.quotaGb);
    if (quotaMib > pool.maxPerUserMib) {
      throw validation(`ยืมได้ไม่เกิน ${mibToGb(pool.maxPerUserMib)} GB ต่อคน`, [`quotaGb สูงสุด ${mibToGb(pool.maxPerUserMib)}`]);
    }

    const live = await this.prisma.storageRequest.findFirst({
      where: { poolId: pool.id, coreUserId: actor.user.id, status: { in: RESERVING } },
      select: { id: true, status: true },
    });
    if (live) throw conflict('ALREADY_HAS_SPACE', 'คุณมีพื้นที่ที่ยืมอยู่แล้ว ต้องคืนก่อนจึงยื่นใหม่ได้', { requestId: live.id });

    const pending = await this.prisma.storageRequest.findFirst({
      where: { poolId: pool.id, coreUserId: actor.user.id, status: StorageRequestStatus.PENDING },
      select: { id: true },
    });
    if (pending) throw conflict('ALREADY_PENDING', 'คุณมีคำขอที่รออนุมัติอยู่แล้ว', { requestId: pending.id });

    // เช็กเบื้องต้นให้ผู้ใช้รู้เร็ว — ตัวจริงตรวจอีกครั้งตอนอนุมัติ (มีล็อก)
    const usage = await this.usageOf(pool.id);
    if (quotaMib > usage.freeMib) {
      throw conflict('POOL_FULL', `พื้นที่รวมเหลือ ${mibToGb(usage.freeMib)} GB ไม่พอกับที่ขอ`, { freeMib: usage.freeMib });
    }

    await this.assertCourse(dto.courseCode, actor.token);
    // personCode มาจาก Core Hub ตอนเกิดรายการ — ไม่รับจาก body
    const me = await this.people.me(actor.token);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.storageRequest.create({
          data: {
            poolId: pool.id,
            coreUserId: actor.user.id,
            personCode: me?.personCode ?? null,
            teacherPersonCode: dto.teacherPersonCode?.trim() || null,
            courseCode: dto.courseCode,
            quotaMib,
            reason: dto.reason,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
          },
          select: PUBLIC_SELECT,
        });
        await this.audit.log(
          { coreUserId: actor.user.id, action: 'STORAGE_REQUEST_CREATE', details: `ขอพื้นที่ ${row.id} ${mibToGb(quotaMib)} GB วิชา ${row.courseCode}` },
          tx,
        );
        return row;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('ALREADY_PENDING', 'คุณมีคำขอที่รออนุมัติอยู่แล้ว');
      throw e;
    }
  }

  /**
   * อาจารย์อนุมัติ = จองโควตา + สั่งสร้างพื้นที่
   * ล็อกแถวคำขอและแถว pool ก่อนนับพื้นที่ — ใบที่อนุมัติพร้อมกันต้องรอคิว จึงไม่มีทางจองเกิน
   */
  async approve(id: string, actor: Actor) {
    this.assertEnabled();
    const myCode = await this.personCodeIfTeacher(actor); // ถาม Core Hub ก่อนเปิด transaction

    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<LockedRequest[]>`
        SELECT id, pool_id, core_user_id, teacher_person_code, status::text AS status, quota_mib
        FROM storage_requests WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw notFound('ไม่พบคำขอพื้นที่ที่ระบุ');
      const owned = { coreUserId: row.core_user_id, teacherPersonCode: row.teacher_person_code };
      if (!canReviewStorage(actor.user, owned, myCode)) throw forbidden('คำขอนี้ไม่ได้ระบุคุณเป็นอาจารย์ผู้อนุมัติ');
      assertMove(row.status, StorageRequestStatus.PROVISIONING, 'อนุมัติ');

      const [pool] = await tx.$queryRaw<LockedPool[]>`
        SELECT total_mib, max_per_user_mib, is_active FROM storage_pools WHERE id = ${row.pool_id}::uuid FOR UPDATE`;
      if (!pool?.is_active) throw conflict('POOL_INACTIVE', 'pool นี้ปิดรับการยืมอยู่');

      const [sum] = await tx.$queryRaw<{ reserved: number; user_reserved: number }[]>`
        SELECT COALESCE(SUM(quota_mib), 0)::int AS reserved,
               COALESCE(SUM(quota_mib) FILTER (WHERE core_user_id = ${row.core_user_id}), 0)::int AS user_reserved
        FROM storage_requests
        WHERE pool_id = ${row.pool_id}::uuid
          AND status IN ('PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED')`;

      const check = checkReservation(
        { totalMib: pool.total_mib, maxPerUserMib: pool.max_per_user_mib, reservedMib: sum.reserved },
        row.quota_mib,
        sum.user_reserved,
      );
      if (!check.ok) throw conflict(check.reason, check.message);

      await tx.storageRequest.update({
        where: { id },
        data: { status: StorageRequestStatus.PROVISIONING, reviewerCoreUserId: actor.user.id, reviewedAt: new Date() },
      });
      await this.audit.log(
        { coreUserId: actor.user.id, action: 'STORAGE_REQUEST_APPROVE', details: `อนุมัติพื้นที่ ${id} ${mibToGb(row.quota_mib)} GB` },
        tx,
      );
    });

    return this.provisionOne(id);
  }

  async reject(id: string, dto: RejectStorageRequestDto, actor: Actor) {
    this.assertEnabled();
    const row = await this.mustExist(id);
    if (!canReviewStorage(actor.user, row, await this.personCodeIfTeacher(actor))) {
      throw forbidden('คำขอนี้ไม่ได้ระบุคุณเป็นอาจารย์ผู้อนุมัติ');
    }
    assertMove(row.status, StorageRequestStatus.REJECTED, 'ปฏิเสธ');
    return this.moveFromPending(id, actor, 'STORAGE_REQUEST_REJECT', `ปฏิเสธพื้นที่ ${id}`, {
      status: StorageRequestStatus.REJECTED,
      rejectReason: dto.rejectReason,
      reviewerCoreUserId: actor.user.id,
      reviewedAt: new Date(),
    });
  }

  async cancel(id: string, actor: Actor) {
    this.assertEnabled();
    const row = await this.mustExist(id);
    if (!hasStoragePermission(actor.user, S.CANCEL_OWN) || !isOwner(actor.user, row)) {
      throw forbidden('ยกเลิกได้เฉพาะคำขอของตัวเอง');
    }
    assertMove(row.status, StorageRequestStatus.CANCELLED, 'ยกเลิก');
    return this.moveFromPending(id, actor, 'STORAGE_REQUEST_CANCEL', `ยกเลิกคำขอพื้นที่ ${id}`, {
      status: StorageRequestStatus.CANCELLED,
    });
  }

  /** เจ้าหน้าที่สั่งสร้างพื้นที่ใหม่หลัง provider ล้ม */
  async retryProvision(id: string, actor: Actor) {
    this.assertEnabled();
    if (!hasStoragePermission(actor.user, S.PROVISION_RETRY)) throw forbidden();
    const row = await this.mustExist(id);
    if (row.status !== StorageRequestStatus.PROVISION_FAILED) {
      throw conflict('STATE_INVALID', `สั่งสร้างซ้ำได้เฉพาะ PROVISION_FAILED (ตอนนี้ ${row.status})`);
    }
    await this.audit.log({ coreUserId: actor.user.id, action: 'STORAGE_PROVISION_RETRY', details: `สั่งสร้างพื้นที่ ${id} ใหม่` });
    return this.provisionOne(id);
  }

  /**
   * สร้างพื้นที่ที่ provider แล้วเปลี่ยนเป็น ACTIVE — เรียกซ้ำได้ (provider ต้อง idempotent)
   * ไม่โยน error ของ provider ออกไป: บันทึกเป็น PROVISION_FAILED แล้วคืนสถานะล่าสุด
   */
  async provisionOne(id: string) {
    const row = await this.mustExist(id);
    const retryable: StorageRequestStatus[] = [StorageRequestStatus.PROVISIONING, StorageRequestStatus.PROVISION_FAILED];
    if (!retryable.includes(row.status)) return this.publicRow(id);

    await this.prisma.storageRequest.update({ where: { id }, data: { provisionAttempts: { increment: 1 } } });

    try {
      const out = await this.provider.provision({ requestId: id, quotaMib: row.quotaMib, expiresOn: toDateString(row.endDate) });
      await this.prisma.$transaction(async (tx) => {
        const moved = await tx.storageRequest.updateMany({
          where: { id, status: { in: retryable } },
          data: {
            status: StorageRequestStatus.ACTIVE,
            providerRef: out.providerRef,
            shareUrlEnc: this.box.seal(out.shareUrl, id),
            sharePasswordEnc: this.box.seal(out.sharePassword, id),
            activatedAt: new Date(),
            lastError: null,
          },
        });
        if (moved.count === 1) {
          await this.audit.log({ coreUserId: null, action: 'STORAGE_ACTIVATE', details: `สร้างพื้นที่ ${id} ที่ ${this.provider.name} แล้ว` }, tx);
        }
      });
    } catch (e) {
      const lastError = safeProviderError(e);
      await this.prisma.storageRequest.updateMany({
        where: { id, status: { in: retryable } },
        data: { status: StorageRequestStatus.PROVISION_FAILED, lastError },
      });
      logEvent('request.error', { path: 'storage.provision', requestId: id, provider: this.provider.name, error: e instanceof Error ? e.name : 'unknown' });
      await this.audit.log({ coreUserId: null, action: 'STORAGE_PROVISION_FAILED', details: `สร้างพื้นที่ ${id} ไม่สำเร็จ — ${lastError}` });
    }
    return this.publicRow(id);
  }

  // ──────────────────────── ภายใน ────────────────────────

  private async activePool() {
    const name = process.env.STORAGE_POOL_NAME?.trim() || DEFAULT_POOL;
    const pool = await this.prisma.storagePool.findUnique({ where: { name } });
    if (!pool || !pool.isActive) throw unavailable(`ยังไม่เปิดให้ยืมพื้นที่ (ไม่พบ pool ${name} ที่เปิดใช้งาน)`, 300);
    return pool;
  }

  private async usageOf(poolId: string) {
    const [u] = await this.prisma.$queryRaw<
      { total_mib: number; max_per_user_mib: number; reserved_mib: number; used_mib: number; free_mib: number; active_count: number; pending_count: number }[]
    >`SELECT total_mib, max_per_user_mib, reserved_mib, used_mib, free_mib, active_count, pending_count
      FROM storage_pool_usage WHERE pool_id = ${poolId}::uuid`;
    return {
      totalMib: u.total_mib,
      maxPerUserMib: u.max_per_user_mib,
      reservedMib: u.reserved_mib,
      usedMib: u.used_mib,
      freeMib: Math.max(0, u.free_mib),
      activeCount: u.active_count,
      pendingCount: u.pending_count,
    };
  }

  private async moveFromPending(
    id: string,
    actor: Actor,
    action: string,
    details: string,
    data: Prisma.StorageRequestUpdateManyMutationInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // เงื่อนไข status = PENDING กันกรณีอีกคนเพิ่งอนุมัติไปก่อนหน้าเสี้ยววินาที
      const moved = await tx.storageRequest.updateMany({ where: { id, status: StorageRequestStatus.PENDING }, data });
      if (moved.count !== 1) throw conflict('STATE_INVALID', 'คำขอเปลี่ยนสถานะไปแล้ว กรุณาโหลดใหม่');
      await this.audit.log({ coreUserId: actor.user.id, action, details }, tx);
    });
    return this.publicRow(id);
  }

  private async scopeFor(actor: Actor): Promise<Prisma.StorageRequestWhereInput> {
    if (hasStoragePermission(actor.user, S.READ_ANY, S.REVIEW_ANY)) return {};
    if (hasStoragePermission(actor.user, S.REVIEW_OWN)) {
      return teacherScope(await this.personCodeIfTeacher(actor));
    }
    if (hasStoragePermission(actor.user, S.READ_OWN)) return { coreUserId: actor.user.id };
    throw forbidden('บทบาทของคุณดูคำขอยืมพื้นที่ไม่ได้');
  }

  private async personCodeIfTeacher(actor: Actor): Promise<string | null> {
    if (!hasStoragePermission(actor.user, S.REVIEW_OWN) || hasStoragePermission(actor.user, S.REVIEW_ANY)) return null;
    return (await this.people.me(actor.token))?.personCode ?? null;
  }

  private async mustExist(id: string) {
    const row = await this.prisma.storageRequest.findUnique({ where: { id } });
    if (!row) throw notFound('ไม่พบคำขอพื้นที่ที่ระบุ');
    return row;
  }

  private async publicRow(id: string) {
    const row = await this.prisma.storageRequest.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!row) throw notFound('ไม่พบคำขอพื้นที่ที่ระบุ');
    return row;
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

interface LockedRequest {
  id: string;
  pool_id: string;
  core_user_id: string;
  teacher_person_code: string | null;
  status: StorageRequestStatus;
  quota_mib: number;
}

interface LockedPool {
  total_mib: number;
  max_per_user_mib: number;
  is_active: boolean;
}

function assertMove(from: StorageRequestStatus, to: StorageRequestStatus, verb: string) {
  if (!canMoveStorage(from, to)) {
    throw conflict('STATE_INVALID', `${verb}ไม่ได้: คำขออยู่ในสถานะ ${from}`, { from, to, allowedNext: STORAGE_TRANSITIONS[from] });
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
