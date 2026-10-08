import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { Prisma, StorageRequestStatus } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { unavailable } from '../common/errors';
import { logEvent } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from './providers/storage-provider';
import { SECRET_BOX, type SecretBox } from './secret-box';
import { StorageRequestsService } from './storage-requests.service';

export const STORAGE_JOBS = ['expire', 'release', 'sync-usage', 'retry-provision'] as const;
export type StorageJobName = (typeof STORAGE_JOBS)[number];

export interface JobResult {
  job: StorageJobName;
  /** ran = ทำงานแล้ว · locked = instance อื่นกำลังทำ · disabled = ฟีเจอร์/งานปิดอยู่ */
  outcome: 'ran' | 'locked' | 'disabled';
  processed: number;
  failed: number;
}

/** เลขล็อกประจำงาน (pg advisory lock) — ห้ามซ้ำกับงานอื่นในระบบ */
const LOCK_KEY: Record<StorageJobName, number> = {
  expire: 420801,
  release: 420802,
  'sync-usage': 420803,
  'retry-provision': 420804,
};

const BATCH = 50;
const TZ = 'Asia/Bangkok';

/**
 * งานตั้งเวลาของระบบยืมพื้นที่ (tech-stack ข้อ 1.4.1)
 *
 * | งาน | เวลา (ไทย) | ทำอะไร |
 * |---|---|---|
 * | expire | ทุกวัน 00:10 | ACTIVE ที่เลยวันสิ้นสุด → ปิดลิงก์ที่ provider → EXPIRED |
 * | release | ทุกวัน 02:10 | EXPIRED เกิน STORAGE_RETENTION_DAYS (14) วัน → ลบพื้นที่ → RELEASED (คืนโควตาเข้า pool) |
 * | sync-usage | ทุก 30 นาที | อัปเดตพื้นที่ที่ใช้จริงของ ACTIVE ทีละ 50 แถว |
 * | retry-provision | ทุก 15 นาที | PROVISION_FAILED (ลองไม่เกิน 5 ครั้ง) / PROVISIONING ที่ค้าง → สร้างพื้นที่ใหม่ |
 *
 * - ทุกงานครอบด้วย pg_try_advisory_xact_lock — รันหลาย instance ได้ ไม่ทำซ้ำ
 * - เปลี่ยนสถานะ "หลัง" provider ทำสำเร็จเท่านั้น และมีเงื่อนไขสถานะใน WHERE เสมอ → รันซ้ำได้ไม่เสียหาย
 * - แถวที่ provider ล้มถูกข้ามไว้ รอบหน้าลองใหม่เอง
 * - ปิดงานอัตโนมัติด้วย STORAGE_JOBS_ENABLED=false · ไม่ตั้ง STORAGE_SECRET_KEY = ทุกงานไม่ทำอะไร
 */
@Injectable()
export class StorageJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageRequestsService,
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox | null,
  ) {}

  // ───────────────────────── ตารางเวลา ─────────────────────────

  @Cron('10 0 * * *', { name: 'storage-expire', timeZone: TZ })
  cronExpire() {
    return this.scheduled('expire');
  }

  @Cron('10 2 * * *', { name: 'storage-release', timeZone: TZ })
  cronRelease() {
    return this.scheduled('release');
  }

  @Cron('*/30 * * * *', { name: 'storage-sync-usage', timeZone: TZ })
  cronSyncUsage() {
    return this.scheduled('sync-usage');
  }

  @Cron('*/15 * * * *', { name: 'storage-retry-provision', timeZone: TZ })
  cronRetry() {
    return this.scheduled('retry-provision');
  }

  // ───────────────────────── เรียกเอง ─────────────────────────

  /** สั่งรันทันที (admin กดจากหน้าเว็บ / ใช้ทดสอบ) — ไม่สน STORAGE_JOBS_ENABLED แต่ต้องเปิดฟีเจอร์แล้ว */
  /** @param poolId จำกัดเฉพาะ pool เดียว (ไม่ระบุ = ทุก pool) — test ใช้แยกข้อมูลของตัวเองจากชุดอื่นที่รันพร้อมกัน */
  async run(job: StorageJobName, poolId: string | null = null): Promise<JobResult> {
    if (!this.secretBox) throw unavailable('ระบบยืมพื้นที่ยังไม่เปิดใช้งาน (ผู้ดูแลยังไม่ได้ตั้งค่า)', 300);
    switch (job) {
      case 'expire':
        return this.locked(job, (tx) => this.expire(tx, poolId));
      case 'release':
        return this.locked(job, (tx) => this.release(tx, poolId));
      case 'sync-usage':
        return this.locked(job, (tx) => this.syncUsage(tx, poolId));
      case 'retry-provision':
        return this.locked(job, () => this.retryProvision(poolId));
    }
  }

  private async scheduled(job: StorageJobName): Promise<JobResult> {
    if (!this.secretBox || process.env.STORAGE_JOBS_ENABLED === 'false') {
      return { job, outcome: 'disabled', processed: 0, failed: 0 };
    }
    try {
      return await this.run(job);
    } catch (e) {
      // งานตั้งเวลาห้ามทำให้แอปล้ม — log แล้วรอรอบหน้า
      logEvent('request.error', { path: `storage.job.${job}`, error: e instanceof Error ? e.name : 'unknown' });
      return { job, outcome: 'ran', processed: 0, failed: 1 };
    }
  }

  // ───────────────────────── งาน ─────────────────────────

  /** ACTIVE ที่วันสิ้นสุดผ่านไปแล้ว (นับวันตามเวลาไทย) → ปิดลิงก์ → EXPIRED */
  private async expire(tx: Prisma.TransactionClient, poolId: string | null) {
    const rows = await tx.$queryRaw<{ id: string; provider_ref: string }[]>`
      SELECT id, provider_ref FROM storage_requests
      WHERE status = 'ACTIVE' AND end_date < (now() AT TIME ZONE ${TZ})::date
        AND (${poolId}::uuid IS NULL OR pool_id = ${poolId}::uuid)
      ORDER BY end_date, id LIMIT ${BATCH}`;
    return this.each(rows, 'expire', async (r) => {
      await this.provider.disableShare(r.provider_ref);
      const moved = await tx.storageRequest.updateMany({
        where: { id: r.id, status: StorageRequestStatus.ACTIVE },
        data: { status: StorageRequestStatus.EXPIRED, expiredAt: new Date() },
      });
      if (moved.count === 1) {
        await this.audit.log({ coreUserId: null, action: 'STORAGE_EXPIRE', details: `ปิดลิงก์พื้นที่ ${r.id} (หมดอายุ)` }, tx);
      }
    });
  }

  /** EXPIRED ที่พ้นช่วงเก็บรักษา → ลบพื้นที่ → RELEASED (ลบลิงก์ที่เข้ารหัสทิ้งด้วย) */
  private async release(tx: Prisma.TransactionClient, poolId: string | null) {
    // เทียบกับเวลาที่คำนวณฝั่งแอป ไม่ใช่ now() ของฐาน — expired_at เขียนโดยแอป (ดู minutesAgo)
    const cutoff = minutesAgo(retentionDays() * 24 * 60);
    const rows = await tx.$queryRaw<{ id: string; provider_ref: string | null }[]>`
      SELECT id, provider_ref FROM storage_requests
      WHERE status = 'EXPIRED' AND expired_at < ${cutoff}
        AND (${poolId}::uuid IS NULL OR pool_id = ${poolId}::uuid)
      ORDER BY expired_at, id LIMIT ${BATCH}`;
    return this.each(rows, 'release', async (r) => {
      if (r.provider_ref) await this.provider.destroy(r.provider_ref);
      const moved = await tx.storageRequest.updateMany({
        where: { id: r.id, status: StorageRequestStatus.EXPIRED },
        data: { status: StorageRequestStatus.RELEASED, releasedAt: new Date(), shareUrlEnc: null, sharePasswordEnc: null },
      });
      if (moved.count === 1) {
        await this.audit.log({ coreUserId: null, action: 'STORAGE_RELEASE', details: `ลบพื้นที่ ${r.id} คืนโควตาเข้า pool` }, tx);
      }
    });
  }

  /** อัปเดต used_mib ของ ACTIVE — แถวที่ sync นานสุดก่อน */
  private async syncUsage(tx: Prisma.TransactionClient, poolId: string | null) {
    const rows = await tx.$queryRaw<{ id: string; provider_ref: string }[]>`
      SELECT id, provider_ref FROM storage_requests
      WHERE status = 'ACTIVE'
        AND (${poolId}::uuid IS NULL OR pool_id = ${poolId}::uuid)
      ORDER BY usage_synced_at ASC NULLS FIRST, id LIMIT ${BATCH}`;
    return this.each(rows, 'sync-usage', async (r) => {
      const usedMib = await this.provider.usageMib(r.provider_ref);
      await tx.storageRequest.updateMany({
        where: { id: r.id, status: StorageRequestStatus.ACTIVE },
        data: { usedMib: Math.max(0, Math.round(usedMib)), usageSyncedAt: new Date() },
      });
    });
  }

  /** สร้างพื้นที่ใหม่ให้คำขอที่ provider ล้ม หรือค้างกลางทาง (เช่น backend ดับระหว่างสร้าง) */
  private async retryProvision(poolId: string | null) {
    const max = maxAttempts();
    const failedBefore = minutesAgo(10);
    const stuckBefore = minutesAgo(15);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM storage_requests
      WHERE ((status = 'PROVISION_FAILED' AND provision_attempts < ${max}::int AND updated_at < ${failedBefore})
         OR (status = 'PROVISIONING' AND updated_at < ${stuckBefore}))
        AND (${poolId}::uuid IS NULL OR pool_id = ${poolId}::uuid)
      ORDER BY updated_at, id LIMIT ${BATCH}`;
    return this.each(rows, 'retry-provision', async (r) => {
      // provisionOne ไม่โยน error ของ provider — ดูผลจากสถานะที่คืนมา
      const after = await this.storage.provisionOne(r.id);
      if (after.status !== StorageRequestStatus.ACTIVE) throw new Error('still_failing');
    });
  }

  // ───────────────────────── ภายใน ─────────────────────────

  private async locked(job: StorageJobName, work: (tx: Prisma.TransactionClient) => Promise<Counts>): Promise<JobResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY[job]}::bigint) AS locked`;
        if (!locked) return { job, outcome: 'locked' as const, processed: 0, failed: 0 };
        const counts = await work(tx);
        return { job, outcome: 'ran' as const, ...counts };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  /** ทำทีละแถว — แถวหนึ่งล้มไม่ลากแถวอื่น · log แค่ id ไม่ log ลิงก์ */
  private async each<T extends { id: string }>(rows: T[], job: StorageJobName, fn: (row: T) => Promise<void>): Promise<Counts> {
    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await fn(row);
        processed++;
      } catch (e) {
        failed++;
        logEvent('request.error', { path: `storage.job.${job}`, requestId: row.id, error: e instanceof Error ? e.name : 'unknown' });
      }
    }
    return { processed, failed };
  }
}

interface Counts {
  processed: number;
  failed: number;
}

function intEnv(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n >= 0 && process.env[key] !== '' && process.env[key] !== undefined ? n : fallback;
}

/**
 * เวลาย้อนหลังแบบคำนวณฝั่งแอป — คอลัมน์ที่แอปเขียน (updated_at · expired_at) ต้องเทียบกับค่าที่ส่งผ่าน Prisma แบบเดียวกัน
 * เพราะ driver adapter ของ Prisma ส่งเวลาโดยไม่มี offset ถ้าฐานตั้ง timezone เป็น Asia/Bangkok
 * ค่าที่เก็บจะคลาดจาก now() ของฐาน 7 ชั่วโมง (เทียบกับ now() ตรง ๆ จึงผิด)
 */
function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

export const retentionDays = () => intEnv('STORAGE_RETENTION_DAYS', 14);
export const maxAttempts = () => intEnv('STORAGE_MAX_PROVISION_ATTEMPTS', 5);
