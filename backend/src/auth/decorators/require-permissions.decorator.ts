import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const REQUIRED_PERMISSIONS = 'csmju:requiredPermissions';

/** ต้องมี permission อย่างน้อยหนึ่งข้อ ไม่งั้น 403 — การตรวจ :own ทำต่อใน service */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
