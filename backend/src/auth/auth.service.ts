import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

/** คอลัมน์ที่ยอมให้หลุดออกไปนอก API — ไม่มี passwordHash อยู่ในนี้โดยตั้งใจ */
export const USER_PUBLIC_SELECT = {
  id: true,
  studentCode: true,
  fullName: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // เทียบ hash เสมอแม้ไม่พบผู้ใช้ เพื่อให้เวลาที่ใช้ตอบใกล้เคียงกัน
    // ถ้าตอบเร็วกว่าตอนอีเมลไม่มีอยู่ จะใช้จับได้ว่าอีเมลไหนมีบัญชีจริง
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(dto.password, hash);

    if (!user || !ok) {
      throw new UnauthorizedException({
        code: 'CREDENTIALS_INVALID',
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
    }

    await this.audit.log({ userId: user.id, action: 'AUTH_LOGIN', details: `เข้าสู่ระบบ: ${user.email}` });

    return {
      accessToken: await this.signToken(user.id, user.email, user.role),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '8h',
      user: {
        id: user.id,
        studentCode: user.studentCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  /** สมัครเองได้เฉพาะ STUDENT — role อื่นต้องให้ ADMIN สร้างให้ */
  async register(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        studentCode: dto.studentCode,
        fullName: dto.fullName,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: UserRole.STUDENT,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.audit.log({
      userId: user.id,
      action: 'AUTH_REGISTER',
      details: `สมัครบัญชีนักศึกษา: ${user.email} (${user.studentCode})`,
    });

    return {
      accessToken: await this.signToken(user.id, user.email, user.role),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '8h',
      user,
    };
  }

  async me(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: USER_PUBLIC_SELECT });
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'CREDENTIALS_INVALID',
        message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    await this.audit.log({ userId, action: 'AUTH_PASSWORD_CHANGE', details: 'เปลี่ยนรหัสผ่านสำเร็จ' });

    return { message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
  }

  private signToken(sub: number, email: string, role: UserRole) {
    // role อยู่ใน token เพื่อ debug เท่านั้น — ตอนตรวจสิทธิ์จริงอ่านจาก DB ใหม่เสมอ (ดู JwtStrategy)
    return this.jwt.signAsync({ sub, email, role });
  }
}
