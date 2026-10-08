'use client';

import type { ReactNode } from 'react';
import { CsmjuAppShell, type NavItem } from '@/csmju';
import { useAuth } from '@/lib/auth';
import { displayName, initials, roleLabel } from './ui';

/** เมนูทั้งหมด — ซ่อนตาม permission เป็นแค่ความสะดวก ด่านจริงอยู่ที่ PermissionsGuard ฝั่ง backend */
const NAV: (NavItem & { perms?: string[] })[] = [
  { label: 'ภาพรวม', labelEn: 'Dashboard', href: '/', icon: 'dashboard' },
  { label: 'คำขอใช้เครื่อง', labelEn: 'Requests', href: '/requests', icon: 'description' },
  { label: 'เครื่องเซิร์ฟเวอร์', labelEn: 'Infrastructure', href: '/resources', icon: 'meeting-room' },
  {
    label: 'การจัดสรร',
    labelEn: 'Allocations',
    href: '/allocations',
    icon: 'event',
    perms: ['allocation:read:own', 'allocation:read:any'],
  },
  { label: 'ยืมพื้นที่ Cloud', labelEn: 'Storage', href: '/storage', icon: 'menu-book', perms: ['storage-pool:read'] },
  { label: 'บันทึกการใช้งาน', labelEn: 'Audit Log', href: '/audit-logs', icon: 'receipt', perms: ['audit-log:read'] },
];

/**
 * ตรวจตัวตนจาก /api/v1/me แล้วครอบหน้าด้วย CsmjuAppShell ของ template กลาง
 * (sidebar · ปุ่มกลับ CSMJU Portal · ปุ่มออกจากระบบแบบฟอร์ม POST /auth/logout)
 */
export default function AppFrame({ coreHubUrl, children }: { coreHubUrl?: string; children: ReactNode }) {
  const { user, loading, needsLogin, can } = useAuth();

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

  const nav = NAV.filter((n) => !n.perms || can(...n.perms)).map(({ perms: _perms, ...item }) => item);

  return (
    <CsmjuAppShell
      displayName="CS Cloudflow"
      nav={nav}
      coreHubUrl={coreHubUrl}
      primaryAction={can('request:create:own') ? { label: 'ยื่นคำขอใช้เครื่อง', href: '/requests/new' } : undefined}
      user={{ initials: initials(displayName(user)), roleLabel: roleLabel(user.coreRole) }}
    >
      {children}
    </CsmjuAppShell>
  );
}
