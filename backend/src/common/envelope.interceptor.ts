import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** service ส่งคืน Paginated เมื่อเป็นรายการ — interceptor แยก data กับ meta ให้ */
export class Paginated<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: { total: number; page: number; limit: number; totalPages: number },
  ) {}
}

/**
 * ห่อทุกคำตอบที่สำเร็จด้วย envelope มาตรฐาน (api-conventions ข้อ 3)
 *   { success: true, data }            — ชิ้นเดียว
 *   { success: true, data: [], meta }  — รายการ
 * redirect ของ /auth/* ไม่ผ่านตรงนี้เพราะ controller เขียน response เอง
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        if (body instanceof Paginated) {
          return { success: true, data: body.data, meta: body.meta };
        }
        return { success: true, data: body ?? null };
      }),
    );
  }
}
