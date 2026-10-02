import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * ทุก error ออกทางเดียวกัน:
 *   { error: { code, message, details? }, path, timestamp }
 *
 * ทำไมต้องรวมศูนย์: ถ้าปล่อยให้แต่ละที่ตอบรูปแบบของตัวเอง
 * ฝั่งที่เรียกต้องเขียนโค้ดอ่าน error หลายแบบ แล้วก็จะอ่านพลาด
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'เกิดข้อผิดพลาดภายในระบบ';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;

      if (typeof body === 'string') {
        message = body;
        code = defaultCodeFor(status);
      } else if (Array.isArray(body?.message)) {
        // ผลจาก ValidationPipe
        code = 'VALIDATION_FAILED';
        message = 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ';
        details = body.message;
      } else {
        code = body?.code ?? defaultCodeFor(status);
        message = body?.message ?? exception.message;
        details = body?.details;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message, details } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'ข้อมูลที่ส่งเข้าฐานข้อมูลผิดรูปแบบ';
    } else if (isDbRuleViolation(exception)) {
      // trigger / CHECK ที่ RAISE EXCEPTION ออกมาเอง
      status = HttpStatus.CONFLICT;
      code = 'DB_RULE_VIOLATION';
      message = cleanPgMessage((exception as any).message);
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url}`, (exception as any)?.stack ?? exception);
    }

    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function defaultCodeFor(status: number): string {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
    }[status] ?? 'ERROR'
  );
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError) {
  switch (e.code) {
    case 'P2002': {
      const target = (e.meta?.target as string[] | string) ?? 'field';
      return {
        status: HttpStatus.CONFLICT,
        code: 'DUPLICATE',
        message: `ค่าซ้ำกับที่มีอยู่แล้ว (${Array.isArray(target) ? target.join(', ') : target})`,
        details: e.meta,
      };
    }
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: 'FK_VIOLATION',
        message: 'อ้างถึงข้อมูลที่ไม่มีอยู่ หรือลบไม่ได้เพราะยังมีข้อมูลอื่นอ้างถึงอยู่',
        details: e.meta,
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'ไม่พบข้อมูลที่ต้องการ',
        details: e.meta,
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: `PRISMA_${e.code}`,
        message: e.message.split('\n').pop()?.trim() ?? e.message,
        details: e.meta,
      };
  }
}

function isDbRuleViolation(e: unknown): boolean {
  const msg = (e as any)?.message;
  return typeof msg === 'string' && /violates check constraint|RAISE|ต้องเป็น|จัดสรรไม่ได้/.test(msg);
}

function cleanPgMessage(msg: string): string {
  const line = msg.split('\n').find((l) => /ERROR|violates|ต้องเป็น|จัดสรรไม่ได้/.test(l));
  return (line ?? msg).replace(/^.*ERROR:\s*/, '').trim();
}
