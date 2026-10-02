import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { ApiException, unavailable } from '../common/errors';

/** endpoint ที่ระบบย่อยเรียกได้ (reference-data.md ข้อ 2) — นอกจากนี้ห้ามเรียก */
const ALLOWLIST = [/^\/courses(\/[A-Z0-9-]{1,50})?$/, /^\/people\/me$/];

export interface CoreHubEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { total: number; page: number; limit: number; totalPages: number };
}

export class CoreHubUnavailable extends Error {
  constructor(public readonly retryAfter: number) {
    super('core hub unavailable');
  }
}

/**
 * ตัวเรียก Core Hub จาก backend ด้วย token ของผู้ใช้คนที่ส่ง request มา (reference-data.md ข้อ 7)
 *
 * - เรียกเฉพาะ allowlist · URL จาก env · timeout 5 วินาที
 * - 401 → 401 ให้ frontend พาไป SSO ใหม่ (ไม่ใช่ 503 และไม่ retry)
 * - 403 → 403 · 404 → null (ให้ผู้เรียกแสดง code เดิม)
 * - 429 · 5xx · timeout → CoreHubUnavailable (ผู้เรียกใช้ cache เก่า หรือตอบ 503 + Retry-After)
 * - ไม่ log token และไม่ส่ง token ต่อที่อื่น
 */
@Injectable()
export class CoreHubClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async get<T>(path: string, userToken: string, query: Record<string, string> = {}): Promise<CoreHubEnvelope<T> | null> {
    if (!ALLOWLIST.some((re) => re.test(path))) {
      throw new Error(`endpoint ${path} ไม่อยู่ใน allowlist ของ reference-data.md`);
    }
    const url = new URL(`${this.config.coreHubUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { authorization: `Bearer ${userToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.dataRequestTimeoutMs),
      });
    } catch {
      throw new CoreHubUnavailable(30);
    }

    if (res.status === 401) {
      throw new ApiException('UNAUTHORIZED', 'session ที่ Core Hub หมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง');
    }
    if (res.status === 403) {
      throw new ApiException('FORBIDDEN', 'บัญชีของคุณไม่มีสิทธิ์ดูข้อมูลนี้ที่ Core Hub');
    }
    if (res.status === 404) return null;
    if (res.status === 429) {
      throw new CoreHubUnavailable(Math.max(1, Number(res.headers.get('retry-after')) || 30));
    }
    if (res.status >= 500) throw new CoreHubUnavailable(30);
    if (!res.ok) {
      // 400 = ระบบนี้ส่งค่าผิดเอง → บั๊ก ให้แก้โค้ด
      throw new ApiException('INTERNAL_ERROR', 'เรียกข้อมูลกลางไม่สำเร็จ');
    }

    const body = (await res.json().catch(() => null)) as CoreHubEnvelope<T> | null;
    if (!body || body.success !== true) throw new CoreHubUnavailable(30);
    return body;
  }

  static toHttp(e: unknown): never {
    if (e instanceof CoreHubUnavailable) {
      throw unavailable('ติดต่อ Core Hub ไม่ได้ชั่วคราว กรุณาลองใหม่', e.retryAfter);
    }
    throw e;
  }
}
