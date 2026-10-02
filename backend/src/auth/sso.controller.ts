import { Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { readCookie, serializeCookie } from '../common/cookies';
import { logEvent } from '../common/logger';
import { Public } from './decorators/public.decorator';
import { IdentityService } from './identity.service';
import {
  CALLBACK_PATH,
  STATE_TTL_SEC,
  cookieNames,
  newState,
  packStateCookie,
  safeNext,
  sameState,
  unpackStateCookie,
} from './sso-session';

/**
 * Central SSO ฝั่งระบบย่อย (auth-contract ข้อ 5) — อยู่นอก prefix /api และเป็น public
 *
 *   GET  /auth/login     สร้าง state → 302 เว็บ Core Hub /sso/authorize
 *   GET  /auth/callback  ตรวจ state + token 10 ขั้น → คุกกี้ session → 302 next
 *   POST /auth/logout    ลบคุกกี้ของตัวเอง → 303 เว็บ Core Hub /logout
 *
 * ระบบนี้ไม่มีฟอร์มรหัสผ่าน ไม่ออก token และไม่มี session ของตัวเอง
 * session คือ Core Hub token ที่ verify แล้วในคุกกี้ HttpOnly เท่านั้น
 * ห้าม log URL เต็มของ /auth/callback (มี token อยู่ใน query)
 */
@ApiExcludeController()
@Controller('auth')
export class SsoController {
  private readonly cookies: { session: string; state: string };

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly identities: IdentityService,
  ) {
    this.cookies = cookieNames(config.subsystemId);
  }

  @Public()
  @Get('login')
  login(@Query('next') next: unknown, @Res() res: Response) {
    const state = newState();
    const target = safeNext(next, this.config.defaultNextPath);

    const authorize = new URL(`${this.config.coreHubWebUrl}/sso/authorize`);
    authorize.searchParams.set('subsystem', this.config.subsystemId);
    authorize.searchParams.set('state', state);

    this.noStore(res);
    res.setHeader(
      'Set-Cookie',
      serializeCookie(this.cookies.state, packStateCookie(state, target), {
        maxAge: STATE_TTL_SEC,
        path: CALLBACK_PATH,
        secure: this.config.isProduction,
      }),
    );
    res.redirect(302, authorize.toString());
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('access_token') accessToken: unknown,
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.noStore(res);
    res.setHeader('Referrer-Policy', 'no-referrer');

    const hasState = typeof state === 'string' && state.length > 0;
    const cookies: string[] = [];
    // เผาคุกกี้ state ทิ้งก่อนตรวจเสมอ — state ใช้ได้ครั้งเดียว
    // ยกเว้น callback ที่ไม่มี state ห้ามแตะ (แท็บอื่นอาจกำลังรอ callback ของตัวเอง)
    if (hasState) cookies.push(this.clear(this.cookies.state, CALLBACK_PATH));

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return this.fail(res, cookies, 400, 'BAD_REQUEST', 'ไม่มี access_token ใน callback', req);
    }

    // เริ่มจาก sidebar ของ Core Hub: ทิ้ง token ไม่ตั้งคุกกี้ใด ๆ แล้วเริ่ม flow ใหม่ที่มี state
    if (!hasState) {
      logEvent('jwt.verification.failure', { reason: 'sso_restart_without_state', kid: null, path: CALLBACK_PATH });
      return res.redirect(302, '/auth/login');
    }

    const stored = unpackStateCookie(readCookie(req.headers.cookie, this.cookies.state));
    if (!stored) {
      logEvent('jwt.verification.failure', { reason: 'sso_state_missing', kid: null, path: CALLBACK_PATH });
      return this.fail(res, cookies, 401, 'UNAUTHORIZED', 'หมดเวลาเข้าสู่ระบบ หรือเปิดลิงก์จากหน้าอื่น', req);
    }
    if (!sameState(stored.state, state as string)) {
      logEvent('jwt.verification.failure', { reason: 'sso_state_mismatch', kid: null, path: CALLBACK_PATH });
      return this.fail(res, cookies, 401, 'UNAUTHORIZED', 'ลิงก์เข้าสู่ระบบไม่ตรงกับที่ระบบเริ่มไว้', req);
    }

    const result = await this.identities.resolve(accessToken, CALLBACK_PATH);
    if (!result.ok) {
      return result.status === 403
        ? this.fail(res, cookies, 403, 'FORBIDDEN', 'บัญชีของคุณไม่มีสิทธิ์เข้าระบบนี้', req)
        : this.fail(res, cookies, 401, 'UNAUTHORIZED', 'ตรวจสอบตัวตนจาก Core Hub ไม่ผ่าน', req);
    }

    const maxAge = result.identity.exp - Math.floor(Date.now() / 1000);
    cookies.push(
      serializeCookie(this.cookies.session, accessToken, {
        maxAge,
        path: '/',
        secure: this.config.isProduction,
      }),
    );
    res.setHeader('Set-Cookie', cookies);
    // ตรวจ next ซ้ำตอนใช้ เพราะค่ามาจากคุกกี้
    return res.redirect(302, safeNext(stored.next, this.config.defaultNextPath));
  }

  @Public()
  @Post('logout')
  @HttpCode(303)
  logout(@Res() res: Response) {
    this.noStore(res);
    res.setHeader('Set-Cookie', [this.clear(this.cookies.session, '/'), this.clear(this.cookies.state, CALLBACK_PATH)]);
    // ออกทั้งระบบ — ออกแค่ระบบย่อยไม่พอ เพราะ Core Hub ที่ยัง login อยู่จะ SSO กลับมาทันที
    res.redirect(303, `${this.config.coreHubWebUrl}/logout`);
  }

  // ─────────────────────────────────────────────────────────────

  private noStore(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
  }

  private clear(name: string, path: string): string {
    return serializeCookie(name, '', { maxAge: 0, path, secure: this.config.isProduction });
  }

  /** ไม่สำเร็จ = ไม่มีคุกกี้ session · ห้าม redirect ซ้ำ · เบราว์เซอร์ได้หน้า HTML ที่มีปุ่มเข้าสู่ระบบอีกครั้ง */
  private fail(res: Response, cookies: string[], status: number, code: string, message: string, req: Request) {
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.status(status);
    if ((req.headers.accept ?? '').includes('text/html')) {
      res.type('html').send(retryPage(message, status));
      return;
    }
    res.json({ success: false, error: { code, message } });
  }
}

function retryPage(message: string, status: number): string {
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const action =
    status === 403
      ? '<p>ติดต่อผู้ดูแลระบบถ้าคิดว่าบัญชีนี้ควรเข้าได้</p>'
      : '<p><a href="/auth/login">เข้าสู่ระบบอีกครั้ง</a></p>';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CS-CloudFlow</title></head><body><main><h1>เข้าสู่ระบบไม่สำเร็จ</h1><p>${safe}</p>${action}</main></body></html>`;
}
