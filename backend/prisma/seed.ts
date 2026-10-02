/**
 * ข้อมูลตั้งต้นสำหรับพัฒนาและทดสอบ — รันซ้ำได้ (upsert ตาม server_name)
 *
 * seed แค่ "เครื่อง" อย่างเดียว เพราะคำขอต้องมีเจ้าของเป็นผู้ใช้จริงของ Core Hub (core_user_id = sub)
 * ระบบนี้ไม่มีตาราง users และไม่มีรหัสผ่าน — ยื่นคำขอผ่านหน้าเว็บหลัง login ด้วย SSO
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, ResourceStatus } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const machines = [
  { serverName: 'cs-node-01', totalCpu: 32, totalRamGb: 128, totalStorageGb: 2000, hasGpu: false, status: ResourceStatus.AVAILABLE },
  { serverName: 'cs-node-02', totalCpu: 64, totalRamGb: 256, totalStorageGb: 4000, hasGpu: true, status: ResourceStatus.AVAILABLE },
  { serverName: 'cs-node-03', totalCpu: 16, totalRamGb: 64, totalStorageGb: 1000, hasGpu: false, status: ResourceStatus.AVAILABLE },
  { serverName: 'cs-node-04', totalCpu: 48, totalRamGb: 192, totalStorageGb: 3000, hasGpu: true, status: ResourceStatus.MAINTENANCE },
];

async function main() {
  for (const m of machines) {
    await prisma.resource.upsert({ where: { serverName: m.serverName }, update: m, create: m });
  }
  console.log(`seed: เครื่อง ${machines.length} เครื่อง`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
