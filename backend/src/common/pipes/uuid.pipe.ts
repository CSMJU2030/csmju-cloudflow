import { Injectable, PipeTransform } from '@nestjs/common';
import { validation } from '../errors';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** path param ที่เป็น id ของระบบเองต้องเป็น UUID v4 — ไม่ใช่ = 400 VALIDATION_ERROR (api-conventions ข้อ 1) */
@Injectable()
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) {
      throw validation('id ต้องเป็น UUID v4', [`id "${String(value).slice(0, 64)}" ไม่ใช่ UUID v4`]);
    }
    return value.toLowerCase();
  }
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}
