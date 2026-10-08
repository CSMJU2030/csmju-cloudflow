import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 แบบ driver adapter (PrismaPg) ตาม tech-stack.md ข้อ 1.3 · DATABASE_URL มาจาก backend/.env
 * จำกัด connection ด้วย DATABASE_POOL_MAX (ค่าเริ่มต้น 5) — ฐานกลางบน server ใช้ร่วมกันหลายระบบ (deployment.md ข้อ 4.1)
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.DATABASE_POOL_MAX) || 5,
      }),
      log: ['warn', 'error'],
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
