/**
 * ตัวเรียก API ของระบบนี้ — ผ่าน frontend เอง (Next.js proxy /api/* ไป backend)
 *
 * - ไม่มี token ในหน้าเว็บ: session คือคุกกี้ HttpOnly ที่ backend ตั้งตอน /auth/callback
 *   JavaScript อ่านไม่ได้ และห้ามเก็บ token ใน localStorage (SEC-03)
 * - คำตอบเป็น envelope { success, data, meta? } — ฟังก์ชันนี้แกะให้
 * - 401 = session หมด → พาทั้งหน้าไป /auth/login?next=<หน้าปัจจุบัน> (Silent re-SSO · auth-contract ข้อ 7)
 *   ต้องเป็น top-level navigation ห้ามใช้ fetch
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** ข้อความที่เอาไปโชว์ผู้ใช้ได้เลย — รวมรายละเอียดของ validation ด้วยถ้ามี */
  get readable(): string {
    if (Array.isArray(this.details) && this.details.length > 0) {
      return `${this.message} (${this.details.join(' · ')})`;
    }
    return this.message;
  }
}

const RESSO_KEY = 'csmju_cloudflow.resso_at';

/** พาไป SSO ใหม่ · กันวน: ถ้าเพิ่งกลับมาไม่ถึง 30 วินาทีแล้วยัง 401 ให้ผู้ใช้กดเอง */
export function goToLogin(force = false): boolean {
  if (typeof window === 'undefined') return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RESSO_KEY) ?? 0);
  } catch {
    /* sessionStorage ใช้ไม่ได้ — ถือว่ายังไม่เคยวน */
  }
  if (!force && Date.now() - last < 30_000) return false;
  try {
    sessionStorage.setItem(RESSO_KEY, String(Date.now()));
  } catch {
    /* ไม่เป็นไร */
  }
  const next = window.location.pathname + window.location.search;
  // /auth/login เป็น route ของ backend (proxy) ไม่ใช่หน้า Next.js — ต้องเป็น top-level navigation (auth-contract ข้อ 7)
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
  return true;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * path ต่อจาก /api/v1 เช่น api('/requests')
 * รายการ (มี meta) คืน { data, meta } · ชิ้นเดียวคืน data
 */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'ต่อกับระบบไม่ได้ — ตรวจว่ารัน backend อยู่หรือเปล่า');
  }

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok || payload?.success === false) {
    const e = payload?.error;
    if (res.status === 401) goToLogin();
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`, e?.details);
  }

  if (payload && typeof payload === 'object' && 'meta' in payload) {
    return { data: payload.data, meta: payload.meta } as T;
  }
  return (payload?.data ?? null) as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
