/**
 * เหตุผลที่ตรวจ token ไม่ผ่าน — รายการปิดตาม standards/contracts/log-events.json
 * ทุกเหตุผลในไฟล์นี้ตอบ 401 UNAUTHORIZED (auth-contract ข้อ 4 · ข้อ 8)
 */
export type TokenFailureReason =
  | 'missing_token'
  | 'malformed_token'
  | 'unsupported_algorithm'
  | 'missing_kid'
  | 'unknown_kid'
  | 'jwks_unavailable'
  | 'invalid_signature'
  | 'expired'
  | 'invalid_issuer'
  | 'invalid_audience'
  | 'invalid_claims'
  | 'token_lifetime_exceeded'
  | 'invalid_azp';

/** callback ที่ state ไม่ผ่าน (auth-contract ข้อ 5.1) — ใช้กับ event jwt.verification.failure ที่ path /auth/callback */
export type SsoStateFailureReason = 'sso_restart_without_state' | 'sso_state_missing' | 'sso_state_mismatch';

export class TokenVerificationError extends Error {
  constructor(
    public readonly reason: TokenFailureReason,
    public readonly kid: string | null = null,
  ) {
    super(reason);
    this.name = 'TokenVerificationError';
  }
}
