import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { readCookie } from '../../common/cookies';
import { ApiException } from '../../common/errors';
import { IDENTITY, USER_TOKEN, type AuthenticatedRequest } from '../core-hub-identity';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { IdentityService } from '../identity.service';
import { cookieNames } from '../sso-session';

/**
 * 401 — "นี่คือใคร?" ลงทะเบียนเป็น APP_GUARD ทุก route จึงต้องมี token เว้นแต่ @Public()
 *
 * รับ token 2 ทาง ตรวจเหมือนกัน (auth-contract ข้อ 6):
 *   Authorization: Bearer <token>             ← มาก่อนถ้ามีทั้งคู่
 *   Cookie: csmju_cloudflow_access_token=...  ← เบราว์เซอร์ที่ผ่าน SSO แล้ว
 * header Authorization ที่ไม่ใช่ Bearer = 401 (ไม่ถอยไปใช้คุกกี้)
 * ห้ามอ่านคุกกี้ของเว็บ Core Hub (csmju_access_token) เด็ดขาด
 */
@Injectable()
export class CoreHubJwtGuard implements CanActivate {
  private readonly sessionCookie: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly identities: IdentityService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.sessionCookie = cookieNames(config.subsystemId).session;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const token = this.extract(req);
    const result = await this.identities.resolve(token ?? undefined, req.path);

    if (!result.ok) {
      if (result.status === 403) {
        throw new ApiException('FORBIDDEN', 'บัญชีของคุณไม่มีสิทธิ์เข้าระบบนี้');
      }
      throw new ApiException('UNAUTHORIZED', 'Missing or invalid token');
    }

    req[USER_TOKEN] = token as string;
    req[IDENTITY] = result.identity;
    return true;
  }

  private extract(req: Request): string | null {
    const header = req.headers.authorization;
    if (header !== undefined) {
      const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
      return match ? match[1] : null;
    }
    return readCookie(req.headers.cookie, this.sessionCookie) ?? null;
  }
}
