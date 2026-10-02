/**
 * ค่าตั้งต้นทั้งหมดของระบบ — อ่านจาก env ที่เดียว แล้วตรวจตั้งแต่ตอนบูต
 *
 * ทำไมต้องตรวจตอนบูต: ถ้า CORE_HUB_URL หรือ SUBSYSTEM_ID หายไป ระบบจะรันขึ้นแต่ login ไม่ได้เลย
 * แล้วไปเจอตอนผู้ใช้กดปุ่ม — ล้มตั้งแต่ตอนเปิดดีกว่า
 * URL ของ Core Hub ห้ามเขียนตายในโค้ด (connect-core-hub.md ข้อ 4)
 */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  host: string;
  subsystemId: string;
  coreHubUrl: string;
  coreHubWebUrl: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
  jwksCacheTtlMs: number;
  jwksMinRefreshIntervalMs: number;
  jwksRequestTimeoutMs: number;
  clockToleranceSec: number;
  dataCacheTtlMs: number;
  dataMinRefreshIntervalMs: number;
  dataRequestTimeoutMs: number;
  /** หน้า default หลัง login ที่ next ไม่ผ่านกฎ */
  defaultNextPath: string;
}

const SUBSYSTEM_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`ต้องตั้งค่า ${key} ใน backend/.env (ดู backend/.env.example)`);
  }
  return value;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} ต้องเป็นจำนวนเต็มไม่ติดลบ`);
  return n;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const subsystemId = required(env, 'SUBSYSTEM_ID');
  if (!SUBSYSTEM_NAME.test(subsystemId) || subsystemId.length > 64) {
    throw new Error('SUBSYSTEM_ID ต้องเป็น a-z 0-9 คั่นด้วย - ไม่เกิน 64 ตัว (subsystem-registry ข้อ 2)');
  }

  const coreHubUrl = stripSlash(required(env, 'CORE_HUB_URL'));
  const nodeEnv = env.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: int(env, 'PORT', 4208),
    host: env.HOST?.trim() || '127.0.0.1',
    subsystemId,
    coreHubUrl,
    coreHubWebUrl: stripSlash(required(env, 'CORE_HUB_WEB_URL')),
    jwksUrl: env.CORE_HUB_JWKS_URL?.trim() || `${coreHubUrl}/api/v1/.well-known/jwks.json`,
    issuer: required(env, 'CORE_HUB_ISSUER'),
    audience: required(env, 'CORE_HUB_AUDIENCE'),
    jwksCacheTtlMs: int(env, 'JWKS_CACHE_TTL_MS', 600_000),
    jwksMinRefreshIntervalMs: int(env, 'JWKS_MIN_REFRESH_INTERVAL_MS', 30_000),
    jwksRequestTimeoutMs: int(env, 'JWKS_REQUEST_TIMEOUT_MS', 5_000),
    // สัญญายอม clock skew ได้ไม่เกิน 60 วินาที (auth-contract ข้อ 4 ขั้น 7)
    clockToleranceSec: Math.min(int(env, 'JWT_CLOCK_TOLERANCE_SEC', 5), 60),
    dataCacheTtlMs: int(env, 'CORE_HUB_DATA_CACHE_TTL_MS', 600_000),
    dataMinRefreshIntervalMs: int(env, 'CORE_HUB_DATA_MIN_REFRESH_INTERVAL_MS', 30_000),
    dataRequestTimeoutMs: int(env, 'CORE_HUB_DATA_REQUEST_TIMEOUT_MS', 5_000),
    defaultNextPath: '/',
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
