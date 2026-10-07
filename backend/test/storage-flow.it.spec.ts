import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { PrismaService } from '../src/prisma/prisma.service';
import { applyEnv, jwksBody, makeKeys, sign, type TestKeys } from './helpers';

/**
 * ไหลครบทาง HTTP: นักศึกษายื่น → อาจารย์อนุมัติ → นักศึกษาเปิดลิงก์
 * ใช้ฐานจริง (sandbox เท่านั้น) + Core Hub ปลอม · รันเมื่อตั้ง STORAGE_IT_DATABASE_URL (ดู storage-requests.it.spec.ts)
 */
const IT_URL = process.env.STORAGE_IT_DATABASE_URL?.trim();
const dbName = IT_URL ? new URL(IT_URL).pathname.replace(/^\//, '') : '';
const run = IT_URL && /sandbox|test/i.test(dbName) ? describe : describe.skip;

run('HTTP flow: storage lending (sandbox)', () => {
  let app: INestApplication;
  let keys: TestKeys;
  let prisma: PrismaService;
  let root: string;
  let poolId: string;
  const original = global.fetch;

  beforeAll(async () => {
    applyEnv();
    root = await mkdtemp(join(tmpdir(), 'cloudflow-flow-'));
    Object.assign(process.env, {
      DATABASE_URL: IT_URL,
      STORAGE_SECRET_KEY: randomBytes(32).toString('base64'),
      STORAGE_PROVIDER: 'fake',
      STORAGE_FAKE_ROOT: root,
      STORAGE_POOL_NAME: `it-${randomBytes(4).toString('hex')}`,
    });
    keys = await makeKeys();
    const jwks = await jwksBody(keys);

    // Core Hub ปลอม: JWKS · รายวิชา · /people/me
    global.fetch = (async (input: unknown) => {
      const url = new URL(String(input));
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.pathname.endsWith('/.well-known/jwks.json')) return json(jwks);
      if (url.pathname.endsWith('/courses')) {
        return json({
          success: true,
          data: [{ code: '10301111-1', nameTh: 'วิชาทดสอบ', nameEn: null, credits: 3, isActive: true, updatedAt: '2026-01-01T00:00:00Z' }],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        });
      }
      if (url.pathname.endsWith('/people/me')) return json({ success: true, data: { personCode: 'it.person', personType: 'STAFF', advisors: [] } });
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const { createApp } = await import('../src/main');
    ({ app } = await createApp());
    await app.init();
    const { PrismaService: PS } = await import('../src/prisma/prisma.service');
    prisma = app.get(PS);
    poolId = (
      await prisma.storagePool.create({
        data: { name: process.env.STORAGE_POOL_NAME!, provider: 'fake', totalMib: 30 * 1024, maxPerUserMib: 15 * 1024 },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.storageRequest.deleteMany({ where: { poolId } });
    await prisma.storagePool.delete({ where: { id: poolId } });
    await app.close();
    global.fetch = original;
    await rm(root, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const as = async (role: string, sub: string) => `Bearer ${await sign(keys, { role }, { sub })}`;

  it('ยื่น → อนุมัติ → เปิดลิงก์ได้เฉพาะเจ้าของ · list ไม่มีลิงก์หลุด', async () => {
    const student = await as('student', 'it-flow-stu');
    const created = await http()
      .post('/api/v1/storage-requests')
      .set('Authorization', student)
      .send({ courseCode: '10301111-1', quotaGb: 15, reason: 'เก็บ dataset โปรเจกต์จบ', startDate: '2026-10-15', endDate: '2027-02-28' })
      .expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.status).toBe('PENDING');

    const pool = await http().get('/api/v1/storage-pools/current').set('Authorization', student).expect(200);
    expect(pool.body.data).toMatchObject({ totalGb: 30, freeGb: 30, pendingCount: 1 });

    const approved = await http().post(`/api/v1/storage-requests/${id}/approve`).set('Authorization', await as('lecturer', 'it-flow-t')).expect(200);
    expect(approved.body.data.status).toBe('ACTIVE');

    const list = await http().get('/api/v1/storage-requests').set('Authorization', student).expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(/dev-storage|shareUrl|share_url/);

    const access = await http().get(`/api/v1/storage-requests/${id}/access`).set('Authorization', student).expect(200);
    expect(access.headers['cache-control']).toBe('no-store');
    expect(access.body.data.shareUrl).toContain(id);
    expect(access.body.data.sharePassword).toBeTruthy();

    await http().get(`/api/v1/storage-requests/${id}/access`).set('Authorization', await as('student', 'it-flow-other')).expect(403);

    const after = await http().get('/api/v1/storage-pools/current').set('Authorization', student).expect(200);
    expect(after.body.data).toMatchObject({ freeGb: 15, fullSlotsLeft: 1, activeCount: 1 });
  });
});
