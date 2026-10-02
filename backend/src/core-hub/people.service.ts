import { Injectable } from '@nestjs/common';

import { CoreHubClient } from './core-hub.client';

export interface MyPerson {
  personCode: string;
  personType: 'STUDENT' | 'STAFF' | string;
  advisors: { personCode: string; fullNameTh: string }[];
}

/**
 * ข้อมูลบุคคลของผู้เรียก (GET /people/me) — ห้าม cache ทุกแบบ (reference-data.md ข้อ 5)
 * ระบบนี้เก็บลงฐานได้แค่ personCode ตอนเกิดรายการ · ชื่ออาจารย์ที่ปรึกษาใช้แสดงผลในฟอร์มเท่านั้น
 * guest เรียกไม่ได้ (403) · บัญชีที่ยังไม่ผูกกับบุคคลได้ null
 */
@Injectable()
export class PeopleService {
  constructor(private readonly coreHub: CoreHubClient) {}

  async me(userToken: string): Promise<MyPerson | null> {
    try {
      const body = await this.coreHub.get<{
        personCode?: unknown;
        personType?: unknown;
        advisors?: { personCode?: unknown; fullNameTh?: unknown }[];
      } | null>('/people/me', userToken);
      const data = body?.data;
      if (!data || typeof data.personCode !== 'string') return null;
      return {
        personCode: data.personCode,
        personType: typeof data.personType === 'string' ? data.personType : 'STUDENT',
        advisors: Array.isArray(data.advisors)
          ? data.advisors
              .filter((a) => typeof a?.personCode === 'string')
              .map((a) => ({
                personCode: a.personCode as string,
                fullNameTh: typeof a.fullNameTh === 'string' ? a.fullNameTh : (a.personCode as string),
              }))
          : [],
      };
    } catch (e) {
      return CoreHubClient.toHttp(e);
    }
  }
}
