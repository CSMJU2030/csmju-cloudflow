import { Module } from '@nestjs/common';

import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { IdentityService } from './identity.service';
import { JwksService } from './jwks.service';
import { MeController } from './me.controller';
import { SsoController } from './sso.controller';

@Module({
  controllers: [SsoController, MeController],
  providers: [JwksService, CoreHubTokenVerifier, IdentityService],
  exports: [JwksService, CoreHubTokenVerifier, IdentityService],
})
export class AuthModule {}
