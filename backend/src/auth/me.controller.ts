import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from './decorators/current-user.decorator';
import type { CoreHubIdentity } from './core-hub-identity';

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'ตัวตนของผู้เรียก (จาก token) · session.expiresAt ใช้ต่ออายุล่วงหน้า' })
  me(@CurrentUser() user: CoreHubIdentity) {
    return {
      id: user.id,
      email: user.email,
      coreRole: user.coreRole,
      subsystemRole: user.subsystemRole,
      permissions: user.permissions,
      session: { expiresAt: user.expiresAt },
    };
  }
}
