import { StorageRequestStatus } from '../generated/prisma/enums';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { hasPermission, Permission } from '../auth/permissions';
import { isAssignedTeacher, isOwner } from '../requests/request-rules';

/**
 * กติกาของระบบยืมพื้นที่ cloud — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * เมทริกซ์สิทธิ์อยู่ที่ auth/permissions.ts ที่เดียว (ROLE_PERMISSIONS) · ที่นี่ตรวจ "ต่อแถว"
 */
export const StoragePermission = {
  POOL_READ: Permission.STORAGE_POOL_READ,
  CREATE_OWN: Permission.STORAGE_CREATE_OWN,
  READ_OWN: Permission.STORAGE_READ_OWN,
  READ_ANY: Permission.STORAGE_READ_ANY,
  CANCEL_OWN: Permission.STORAGE_CANCEL_OWN,
  REVIEW_OWN: Permission.STORAGE_REVIEW_OWN,
  REVIEW_ANY: Permission.STORAGE_REVIEW_ANY,
  LINK_READ_OWN: Permission.STORAGE_LINK_READ_OWN,
  PROVISION_RETRY: Permission.STORAGE_PROVISION_RETRY,
} as const;

const S = StoragePermission;

export function hasStoragePermission(user: Pick<CoreHubIdentity, 'permissions'>, ...required: Permission[]) {
  return hasPermission(user.permissions, ...required);
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
