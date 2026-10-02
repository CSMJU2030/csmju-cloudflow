import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** เปิดให้ยิงได้โดยไม่ต้องมี token — ใช้เฉพาะ /health, /auth/login, /auth/register */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
