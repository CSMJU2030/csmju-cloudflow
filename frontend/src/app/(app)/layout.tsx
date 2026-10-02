'use client';

import type { ReactNode } from 'react';
import Rail from '@/components/Rail';
import Topbar from '@/components/Topbar';
import { useAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, needsLogin } = useAuth();

  // ระหว่างถาม /api/v1/me ยังไม่รู้ว่าเป็นใคร — อย่าเพิ่งวาดอะไรที่ต้องใช้ตัวตน
  if (loading || (!user && !needsLogin)) {
    return (
      <div className="login-wrap">
        <span className="mono muted">กำลังตรวจสอบสิทธิ์…</span>
      </div>
    );
  }

  // re-SSO เพิ่งวนกลับมาแล้วยังไม่ผ่าน — ให้ผู้ใช้กดเอง แทนการ redirect ซ้ำ (auth-contract ข้อ 7)
  if (!user) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p>เข้าสู่ระบบด้วยบัญชีของ Core Hub (CSMJU Portal)</p>
          <a className="btn btn-primary btn-block" href="/auth/login">
            เข้าสู่ระบบอีกครั้ง
          </a>
        </div>
      </div>
    );
  }

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
