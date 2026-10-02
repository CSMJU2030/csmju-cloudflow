import { Injectable } from '@nestjs/common';

import { logEvent } from '../common/logger';
import { TokenVerificationError } from './auth.errors';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import type { CoreHubIdentity } from './core-hub-identity';
import { permissionsOf } from './permissions';
import { isCoreRole, mapCoreRole } from './role-mapping';

export type IdentityResult =
  | { ok: true; identity: CoreHubIdentity }
  | { ok: false; status: 401; reason: string }
  | { ok: false; status: 403; reason: 'role_not_mapped' };

/** ตรวจ token แล้วแมป role — ใช้ร่วมกันระหว่าง guard ของ API และ /auth/callback */
@Injectable()
export class IdentityService {
  constructor(private readonly verifier: CoreHubTokenVerifier) {}

  async resolve(token: string | undefined, path: string): Promise<IdentityResult> {
    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch (e) {
      const reason = e instanceof TokenVerificationError ? e.reason : 'invalid_signature';
      const kid = e instanceof TokenVerificationError ? e.kid : null;
      logEvent('jwt.verification.failure', { reason, kid, path });
      return { ok: false, status: 401, reason };
    }

    const subsystemRole = isCoreRole(claims.role) ? mapCoreRole(claims.role) : null;
    if (!subsystemRole) {
      logEvent('authorization.role_mapping_failed', { sub: claims.sub, coreRole: claims.role });
      return { ok: false, status: 403, reason: 'role_not_mapped' };
    }

    logEvent('jwt.verification.success', { sub: claims.sub, coreRole: claims.role, subsystemRole });

    return {
      ok: true,
      identity: {
        id: claims.sub,
        email: claims.email,
        coreRole: claims.role as CoreHubIdentity['coreRole'],
        subsystemRole,
        permissions: permissionsOf(subsystemRole),
        exp: claims.exp,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
      },
    };
  }
}
