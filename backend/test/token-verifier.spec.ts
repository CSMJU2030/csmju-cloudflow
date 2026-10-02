import { SignJWT, base64url } from 'jose';

import { loadConfig } from '../src/config/configuration';
import { TokenVerificationError } from '../src/auth/auth.errors';
import { CoreHubTokenVerifier } from '../src/auth/core-hub-token.verifier';
import { JwksService } from '../src/auth/jwks.service';
import { ENV, jwksBody, makeKeys, mockJwksFetch, sign, type TestKeys } from './helpers';

/** ตัวตรวจ token 10 ขั้น (auth-contract ข้อ 4) — ขั้น 9–10 conformance ทดสอบให้ไม่ได้ ต้องอยู่ที่นี่ */
describe('CoreHubTokenVerifier', () => {
  let keys: TestKeys;
  let verifier: CoreHubTokenVerifier;
  let restore: () => void;

  beforeAll(async () => {
    process.env.LOG_SILENT = '1';
    keys = await makeKeys();
    ({ restore } = mockJwksFetch(await jwksBody(keys)));
    const config = loadConfig({ ...ENV });
    verifier = new CoreHubTokenVerifier(config, new JwksService(config));
  });
  afterAll(() => restore());

  const reason = async (token: string | undefined) => {
    try {
      await verifier.verify(token);
      return 'ok';
    } catch (e) {
      return (e as TokenVerificationError).reason;
    }
  };

  it('รับ token ที่ถูกต้อง และคืน sub แบบ string ทึบ (ไม่ใช่ UUID)', async () => {
    const claims = await verifier.verify(await sign(keys, { role: 'student' }));
    expect(claims.sub).toBe('user-6704101323');
    expect(claims.role).toBe('student');
  });

  it('ขั้น 1 · ไม่มี token', async () => expect(await reason(undefined)).toBe('missing_token'));
  it('ขั้น 2 · token ผิดรูปแบบ', async () => expect(await reason('not-a-jwt')).toBe('malformed_token'));

  it('ขั้น 3 · ปฏิเสธ alg=none', async () => {
    const header = base64url.encode(JSON.stringify({ alg: 'none', kid: keys.kid }));
    const body = base64url.encode(JSON.stringify({ sub: 'x', iss: 'core-hub', aud: 'csmju2030' }));
    expect(await reason(`${header}.${body}.`)).toBe('unsupported_algorithm');
  });

  it('ขั้น 3 · ปฏิเสธ HS256', async () => {
    const token = await new SignJWT({ role: 'staff' })
      .setProtectedHeader({ alg: 'HS256', kid: keys.kid })
      .setSubject('x')
      .setIssuer('core-hub')
      .setAudience('csmju2030')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('shared-secret-shared-secret-1234'));
    expect(await reason(token)).toBe('unsupported_algorithm');
  });

  it('ขั้น 4 · kid ที่ไม่รู้จัก', async () => {
    expect(await reason(await sign(keys, {}, { kid: 'core-hub-2099' }))).toBe('unknown_kid');
  });

  it('ขั้น 5 · ลายเซ็นจากกุญแจอื่น', async () => {
    const other = await makeKeys(keys.kid);
    expect(await reason(await sign(other))).toBe('invalid_signature');
  });

  it('ขั้น 6 · iss / aud ผิด', async () => {
    expect(await reason(await sign(keys, {}, { iss: 'evil' }))).toBe('invalid_issuer');
    expect(await reason(await sign(keys, {}, { aud: 'other-app' }))).toBe('invalid_audience');
  });

  it('ขั้น 7 · หมดอายุ', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(await reason(await sign(keys, {}, { iat: past, exp: past + 900 }))).toBe('expired');
  });

  it('ขั้น 8 · ไม่มี sub', async () => {
    expect(await reason(await sign(keys, {}, { sub: null }))).toBe('invalid_claims');
  });

  it('ขั้น 9 · อายุ token เกิน 900+60 วินาที (เช่น refresh token 7 วัน)', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await reason(await sign(keys, {}, { iat: now, exp: now + 7 * 24 * 3600 }))).toBe('token_lifetime_exceeded');
    expect(await reason(await sign(keys, {}, { iat: now, exp: now + 960 }))).toBe('ok');
  });

  it('ขั้น 9 · ไม่มี iat', async () => {
    const token = await new SignJWT({ role: 'staff' })
      .setProtectedHeader({ alg: 'RS256', kid: keys.kid })
      .setSubject('x')
      .setIssuer('core-hub')
      .setAudience('csmju2030')
      .setExpirationTime('10m')
      .sign(keys.privateKey);
    expect(await reason(token)).toBe('token_lifetime_exceeded');
  });

  it('ขั้น 10 · azp ต้องเป็นชื่อระบบนี้เมื่อมี', async () => {
    expect(await reason(await sign(keys, { azp: 'csmju-shop' }))).toBe('invalid_azp');
    expect(await reason(await sign(keys, { azp: 'csmju-cloudflow' }))).toBe('ok');
  });

  it('ไม่ปฏิเสธ token เพราะมี claim อื่นเพิ่มมา', async () => {
    expect(await reason(await sign(keys, { somethingNew: 1, sid: 'abc' }))).toBe('ok');
  });
});
