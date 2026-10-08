'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, ResourceRequest, ResourceUsage } from '@/lib/types';
import {
  Alert,
  Card,
  Empty,
  Icon,
  SpecChip,
  Stat,
  StatusChip,
  clamp,
  days,
  displayName,
  fmtDate,
  personLabel,
} from '@/components/ui';

export default function DashboardPage() {
  const { user, can } = useAuth();
  const [usage, setUsage] = useState<ResourceUsage[] | null>(null);
  const [recent, setRecent] = useState<ResourceRequest[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [u, r] = await Promise.all([
          api<Paged<ResourceUsage>>('/resource-usages?limit=100'),
          api<Paged<ResourceRequest>>('/requests?limit=8'),
        ]);
        setUsage(u.data);
        setRecent(r.data);
      } catch (e) {
        setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูลไม่สำเร็จ');
        setUsage([]);
        setRecent([]);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const r = recent ?? [];
    const n = usage ?? [];
    return {
      pending: r.filter((x) => x.status === 'PENDING').length,
      allocated: r.filter((x) => x.status === 'ALLOCATED').length,
      nodesFree: n.filter((x) => x.status === 'AVAILABLE' && x.freeCpu > 0).length,
      nodesTotal: n.length,
    };
  }, [recent, usage]);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        สวัสดี {user ? displayName(user) : ''} — ภาพรวมของระบบขอใช้ทรัพยากร
      </p>

      <Alert kind="bad">{error}</Alert>

      <div className="cf-grid cols-3" style={{ marginBottom: 18 }}>
        <Stat
          label={can('request:create:own') ? 'คำขอที่รอพิจารณา' : 'Pending Approvals'}
          value={stats.pending}
          icon={<Icon.clip />}
          tone="brand"
          chip={stats.pending > 0 ? { text: 'Action Required', tone: 'alert' } : undefined}
        />
        <Stat label="Provisioned" value={stats.allocated} icon={<Icon.check />} tone="ok" />
        <Stat
          label="Nodes Available"
          value={stats.nodesFree}
          note={`of ${stats.nodesTotal} nodes`}
          icon={<Icon.server />}
          tone="neutral"
        />
      </div>

      <div className="split-wide">
        <Card
          title="คำขอล่าสุด"
          bare
          right={
            <Link href="/requests" className="btn btn-sm">
              ดูทั้งหมด
            </Link>
          }
        >
          {recent === null ? (
            <Empty>กำลังโหลด…</Empty>
          ) : recent.length === 0 ? (
            <Empty>
              ยังไม่มีคำขอ
              {can('request:create:own') && (
                <div style={{ marginTop: 12 }}>
                  <Link href="/requests/new" className="btn btn-primary btn-sm">
                    <Icon.plus /> ยื่นคำขอแรก
                  </Link>
                </div>
              )}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Specs</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/requests/${r.id}`} className="cell-link">
                          {r.courseCode}
                        </Link>
                        <div className="cell-sub">{personLabel(r.personCode, r.coreUserId)}</div>
                      </td>
                      <td>
                        <SpecChip cpu={r.reqCpu} ram={r.reqRamGb} gpu={r.isGpuRequired} plain={!r.isGpuRequired} />
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                        <div className="cell-sub">{days(r.startDate, r.endDate)} Days</div>
                      </td>
                      <td>
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="ทรัพยากรคงเหลือ">
          {usage === null ? (
            <p className="mono muted">กำลังโหลด…</p>
          ) : (
            usage.map((n) => {
              const p = n.totalCpu ? Math.round((n.usedCpu / n.totalCpu) * 100) : 0;
              return (
                <div key={n.resourceId} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {n.serverName}
                      {n.hasGpu && <span className="muted"> · GPU</span>}
                    </span>
                    <span className="mono muted" style={{ fontSize: 11 }}>
                      free {n.freeCpu}/{n.totalCpu}
                    </span>
                  </div>
                  <div className="meter">
                    <span className={p > 90 ? 'bad' : p > 70 ? 'warn' : ''} style={{ width: `${clamp(p)}%` }} />
                  </div>
                </div>
              );
            })
          )}
          <Link href="/resources" className="btn btn-sm btn-block" style={{ marginTop: 4 }}>
            <Icon.server /> ดู Infrastructure
          </Link>
        </Card>
      </div>
    </>
  );
}
