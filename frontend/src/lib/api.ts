const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'cscloudflow.token';

/**
 * error ที่ backend ส่งมาในรูป { error: { code, message, details } }
 * ห่อไว้เป็น class เพื่อให้หน้าจอเลือกแสดงตาม code ได้ ไม่ต้องอ่านข้อความดิบ
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

export const token = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (v: string) => localStorage.setItem(TOKEN_KEY, v),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = token.get();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // ต่อไม่ติดเลย — มักเป็นเพราะ backend ไม่ได้เปิด
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `ต่อกับ backend ที่ ${BASE} ไม่ได้ — ตรวจว่ารัน npm run dev ฝั่ง backend อยู่หรือเปล่า`,
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const e = payload?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN',
      e?.message ?? `คำขอล้มเหลว (HTTP ${res.status})`,
      e?.details,
    );
  }

  return payload as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const API_BASE = BASE;
