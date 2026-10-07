'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Icon, displayName, initials, roleLabel } from './ui';

/** ซ่อนเมนูตาม permission เป็นเรื่องความสะดวก — ด่านจริงอยู่ที่ PermissionsGuard ฝั่ง backend */
const NAV: { href: string; label: string; icon: () => ReactElement; perms?: string[] }[] = [
  { href: '/', label: 'Dashboard', icon: Icon.grid },
  { href: '/requests', label: 'Requests', icon: Icon.inbox },
  { href: '/resources', label: 'Infrastructure', icon: Icon.server },
  { href: '/allocations', label: 'Allocations', icon: Icon.node, perms: ['allocation:read:own', 'allocation:read:any'] },
  { href: '/storage', label: 'Cloud Storage', icon: Icon.disk, perms: ['storage-pool:read'] },
  { href: '/audit-logs', label: 'Audit Log', icon: Icon.history, perms: ['audit-log:read'] },
];

export default function Rail() {
  const { user, signOut, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) return null;

  const items = NAV.filter((n) => !n.perms || can(...n.perms));

  return (
    <aside className="rail">
      <div className="rail-user">
        <div className="avatar">{initials(displayName(user))}</div>
        <div style={{ minWidth: 0 }}>
          <div className="rail-name">{displayName(user)}</div>
          <div className="rail-role">{roleLabel(user.coreRole)}</div>
        </div>
      </div>

      {can('request:create:own') && (
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
        <button type="button" className="nav nav-button" onClick={signOut}>
          <Icon.logout /> Logout
        </button>
      </div>
    </aside>
  );
}
