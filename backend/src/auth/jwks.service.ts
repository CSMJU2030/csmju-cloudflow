import { Inject, Injectable } from '@nestjs/common';
import { importJWK, type JWK, type KeyLike } from 'jose';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { logEvent } from '../common/logger';
import { TokenVerificationError } from './auth.errors';

type RefreshReason = 'initial' | 'ttl_expired' | 'unknown_kid';

/**
 * ตัวดึงกุญแจสาธารณะของ Core Hub จาก JWKS (auth-contract ข้อ 4.1)
 *
 * - แคชกุญแจ ไม่ยิง Core Hub ทุก request (TTL ค่าเริ่มต้น 10 นาที)
 * - เลือกกุญแจจาก header.kid เสมอ — รองรับการหมุนกุญแจ
 * - เจอ kid ที่ไม่รู้จัก → รีเฟรชหนึ่งครั้ง ยังไม่เจอ → ปฏิเสธ
 * - รีเฟรชได้ไม่ถี่กว่าทุก 30 วินาที (กัน refresh loop)
 * - Core Hub ล่มชั่วคราว → ใช้กุญแจที่แคชไว้ต่อ
 * - ปฏิเสธ JWK ที่มี private material (`d`) หรือไม่ใช่ kty RSA
 */
@Injectable()
export class JwksService {
  private keys = new Map<string, KeyLike>();
  private fetchedAt = 0;
  private lastAttemptAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async getKey(kid: string): Promise<KeyLike> {
    const now = Date.now();

    if (this.fetchedAt === 0) {
      await this.refresh('initial');
    } else if (now - this.fetchedAt > this.config.jwksCacheTtlMs && this.canRefresh(now)) {
      await this.refresh('ttl_expired');
    }

    const cached = this.keys.get(kid);
    if (cached) return cached;

    logEvent('jwks.unknown_kid', { kid, knownKids: [...this.keys.keys()] });

    if (this.canRefresh(Date.now())) {
      await this.refresh('unknown_kid');
      const fresh = this.keys.get(kid);
      if (fresh) return fresh;
    }

    if (this.keys.size === 0) throw new TokenVerificationError('jwks_unavailable', kid);
    throw new TokenVerificationError('unknown_kid', kid);
  }

  private canRefresh(now: number): boolean {
    return now - this.lastAttemptAt >= this.config.jwksMinRefreshIntervalMs;
  }

  /** single-flight: คำขอที่มาพร้อมกันรอผลการดึงครั้งเดียวกัน */
  private refresh(reason: RefreshReason): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.doRefresh(reason).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(reason: RefreshReason): Promise<void> {
    this.lastAttemptAt = Date.now();
    try {
      const res = await fetch(this.config.jwksUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.jwksRequestTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as { keys?: unknown };
      if (!body || !Array.isArray(body.keys)) throw new Error('JWKS ต้องเป็น {"keys":[...]}');

      const next = new Map<string, KeyLike>();
      for (const raw of body.keys as JWK[]) {
        if (!raw || typeof raw !== 'object') continue;
        if (raw.kty !== 'RSA' || 'd' in raw) continue; // ห้ามรับ private key / กุญแจชนิดอื่น
        if (typeof raw.kid !== 'string' || raw.kid.length === 0) continue;
        if (raw.alg !== undefined && raw.alg !== 'RS256') continue;
        if (raw.use !== undefined && raw.use !== 'sig') continue;
        const key = await importJWK({ kty: 'RSA', n: raw.n, e: raw.e }, 'RS256');
        if (typeof key === 'object' && key !== null) next.set(raw.kid, key as KeyLike);
      }
      if (next.size === 0) throw new Error('JWKS ไม่มีกุญแจ RSA ที่ใช้ได้');

      this.keys = next;
      this.fetchedAt = Date.now();
      logEvent('jwks.refresh', { reason, keyCount: next.size, kids: [...next.keys()] });
    } catch (e) {
      // ใช้กุญแจเดิมต่อ (ถ้ามี) — ไม่เขียนทับของดีด้วยของเสีย
      logEvent('jwks.refresh.failure', {
        reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
        cachedKeyCount: this.keys.size,
      });
    }
  }
}
