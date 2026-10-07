'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, StorageJobResult, StoragePool, StorageRequest, StorageStatus } from '@/lib/types';
import { Alert, Card, Empty, Icon, Stat, clamp, personLabel } from '@/components/ui';
import { HOLDING, StorageChip, gb, pct, thDate } from '@/components/storage';

type TabKey = 'pending' | 'holding' | 'closed' | 'all';

const TABS: { key: TabKey; label: string; match: StorageStatus[] }[] = [
  { key: 'pending', label: 'รออนุมัติ', match: ['PENDING'] },
  { key: 'holding', label: 'ถือพื้นที่อยู่', match: HOLDING },
  { key: 'closed', label: 'ปิดแล้ว', match: ['REJECTED', 'CANCELLED', 'RELEASED'] },
  { key: 'all', label: 'ทั้งหมด', match: [] },
];

const JOBS: { key: string; label: string }[] = [
  { key: 'expire', label: 'ปิดลิงก์ที่หมดอายุ' },
  { key: 'release', label: 'ลบพื้นที่ที่พ้นกำหนดเก็บ' },
  { key: 'sync-usage', label: 'อัปเดตขนาดที่ใช้' },
  { key: 'retry-provision', label: 'ลองสร้างพื้นที่ที่ล้มใหม่' },
];

/**
 * หน้ารวมของระบบยืมพื้นที่ cloud
 * - ทุกคน: การ์ดพื้นที่รวมของ pool
 * - นักศึกษา: พื้นที่ของฉัน + ปุ่มขอยืม
 * - อาจารย์ / admin: รายการพร้อมปุ่มอนุมัติ/ปฏิเสธ
 * - staff / admin: ปุ่มสั่งสร้างใหม่เมื่อ cloud ล้ม · admin รันงานตั้งเวลาเองได้
 * การซ่อนปุ่มเป็นแค่ความสะดวก — ด่านจริงอยู่ที่ backend
 */
export default function StoragePage() {
  const { can } = useAuth();
  const [pool, setPool] = useState<StoragePool | null>(null);
  const [rows, setRows] = useState<StorageRequest[] | null>(null);
  const [tab, setTab] = useState<TabKey>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isStudent = can('storage:create:own');
  const isReviewer = can('storage:review:own', 'storage:review:any');
  const canRetry = can('storage:retry:any');
  const canRunJobs = can('storage-job:run');

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api<StoragePool>('/storage-pools/current'),
        api<Paged<StorageRequest>>('/storage-requests?limit=100'),
      ]);
      setPool(p);
      setRows(r.data);
      setDisabled(false);
      return r.data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setDisabled(true);
      else setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูลพื้นที่ไม่สำเร็จ');
      setRows([]);
      return [];
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await load();
      if (isReviewer && data.some((r) => r.status === 'PENDING')) setTab('pending');
    })();
  }, [load, isReviewer]);

  const mine = useMemo(
    () => (isStudent ? (rows ?? []).find((r) => r.status === 'PENDING' || HOLDING.includes(r.status)) : undefined),
    [rows, isStudent],
  );

  const shown = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return t.match.length ? (rows ?? []).filter((r) => t.match.includes(r.status)) : (rows ?? []);
  }, [rows, tab]);

  async function act(id: string, kind: 'approve' | 'reject' | 'retry-provision' | 'cancel') {
    setError('');
    setNotice('');
    let body: unknown;
    if (kind === 'reject') {
      const why = window.prompt('เหตุผลที่ปฏิเสธ (อย่างน้อย 5 ตัวอักษร):');
      if (!why) return;
      body = { rejectReason: why };
    }
    if (kind === 'cancel' && !window.confirm('ยกเลิกคำขอนี้?')) return;
    setBusy(id);
    try {
      const r = await api<StorageRequest>(`/storage-requests/${id}/${kind}`, { method: 'POST', body });
      if (r?.status === 'PROVISION_FAILED') setError('อนุมัติแล้ว แต่สร้างพื้นที่ที่ cloud ไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  async function runJob(job: string) {
    setError('');
    setNotice('');
    setBusy(job);
    try {
      const r = await api<StorageJobResult>(`/storage-jobs/${job}/run`, { method: 'POST' });
      setNotice(
        r.outcome === 'locked'
          ? `งาน ${job} กำลังทำงานอยู่ที่อื่น — ลองใหม่อีกครู่`
          : `งาน ${job}: ทำสำเร็จ ${r.processed} รายการ · ล้ม ${r.failed} รายการ`,
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'รันงานไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  if (disabled) {
    return (
      <>
        <h1 className="page-title">Cloud Storage</h1>
        <p className="page-sub">ยืมพื้นที่เก็บไฟล์สำหรับงานรายวิชา</p>
        <Alert kind="bad">ระบบยืมพื้นที่ยังไม่เปิดใช้งาน — ผู้ดูแลระบบยังไม่ได้ตั้งค่า (STORAGE_SECRET_KEY)</Alert>
      </>
    );
  }

  const usedPct = pool ? pct(pool.totalMib - pool.freeMib, pool.totalMib) : 0;

  return (
    <>
      <h1 className="page-title">Cloud Storage</h1>
      <p className="page-sub">
        ยืมพื้นที่เก็บไฟล์สำหรับงานรายวิชา ไม่เกินคนละ {pool ? gb(pool.maxPerUserMib) : '…'} · อาจารย์อนุมัติแล้วได้ลิงก์ใช้งานทันที
      </p>

      <Alert kind="bad">{error}</Alert>
      <Alert kind="ok">{notice}</Alert>

      {pool && (
        <div className="grid cols-3" style={{ marginBottom: 18 }}>
          <Stat
            label="พื้นที่ที่ยังให้ยืมได้"
            value={gb(pool.freeMib)}
            note={`จากทั้งหมด ${gb(pool.totalMib)} · จองแล้ว ${usedPct}%`}
            icon={<Icon.disk />}
            tone={pool.freeMib < pool.maxPerUserMib ? 'bad' : 'brand'}
            meter={{ pct: clamp(usedPct), tone: usedPct > 90 ? 'bad' : usedPct > 70 ? 'warn' : 'ok' }}
          />
          <Stat
            label={`ยืมเต็ม ${gb(pool.maxPerUserMib)} ได้อีก`}
            value={`${pool.fullSlotsLeft} คน`}
            note={`ใช้งานอยู่ ${pool.activeCount} คน · ใช้จริงรวม ${gb(pool.usedMib)}`}
            icon={<Icon.user />}
            tone="ok"
          />
          <Stat
            label="คำขอรออนุมัติ"
            value={pool.pendingCount}
            icon={<Icon.clip />}
            tone="neutral"
            chip={isReviewer && pool.pendingCount > 0 ? { text: 'Action Required', tone: 'alert' } : undefined}
          />
        </div>
      )}

      {isStudent && (
        <Card title="พื้นที่ของฉัน" right={!mine && <Link href="/storage/new" className="btn btn-primary btn-sm"><Icon.plus /> ขอยืมพื้นที่</Link>}>
          {!rows ? (
            <Empty>กำลังโหลด…</Empty>
          ) : !mine ? (
            <Empty>ยังไม่มีพื้นที่ — กด “ขอยืมพื้นที่” เพื่อยื่นคำขอให้อาจารย์อนุมัติ</Empty>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <StorageChip status={mine.status} />
              <span className="mono">{gb(mine.quotaMib)}</span>
              <span className="muted">วิชา {mine.courseCode} · ถึง {thDate(mine.endDate)}</span>
              <Link href={`/storage/${mine.id}`} className="btn btn-dark btn-sm" style={{ marginLeft: 'auto' }}>
                {mine.status === 'ACTIVE' ? 'เปิดลิงก์ใช้งาน' : 'ดูรายละเอียด'}
              </Link>
            </div>
          )}
        </Card>
      )}

      {(!isStudent || (rows?.length ?? 0) > 0) && (
        <div style={{ marginTop: 18 }}>
          <Card bare>
            <div className="tabs">
              {TABS.map((t) => (
                <button key={t.key} className="tab" data-active={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}
                  {t.key === 'pending' && (rows ?? []).some((r) => r.status === 'PENDING')
                    ? ` (${(rows ?? []).filter((r) => r.status === 'PENDING').length})`
                    : ''}
                </button>
              ))}
            </div>

            {rows === null ? (
              <Empty>กำลังโหลด…</Empty>
            ) : shown.length === 0 ? (
              <Empty>ไม่มีคำขอในหมวดนี้</Empty>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ผู้ขอ</th>
                      <th>วิชา / เหตุผล</th>
                      <th>ขนาด</th>
                      <th>ช่วงใช้งาน</th>
                      <th>สถานะ</th>
                      <th style={{ textAlign: 'right' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="cell-strong">{personLabel(r.personCode, r.coreUserId)}</div>
                          <div className="cell-sub">
                            {r.teacherPersonCode ? `อาจารย์: ${r.teacherPersonCode}` : 'อาจารย์คนใดก็ได้'}
                          </div>
                        </td>
                        <td style={{ maxWidth: 240 }}>
                          <Link href={`/storage/${r.id}`} className="cell-link">
                            {r.courseCode}
                          </Link>
                          <div className="cell-sub" style={{ whiteSpace: 'normal' }}>
                            {r.reason.length > 60 ? `${r.reason.slice(0, 60)}…` : r.reason}
                          </div>
                        </td>
                        <td className="mono">
                          {gb(r.quotaMib)}
                          {r.status === 'ACTIVE' && <div className="cell-sub">ใช้ไป {gb(r.usedMib)}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {thDate(r.startDate)} – {thDate(r.endDate)}
                        </td>
                        <td>
                          <StorageChip status={r.status} />
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {isReviewer && r.status === 'PENDING' && (
                            <>
                              <button className="btn btn-ok btn-sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>
                                <Icon.check /> อนุมัติ
                              </button>{' '}
                              <button className="btn-danger-text" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>
                                ปฏิเสธ
                              </button>
                            </>
                          )}
                          {canRetry && r.status === 'PROVISION_FAILED' && (
                            <button className="btn btn-dark btn-sm" disabled={busy === r.id} onClick={() => act(r.id, 'retry-provision')}>
                              <Icon.refresh /> สร้างใหม่
                            </button>
                          )}
                          {isStudent && r.status === 'PENDING' && (
                            <button className="btn-danger-text" disabled={busy === r.id} onClick={() => act(r.id, 'cancel')}>
                              ยกเลิก
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {canRunJobs && (
        <div style={{ marginTop: 18 }}>
          <Card title="งานตั้งเวลา (ผู้ดูแลระบบ)">
            <p className="muted" style={{ marginTop: 0 }}>
              ปกติรันเองตามเวลา (00:10 · 02:10 · ทุก 30 นาที · ทุก 15 นาที) — ปุ่มนี้ใช้ทดสอบหรือสั่งทันที
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {JOBS.map((j) => (
                <button key={j.key} className="btn btn-sm" disabled={busy === j.key} onClick={() => runJob(j.key)}>
                  {busy === j.key ? 'กำลังรัน…' : j.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
