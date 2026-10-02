import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** จำกัด endpoint ให้เฉพาะ role ที่ระบุ — ตรวจโดย RolesGuard */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
