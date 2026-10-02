import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * error code เป็นรายการปิด 9 ค่า (standards/contracts/error-codes.json)
 * เหตุผลเฉพาะทางธุรกิจ (เช่น เครื่องไม่พอ) ใส่ไว้ใน `details.reason` ไม่ใช่สร้าง code ใหม่
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export const STATUS_OF: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class ApiException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: unknown,
    /** วินาที — ต้องมีกับ 429 และ 503 */
    public readonly retryAfter?: number,
  ) {
    super({ code: errorCode, message, details }, STATUS_OF[errorCode]);
  }
}

export const notFound = (message: string) => new ApiException('NOT_FOUND', message);
export const forbidden = (message = 'คุณไม่มีสิทธิ์ทำรายการนี้') => new ApiException('FORBIDDEN', message);
export const validation = (message: string, details?: unknown) =>
  new ApiException('VALIDATION_ERROR', message, details);
export const conflict = (reason: string, message: string, extra?: Record<string, unknown>) =>
  new ApiException('CONFLICT', message, { reason, ...extra });
export const unavailable = (message: string, retryAfter = 30) =>
  new ApiException('SERVICE_UNAVAILABLE', message, undefined, Math.max(1, Math.ceil(retryAfter)));

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.METHOD_NOT_ALLOWED:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'VALIDATION_ERROR';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'BAD_REQUEST';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}
