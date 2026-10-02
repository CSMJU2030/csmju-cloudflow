'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, RequestStatus, ResourceRequest } from '@/lib/types';
import { Alert, Card, Empty, Icon, SpecChip, Stat, StatusChip, days, fmtDate } from '@/components/ui';

type TabKey = 'all' | 'pending' | 'active' | 'closed';

const TABS: { key: TabKey; label: string; match: RequestStatus[] }[] = [
  { key: 'all', label: 'All Requests', match: [] },
  { key: 'pending', label: 'Pending Action', match: ['PENDING'] },
  { key: 'active', label: 'Active Provisioned', match: ['APPROVED', 'ALLOCATED'] },
  { key: 'closed', label: 'Expired/Denied', match: ['REJECTED', 'CANCELLED', 'EXPIRED'] },
];

export default function RequestsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ResourceRequest[] | null>(null);
  const [tab, setTab] = useState<TabKey>('pending');
  const [course, setCourse] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const isReviewer = user?.role === 'TEACHER' || user?.role === 'ADMIN';

  async function load() {
    try {
      const res = await api<Paged<ResourceRequest>>('/requests?limit=100');
      setRows(res.data);
      return res.data;
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดรายการคำขอไม่สำเร็จ');
      setRows([]);
      return [];
    }
  }

  useEffect(() => {
    (async () => {
      const data = await load();
      // เปิดมาที่ "Pending Action" เพราะเป็นงานที่ต้องทำ
      // แต่ถ้าไม่มีอะไรค้าง การโชว์แท็บว่างเปล่าไม่ได้บอกอะไรเลย — สลับไปแท็บรวมแทน
      const hasPending = data.some((r) => r.status === 'PENDING');
      setTab(isReviewer && hasPending ? 'pending' : 'all');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewer]);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      pending: r.filter((x) => x.status === 'PENDING').length,
      active: r.filter((x) => x.status === 'APPROVED' || x.status === 'ALLOCATED').length,
      rejected: r.filter((x) => x.status === 'REJECTED').length,
    };
  }, [rows]);

  const courses = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.subjectCode))].sort(),
    [rows],
  );

  const shown = useMemo(() => {
    let list = rows ?? [];
    const t = TABS.find((x) => x.key === tab)!;
    if (t.match.length) list = list.filter((r) => t.match.includes(r.status));
    if (course) list = list.filter((r) => r.subjectCode === course);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.student?.fullName.toLowerCase().includes(needle) ||
          r.student?.studentCode?.includes(needle) ||
          r.subjectCode.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, tab, course, q]);

  async function act(id: number, kind: 'approve' | 'reject') {
    setError('');
    let body: unknown;
    if (kind === 'reject') {
      const why = window.prompt('เหตุผลที่ปฏิเสธ (ต้องอย่างน้อย 5 ตัวอักษร):');
      if (!why) return;
      body = { rejectReason: why };
    }
    setBusyId(id);
    try {
      await api(`/requests/${id}/${kind}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1 className="page-title">{isReviewer ? 'Approval Dashboard' : 'My Requests'}</h1>
      <p className="page-sub">
        {isReviewer
          ? 'Manage infrastructure requests for your active courses.'
          : 'ติดตามสถานะคำขอใช้ทรัพยากรของคุณ'}
      </p>

      <Alert kind="bad">{error}</Alert>

      {isReviewer && (
        <div className="grid cols-3" style={{ marginBottom: 18 }}>
          <Stat
            label="Pending Approvals"
            value={counts.pending}
            icon={<Icon.clip />}
            tone="brand"
            chip={counts.pending > 0 ? { text: 'Action Required', tone: 'alert' } : undefined}
          />
          <Stat label="Active Approved" value={counts.active} icon={<Icon.check />} tone="ok" />
          <Stat label="Rejected This Term" value={counts.rejected} icon={<Icon.ban />} tone="bad" />
        </div>
      )}

      <div className="toolbar">
        <select className="select" style={{ maxWidth: 200 }} value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="search grow">
          <Icon.search />
          <input
            className="input"
            placeholder={isReviewer ? 'Search student or ID...' : 'ค้นหารหัสวิชา...'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {!isReviewer && user?.role === 'STUDENT' && (
          <Link href="/requests/new" className="btn btn-primary">
            <Icon.plus /> New Request
          </Link>
        )}
      </div>

      <Card bare>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className="tab" data-active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === 'pending' && counts.pending > 0 ? ` (${counts.pending})` : ''}
            </button>
          ))}
        </div>

        {rows === null ? (
          <Empty>กำลังโหลด…</Empty>
        ) : shown.length === 0 ? (
          <Empty>ไม่มีคำขอในหมวดนี้</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{isReviewer ? 'Student / ID' : 'Request'}</th>
                    <th>Course &amp; Project</th>
                    <th>Requested Specs</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="cell-strong">{r.student?.fullName ?? `คำขอ #${r.id}`}</div>
                        <div className="cell-sub">
                          {r.student?.studentCode ? `ID: ${r.student.studentCode}` : `#${r.id}`}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <Link href={`/requests/${r.id}`} className="cell-link">
                          {r.subjectCode}
                        </Link>
                        <div className="cell-sub" style={{ whiteSpace: 'normal' }}>
                          {r.reason.length > 60 ? `${r.reason.slice(0, 60)}…` : r.reason}
                        </div>
                      </td>
                      <td>
                        <SpecChip cpu={r.reqCpu} ram={r.reqRamGb} gpu={r.reqGpu} plain={!r.reqGpu} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="mono" style={{ fontSize: 12 }}>
                          {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                        </div>
                        <div className="cell-sub">{days(r.startDate, r.endDate)} Days</div>
                      </td>
                      <td>
                        <StatusChip status={r.status} />
                      </td>
                      <td>
                        <div className="actions">
                          {isReviewer && r.status === 'PENDING' ? (
                            <>
                              <button
                                className="btn btn-sm"
                                disabled={busyId === r.id}
                                onClick={() => act(r.id, 'reject')}
                              >
                                Reject
                              </button>
                              <button
                                className="btn btn-sm btn-ok"
                                disabled={busyId === r.id}
                                onClick={() => act(r.id, 'approve')}
                              >
                                Approve
                              </button>
                            </>
                          ) : (
                            <Link href={`/requests/${r.id}`} className="btn btn-sm">
                              View
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                Showing {shown.length} of {rows.length} requests
              </span>
              <button className="btn btn-sm" onClick={load}>
                <Icon.refresh /> Refresh
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
