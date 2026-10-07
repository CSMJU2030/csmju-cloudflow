import { permissionsOf } from '../src/auth/permissions';
import type { SubsystemRole } from '../src/auth/role-mapping';
import {
  canMoveStorage,
  canReadStorage,
  canReviewStorage,
  safeProviderError,
  StoragePermission as S,
} from '../src/storage/storage-rules';

const user = (role: SubsystemRole, id: string) => ({
  id,
  email: null,
  coreRole: 'student' as const,
  subsystemRole: role,
  permissions: permissionsOf(role),
  exp: 0,
  expiresAt: '',
});

describe('storage-rules', () => {
  const row = { coreUserId: 'stu-1', teacherPersonCode: 'somchai.t' };

  it('เส้นทางสถานะ: อนุมัติได้จาก PENDING เท่านั้น · ACTIVE ย้อนกลับไม่ได้', () => {
    expect(canMoveStorage('PENDING', 'PROVISIONING')).toBe(true);
    expect(canMoveStorage('REJECTED', 'PROVISIONING')).toBe(false);
    expect(canMoveStorage('ACTIVE', 'PENDING')).toBe(false);
    expect(canMoveStorage('PROVISION_FAILED', 'ACTIVE')).toBe(true);
  });

  it('นักศึกษายืมได้ อาจารย์อนุมัติได้ staff อนุมัติไม่ได้', () => {
    expect(permissionsOf('STUDENT')).toContain(S.CREATE_OWN);
    expect(permissionsOf('TEACHER')).toContain(S.REVIEW_OWN);
    expect(permissionsOf('TEACHER')).not.toContain(S.CREATE_OWN);
    expect(permissionsOf('STAFF')).not.toContain(S.REVIEW_ANY);
    expect(permissionsOf('STAFF')).not.toContain(S.REVIEW_OWN);
    expect(permissionsOf('ADMIN')).toContain(S.REVIEW_ANY);
  });

  it('อาจารย์อนุมัติได้เฉพาะคำขอที่ระบุตัวเองหรือไม่ระบุใคร', () => {
    const t = user('TEACHER', 'teacher-1');
    expect(canReviewStorage(t, row, 'somchai.t')).toBe(true);
    expect(canReviewStorage(t, row, 'other.t')).toBe(false);
    expect(canReviewStorage(t, { ...row, teacherPersonCode: null }, null)).toBe(true);
  });

  it('ห้ามอนุมัติคำขอของตัวเอง แม้เป็น admin', () => {
    expect(canReviewStorage(user('ADMIN', 'stu-1'), row, null)).toBe(false);
    expect(canReviewStorage(user('ADMIN', 'admin-1'), row, null)).toBe(true);
  });

  it('นักศึกษาเห็นแค่ของตัวเอง', () => {
    expect(canReadStorage(user('STUDENT', 'stu-1'), row, null)).toBe(true);
    expect(canReadStorage(user('STUDENT', 'stu-2'), row, null)).toBe(false);
    expect(canReadStorage(user('STAFF', 'staff-1'), row, null)).toBe(true);
  });

  it('error ของ provider ถูกตัด URL ออกก่อนเก็บ', () => {
    const msg = safeProviderError(new Error('POST https://admin:pw@cloud.example/ocs?token=abc failed 500'));
    expect(msg).not.toContain('cloud.example');
    expect(msg).not.toContain('token=abc');
    expect(msg).toContain('[url]');
  });
});
