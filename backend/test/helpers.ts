import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from 'jose';

export const ENV = {
  NODE_ENV: 'test',
  LOG_SILENT: '1',
  SUBSYSTEM_ID: 'csmju-cloudflow',
  CORE_HUB_URL: 'https://core-hub.test',
  CORE_HUB_WEB_URL: 'https://core-hub-web.test',
  CORE_HUB_JWKS_URL: 'https://core-hub.test/api/v1/.well-known/jwks.json',
  CORE_HUB_ISSUER: 'core-hub',
  CORE_HUB_AUDIENCE: 'csmju2030',
  DATABASE_URL: 'postgresql://unused@localhost:1/unused',
};

export function applyEnv() {
  Object.assign(process.env, ENV);
}

export interface TestKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  kid: string;
}

export async function makeKeys(kid = 'core-hub-2026'): Promise<TestKeys> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  return { privateKey, publicKey, kid };
}

export async function jwksBody(keys: TestKeys) {
  const jwk = await exportJWK(keys.publicKey);
  return { keys: [{ ...jwk, kid: keys.kid, alg: 'RS256', use: 'sig' }] };
}

export async function sign(
  keys: TestKeys,
  claims: Record<string, unknown> = {},
  opts: { iat?: number; exp?: number; iss?: string; aud?: string; kid?: string; sub?: string | null } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const iat = opts.iat ?? now;
  const jwt = new SignJWT({ role: 'staff', email: 'tester@example.test', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? keys.kid, typ: 'JWT' })
    .setIssuer(opts.iss ?? 'core-hub')
    .setAudience(opts.aud ?? 'csmju2030')
    .setIssuedAt(iat)
    .setExpirationTime(opts.exp ?? iat + 900);
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? 'user-6704101323');
  return jwt.sign(keys.privateKey);
}

/** ให้ fetch ของ JwksService ได้ JWKS ปลอมแทนการยิง Core Hub จริง */
export function mockJwksFetch(body: unknown) {
  const original = global.fetch;
  const spy = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  });
  global.fetch = spy as unknown as typeof fetch;
  return { spy, restore: () => (global.fetch = original) };
}
