import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { logEvent } from '../common/logger';
import { CoreHubClient, CoreHubUnavailable } from './core-hub.client';

/** รายวิชาจาก Core Hub (reference-data.md ข้อ 4.6) — ระบบนี้ใช้แค่ field ที่แสดงผล */
export interface Course {
  code: string;
  nameTh: string;
  nameEn: string | null;
  credits: number;
  isActive: boolean;
  updatedAt: string;
}

/**
 * cache ข้อมูลอ้างอิง "รายวิชา" รวมทุกผู้ใช้ (reference-data.md ข้อ 7.3)
 *
 * - ดึงทั้งชุด ?limit=100&includeInactive=true วนตาม totalPages · TTL 10 นาที
 * - single-flight: คำขอที่มาพร้อมกันตอน cache ว่างรอผลครั้งเดียวกัน
 * - stale-on-error: ดึงใหม่ไม่ได้แต่มีของเก่า → ใช้ของเก่า + log core_data.refresh.failure
 * - ล้มแล้วรออย่างน้อย 30 วินาทีก่อนลองใหม่ · ไม่ดึงตอนเปิดระบบ
 * - คำตอบรูปแบบผิดถือว่าล้ม ห้ามเขียนทับของดี
 * ไม่มี token ของระบบ จึงดึงด้วย token ของผู้ใช้คนแรกที่ต้องใช้ข้อมูล
 */
@Injectable()
export class ReferenceDataService {
  private courses: Map<string, Course> | null = null;
  private fetchedAt = 0;
  private failedAt = 0;
  private lastRetryAfter = 30;
  private inflight: Promise<void> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly coreHub: CoreHubClient,
  ) {}

  async listCourses(userToken: string): Promise<Course[]> {
    await this.ensureFresh(userToken);
    return [...(this.courses?.values() ?? [])];
  }

  /** code ต้องมีจริงและยังเปิดใช้ — คืน false ถ้าไม่ผ่าน (ผู้เรียกตอบ 400 VALIDATION_ERROR) */
  async isActiveCourse(code: string, userToken: string): Promise<boolean> {
    await this.ensureFresh(userToken);
    let course = this.courses?.get(code);
    if (!course && this.canRetry()) {
      // code ที่ยังไม่เห็นใน cache ดึงใหม่ได้หนึ่งครั้ง (ภายใต้กติกา 30 วินาที)
      await this.refresh(userToken).catch(() => undefined);
      course = this.courses?.get(code);
    }
    return Boolean(course?.isActive);
  }

  private async ensureFresh(userToken: string) {
    const stale = !this.courses || Date.now() - this.fetchedAt > this.config.dataCacheTtlMs;
    if (!stale) return;
    if (!this.canRetry()) {
      if (this.courses) return;
      throw new CoreHubUnavailable(this.lastRetryAfter);
    }
    try {
      await this.refresh(userToken);
    } catch (e) {
      if (!this.courses) throw e;
    }
  }

  private canRetry() {
    return Date.now() - this.failedAt >= this.config.dataMinRefreshIntervalMs;
  }

  private refresh(userToken: string): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.load(userToken).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async load(userToken: string) {
    try {
      const next = new Map<string, Course>();
      let page = 1;
      let totalPages = 1;
      do {
        const body = await this.coreHub.get<Course[]>('/courses', userToken, {
          limit: '100',
          page: String(page),
          includeInactive: 'true',
        });
        if (!body || !Array.isArray(body.data) || typeof body.meta?.totalPages !== 'number') {
          throw new CoreHubUnavailable(30);
        }
        for (const row of body.data) {
          if (typeof row?.code !== 'string' || typeof row.isActive !== 'boolean' || typeof row.updatedAt !== 'string') {
            throw new CoreHubUnavailable(30);
          }
          next.set(row.code, {
            code: row.code,
            nameTh: row.nameTh,
            nameEn: row.nameEn ?? null,
            credits: row.credits,
            isActive: row.isActive,
            updatedAt: row.updatedAt,
          });
        }
        totalPages = body.meta.totalPages;
        page += 1;
      } while (page <= totalPages && page <= 200);

      this.courses = next;
      this.fetchedAt = Date.now();
    } catch (e) {
      this.failedAt = Date.now();
      if (e instanceof CoreHubUnavailable) this.lastRetryAfter = e.retryAfter;
      logEvent('core_data.refresh.failure', {
        dataset: 'courses',
        reason: e instanceof CoreHubUnavailable ? 'unavailable' : e instanceof Error ? e.name : 'unknown',
        cachedCount: this.courses?.size ?? 0,
      });
      throw e;
    }
  }
}
