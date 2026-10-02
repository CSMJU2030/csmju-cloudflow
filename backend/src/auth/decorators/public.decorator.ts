import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'csmju:isPublic';

/**
 * เปิด route ให้เรียกได้โดยไม่มี token — ใช้ได้กับ 4 path เท่านั้น
 * (GET /api/health · GET /auth/login · GET /auth/callback · POST /auth/logout)
 * และต้องประกาศใน public_endpoints ของ subsystem.yaml
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
