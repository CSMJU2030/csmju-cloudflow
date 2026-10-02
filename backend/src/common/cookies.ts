/**
 * อ่านคุกกี้จาก header เอง — ไม่ต้องเพิ่ม cookie-parser (ไม่อยู่ใน whitelist ของ ARC-02)
 * ค่าที่ decode ไม่ได้ถือว่าไม่มี
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface CookieOptions {
  maxAge: number; // วินาที
  path: string;
  secure: boolean;
}

/** คุกกี้ของระบบเป็น HttpOnly + SameSite=Lax เสมอ (auth-contract ข้อ 5.1–5.2) */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`,
    `Path=${opts.path}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (opts.maxAge <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}
