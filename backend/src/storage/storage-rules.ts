import { StorageRequestStatus } from '../generated/prisma/enums';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import type { SubsystemRole } from '../auth/role-mapping';
import { isAssignedTeacher, isOwner } from '../requests/request-rules';

/**
 * กติกาของระบบยืมพื้นที่ cloud — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 * permission แยกจากเมทริกซ์หลัก (auth/permissions.ts) ไว้ก่อน เพื่อให้ขั้นนี้ไม่เปลี่ยนสิทธิ์ของระบบเดิม
 * ขั้น API จะย้ายเข้า ROLE_PERMISSIONS แล้วใช้กับ @RequirePermissions
 */
export const StoragePermission = {
  POOL_READ: 'storage-pool:read',
  CREATE_OWN: 'storage:create:own',
  READ_OWN: 'storage:read:own',
  READ_ANY: 'storage:read:any',
  CANCEL_OWN: 'storage:cancel:own',
  /** อาจารย์พิจารณาคำขอที่ระบุตัวเอง หรือคำขอที่ไม่ได้ระบุอาจารย์ */
  REVIEW_OWN: 'storage:review:own',
  REVIEW_ANY: 'storage:review:any',
  /** เปิดดูลิงก์และรหัสของพื้นที่ตัวเอง */
  LINK_READ_OWN: 'storage-link:read:own',
  /** สั่งสร้างพื้นที่ใหม่เมื่อ provider ล้ม */
  PROVISION_RETRY: 'storage:retry:any',
} as const;

export type StoragePermission = (typeof StoragePermission)[keyof typeof StoragePermission];

const S = StoragePermission;

/**
 * ข้อสมมติ (แก้ได้ที่นี่ที่เดียว):
 * - ผู้ยืมคือนักศึกษา · ผู้อนุมัติคืออาจารย์ · admin อนุมัติแทนได้
 * - staff ดูทุกคำขอและสั่งสร้างพื้นที่ซ้ำได้ แต่ไม่อนุมัติ (โจทย์กำหนดให้อาจารย์เป็นคนกดอนุญาต)
 */
export const STORAGE_ROLE_PERMISSIONS: Record<SubsystemRole, readonly StoragePermission[]> = {
  STUDENT: [S.POOL_READ, S.CREATE_OWN, S.READ_OWN, S.CANCEL_OWN, S.LINK_READ_OWN],
  TEACHER: [S.POOL_READ, S.REVIEW_OWN],
  STAFF: [S.POOL_READ, S.READ_ANY, S.PROVISION_RETRY],
  ADMIN: [S.POOL_READ, S.READ_ANY, S.REVIEW_ANY, S.PROVISION_RETRY],
};

export function storagePermissionsOf(user: Pick<CoreHubIdentity, 'subsystemRole'>): readonly StoragePermission[] {
  return STORAGE_ROLE_PERMISSIONS[user.subsystemRole] ?? [];
}

export function hasStoragePermission(user: Pick<CoreHubIdentity, 'subsystemRole'>, ...required: StoragePermission[]) {
  const mine = storagePermissionsOf(user);
  return required.some((p) => mine.includes(p));
}

// ─────────────────────────── สถานะ ───────────────────────────

/** สถานะที่ "กินโควตา" ของ pool — ต้องตรงกับ view storage_pool_usage และ index one_live_per_user */
export const RESERVING_STATUSES: readonly StorageRequestStatus[] = [
  StorageRequestStatus.PROVISIONING,
  StorageRequestStatus.PROVISION_FAILED,
  StorageRequestStatus.ACTIVE,
  StorageRequestStatus.EXPIRED,
];

export const STORAGE_TRANSITIONS: Record<StorageRequestStatus, readonly StorageRequestStatus[]> = {
  PENDING: ['PROVISIONING', 'REJECTED', 'CANCELLED'],
  PROVISIONING: ['ACTIVE', 'PROVISION_FAILED'],
  PROVISION_FAILED: ['ACTIVE', 'PROVISION_FAILED', 'RELEASED'],
  ACTIVE: ['EXPIRED'],
  EXPIRED: ['RELEASED'],
  REJECTED: [],
  CANCELLED: [],
  RELEASED: [],
};

export function canMoveStorage(from: StorageRequestStatus, to: StorageRequestStatus): boolean {
  return STORAGE_TRANSITIONS[from].includes(to);
}

// ─────────────────────────── สิทธิ์ต่อแถว ───────────────────────────

interface Owned {
  coreUserId: string;
  teacherPersonCode: string | null;
}

export function canReadStorage(user: CoreHubIdentity, row: Owned, myPersonCode: string | null): boolean {
  if (hasStoragePermission(user, S.READ_ANY, S.REVIEW_ANY)) return true;
  if (hasStoragePermission(user, S.REVIEW_OWN) && isAssignedTeacher(row, myPersonCode)) return true;
  return hasStoragePermission(user, S.READ_OWN) && isOwner(user, row);
}

export function canReviewStorage(user: CoreHubIdentity, row: Owned, myPersonCode: string | null): boolean {
  if (isOwner(user, row)) return false; // ห้ามอนุมัติคำขอของตัวเอง
  if (hasStoragePermission(user, S.REVIEW_ANY)) return true;
  return hasStoragePermission(user, S.REVIEW_OWN) && isAssignedTeacher(row, myPersonCode);
}

/**
 * ข้อความ error จาก provider ที่ยอมเก็บลงฐาน/แสดงได้ — ตัด URL (อาจมี token) และตัดความยาว
 */
export function safeProviderError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error';
  return raw.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]').replace(/\s+/g, ' ').slice(0, 300);
}
