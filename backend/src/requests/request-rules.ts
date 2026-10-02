import { RequestStatus } from '../generated/prisma/client';
import { hasPermission, Permission } from '../auth/permissions';
import type { CoreHubIdentity } from '../auth/core-hub-identity';

/**
 * เส้นทางสถานะที่อนุญาต — ที่เดียวที่ตอบว่า "จากสถานะนี้ไปไหนได้บ้าง"
 */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ALLOCATED', 'CANCELLED'],
  REJECTED: [],
  ALLOCATED: ['EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

interface Owned {
  coreUserId: string;
  teacherPersonCode: string | null;
}

/** "ของตัวเอง" มาตรฐาน: record.core_user_id === token.sub (authorization.md ข้อ 4) */
export function isOwner(user: CoreHubIdentity, record: Owned): boolean {
  return record.coreUserId === user.id;
}

/**
 * อาจารย์พิจารณาได้เมื่อคำขอระบุ personCode ของตัวเอง หรือไม่ได้ระบุอาจารย์
 * myPersonCode มาจาก GET /people/me ของ Core Hub (null = บัญชียังไม่ผูกกับบุคคล)
 */
export function isAssignedTeacher(record: Owned, myPersonCode: string | null): boolean {
  if (record.teacherPersonCode === null) return true;
  return myPersonCode !== null && record.teacherPersonCode === myPersonCode;
}

export function canRead(user: CoreHubIdentity, record: Owned, myPersonCode: string | null): boolean {
  if (hasPermission(user.permissions, Permission.REQUEST_READ_ANY)) return true;
  if (hasPermission(user.permissions, Permission.REQUEST_REVIEW_OWN) && isAssignedTeacher(record, myPersonCode)) return true;
  return hasPermission(user.permissions, Permission.REQUEST_READ_OWN) && isOwner(user, record);
}

export function canReview(user: CoreHubIdentity, record: Owned, myPersonCode: string | null): boolean {
  if (hasPermission(user.permissions, Permission.REQUEST_REVIEW_ANY)) return true;
  return hasPermission(user.permissions, Permission.REQUEST_REVIEW_OWN) && isAssignedTeacher(record, myPersonCode);
}

export function canCancel(user: CoreHubIdentity, record: Owned): boolean {
  if (hasPermission(user.permissions, Permission.REQUEST_CANCEL_ANY)) return true;
  return hasPermission(user.permissions, Permission.REQUEST_CANCEL_OWN) && isOwner(user, record);
}
