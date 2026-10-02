'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Icon, initials, roleLabel } from './ui';
import type { UserRole } from '@/lib/types';

const NAV: { href: string; label: string; icon: () => ReactElement; roles?: UserRole[] }[] = [
  { href: '/', label: 'Dashboard', icon: Icon.grid },
  { href: '/requests', label: 'Requests', icon: Icon.inbox },
  { href: '/resources', label: 'Infrastructure', icon: Icon.server },
  // ไม่มีเมนูนี้ให้ TEACHER เพราะ GET /allocations กรองด้วย request.studentId = ตัวเอง
  // อาจารย์ไม่มีทางเป็นนักศึกษา หน้านี้จึงว่างเปล่าตลอดกาลสำหรับ role นี้
  // (อาจารย์ดูเครื่องที่นักศึกษาได้รับ ผ่านหน้ารายละเอียดคำขอที่ตัวเองรับรองแทน)
  { href: '/allocations', label: 'Allocations', icon: Icon.node, roles: ['STUDENT', 'ADMIN'] },
  { href: '/audit-logs', label: 'Audit Log', icon: Icon.history, roles: ['ADMIN'] },
  { href: '/users', label: 'Settings', icon: Icon.gear, roles: ['ADMIN'] },
];

export default function Rail() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) return null;

  // ซ่อนเมนูตาม role เป็นเรื่องความสะดวก ไม่ใช่การกันสิทธิ์ —
  // ด่านจริงอยู่ที่ RolesGuard ฝั่ง backend เพราะโค้ดหน้านี้อยู่บนเครื่องผู้ใช้แล้ว
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <aside className="rail">
      <div className="rail-user">
        <div className="avatar">{initials(user.fullName)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="rail-name">{user.fullName}</div>
          <div className="rail-role">{roleLabel(user.role)}</div>
        </div>
      </div>

      {user.role === 'STUDENT' && (
        <button className="btn btn-primary btn-block" onClick={() => router.push('/requests/new')}>
          <Icon.plus /> New Request
        </button>
      )}

      <nav>
        {items.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className="nav" data-active={active}>
              <n.icon />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="rail-spacer" />

      <div className="rail-foot">
        <Link href="/requests" className="nav">
          <Icon.help /> Help Center
        </Link>
        <button className="nav" onClick={signOut} style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%' }}>
          <Icon.logout /> Logout
        </button>
      </div>
    </aside>
  );
}
