import { RequestStatus } from '../src/generated/prisma/enums';
import type { CoreHubIdentity } from '../src/auth/core-hub-identity';
import { permissionsOf } from '../src/auth/permissions';
import { mapCoreRole, type SubsystemRole } from '../src/auth/role-mapping';
import { canCancel, canRead, canReview, canTransition } from '../src/requests/request-rules';

const as = (role: SubsystemRole, id = 'user-1'): CoreHubIdentity => ({
  id,
  email: null,
  coreRole: 'student',
  subsystemRole: role,
  permissions: permissionsOf(role),
  exp: 0,
  expiresAt: '',
});

describe('role mapping (ต้องตรงกับ default_role_mapping ในทะเบียน)', () => {
  it('แมปเฉพาะ role ที่ระบบรับ', () => {
    expect(mapCoreRole('student')).toBe('STUDENT');
    expect(mapCoreRole('lecturer')).toBe('TEACHER');
    expect(mapCoreRole('staff')).toBe('STAFF');
    expect(mapCoreRole('admin')).toBe('ADMIN');
  });
  it('alumni / guest / ค่าอื่น เข้าไม่ได้ (403)', () => {
    expect(mapCoreRole('alumni')).toBeNull();
    expect(mapCoreRole('guest')).toBeNull();
    expect(mapCoreRole('root')).toBeNull();
  });
});

describe('สิทธิ์ของคำขอ (:own ตรวจกับข้อมูลจริง)', () => {
  const mine = { coreUserId: 'user-1', teacherPersonCode: 'somchai.t' };

  it('นักศึกษาเห็น/ยกเลิกได้เฉพาะของตัวเอง', () => {
    expect(canRead(as('STUDENT', 'user-1'), mine, null)).toBe(true);
    expect(canRead(as('STUDENT', 'user-2'), mine, null)).toBe(false);
    expect(canCancel(as('STUDENT', 'user-2'), mine)).toBe(false);
  });

  it('นักศึกษาอนุมัติคำขอไม่ได้ (403)', () => {
    expect(canReview(as('STUDENT', 'user-1'), mine, null)).toBe(false);
  });

  it('อาจารย์พิจารณาได้เฉพาะที่ระบุตัวเอง หรือไม่ได้ระบุใคร', () => {
    expect(canReview(as('TEACHER', 't'), mine, 'somchai.t')).toBe(true);
    expect(canReview(as('TEACHER', 't'), mine, 'wanida.t')).toBe(false);
    expect(canReview(as('TEACHER', 't'), mine, null)).toBe(false);
    expect(canReview(as('TEACHER', 't'), { ...mine, teacherPersonCode: null }, null)).toBe(true);
  });

  it('เจ้าหน้าที่พิจารณา/ยกเลิกได้ทุกใบ', () => {
    expect(canReview(as('STAFF', 's'), mine, null)).toBe(true);
    expect(canCancel(as('ADMIN', 'a'), mine)).toBe(true);
  });

  it('เส้นทางสถานะ — REJECTED ไปต่อไม่ได้ (409)', () => {
    expect(canTransition(RequestStatus.PENDING, RequestStatus.APPROVED)).toBe(true);
    expect(canTransition(RequestStatus.REJECTED, RequestStatus.APPROVED)).toBe(false);
    expect(canTransition(RequestStatus.ALLOCATED, RequestStatus.CANCELLED)).toBe(false);
  });
});
