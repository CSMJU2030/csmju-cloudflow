'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Allocation, ResourceRequest } from '@/lib/types';
import {
  Alert,
  Card,
  Icon,
  SpecChip,
  StatusChip,
  days,
  daysLeft,
  fmtDateTime,
} from '@/components/ui';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [req, setReq] = useState<ResourceRequest | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setReq(await api<ResourceRequest>(`/requests/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดคำขอไม่สำเร็จ');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, body?: unknown) {
    setError('');
    setBusy(true);
    try {
      await api(path, { method: 'PATCH', body });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (error && !req) {
    return (
      <>
        <BackLink />
        <Alert kind="bad">{error}</Alert>
      </>
    );
  }
  if (!req) return <p className="mono muted">กำลังโหลด…</p>;

  const active: Allocation | undefined = req.allocations?.find((a) => !a.releasedAt);
  const isOwner = user?.id === req.studentId;
  const isAssignedTeacher = user?.role === 'TEACHER' && user.id === req.teacherId;
  const isAdmin = user?.role === 'ADMIN';
  const canReview = (isAssignedTeacher || isAdmin) && req.status === 'PENDING';
  const canCancel = (isOwner || isAdmin) && ['PENDING', 'APPROVED'].includes(req.status);
  const left = daysLeft(req.endDate);

  return (
    <>
      <BackLink />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title">{req.subjectCode}</h1>
        <StatusChip status={req.status} />
      </div>
      <p className="page-sub">
        คำขอ #{req.id} · ยื่นโดย {req.student?.fullName ?? '—'} · ผู้รับรอง {req.teacher?.fullName ?? '—'}
      </p>

      <Alert kind="bad">{error}</Alert>

      {/* ── แถบสถานะเครื่อง (เมื่อจัดสรรแล้ว) ────────────── */}
      {active && (
        <div className="status-strip" style={{ marginBottom: 18 }}>
          <span className="dot pulse" />
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
            Server Status: {req.status === 'ALLOCATED' ? 'ACTIVE' : req.status}
          </span>
          <span className="muted mono" style={{ fontSize: 12 }}>
            {active.resource?.serverName}
            {active.resource?.hasGpu ? ' · GPU' : ''}
          </span>
          <span style={{ flex: 1 }} />
          <span className={`chip chip-${left < 0 ? 'rejected' : left <= 7 ? 'pending' : 'allocated'}`}>
            {left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : `${left} Days Remaining`}
          </span>
        </div>
      )}

      <div className="split-wide">
        <div style={{ display: 'grid', gap: 16 }}>
          {/* ── Active Credential ───────────────────────── */}
          {active && (
            <div className="panel-dark">
              <h3>Active Credential &amp; Connection</h3>
              <p className="sub">Use these details to access your assigned compute resource.</p>

              <div className="grid cols-3" style={{ marginBottom: 16 }}>
                <div className="dfield">
                  <div className="k">IP ADDRESS</div>
                  <div className="v">{active.ipAddress}</div>
                </div>
                <div className="dfield">
                  <div className="k">SSH PORT</div>
                  <div className="v">{active.port}</div>
                </div>
                <div className="dfield">
                  <div className="k">USERNAME</div>
                  <div className="v">{req.student?.studentCode ?? 'student'}</div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 7,
                }}
              >
                <span className="k lbl-up" style={{ color: 'var(--dark-muted)' }}>
                  Quick Connect Command
                </span>
                <button
                  className="link-copy"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(sshCommand(req, active))
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      })
                      .catch(() => {});
                  }}
                >
                  <Icon.copy /> {copied ? 'Copied' : 'Copy SSH Command'}
                </button>
              </div>
              <div className="term">$ {sshCommand(req, active)}</div>

              <div className="dnote" style={{ marginBottom: 0 }}>
                <Icon.info />
                <span>Ensure you are connected to the university VPN before attempting to SSH.</span>
              </div>

              {active.accessNote && (
                <p className="mono" style={{ color: 'var(--dark-muted)', fontSize: 11, marginBottom: 0 }}>
                  {active.accessNote}
                </p>
              )}
            </div>
          )}

          {/* ── รายละเอียดคำขอ ──────────────────────────── */}
          <Card title="Request Details">
            <div className="grid cols-2">
              <Field k="Requested Specs">
                <SpecChip cpu={req.reqCpu} ram={req.reqRamGb} gpu={req.reqGpu} plain={!req.reqGpu} />
                <div className="cell-sub">Storage {req.reqStorageGb} GB</div>
              </Field>
              <Field k="Duration">
                <span className="mono">
                  {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                </span>
                <div className="cell-sub">{days(req.startDate, req.endDate)} Days</div>
              </Field>
              <Field k="Submitted">
                <span className="mono">{fmtDateTime(req.createdAt)}</span>
              </Field>
              <Field k="Reviewed">
                <span className="mono">{req.reviewedAt ? fmtDateTime(req.reviewedAt) : '—'}</span>
              </Field>
            </div>

            <div style={{ marginTop: 6 }}>
              <div className="lbl-up" style={{ marginBottom: 6 }}>
                Technical Purpose
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{req.reason}</p>
            </div>

            {req.rejectReason && (
              <div className="alert alert-bad" style={{ marginTop: 16, marginBottom: 0 }}>
                <b>เหตุผลที่ปฏิเสธ:</b> {req.rejectReason}
              </div>
            )}
          </Card>

          {/* ── ประวัติการจัดสรร ────────────────────────── */}
          {req.allocations && req.allocations.length > 0 && (
            <Card title="Allocation History" bare>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th>Endpoint</th>
                      <th>Assigned</th>
                      <th>Released</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.allocations.map((a) => (
                      <tr key={a.id}>
                        <td className="mono">{a.resource?.serverName ?? `#${a.resourceId}`}</td>
                        <td className="mono">
                          {a.ipAddress}:{a.port}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {fmtDateTime(a.assignedAt)}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {a.releasedAt ? fmtDateTime(a.releasedAt) : <span className="chip chip-allocated">active</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* ── การกระทำที่ทำได้ตอนนี้ ──────────────────── */}
        <Card title="Actions">
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
            ปุ่มที่ขึ้นอยู่กับสถานะปัจจุบันและ role ของคุณ — ตรงกับ state machine ฝั่ง backend
          </p>

          {canReview && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-ok btn-block" disabled={busy} onClick={() => act(`/requests/${req.id}/approve`)}>
                <Icon.check /> Approve Request
              </button>
              <button
                className="btn btn-block"
                disabled={busy}
                onClick={() => {
                  const why = window.prompt('เหตุผลที่ปฏิเสธ (อย่างน้อย 5 ตัวอักษร):');
                  if (why) act(`/requests/${req.id}/reject`, { rejectReason: why });
                }}
              >
                Reject Request
              </button>
            </div>
          )}

          {isAdmin && req.status === 'APPROVED' && (
            <Link href="/allocations" className="btn btn-primary btn-block" style={{ marginBottom: 12 }}>
              <Icon.server /> จัดสรรเครื่อง
            </Link>
          )}

          {isAdmin && active && (
            <button
              className="btn-danger-text"
              disabled={busy}
              onClick={() => {
                if (window.confirm('คืนเครื่องรายการนี้?')) act(`/allocations/${active.id}/release`, {});
              }}
            >
              <Icon.ban /> Release Resource Early
            </button>
          )}

          {canCancel && (
            <button
              className="btn btn-block"
              disabled={busy}
              onClick={() => {
                if (window.confirm('ยกเลิกคำขอนี้?')) act(`/requests/${req.id}/cancel`);
              }}
            >
              ยกเลิกคำขอ
            </button>
          )}

          {!canReview && !canCancel && !(isAdmin && active) && (
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              สถานะ <b>{req.status}</b> ไม่มีการกระทำที่ทำได้จากบัญชีนี้
            </p>
          )}
        </Card>
      </div>
    </>
  );

  function BackLink() {
    return (
      <button className="btn btn-sm" onClick={() => router.push('/requests')} style={{ marginBottom: 14 }}>
        <Icon.back /> กลับไปรายการคำขอ
      </button>
    );
  }
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="lbl-up" style={{ marginBottom: 6 }}>
        {k}
      </div>
      {children}
    </div>
  );
}

/** คำสั่งเชื่อมต่อ — ประกอบจากข้อมูลจริงของ allocation ไม่ได้ hardcode */
function sshCommand(req: ResourceRequest, a: Allocation) {
  const userName = req.student?.studentCode ?? 'student';
  return `ssh ${userName}@${a.ipAddress} -p ${a.port}`;
}
