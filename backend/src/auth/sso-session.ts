import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * ชื่อคุกกี้และกฎของ state / next ตาม auth-contract ข้อ 5.1–5.2
 *
 * คุกกี้ขึ้นต้นด้วยชื่อระบบ (เปลี่ยน - เป็น _) เพราะตอนพัฒนาทุกระบบรันบน localhost
 * และคุกกี้ไม่แยกตาม port
 */
export const STATE_TTL_SEC = 600;
export const CALLBACK_PATH = '/auth/callback';

export function cookieNames(subsystemId: string) {
  const prefix = subsystemId.replace(/-/g, '_');
  return { session: `${prefix}_access_token`, state: `${prefix}_sso_state` };
}

/** state สุ่ม 32 ไบต์ เข้ารหัส base64url */
export function newState(): string {
  return randomBytes(32).toString('base64url');
}

export function packStateCookie(state: string, next: string): string {
  return `${state}.${Buffer.from(next, 'utf8').toString('base64url')}`;
}

export function unpackStateCookie(value: string | undefined): { state: string; next: string } | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const state = value.slice(0, dot);
  let next = '';
  try {
    next = Buffer.from(value.slice(dot + 1), 'base64url').toString('utf8');
  } catch {
    next = '';
  }
  return { state, next };
}

/** เทียบแบบ constant-time */
export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

const ORIGIN = 'http://subsystem.invalid';

/**
 * กฎของ next — ผ่านครบทุกข้อจึงใช้ได้ ไม่ผ่านใช้หน้า default (กัน open redirect)
 * ต้องตรวจทั้งตอน /auth/login และตอน callback เพราะค่าที่เก็บไว้กลับมาจากคุกกี้
 */
export function safeNext(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string') return fallback;
  if (next.length < 1 || next.length > 512) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c <= 31 || c === 127) return fallback;
  }
  let url: URL;
  try {
    url = new URL(next, ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== ORIGIN) return fallback;
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return fallback;
  return url.pathname + url.search + url.hash;
}
