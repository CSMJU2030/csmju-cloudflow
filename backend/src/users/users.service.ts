import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { USER_PUBLIC_SELECT } from '../auth/auth.service';
import { paginated } from '../common/dto/pagination.dto';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(dto.role ? { role: dto.role } : {}),
      ...(dto.q
        ? {
            OR: [
              { fullName: { contains: dto.q, mode: 'insensitive' } },
              { email: { contains: dto.q, mode: 'insensitive' } },
              { studentCode: { contains: dto.q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_PUBLIC_SELECT,
        orderBy: { id: 'asc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginated(rows, total, dto);
  }

  /** เปิดให้ทุก role เรียกได้ — นักศึกษาต้องเลือกอาจารย์ผู้รับรองตอนยื่นคำขอ */
  async listTeachers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.TEACHER },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_PUBLIC_SELECT });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบผู้ใช้ id ${id}` });
    return user;
  }

  async create(dto: CreateUserDto, actorId: number) {
    this.assertStudentCodeMatchesRole(dto.role, dto.studentCode);

    const user = await this.prisma.user.create({
      data: {
        studentCode: dto.role === UserRole.STUDENT ? dto.studentCode : null,
        fullName: dto.fullName,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      userId: actorId,
      action: 'USER_CREATE',
      details: `สร้างผู้ใช้ #${user.id} ${user.email} role=${user.role}`,
    });
    return user;
  }

  async update(id: number, dto: UpdateUserDto, actorId: number) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: `ไม่พบผู้ใช้ id ${id}` });

    const nextRole = dto.role ?? current.role;
    const nextCode = dto.studentCode !== undefined ? dto.studentCode : current.studentCode;
    this.assertStudentCodeMatchesRole(nextRole, nextCode);

    // เปลี่ยน role จาก STUDENT ทั้งที่ยังมีคำขอค้างอยู่ → trigger จะตีตกทันที
    // ตรวจที่นี่ก่อนเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง แทนข้อความดิบจาก PostgreSQL
    if (current.role === UserRole.STUDENT && nextRole !== UserRole.STUDENT) {
      const open = await this.prisma.request.count({ where: { studentId: id } });
      if (open > 0) {
        throw new ConflictException({
          code: 'ROLE_CHANGE_BLOCKED',
          message: `เปลี่ยน role ไม่ได้: ผู้ใช้ #${id} ยังมีคำขออยู่ ${open} ใบ`,
        });
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        studentCode: nextRole === UserRole.STUDENT ? nextCode : null,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({ userId: actorId, action: 'USER_UPDATE', details: `แก้ไขผู้ใช้ #${id}` });
    return user;
  }

  async remove(id: number, actorId: number) {
    if (id === actorId) {
      throw new ConflictException({ code: 'SELF_DELETE', message: 'ลบบัญชีของตัวเองไม่ได้' });
    }
    await this.findOne(id);

    // FK เป็น RESTRICT — ถ้ายังมีคำขออ้างอยู่ Prisma จะโยน P2003 แล้ว filter แปลงเป็น 409
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({ userId: actorId, action: 'USER_DELETE', details: `ลบผู้ใช้ #${id}` });
    return { message: `ลบผู้ใช้ #${id} เรียบร้อย` };
  }

  private assertStudentCodeMatchesRole(role: UserRole, studentCode?: string | null) {
    if (role === UserRole.STUDENT && !studentCode) {
      throw new BadRequestException({
        code: 'STUDENT_CODE_REQUIRED',
        message: 'role = STUDENT ต้องมี studentCode',
      });
    }
    if (role !== UserRole.STUDENT && studentCode) {
      throw new BadRequestException({
        code: 'STUDENT_CODE_NOT_ALLOWED',
        message: `role = ${role} ต้องไม่มี studentCode`,
      });
    }
  }
}
