'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, ResourceRequest, ResourceUsage } from '@/lib/types';
import { Icon, clamp, initials } from './ui';

/**
 * จำนวนคำขอที่ยัง active พร้อมกันซึ่งถือว่า "ปกติ" สำหรับนักศึกษาหนึ่งคน
 *
 * ⚠️ เป็นค่าที่ใช้แสดงผลฝั่งหน้าเว็บเท่านั้น — backend ไม่ได้บังคับเพดานนี้
 * ถ้าอยากให้บังคับจริง ต้องเพิ่มการตรวจใน RequestsService
 */
const ACTIVE_REQUEST_GUIDELINE = 2;

export default function Topbar() {
  const { user } = useAuth();
  const [pill, setPill] = useState<{ text: string; pct: number; ok: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      try {
        if (user.role === 'STUDENT') {
          // นับคำขอของตัวเองที่ยังเดินอยู่ — ข้อมูลจริงจาก /requests
          const res = await api<Paged<ResourceRequest>>('/requests?limit=100');
          const active = res.data.filter((r) =>
            ['PENDING', 'APPROVED', 'ALLOCATED'].includes(r.status),
          ).length;
          if (alive)
            setPill({
              text: `Active Quota: ${active}/${ACTIVE_REQUEST_GUIDELINE}`,
              pct: (active / ACTIVE_REQUEST_GUIDELINE) * 100,
              ok: active < ACTIVE_REQUEST_GUIDELINE,
            });
        } else {
          // อาจารย์/แอดมินเห็นภาระของคลัสเตอร์รวม — คำนวณจาก view resource_usage
          const rows = await api<ResourceUsage[]>('/resources/usage');
          const total = rows.reduce((s, r) => s + r.total_cpu, 0);
          const used = rows.reduce((s, r) => s + r.used_cpu, 0);
          const pct = total ? Math.round((used / total) * 100) : 0;
          if (alive) setPill({ text: `Cluster Load: ${pct}%`, pct, ok: false });
        }
      } catch {
        /* แถบนี้เป็นของประกอบ ล้มเหลวแล้วไม่ต้องรบกวนผู้ใช้ */
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  return (
    <header className="topbar">
      <span className="brand">CS-CloudFlow</span>
      <div className="topbar-right">
        {pill && (
          <span className={`quota-pill${pill.ok ? ' ok' : ''}`}>
            {pill.text}
            {!pill.ok && (
              <span className="bar">
                <span style={{ width: `${clamp(pill.pct)}%` }} />
              </span>
            )}
          </span>
        )}
        <span style={{ color: 'var(--muted)', display: 'flex' }}>
          <Icon.bell />
        </span>
        {user && <span className="avatar sm">{initials(user.fullName)}</span>}
      </div>
    </header>
  );
}
