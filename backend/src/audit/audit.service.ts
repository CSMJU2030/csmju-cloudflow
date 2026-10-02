import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * บันทึกเหตุการณ์ลง audit_logs
   *
   * รับ `tx` ได้ เพื่อให้บันทึกอยู่ใน transaction เดียวกับงานจริง —
   * ถ้างานจริง rollback บันทึกก็ต้องหายไปด้วย ไม่งั้น log จะเล่าเรื่องที่ไม่เคยเกิด
   */
  async log(
    params: { userId: number | null; action: string; details?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    try {
      return await client.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          details: params.details ?? null,
        },
      });
    } catch (e) {
      // การเขียน log ล้มเหลว ต้องไม่ทำให้งานหลักพัง (ยกเว้นอยู่ใน tx เดียวกัน)
      if (tx) throw e;
      this.logger.warn(`เขียน audit log ไม่สำเร็จ: ${params.action} — ${(e as Error).message}`);
      return null;
    }
  }
}
