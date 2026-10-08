import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { APP_CONFIG, loadConfig } from './config/configuration';
import { AllocationsModule } from './allocations/allocations.module';
import { AuditModule } from './audit/audit.module';
import { AuditLogsModule } from './audit-logs/audit-logs.controller';
import { AuthModule } from './auth/auth.module';
import { CoreHubJwtGuard } from './auth/guards/core-hub-jwt.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { CoreHubModule } from './core-hub/core-hub.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RequestsModule } from './requests/requests.module';
import { ResourcesModule } from './resources/resources.module';
import { StorageModule } from './storage/storage.module';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class ConfigProviderModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ConfigProviderModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    CoreHubModule,
    ResourcesModule,
    RequestsModule,
    AllocationsModule,
    AuditLogsModule,
    StorageModule,
  ],
  controllers: [HealthController],
  providers: [
    // ปิดทั้งแอปไว้ก่อน แล้วเปิดเฉพาะจุดด้วย @Public() (api-conventions ข้อ 7.2)
    { provide: APP_GUARD, useClass: CoreHubJwtGuard }, // 401 — ใคร?
    { provide: APP_GUARD, useClass: PermissionsGuard }, // 403 — ทำได้ไหม?
  ],
})
export class AppModule {}
