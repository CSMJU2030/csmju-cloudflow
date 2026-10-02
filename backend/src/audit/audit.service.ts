import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { logEvent } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';

/**
 * บันทึกเหตุการณ์ลง audit_logs (ตารางเขียนอย่างเดียว)
 *
 * ระบุผู้กระทำด้วย core_user_id (claim sub) เท่านั้น — ห้ามใส่ชื่อหรืออีเมลใน details
 * รับ tx ได้ เพื่อให้บันทึกอยู่ใน transaction เดียวกับงานจริง
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    params: { coreUserId: string | null; action: string; details?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    try {
      return await client.auditLog.create({
        data: { coreUserId: params.coreUserId, action: params.action, details: params.details ?? null },
      });
    } catch (e) {
      if (tx) throw e;
      logEvent('request.error', { path: 'audit_logs', action: params.action, error: (e as Error).name });
      return null;
    }
  }
}
