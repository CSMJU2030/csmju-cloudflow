import type { CoreRole, SubsystemRole } from './role-mapping';
import type { Permission } from './permissions';

/**
 * ตัวตนของผู้เรียกหลังตรวจ token ครบ 10 ขั้นแล้ว — มาจาก claim ที่ลายเซ็นถูกต้องเท่านั้น
 * ห้ามเชื่อ identity จาก body / query / custom header (auth-contract ข้อ 6)
 */
export interface CoreHubIdentity {
  /** claim `sub` — string ทึบ ≤ 64 ตัว ไม่ใช่ UUID เสมอไป · เก็บลงฐานเป็น core_user_id */
  id: string;
  /** แสดงผลเท่านั้น ห้ามใช้เป็นกุญแจ */
  email: string | null;
  /** claim `role` — role ของผู้ใช้สำหรับระบบนี้ (อ่านจาก token ทุก request ห้ามเก็บ) */
  coreRole: CoreRole;
  subsystemRole: SubsystemRole;
  permissions: readonly Permission[];
  /** ISO 8601 จาก exp — ให้ frontend ต่ออายุล่วงหน้าได้ */
  expiresAt: string;
  /** วินาทีจาก epoch */
  exp: number;
}

/** claim ที่ผ่านขั้น 1–10 แล้ว แต่ยังไม่ได้แมป role */
export interface VerifiedClaims {
  sub: string;
  email: string | null;
  role: string;
  exp: number;
  iat: number;
  kid: string;
}

/**
 * token ของผู้ใช้ใช้เรียก Core Hub ในนามผู้ใช้ได้ — เก็บไว้บน request ด้วย symbol
 * จึงไม่หลุดไปกับ JSON ของ /me หรือ log ใด ๆ (auth-contract ข้อ 6.1)
 */
export const USER_TOKEN = Symbol('core-hub-user-token');
export const IDENTITY = Symbol('core-hub-identity');

export interface AuthenticatedRequest {
  [USER_TOKEN]?: string;
  [IDENTITY]?: CoreHubIdentity;
}
