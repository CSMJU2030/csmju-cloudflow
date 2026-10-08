'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, RequestStatus, ResourceRequest } from '@/lib/types';
import { Alert, Card, Empty, Icon, SpecChip, Stat, StatusChip, days, fmtDate, personLabel } from '@/components/ui';

type TabKey = 'all' | 'pending' | 'active' | 'closed';

const TABS: { key: TabKey; label: string; match: RequestStatus[] }[] = [
  { key: 'all', label: 'All Requests', match: [] },
  { key: 'pending', label: 'Pending Action', match: ['PENDING'] },
  { key: 'active', label: 'Active Provisioned', match: ['APPROVED', 'ALLOCATED'] },
  { key: 'closed', label: 'Expired/Denied', match: ['REJECTED', 'CANCELLED', 'EXPIRED'] },
];

export default function RequestsPage() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState<ResourceRequest[] | null>(null);
  const [tab, setTab] = useState<TabKey>('pending');
  const [course, setCourse] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isReviewer = can('request:review:own', 'request:review:any');
  // อาจารย์ (review:own) เห็นเฉพาะใบที่ระบุรหัสบุคลากรของตัวเอง หรือไม่ระบุใคร — บอกรหัสให้เห็นชัด ๆ
  const isOwnReviewer = can('request:review:own') && !can('request:review:any');
  const [myCode, setMyCode] = useState<{ personCode: string | null; linked: boolean } | null>(null);

  useEffect(() => {
    if (!isOwnReviewer) return;
    api<{ personCode: string | null; linked: boolean }>('/me/person')
      .then(setMyCode)
      .catch(() => setMyCode({ personCode: null, linked: false }));
  }, [isOwnReviewer]);

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
    () => [...new Set((rows ?? []).map((r) => r.courseCode))].sort(),
    [rows],
  );

  const shown = useMemo(() => {
    let list = rows ?? [];
    const t = TABS.find((x) => x.key === tab)!;
    if (t.match.length) list = list.filter((r) => t.match.includes(r.status));
    if (course) list = list.filter((r) => r.courseCode === course);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.personCode?.toLowerCase().includes(needle) ||
          r.teacherPersonCode?.toLowerCase().includes(needle) ||
          r.courseCode.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, tab, course, q]);

  async function act(id: string, kind: 'approve' | 'reject') {
    setError('');
    let body: unknown;
    if (kind === 'reject') {
      const why = window.prompt('เหตุผลที่ปฏิเสธ (ต้องอย่างน้อย 5 ตัวอักษร):');
      if (!why) return;
      body = { rejectReason: why };
    }
    setBusyId(id);
    try {
      await api(`/requests/${id}/${kind}`, { method: 'POST', body });
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

      {isOwnReviewer && myCode && (
        <div className={`alert alert-${myCode.personCode ? 'ok' : 'bad'}`}>
          {myCode.personCode ? (
            <>
              รหัสบุคลากรของคุณใน Core Hub คือ <b className="mono">{myCode.personCode}</b> — คุณจะเห็นคำขอที่นักศึกษาระบุรหัสนี้
              ในช่อง Faculty Advisor และคำขอที่ไม่ได้ระบุอาจารย์
            </>
          ) : (
            <>
              บัญชีของคุณยังไม่ผูกกับข้อมูลบุคลากรใน Core Hub — จะเห็นเฉพาะคำขอที่นักศึกษา <b>ไม่ได้ระบุ</b> อาจารย์
              (ติดต่อผู้ดูแล Core Hub ให้ผูกบัญชีกับรหัสบุคลากร)
            </>
          )}
        </div>
      )}

      {isReviewer && (
        <div className="cf-grid cols-3" style={{ marginBottom: 18 }}>
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
            placeholder={isReviewer ? 'ค้นหารหัสนักศึกษา หรือรหัสวิชา...' : 'ค้นหารหัสวิชา...'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {!isReviewer && can('request:create:own') && (
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
                        <div className="cell-strong">{personLabel(r.personCode, r.coreUserId)}</div>
                        <div className="cell-sub">
                          {r.teacherPersonCode ? `ผู้รับรอง: ${r.teacherPersonCode}` : 'ผู้รับรอง: อาจารย์คนใดก็ได้'}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <Link href={`/requests/${r.id}`} className="cell-link">
                          {r.courseCode}
                        </Link>
                        <div className="cell-sub" style={{ whiteSpace: 'normal' }}>
                          {r.reason.length > 60 ? `${r.reason.slice(0, 60)}…` : r.reason}
                        </div>
                      </td>
                      <td>
                        <SpecChip cpu={r.reqCpu} ram={r.reqRamGb} gpu={r.isGpuRequired} plain={!r.isGpuRequired} />
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
