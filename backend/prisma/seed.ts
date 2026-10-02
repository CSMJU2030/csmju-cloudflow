/**
 * ข้อมูลตั้งต้นสำหรับพัฒนาและทดสอบ
 *
 * รันซ้ำได้ (idempotent) — ใช้ upsert ทั้งหมด จึงไม่สร้างข้อมูลซ้ำ
 * รหัสผ่านของทุกบัญชี: Passw0rd!
 */
import { PrismaClient, RequestStatus, ResourceStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Passw0rd!';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ───────────────── ผู้ใช้ ─────────────────
  const people = [
    { email: 'admin@mju.ac.th', fullName: 'ผู้ดูแลระบบ CS', role: UserRole.ADMIN, studentCode: null },
    { email: 'somchai.t@mju.ac.th', fullName: 'อ.สมชาย ใจดี', role: UserRole.TEACHER, studentCode: null },
    { email: 'wanida.t@mju.ac.th', fullName: 'อ.วนิดา รักเรียน', role: UserRole.TEACHER, studentCode: null },
    { email: 'natdanai@mju.ac.th', fullName: 'ณัฐดนัย ผู้ขอ', role: UserRole.STUDENT, studentCode: '6704101323' },
    { email: 'student2@mju.ac.th', fullName: 'ปิยะ นักศึกษา', role: UserRole.STUDENT, studentCode: '6704101324' },
    { email: 'student3@mju.ac.th', fullName: 'มานี เรียนดี', role: UserRole.STUDENT, studentCode: '6704101325' },
  ];

  for (const p of people) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: { fullName: p.fullName, role: p.role, studentCode: p.studentCode },
      create: { ...p, passwordHash },
    });
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@mju.ac.th' } });
  const somchai = await prisma.user.findUniqueOrThrow({ where: { email: 'somchai.t@mju.ac.th' } });
  const wanida = await prisma.user.findUniqueOrThrow({ where: { email: 'wanida.t@mju.ac.th' } });
  const natdanai = await prisma.user.findUniqueOrThrow({ where: { email: 'natdanai@mju.ac.th' } });
  const piya = await prisma.user.findUniqueOrThrow({ where: { email: 'student2@mju.ac.th' } });

  // ───────────────── เครื่อง ─────────────────
  const machines = [
    { serverName: 'cs-node-01', totalCpu: 32, totalRamGb: 128, totalStorageGb: 2000, hasGpu: false, status: ResourceStatus.AVAILABLE },
    { serverName: 'cs-node-02', totalCpu: 64, totalRamGb: 256, totalStorageGb: 4000, hasGpu: true, status: ResourceStatus.AVAILABLE },
    { serverName: 'cs-node-03', totalCpu: 16, totalRamGb: 64, totalStorageGb: 1000, hasGpu: false, status: ResourceStatus.AVAILABLE },
    { serverName: 'cs-node-04', totalCpu: 48, totalRamGb: 192, totalStorageGb: 3000, hasGpu: true, status: ResourceStatus.MAINTENANCE },
  ];

  for (const m of machines) {
    await prisma.resource.upsert({ where: { serverName: m.serverName }, update: m, create: m });
  }
  const node01 = await prisma.resource.findUniqueOrThrow({ where: { serverName: 'cs-node-01' } });

  // ───────────────── คำขอ ─────────────────
  // ใช้ subjectCode เป็นตัวกันซ้ำ เพราะยังไม่มี unique key ทางธุรกิจตัวอื่น
  const seedRequests = [
    {
      key: 'SEED-CS401',
      data: {
        studentId: natdanai.id,
        teacherId: somchai.id,
        subjectCode: 'CS401',
        reqCpu: 8,
        reqRamGb: 32,
        reqStorageGb: 300,
        reqGpu: false,
        reason: 'ฝึกโมเดลจำแนกภาพสำหรับโปรเจกต์จบ ต้องรันต่อเนื่องหลายวัน',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-12-31'),
        status: RequestStatus.APPROVED,
        reviewedAt: new Date(),
      },
    },
    {
      key: 'SEED-CS302',
      data: {
        studentId: piya.id,
        teacherId: wanida.id,
        subjectCode: 'CS302',
        reqCpu: 4,
        reqRamGb: 16,
        reqStorageGb: 100,
        reqGpu: false,
        reason: 'ทำแล็บฐานข้อมูลแบบกระจาย ต้องมีเครื่องแยกจากเครื่องส่วนตัว',
        startDate: new Date('2026-10-05'),
        endDate: new Date('2026-11-30'),
        status: RequestStatus.PENDING,
      },
    },
    {
      key: 'SEED-CS450',
      data: {
        studentId: natdanai.id,
        teacherId: wanida.id,
        subjectCode: 'CS450',
        reqCpu: 16,
        reqRamGb: 64,
        reqStorageGb: 500,
        reqGpu: true,
        reason: 'ทดลอง fine-tune โมเดลภาษาขนาดเล็ก จำเป็นต้องใช้ GPU',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2027-01-31'),
        status: RequestStatus.PENDING,
      },
    },
  ];

  for (const r of seedRequests) {
    const exists = await prisma.request.findFirst({
      where: { subjectCode: r.data.subjectCode, studentId: r.data.studentId },
    });
    if (!exists) await prisma.request.create({ data: r.data });
  }

  const approved = await prisma.request.findFirstOrThrow({
    where: { subjectCode: 'CS401', studentId: natdanai.id },
  });

  // ───────────────── การจัดสรร ─────────────────
  const hasAllocation = await prisma.allocation.findFirst({
    where: { requestId: approved.id, releasedAt: null },
  });

  if (!hasAllocation) {
    await prisma.$transaction(async (tx) => {
      await tx.request.update({ where: { id: approved.id }, data: { status: RequestStatus.ALLOCATED } });
      await tx.allocation.create({
        data: {
          requestId: approved.id,
          resourceId: node01.id,
          ipAddress: '10.10.20.11',
          port: 22001,
          accessNote: 'ssh cs401@10.10.20.11 -p 22001',
        },
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: 'ALLOCATION_CREATE',
          details: `[seed] จัดสรรคำขอ #${approved.id} ลงเครื่อง ${node01.serverName}`,
        },
      });
    });
  }

  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'SEED_RUN', details: 'รันข้อมูลตั้งต้นสำเร็จ' },
  });

  // ───────────────── สรุป ─────────────────
  const counts = {
    users: await prisma.user.count(),
    resources: await prisma.resource.count(),
    requests: await prisma.request.count(),
    allocations: await prisma.allocation.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('เพิ่มข้อมูลตั้งต้นเรียบร้อย:', counts);
  console.log(`รหัสผ่านของทุกบัญชี: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('seed ล้มเหลว:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
