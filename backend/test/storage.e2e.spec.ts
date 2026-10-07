import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { applyEnv, jwksBody, makeKeys, mockJwksFetch, sign, type TestKeys } from './helpers';

/**
 * HTTP ของระบบยืมพื้นที่ — ไม่ต้องมีฐานข้อมูล (ทุกเคสจบก่อนแตะฐาน)
 * ไม่ตั้ง STORAGE_SECRET_KEY = ฟีเจอร์ปิด: แอปยังบูตได้ และ endpoint storage ตอบ 503
 */
describe('HTTP: storage lending', () => {
  let app: INestApplication;
  let keys: TestKeys;
  let restore: () => void;

  beforeAll(async () => {
    applyEnv();
    delete process.env.STORAGE_SECRET_KEY;
    keys = await makeKeys();
    ({ restore } = mockJwksFetch(await jwksBody(keys)));
    const { createApp } = await import('../src/main');
    ({ app } = await createApp());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restore();
  });

  const http = () => request(app.getHttpServer());
  const as = async (role: string) => `Bearer ${await sign(keys, { role })}`;
  const ID = '6f1c2f8e-0d55-4b8e-9c7a-1d1f2b3c4d5e';

  it('ไม่มี token → 401', async () => {
    await http().get('/api/v1/storage-pools/current').expect(401);
    await http().get('/api/v1/storage-requests').expect(401);
  });

  it('/api/v1/me บอก permission ของ storage ตาม role', async () => {
    const stu = await http().get('/api/v1/me').set('Authorization', await as('student')).expect(200);
    expect(stu.body.data.permissions).toEqual(expect.arrayContaining(['storage:create:own', 'storage-link:read:own']));
    const t = await http().get('/api/v1/me').set('Authorization', await as('lecturer')).expect(200);
    expect(t.body.data.permissions).toContain('storage:review:own');
    expect(t.body.data.permissions).not.toContain('storage:create:own');
  });

  it('อาจารย์ยื่นคำขอไม่ได้ · staff อนุมัติไม่ได้ · นักศึกษาสั่งสร้างซ้ำไม่ได้ → 403', async () => {
    const body = { courseCode: '10301111-1', quotaGb: 15, reason: 'เก็บ dataset โปรเจกต์จบ', startDate: '2026-10-15', endDate: '2027-02-28' };
    await http().post('/api/v1/storage-requests').set('Authorization', await as('lecturer')).send(body).expect(403);
    await http().post(`/api/v1/storage-requests/${ID}/approve`).set('Authorization', await as('staff')).expect(403);
    await http().post(`/api/v1/storage-requests/${ID}/retry-provision`).set('Authorization', await as('student')).expect(403);
    await http().get(`/api/v1/storage-requests/${ID}/access`).set('Authorization', await as('lecturer')).expect(403);
  });

  it('id ไม่ใช่ UUID / body ผิด → 400 VALIDATION_ERROR', async () => {
    const auth = await as('student');
    const bad = await http().get('/api/v1/storage-requests/not-a-uuid').set('Authorization', auth).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const body = await http()
      .post('/api/v1/storage-requests')
      .set('Authorization', auth)
      .send({ courseCode: '10301111-1', quotaGb: 0, reason: 'สั้น', startDate: '2026-13-01', endDate: '2027-02-28' })
      .expect(400);
    expect(body.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ยังไม่ตั้ง STORAGE_SECRET_KEY → 503 พร้อม Retry-After (ฟีเจอร์ปิด ส่วนอื่นทำงานปกติ)', async () => {
    const res = await http().get('/api/v1/storage-pools/current').set('Authorization', await as('student')).expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.headers['retry-after']).toBe('300');
    await http().get('/api/health').expect(200);
  });
});
