import { randomBytes } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { permissionsOf } from '../src/auth/permissions';
import type { SubsystemRole } from '../src/auth/role-mapping';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeStorageProvider } from '../src/storage/providers/fake.provider';
import type { StorageProvider } from '../src/storage/providers/storage-provider';
import { SecretBox } from '../src/storage/secret-box';
import { StorageJobsService } from '../src/storage/storage-jobs.service';
import { StorageRequestsService } from '../src/storage/storage-requests.service';

/**
 * งานตั้งเวลา กับฐานข้อมูลจริง (sandbox เท่านั้น) — รันเมื่อตั้ง STORAGE_IT_DATABASE_URL
 * ไม่ต้องรอถึงเที่ยงคืน: ย้อนวันที่ในแถวทดสอบแล้วสั่ง run() ตรง ๆ
 */
const IT_URL = process.env.STORAGE_IT_DATABASE_URL?.trim();
const dbName = IT_URL ? new URL(IT_URL).pathname.replace(/^\//, '') : '';
const run = IT_URL && /sandbox|test/i.test(dbName) ? describe : describe.skip;

const GB = 1024;
// ย้อนเวลาผ่าน Prisma (แบบเดียวกับที่แอปเขียน) — ไม่ใช้ now() ของฐาน ดูเหตุผลที่ minutesAgo ใน storage-jobs.service.ts
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

// ฐานจริง + หลายชุดรันพร้อมกัน บน Windows ช้ากว่า 5 วินาทีของ jest ได้
jest.setTimeout(60_000);

const actor = (role: SubsystemRole, id: string) => ({
  token: 'it-token',
  user: { id, email: null, coreRole: 'student' as const, subsystemRole: role, permissions: permissionsOf(role), exp: 0, expiresAt: '' },
});

class SwitchProvider extends FakeStorageProvider {
  fail = false;
  override provision(i: Parameters<StorageProvider['provision']>[0]) {
    return this.fail ? Promise.reject(new Error('provider down')) : super.provision(i);
  }
}

run('StorageJobsService กับฐานข้อมูลจริง (sandbox)', () => {
  let prisma: PrismaService;
  let root: string;
  let provider: SwitchProvider;
  let svc: StorageRequestsService;
  let jobs: StorageJobsService;
  let poolId: string;
  const saved = { db: process.env.DATABASE_URL, pool: process.env.STORAGE_POOL_NAME, silent: process.env.LOG_SILENT, jobs: process.env.STORAGE_JOBS_ENABLED };

  beforeAll(async () => {
    process.env.DATABASE_URL = IT_URL;
    process.env.LOG_SILENT = '1';
    prisma = new PrismaService();
    root = await mkdtemp(join(tmpdir(), 'cloudflow-jobs-'));
    provider = new SwitchProvider(root);
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const people = { me: async () => ({ personCode: 'it.teacher', personType: 'STAFF', advisors: [] }) };
    const reference = { isActiveCourse: async () => true };
    const audit = new AuditService(prisma);
    svc = new StorageRequestsService(prisma, audit, people as never, reference as never, provider, box);
    jobs = new StorageJobsService(prisma, audit, svc, provider, box);
  });

  beforeEach(async () => {
    provider.fail = false;
    process.env.STORAGE_POOL_NAME = `it-${randomBytes(4).toString('hex')}`;
    poolId = (await prisma.storagePool.create({ data: { name: process.env.STORAGE_POOL_NAME, provider: 'fake', totalMib: 30 * GB, maxPerUserMib: 15 * GB } })).id;
  });

  afterEach(async () => {
    await prisma.storageRequest.deleteMany({ where: { poolId } });
    await prisma.storagePool.delete({ where: { id: poolId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
    Object.assign(process.env, { DATABASE_URL: saved.db, STORAGE_POOL_NAME: saved.pool, LOG_SILENT: saved.silent });
    if (saved.jobs === undefined) delete process.env.STORAGE_JOBS_ENABLED;
    else process.env.STORAGE_JOBS_ENABLED = saved.jobs;
  });

  async function activeSpace(user = 'it-stu-1', gb = 15) {
    const req = await svc.create(
      { courseCode: '10301111-1', quotaGb: gb, reason: 'เก็บ dataset โปรเจกต์จบ', startDate: '2026-10-15', endDate: '2027-02-28' },
      actor('STUDENT', user),
    );
    return svc.approve(req.id, actor('TEACHER', 'it-teacher-1'));
  }

  const status = async (id: string) => (await prisma.storageRequest.findUniqueOrThrow({ where: { id } })).status;
  const exists = (p: string) => access(p).then(() => true, () => false);

  it('expire: เลยวันสิ้นสุด → ปิดลิงก์ → EXPIRED · ยังไม่ถึง → ไม่แตะ · รันซ้ำไม่เสียหาย', async () => {
    const old = await activeSpace('it-stu-1');
    const fresh = await activeSpace('it-stu-2');
    await prisma.$executeRaw`UPDATE storage_requests SET start_date = '2026-01-01', end_date = '2026-02-01' WHERE id = ${old.id}::uuid`;

    expect((await jobs.run('expire', poolId)).outcome).toBe('ran');
    expect(await status(old.id)).toBe('EXPIRED');
    expect(await provider.isShareEnabled(old.id)).toBe(false);
    expect(await status(fresh.id)).toBe('ACTIVE');

    await jobs.run('expire', poolId);
    expect(await status(old.id)).toBe('EXPIRED');
    // ยังไม่ลบไฟล์ และยังกินโควตาอยู่จนกว่าจะ release
    expect(await exists(join(root, old.id))).toBe(true);
    expect((await svc.poolSummary()).freeMib).toBe(0);
  });

  it('release: EXPIRED เกิน 14 วัน → ลบพื้นที่ → RELEASED · คืนโควตา · ลบลิงก์ที่เข้ารหัส', async () => {
    const a = await activeSpace('it-stu-1');
    const b = await activeSpace('it-stu-2');
    await prisma.storageRequest.update({ where: { id: a.id }, data: { status: 'EXPIRED', expiredAt: daysAgo(20) } });
    await prisma.storageRequest.update({ where: { id: b.id }, data: { status: 'EXPIRED', expiredAt: daysAgo(3) } });

    await jobs.run('release', poolId);
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe('RELEASED');
    expect(row.shareUrlEnc).toBeNull();
    expect(row.sharePasswordEnc).toBeNull();
    expect(await exists(join(root, a.id))).toBe(false);
    expect(await status(b.id)).toBe('EXPIRED');
    expect((await svc.poolSummary()).freeMib).toBe(15 * GB);

    // คืนแล้วยืมใหม่ได้
    expect((await activeSpace('it-stu-1')).status).toBe('ACTIVE');
  });

  it('sync-usage: ขนาดไฟล์จริงไปอยู่ใน used_mib และสรุป pool', async () => {
    const s = await activeSpace();
    await writeFile(join(root, s.id, 'data.bin'), Buffer.alloc(3 * 1024 * 1024));
    await jobs.run('sync-usage', poolId);
    const row = await prisma.storageRequest.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.usedMib).toBe(3);
    expect(row.usageSyncedAt).not.toBeNull();
    expect((await svc.poolSummary()).usedMib).toBeGreaterThanOrEqual(3);
  });

  it('retry-provision: รอ 10 นาทีหลังล้ม · ลองใหม่จนสำเร็จ · เกิน 5 ครั้งเลิกลอง', async () => {
    provider.fail = true;
    const failed = await activeSpace('it-stu-1');
    expect(failed.status).toBe('PROVISION_FAILED');

    provider.fail = false;
    await jobs.run('retry-provision', poolId);
    expect(await status(failed.id)).toBe('PROVISION_FAILED'); // ยังไม่ครบ 10 นาที

    await prisma.storageRequest.update({ where: { id: failed.id }, data: { updatedAt: minutesAgo(11) } });
    await jobs.run('retry-provision', poolId);
    expect(await status(failed.id)).toBe('ACTIVE');

    provider.fail = true;
    const giveUp = await activeSpace('it-stu-2');
    provider.fail = false;
    await prisma.storageRequest.update({ where: { id: giveUp.id }, data: { provisionAttempts: 5, updatedAt: minutesAgo(60) } });
    await jobs.run('retry-provision', poolId);
    expect(await status(giveUp.id)).toBe('PROVISION_FAILED');
  });

  it('มีอีกตัวถือล็อกอยู่ → locked ไม่ทำงานซ้ำ · STORAGE_JOBS_ENABLED=false → รอบอัตโนมัติไม่ทำงาน', async () => {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(420801::bigint)`;
      return jobs.run('expire', poolId);
    });
    expect(result.outcome).toBe('locked');

    process.env.STORAGE_JOBS_ENABLED = 'false';
    expect((await jobs.cronExpire()).outcome).toBe('disabled');
    process.env.STORAGE_JOBS_ENABLED = 'true';
    expect((await jobs.cronExpire()).outcome).toBe('ran');
  });
});
