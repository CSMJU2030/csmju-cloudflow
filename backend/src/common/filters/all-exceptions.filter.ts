import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Prisma } from '../../generated/prisma/client';
import { ApiException, ErrorCode, codeForStatus } from '../errors';
import { logEvent } from '../logger';

/**
 * error ทุกตัวออกทางเดียว: { success: false, error: { code, message, details? } }
 *
 * - code มาจากรายการปิด 9 ค่าเท่านั้น (api-conventions ข้อ 4)
 * - ห้ามหลุด stack trace · SQL · path ของไฟล์ ไปกับคำตอบ
 * - log แค่ `request.path` (ไม่มี query) — URL ของ /auth/callback มี token (auth-contract ข้อ 5.1)
 * - 429/503 ใส่ Retry-After เสมอ
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, details, retryAfter } = this.describe(exception);

    if (status >= 500 && status !== HttpStatus.SERVICE_UNAVAILABLE) {
      logEvent('request.error', {
        method: req.method,
        path: req.path,
        status,
        error: exception instanceof Error ? exception.name : typeof exception,
      });
    }

    if (retryAfter !== undefined) res.setHeader('Retry-After', String(retryAfter));
    if (req.path.startsWith('/auth/')) res.setHeader('Cache-Control', 'no-store');

    res.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
  }

  private describe(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
    retryAfter?: number;
  } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        code: exception.errorCode,
        message: (exception.getResponse() as { message: string }).message,
        details: exception.details,
        retryAfter: exception.retryAfter,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as string | { message?: unknown };
      const raw = typeof body === 'string' ? body : body?.message;
      // ValidationPipe ส่ง message เป็น array
      if (Array.isArray(raw)) {
        return { status: 400, code: 'VALIDATION_ERROR', message: 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ', details: raw };
      }
      const code = codeForStatus(status);
      return {
        status: code === 'NOT_FOUND' ? 404 : status,
        code,
        message: status === HttpStatus.NOT_FOUND || status === HttpStatus.METHOD_NOT_ALLOWED
          ? 'ไม่พบ endpoint ที่ขอ'
          : typeof raw === 'string' ? raw : 'คำขอไม่ถูกต้อง',
        ...(status === 429 ? { retryAfter: 1 } : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { status: 409, code: 'CONFLICT', message: 'ค่าซ้ำกับข้อมูลที่มีอยู่แล้ว', details: { reason: 'DUPLICATE' } };
        case 'P2003':
          return { status: 409, code: 'CONFLICT', message: 'ยังมีข้อมูลอื่นอ้างถึงรายการนี้อยู่', details: { reason: 'IN_USE' } };
        case 'P2025':
          return { status: 404, code: 'NOT_FOUND', message: 'ไม่พบข้อมูลที่ต้องการ' };
        case 'P2024':
          // pool ของฐานข้อมูลเต็มชั่วคราว (api-conventions ข้อ 4)
          return { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'ระบบไม่ว่างชั่วคราว กรุณาลองใหม่', retryAfter: 5 };
        default:
          return { status: 500, code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: 400, code: 'VALIDATION_ERROR', message: 'ข้อมูลที่ส่งเข้าฐานข้อมูลผิดรูปแบบ' };
    }

    if (isDbRuleViolation(exception)) {
      // trigger / CHECK ที่ RAISE EXCEPTION — กติกาธุรกิจที่ฐานข้อมูลเป็นคนกัน
      return { status: 409, code: 'CONFLICT', message: 'ขัดกับกติกาของระบบ', details: { reason: 'DB_RULE_VIOLATION' } };
    }

    return { status: 500, code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' };
  }
}

function isDbRuleViolation(e: unknown): boolean {
  const msg = (e as { message?: unknown })?.message;
  return typeof msg === 'string' && /violates check constraint|จัดสรรไม่ได้|ไม่พบคำขอ|เขียนอย่างเดียว/.test(msg);
}
