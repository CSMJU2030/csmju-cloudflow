/**
 * core role (Layer 1 · จาก claim `role`) → role ของ CS-CloudFlow (Layer 2)
 *
 * ✏️ แก้ได้เฉพาะ "ค่า" ในตาราง และต้องตรงกับ default_role_mapping ที่ลงทะเบียนใน Core Hub เสมอ
 *    (authorization.md ข้อ 3) — key ในทะเบียนคือรายชื่อ role ที่ Core Hub ยอมให้เข้า
 *
 * - alumni และ guest ไม่อยู่ในตาราง = เข้าระบบนี้ไม่ได้ → 403 FORBIDDEN
 * - staff = เจ้าหน้าที่ดูแลเครื่อง (จัดสรร/คืนเครื่อง) · admin = ผู้ดูแลระบบกลาง
 *   ถ้าวันหนึ่งผู้ดูแลเป็นแค่บางคน ให้ใช้สิทธิ์พิเศษรายบุคคลผ่านทะเบียน ห้ามเขียนรายชื่อในโค้ด
 */
export const CORE_ROLES = ['student', 'alumni', 'staff', 'lecturer', 'guest', 'admin'] as const;
export type CoreRole = (typeof CORE_ROLES)[number];

export const CORE_ROLE_TO_SUBSYSTEM_ROLE = {
  student: 'STUDENT',
  lecturer: 'TEACHER',
  staff: 'STAFF',
  admin: 'ADMIN',
} as const satisfies Partial<Record<CoreRole, string>>;

export type SubsystemRole = (typeof CORE_ROLE_TO_SUBSYSTEM_ROLE)[keyof typeof CORE_ROLE_TO_SUBSYSTEM_ROLE];

export function isCoreRole(value: unknown): value is CoreRole {
  return typeof value === 'string' && (CORE_ROLES as readonly string[]).includes(value);
}

/** null = role นี้ไม่มีสิทธิ์เข้าระบบนี้ (403) */
export function mapCoreRole(coreRole: string): SubsystemRole | null {
  return (CORE_ROLE_TO_SUBSYSTEM_ROLE as Record<string, SubsystemRole>)[coreRole] ?? null;
}
