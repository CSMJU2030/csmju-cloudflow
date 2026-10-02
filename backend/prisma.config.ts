import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: URL ของฐานข้อมูลอยู่ที่นี่ ไม่ได้อยู่ใน schema.prisma
// อ่านจาก backend/.env (ห้าม commit) · `prisma generate` ไม่ต้องต่อฐานจึงปล่อยว่างได้ใน CI
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
