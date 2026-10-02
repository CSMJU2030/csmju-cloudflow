'use client';

import type { ReactNode } from 'react';
import Rail from '@/components/Rail';
import Topbar from '@/components/Topbar';
import { useAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // ระหว่างถาม /auth/me ยังไม่รู้ว่าเป็นใคร — อย่าเพิ่งวาดอะไรที่ต้องใช้ตัวตน
  if (loading) {
    return (
      <div className="login-wrap">
        <span className="mono muted">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }

  // AuthProvider จะพากลับไปหน้า login ให้เอง
  if (!user) return null;

  return (
    <div className="shell">
      <Topbar />
      <div className="body">
        <Rail />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
