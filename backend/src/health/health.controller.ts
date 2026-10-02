import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { Public } from '../auth/decorators/public.decorator';

/** GET /api/health — public · data.service ต้องตรงกับ name ใน subsystem.yaml และทะเบียน Core Hub */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok', service: this.config.subsystemId };
  }
}
