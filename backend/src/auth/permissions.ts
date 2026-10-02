import type { SubsystemRole } from './role-mapping';

/**
 * permission ของ CS-CloudFlow — รูปแบบ <resource>:<action>[:own|:any] (authorization.md ข้อ 4)
 *
 * guard ตรวจแค่ว่ามี permission อย่างน้อยหนึ่งข้อ
 * การตรวจ ":own" (เป็นเจ้าของคำขอจริงไหม · เป็นอาจารย์ที่ถูกระบุจริงไหม) ทำใน service กับข้อมูลจริงเสมอ
 */
export const Permission = {
  RESOURCE_READ: 'resource:read',
  RESOURCE_CREATE: 'resource:create',
  RESOURCE_UPDATE: 'resource:update',
  RESOURCE_DELETE: 'resource:delete',

  REQUEST_CREATE_OWN: 'request:create:own',
  REQUEST_READ_OWN: 'request:read:own',
  REQUEST_READ_ANY: 'request:read:any',
  REQUEST_UPDATE_OWN: 'request:update:own',
  REQUEST_CANCEL_OWN: 'request:cancel:own',
  REQUEST_CANCEL_ANY: 'request:cancel:any',
  /** อาจารย์พิจารณาคำขอที่ระบุตัวเอง หรือคำขอที่ไม่ได้ระบุอาจารย์ */
  REQUEST_REVIEW_OWN: 'request:review:own',
  REQUEST_REVIEW_ANY: 'request:review:any',

  ALLOCATION_READ_OWN: 'allocation:read:own',
  ALLOCATION_READ_ANY: 'allocation:read:any',
  ALLOCATION_CREATE: 'allocation:create',
  ALLOCATION_RELEASE: 'allocation:release',

  AUDIT_LOG_READ: 'audit-log:read',
  COURSE_READ: 'course:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const OPERATOR: readonly Permission[] = [
  P.RESOURCE_READ,
  P.RESOURCE_CREATE,
  P.RESOURCE_UPDATE,
  P.RESOURCE_DELETE,
  P.REQUEST_READ_ANY,
  P.REQUEST_CANCEL_ANY,
  P.REQUEST_REVIEW_ANY,
  P.ALLOCATION_READ_ANY,
  P.ALLOCATION_CREATE,
  P.ALLOCATION_RELEASE,
  P.AUDIT_LOG_READ,
  P.COURSE_READ,
];

/** เมทริกซ์สิทธิ์ที่เดียวของระบบ */
export const ROLE_PERMISSIONS: Record<SubsystemRole, readonly Permission[]> = {
  STUDENT: [
    P.RESOURCE_READ,
    P.REQUEST_CREATE_OWN,
    P.REQUEST_READ_OWN,
    P.REQUEST_UPDATE_OWN,
    P.REQUEST_CANCEL_OWN,
    P.ALLOCATION_READ_OWN,
    P.COURSE_READ,
  ],
  TEACHER: [P.RESOURCE_READ, P.REQUEST_READ_OWN, P.REQUEST_REVIEW_OWN, P.COURSE_READ],
  STAFF: OPERATOR,
  ADMIN: OPERATOR,
};

export function permissionsOf(role: SubsystemRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(perms: readonly Permission[], ...required: Permission[]): boolean {
  return required.some((p) => perms.includes(p));
}
