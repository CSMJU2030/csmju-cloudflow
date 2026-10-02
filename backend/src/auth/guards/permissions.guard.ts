import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ApiException } from '../../common/errors';
import { logEvent } from '../../common/logger';
import { IDENTITY, type AuthenticatedRequest } from '../core-hub-identity';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';
import { hasPermission, type Permission } from '../permissions';

/** 403 — "ทำได้ไหม?" รู้ตัวตนแล้วแต่ไม่มี permission ที่ route ต้องการ (ไม่ใช่ 401 · ไม่ใช่ 404) */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const user = req[IDENTITY];
    if (!user) return true; // route สาธารณะ — CoreHubJwtGuard ตัดสินไปแล้ว

    if (hasPermission(user.permissions, ...required)) return true;

    logEvent('authorization.denied', {
      sub: user.id,
      subsystemRole: user.subsystemRole,
      required,
      reason: 'missing_permission',
      path: req.path,
    });
    throw new ApiException('FORBIDDEN', 'You do not have permission to perform this action');
  }
}
