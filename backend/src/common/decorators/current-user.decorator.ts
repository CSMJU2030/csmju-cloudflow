import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  fullName: string;
}

/**
 * ดึงผู้ใช้จาก token ที่ผ่าน JwtStrategy มาแล้ว
 * ตัวตนของผู้ยิงมาจากตรงนี้เสมอ — ไม่เคยมาจาก body
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    return data ? user?.[data] : user;
  },
);
