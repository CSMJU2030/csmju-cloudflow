import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { permissionsOf } from '../src/auth/permissions';
import type { SubsystemRole } from '../src/auth/role-mapping';
import { AuditService } from '../src/audit/audit.service';
import { ApiException } from '../src/common/errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeStorageProvider } from '../src/storage/providers/fake.provider';
import type { StorageProvider } from '../src/storage/providers/storage-provider';
import { SecretBox } from '../src/storage/secret-box';
import { StorageRequestsService } from '../src/storage/storage-requests.service';

/**
 * ทดสอบกับฐานข้อมูลจริง — รันเฉพาะเมื่อตั้ง STORAGE_IT_DATABASE_URL (ไม่ตั้ง = ข้ามทั้งไฟล์)
 * ยอมรับเฉพาะฐานที่ชื่อมีคำว่า sandbox หรือ test — กันพลาดไปเขียนฐานจริง cs_cloudflow
 *
 * สร้าง pool ชั่วคราวชื่อ it-xxxx ต่อหนึ่งเคส แล้วลบทิ้งตอนจบ
 * (audit_logs ของเคสทดสอบจะค้างอยู่ เพราะตารางนั้นลบไม่ได้โดยออกแบบ — ใช้กับ sandbox เท่านั้น)
 */
const IT_URL = process.env.STORAGE_IT_DATABASE_URL?.trim();
const dbName = IT_URL ? new URL(IT_URL).pathname.replace(/^\//, '') : '';
const SAFE = /sandbox|test/i.test(dbName);
const run = IT_URL && SAFE ? describe : describe.skip;

if (IT_URL && !SAFE) {
  console.warn(`ข้าม storage-requests.it: ฐาน "${dbName}" ไม่ใช่ sandbox/test`);
}

const GB = 1024;

const actor = (role: SubsystemRole, id: string) => ({
  token: 'it-token',
  user: {
    id,
    email: null,
    coreRole: (role === 'TEACHER' ? 'lecturer' : role.toLowerCase()) as 'student',
    subsystemRole: role,
    permissions: permissionsOf(role),
    exp: 0,
    expiresAt: '',
  },
});

const dto = (gb = 15) => ({
  courseCode: '10301111-1',
  quotaGb: gb,
  reason: 'เก็บ dataset สำหรับโปรเจกต์จบ',
  startDate: '2026-10-15',
  endDate: '2027-02-28',
});

class FlakyProvider implements StorageProvider {
  readonly name = 'flaky';
  fail = true;
  constructor(private readonly inner: FakeStorageProvider) {}
  provision(i: Parameters<StorageProvider['provision']>[0]) {
    if (this.fail) return Promise.reject(new Error('connect ECONNREFUSED https://cloud.example/ocs?token=abc'));
    return this.inner.provision(i);
  }
  usageMib(r: string) {
    return this.inner.usageMib(r);
  }
  disableShare(r: string) {
    return this.inner.disableShare(r);
  }
  destroy(r: string) {
    return this.inner.destroy(r);
  }
  health() {
    return this.inner.health();
  }
}

run('StorageRequestsService กับฐานข้อมูลจริง (sandbox)', () => {
  let prisma: PrismaService;
  let root: string;
  let fake: FakeStorageProvider;
  let box: SecretBox;
  let poolId: string;
  let poolName: string;
  const people = { me: jest.fn(async () => ({ personCode: 'it.teacher', personType: 'STAFF', advisors: [] })) };
  const reference = { isActiveCourse: jest.fn(async () => true) };
  const savedEnv = { db: process.env.DATABASE_URL, pool: process.env.STORAGE_POOL_NAME, silent: process.env.LOG_SILENT };

  const make = (provider: StorageProvider = fake) =>
    new StorageRequestsService(prisma, new AuditService(prisma), people as never, reference as never, provider, box);

  beforeAll(async () => {
    process.env.DATABASE_URL = IT_URL;
    process.env.LOG_SILENT = '1';
    prisma = new PrismaService();
    root = await mkdtemp(join(tmpdir(), 'cloudflow-it-'));
    fake = new FakeStorageProvider(root);
    box = new SecretBox(randomBytes(32).toString('base64'));
  });

  beforeEach(async () => {
    poolName = `it-${randomBytes(4).toString('hex')}`;
    process.env.STORAGE_POOL_NAME = poolName;
    // pool เล็ก 30 GB = ยืมเต็มได้ 2 คน
    const pool = await prisma.storagePool.create({
      data: { name: poolName, provider: 'fake', totalMib: 30 * GB, maxPerUserMib: 15 * GB },
    });
    poolId = pool.id;
  });

  afterEach(async () => {
    await prisma.storageRequest.deleteMany({ where: { poolId } });
    await prisma.storagePool.delete({ where: { id: poolId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
    process.env.DATABASE_URL = savedEnv.db;
    process.env.STORAGE_POOL_NAME = savedEnv.pool;
    process.env.LOG_SILENT = savedEnv.silent;
  });

  const code = (e: unknown) => {
    expect(e).toBeInstanceOf(ApiException);
    const ex = e as ApiException;
    return { status: ex.getStatus(), reason: (ex.details as { reason?: string } | undefined)?.reason };
  };

  it('ยื่น → อาจารย์อนุมัติ → ACTIVE · ลิงก์ในฐานถูกเข้ารหัส · เจ้าของเปิดดูได้คนเดียว', async () => {
    const svc = make();
    const stu = actor('STUDENT', 'it-stu-1');
    const req = await svc.create(dto(15), stu);
    expect(req.status).toBe('PENDING');
    expect(req).not.toHaveProperty('shareUrlEnc');

    const done = await svc.approve(req.id, actor('TEACHER', 'it-teacher-1'));
    expect(done.status).toBe('ACTIVE');
    expect(done.provisionAttempts).toBe(1);

    const [raw] = await prisma.$queryRaw<{ share_url_enc: string }[]>`
      SELECT share_url_enc FROM storage_requests WHERE id = ${req.id}::uuid`;
    expect(raw.share_url_enc).toMatch(/^v1\./);
    expect(raw.share_url_enc).not.toContain('http');

    const link = await svc.revealLink(req.id, stu);
    expect(link.shareUrl).toContain(req.id);
    expect(link.sharePassword).toBeTruthy();
    expect(await fake.isShareEnabled(req.id)).toBe(true);

    expect(code(await svc.revealLink(req.id, actor('STUDENT', 'it-stu-2')).catch((e) => e)).status).toBe(403);

    const summary = await svc.poolSummary();
    expect(summary.freeMib).toBe(15 * GB);
    expect(summary.fullSlotsLeft).toBe(1);
  });

  it('ยื่นซ้ำระหว่างรอ → 409 ALREADY_PENDING · มีพื้นที่แล้วยื่นอีก → 409 ALREADY_HAS_SPACE', async () => {
    const svc = make();
    const stu = actor('STUDENT', 'it-stu-1');
    const req = await svc.create(dto(5), stu);
    expect(code(await svc.create(dto(5), stu).catch((e) => e))).toEqual({ status: 409, reason: 'ALREADY_PENDING' });
    await svc.approve(req.id, actor('TEACHER', 'it-teacher-1'));
    expect(code(await svc.create(dto(5), stu).catch((e) => e))).toEqual({ status: 409, reason: 'ALREADY_HAS_SPACE' });
  });

  it('ขอเกิน 15 GB → 400 · staff อนุมัติไม่ได้ → 403 · อนุมัติใบที่ยกเลิกแล้ว → 409', async () => {
    const svc = make();
    expect(code(await svc.create(dto(16), actor('STUDENT', 'it-stu-1')).catch((e) => e)).status).toBe(400);

    const req = await svc.create(dto(10), actor('STUDENT', 'it-stu-1'));
    expect(code(await svc.approve(req.id, actor('STAFF', 'it-staff-1')).catch((e) => e)).status).toBe(403);
    expect(code(await svc.cancel(req.id, actor('STUDENT', 'it-stu-2')).catch((e) => e)).status).toBe(403);

    const cancelled = await svc.cancel(req.id, actor('STUDENT', 'it-stu-1'));
    expect(cancelled.status).toBe('CANCELLED');
    expect(code(await svc.approve(req.id, actor('TEACHER', 'it-teacher-1')).catch((e) => e))).toEqual({
      status: 409,
      reason: 'STATE_INVALID',
    });
  });

  it('อนุมัติพร้อมกัน 3 ใบใน pool 30 GB → ผ่าน 2 ใบพอดี ไม่มีทางจองเกิน', async () => {
    const svc = make();
    const reqs = await Promise.all(['a', 'b', 'c'].map((s) => svc.create(dto(15), actor('STUDENT', `it-stu-${s}`))));

    const results = await Promise.allSettled(reqs.map((r) => svc.approve(r.id, actor('TEACHER', 'it-teacher-1'))));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(code(failed[0].reason)).toEqual({ status: 409, reason: 'POOL_FULL' });

    const summary = await svc.poolSummary();
    expect(summary.reservedMib).toBe(30 * GB);
    expect(summary.freeMib).toBe(0);
    expect(summary.pendingCount).toBe(1);
  });

  it('provider ล้ม → PROVISION_FAILED (ยังถือโควตา · error ไม่มี URL) → staff สั่งใหม่ → ACTIVE', async () => {
    const flaky = new FlakyProvider(fake);
    const svc = make(flaky);
    const req = await svc.create(dto(15), actor('STUDENT', 'it-stu-1'));

    const failed = await svc.approve(req.id, actor('TEACHER', 'it-teacher-1'));
    expect(failed.status).toBe('PROVISION_FAILED');
    expect(failed.lastError).toContain('[url]');
    expect(failed.lastError).not.toContain('cloud.example');
    expect((await svc.poolSummary()).reservedMib).toBe(15 * GB);

    expect(code(await svc.retryProvision(req.id, actor('STUDENT', 'it-stu-1')).catch((e) => e)).status).toBe(403);

    flaky.fail = false;
    const ok = await svc.retryProvision(req.id, actor('STAFF', 'it-staff-1'));
    expect(ok.status).toBe('ACTIVE');
    expect(ok.provisionAttempts).toBe(2);
    expect(ok.lastError).toBeNull();
  });

  it('ปฏิเสธต้องมีเหตุผล และอนุมัติซ้ำไม่ได้ · ไฟล์ที่อัปโหลดถูกนับขนาด', async () => {
    const svc = make();
    const r1 = await svc.create(dto(1), actor('STUDENT', 'it-stu-1'));
    const rejected = await svc.reject(r1.id, { rejectReason: 'ยังไม่จำเป็นในรายวิชานี้' }, actor('TEACHER', 'it-teacher-1'));
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectReason).toBe('ยังไม่จำเป็นในรายวิชานี้');

    const r2 = await svc.create(dto(1), actor('STUDENT', 'it-stu-1'));
    await svc.approve(r2.id, actor('TEACHER', 'it-teacher-1'));
    expect(code(await svc.approve(r2.id, actor('TEACHER', 'it-teacher-1')).catch((e) => e)).status).toBe(409);

    await writeFile(join(root, r2.id, 'data.bin'), Buffer.alloc(3 * 1024 * 1024));
    expect(await fake.usageMib(r2.id)).toBe(3);
  });
});
