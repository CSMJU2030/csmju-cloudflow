import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { applyEnv, jwksBody, makeKeys, mockJwksFetch, sign, type TestKeys } from './helpers';

/**
 * พฤติกรรม HTTP ของชั้น auth + สัญญา API โดยไม่ต้องมีฐานข้อมูลและไม่ยิง Core Hub จริง
 * (JWKS ปลอมจากคู่กุญแจที่สร้างในเทสต์)
 */
describe('HTTP: SSO + API contract', () => {
  let app: INestApplication;
  let keys: TestKeys;
  let restore: () => void;

  beforeAll(async () => {
    applyEnv();
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

  it('GET /api/health เป็น public และบอกชื่อระบบ', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', service: 'csmju-cloudflow' } });
  });

  it('ไม่มี login ของตัวเอง', async () => {
    await http().post('/api/v1/auth/login').send({ email: 'x', password: 'y' }).expect(404);
  });

  it('ไม่มี token → 401 UNAUTHORIZED', async () => {
    const res = await http().get('/api/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('header ที่ไม่ใช่ Bearer → 401 แม้มีคุกกี้ที่ถูกต้อง', async () => {
    const token = await sign(keys);
    await http()
      .get('/api/v1/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .set('Cookie', `csmju_cloudflow_access_token=${token}`)
      .expect(401);
  });

  it('/api/v1/me คืนตัวตนจาก token (ทาง Bearer และทางคุกกี้)', async () => {
    const token = await sign(keys, { role: 'lecturer' });
    const viaHeader = await http().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(viaHeader.body.data).toMatchObject({ id: 'user-6704101323', coreRole: 'lecturer', subsystemRole: 'TEACHER' });
    expect(viaHeader.body.data.session.expiresAt).toMatch(/Z$/);
    await http().get('/api/v1/me').set('Cookie', `csmju_cloudflow_access_token=${token}`).expect(200);
  });

  it('role ที่ระบบไม่รับ → 403 FORBIDDEN', async () => {
    const res = await http().get('/api/v1/me').set('Authorization', `Bearer ${await sign(keys, { role: 'guest' })}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('นักศึกษาสร้างเครื่องไม่ได้ → 403 (ไม่ใช่ 401/404)', async () => {
    const res = await http()
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${await sign(keys, { role: 'student' })}`)
      .send({ serverName: 'x1', totalCpu: 1, totalRamGb: 1, totalStorageGb: 1 })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('id ที่ไม่ใช่ UUID → 400 VALIDATION_ERROR · route ที่ไม่มี → 404 envelope', async () => {
    const auth = `Bearer ${await sign(keys)}`;
    const bad = await http().get('/api/v1/resources/not-a-uuid').set('Authorization', auth).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await http().get('/api/v1/__does_not_exist__').set('Authorization', auth).expect(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  describe('SSO (auth-contract ข้อ 5)', () => {
    const cookiesOf = (res: request.Response): string[] => {
      const raw = res.headers['set-cookie'] as unknown;
      return Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    };

    async function startLogin(next = '/requests') {
      const res = await http().get(`/auth/login?next=${encodeURIComponent(next)}`).expect(302);
      const location = new URL(res.headers.location);
      const stateCookie = cookiesOf(res).find((c) => c.startsWith('csmju_cloudflow_sso_state='))!;
      return { res, location, state: location.searchParams.get('state')!, cookie: stateCookie.split(';')[0] };
    }

    it('/auth/login → 302 เว็บ Core Hub พร้อม state · ไม่ส่ง callback_url · คุกกี้ state HttpOnly ≤ 600s', async () => {
      const { res, location, state } = await startLogin();
      expect(location.origin + location.pathname).toBe('https://core-hub-web.test/sso/authorize');
      expect(location.searchParams.get('subsystem')).toBe('csmju-cloudflow');
      expect(location.searchParams.has('callback_url')).toBe(false);
      expect(Buffer.from(state, 'base64url').length).toBeGreaterThanOrEqual(32);
      const cookie = cookiesOf(res)[0];
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Max-Age=600/);
      expect(cookie).toMatch(/Path=\/auth\/callback/);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('callback ครบ → คุกกี้ session แล้ว 302 ไปหน้า next', async () => {
      const { state, cookie } = await startLogin('/requests?status=PENDING');
      const token = await sign(keys, { role: 'student' });
      const res = await http()
        .get(`/auth/callback?access_token=${token}&token_type=Bearer&expires_in=900&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);
      expect(res.headers.location).toBe('/requests?status=PENDING');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      const session = cookiesOf(res).find((c) => c.startsWith('csmju_cloudflow_access_token='))!;
      expect(session).toMatch(/HttpOnly/);
      expect(session).toMatch(/SameSite=Lax/);
      expect(cookiesOf(res).some((c) => c.startsWith('csmju_cloudflow_sso_state=;'))).toBe(true);
    });

    it('callback ไม่มี state (กดจาก sidebar) → ทิ้ง token · ไม่มีคุกกี้ · 302 /auth/login', async () => {
      const res = await http().get(`/auth/callback?access_token=${await sign(keys)}`).expect(302);
      expect(res.headers.location).toBe('/auth/login');
      expect(cookiesOf(res)).toHaveLength(0);
    });

    it('มี state แต่ไม่มีคุกกี้ / state ไม่ตรง → 401 ไม่มีคุกกี้ session · HTML มีปุ่มเข้าสู่ระบบอีกครั้ง', async () => {
      const token = await sign(keys);
      const noCookie = await http().get(`/auth/callback?access_token=${token}&state=abc`).set('Accept', 'text/html').expect(401);
      expect(noCookie.text).toContain('/auth/login');
      expect(cookiesOf(noCookie).some((c) => c.startsWith('csmju_cloudflow_access_token='))).toBe(false);

      const a = await startLogin();
      const b = await startLogin();
      const mismatch = await http().get(`/auth/callback?access_token=${token}&state=${a.state}`).set('Cookie', b.cookie).expect(401);
      expect(cookiesOf(mismatch).some((c) => c.startsWith('csmju_cloudflow_access_token='))).toBe(false);
    });

    it('token ปลอม → 401 · ไม่มี token → 400', async () => {
      const { state, cookie } = await startLogin();
      const forged = await sign(await makeKeys());
      await http().get(`/auth/callback?access_token=${forged}&state=${state}`).set('Cookie', cookie).expect(401);
      await http().get('/auth/callback?state=x').expect(400);
    });

    it('กัน open redirect: next=//evil.example.com → กลับหน้าแรกของระบบ', async () => {
      const { state, cookie } = await startLogin('//evil.example.com');
      const res = await http()
        .get(`/auth/callback?access_token=${await sign(keys)}&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);
      expect(res.headers.location).toBe('/');
    });

    it('POST /auth/logout → 303 เว็บ Core Hub /logout และลบคุกกี้ session', async () => {
      const res = await http().post('/auth/logout').expect(303);
      expect(res.headers.location).toBe('https://core-hub-web.test/logout');
      expect(cookiesOf(res).find((c) => c.startsWith('csmju_cloudflow_access_token='))).toMatch(/Max-Age=0/);
    });
  });
});
