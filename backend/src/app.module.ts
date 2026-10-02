import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { RequestsModule } from './requests/requests.module';
import { AllocationsModule } from './allocations/allocations.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { HealthModule } from './health/health.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ResourcesModule,
    RequestsModule,
    AllocationsModule,
    AuditLogsModule,
    HealthModule,
  ],
  providers: [
    // ปิดทั้งแอปไว้ก่อนเป็นค่าเริ่มต้น แล้วค่อยเปิดเฉพาะจุดด้วย @Public()
    // ปลอดภัยกว่าการไล่ใส่ guard ทีละ controller ซึ่งลืมได้
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
