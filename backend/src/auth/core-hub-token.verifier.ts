import { Inject, Injectable } from '@nestjs/common';
import { decodeProtectedHeader, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { TokenVerificationError } from './auth.errors';
import type { VerifiedClaims } from './core-hub-identity';
import { JwksService } from './jwks.service';

/** อายุ access token ตามสัญญา (jwt-contract.json maxTokenLifetimeSeconds) */
export const MAX_TOKEN_LIFETIME_SEC = 900;
/** clock skew ที่ยอมรับในการตรวจอายุ token (jwt-contract.json clockToleranceSeconds) */
export const LIFETIME_TOLERANCE_SEC = 60;

/**
 * ตรวจ Core Hub token ครบ 10 ขั้น (auth-contract ข้อ 4) — ใช้กับทุก request และกับ token ที่มาทาง /auth/callback
 *
 *  1  มี token (guard / callback เป็นคนหยิบ)        6  iss · aud
 *  2  ถอด header อ่าน alg · kid (ยังไม่เชื่อ payload)   7  exp (clock skew ≤ 60 วินาที)
 *  3  alg ต้องเป็น RS256 เท่านั้น                      8  sub ไม่ว่าง
 *  4  หา public key จาก JWKS ตาม kid                  9  มี iat และ exp − iat ≤ 900 + 60 วินาที
 *  5  ตรวจลายเซ็น (allow-list RS256 ซ้ำอีกชั้น)         10 ถ้ามี azp ต้องเท่ากับ SUBSYSTEM_ID
 *
 * ทุกขั้นที่ไม่ผ่านโยน TokenVerificationError → 401 · ห้ามข้ามขั้นใดแม้ใน development
 */
@Injectable()
export class CoreHubTokenVerifier {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwks: JwksService,
  ) {}

  async verify(token: string | undefined | null): Promise<VerifiedClaims> {
    // ขั้น 1
    if (typeof token !== 'string' || token.length === 0) {
      throw new TokenVerificationError('missing_token');
    }

    // ขั้น 2
    let header: { alg?: string; kid?: string };
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new TokenVerificationError('malformed_token');
    }
    const kid = typeof header.kid === 'string' && header.kid.length > 0 ? header.kid : null;

    // ขั้น 3
    if (header.alg !== 'RS256') throw new TokenVerificationError('unsupported_algorithm', kid);
    if (!kid) throw new TokenVerificationError('missing_kid');

    // ขั้น 4
    const key = await this.jwks.getKey(kid);

    // ขั้น 5–7
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockToleranceSec,
        requiredClaims: ['exp'],
      }));
    } catch (e) {
      throw new TokenVerificationError(reasonOf(e), kid);
    }

    // ขั้น 8
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.trim().length === 0 || sub.length > 64) {
      throw new TokenVerificationError('invalid_claims', kid);
    }
    if (typeof payload.exp !== 'number') throw new TokenVerificationError('invalid_claims', kid);

    // ขั้น 9 — กัน refresh token (อายุ 7 วัน) ถูกใช้แทน access token
    if (typeof payload.iat !== 'number') throw new TokenVerificationError('token_lifetime_exceeded', kid);
    if (payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SEC + LIFETIME_TOLERANCE_SEC) {
      throw new TokenVerificationError('token_lifetime_exceeded', kid);
    }

    // ขั้น 10 — token ที่ออกให้ระบบอื่นใช้ที่นี่ไม่ได้
    const azp = (payload as { azp?: unknown }).azp;
    if (azp !== undefined && azp !== this.config.subsystemId) {
      throw new TokenVerificationError('invalid_azp', kid);
    }

    const role = (payload as { role?: unknown }).role;
    if (typeof role !== 'string' || role.length === 0) throw new TokenVerificationError('invalid_claims', kid);

    const email = (payload as { email?: unknown }).email;
    return {
      sub,
      email: typeof email === 'string' ? email : null,
      role,
      exp: payload.exp,
      iat: payload.iat,
      kid,
    };
  }
}

function reasonOf(e: unknown) {
  if (e instanceof joseErrors.JWTExpired) return 'expired' as const;
  if (e instanceof joseErrors.JWTClaimValidationFailed) {
    if (e.claim === 'iss') return 'invalid_issuer' as const;
    if (e.claim === 'aud') return 'invalid_audience' as const;
    return 'invalid_claims' as const;
  }
  if (e instanceof joseErrors.JWSSignatureVerificationFailed) return 'invalid_signature' as const;
  if (e instanceof joseErrors.JOSEAlgNotAllowed) return 'unsupported_algorithm' as const;
  if (e instanceof joseErrors.JWSInvalid || e instanceof joseErrors.JWTInvalid) return 'malformed_token' as const;
  return 'invalid_signature' as const;
}
