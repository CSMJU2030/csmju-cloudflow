import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IDENTITY, USER_TOKEN, type AuthenticatedRequest, type CoreHubIdentity } from '../core-hub-identity';

/** ตัวตนที่ guard ตรวจแล้ว — มีเสมอใน route ที่ไม่ใช่ @Public() */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): CoreHubIdentity => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req[IDENTITY] as CoreHubIdentity;
});

/**
 * token ของผู้ใช้ สำหรับเรียก Core Hub ในนามผู้ใช้จาก backend เท่านั้น
 * ห้ามส่งต่อ ห้ามเก็บ ห้าม log (auth-contract ข้อ 6.1)
 */
export const UserToken = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req[USER_TOKEN] as string;
});
