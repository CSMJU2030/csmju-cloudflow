import { RequestStatus } from '../src/generated/prisma/enums';
import { ApiException } from '../src/common/errors';
import { permissionsOf } from '../src/auth/permissions';
import { RequestsService } from '../src/requests/requests.service';

/** กฎธุรกิจในชั้น service — 403 (ไม่ใช่เจ้าของ) และ 409 (สถานะไปต่อไม่ได้) */
describe('RequestsService', () => {
  const record = {
    id: '6f1c2f8e-0d55-4b8e-9c7a-1d1f2b3c4d5e',
    coreUserId: 'user-owner',
    teacherPersonCode: null,
    status: RequestStatus.REJECTED,
  };
  const prisma = { request: { findUnique: jest.fn(async () => record) } };
  const people = { me: jest.fn(async () => null) };
  const service = new RequestsService(prisma as never, {} as never, people as never, {} as never);

  const actor = (role: 'STUDENT' | 'STAFF', id: string) => ({
    token: 't',
    user: { id, email: null, coreRole: 'student' as const, subsystemRole: role, permissions: permissionsOf(role), exp: 0, expiresAt: '' },
  });

  it('อนุมัติคำขอที่ถูกปฏิเสธไปแล้ว → 409 CONFLICT', async () => {
    const err = await service.approve(record.id, actor('STAFF', 'staff-1')).catch((e) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).getStatus()).toBe(409);
    expect((err as ApiException).errorCode).toBe('CONFLICT');
  });

  it('ยกเลิกคำขอของคนอื่น → 403 FORBIDDEN', async () => {
    const err = await service.cancel(record.id, actor('STUDENT', 'someone-else')).catch((e) => e);
    expect((err as ApiException).getStatus()).toBe(403);
    expect((err as ApiException).errorCode).toBe('FORBIDDEN');
  });
});
