import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-only-change-me-before-production',
    });
  }

  /**
   * อ่าน role จากฐานข้อมูลใหม่ทุกครั้ง ไม่เชื่อ role ที่ฝังอยู่ใน token
   * ถ้าเชื่อ token คนที่ถูกลดสิทธิ์จะยังใช้สิทธิ์เดิมได้จนกว่า token เดิมจะหมดอายุ
   */
  async validate(payload: { sub: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, fullName: true },
    });
    if (!user) {
      throw new UnauthorizedException({ code: 'USER_GONE', message: 'บัญชีนี้ถูกลบไปแล้ว' });
    }
    return user;
  }
}
