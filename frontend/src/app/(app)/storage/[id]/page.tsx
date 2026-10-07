'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { StorageAccess, StorageRequest } from '@/lib/types';
import { Alert, Card, Empty, Icon, clamp, daysLeft, fmtDateTime, personLabel } from '@/components/ui';
import { StorageChip, gb, pct, thDate } from '@/components/storage';

/**
 * รายละเอียดคำขอพื้นที่
 * ลิงก์ + รหัสโหลดเฉพาะตอนเจ้าของกดปุ่ม (GET /access · no-store · บันทึก audit) ไม่โหลดไว้ล่วงหน้า และไม่เก็บลง storage ของเบราว์เซอร์
 */
export default function StorageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const [req, setReq] = useState<StorageRequest | null>(null);
  const [access, setAccess] = useState<StorageAccess | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setReq(await api<StorageRequest>(`/storage-requests/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดคำขอไม่สำเร็จ');
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const isOwner = Boolean(user && req && req.coreUserId === user.id);
  const isReviewer = can('storage:review:own', 'storage:review:any') && !isOwner;

  async function reveal() {
    setError('');
    setBusy(true);
    try {
      setAccess(await api<StorageAccess>(`/storage-requests/${id}/access`));
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'เปิดลิงก์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: 'approve' | 'reject' | 'cancel' | 'retry-provision') {
    setError('');
    let body: unknown;
    if (kind === 'reject') {
      const why = window.prompt('เหตุผลที่ปฏิเสธ (อย่างน้อย 5 ตัวอักษร):');
      if (!why) return;
      body = { rejectReason: why };
    }
    if (kind === 'cancel' && !window.confirm('ยกเลิกคำขอนี้?')) return;
    setBusy(true);
    try {
      setReq(await api<StorageRequest>(`/storage-requests/${id}/${kind}`, { method: 'POST', body }));
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    });
  }

  if (!req) {
    return (
      <>
        <Link href="/storage" className="cell-link">
          <Icon.back /> กลับ
        </Link>
        <Alert kind="bad">{error}</Alert>
        {!error && <Empty>กำลังโหลด…</Empty>}
      </>
    );
  }

  const left = daysLeft(req.endDate);
  const usedPct = pct(req.usedMib, req.quotaMib);

  return (
    <>
      <Link href="/storage" className="cell-link">
        <Icon.back /> Cloud Storage
      </Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>
        พื้นที่ {gb(req.quotaMib)} · {req.courseCode}
      </h1>
      <p className="page-sub">
        <StorageChip status={req.status} /> <span className="mono faint">#{req.id.slice(0, 8)}</span>
      </p>

      <Alert kind="bad">{error}</Alert>

      <div className="split">
        <Card title="ข้อมูลคำขอ">
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 16px', margin: 0 }}>
            <dt className="muted">ผู้ขอ</dt>
            <dd style={{ margin: 0 }}>{personLabel(req.personCode, req.coreUserId)}</dd>
            <dt className="muted">อาจารย์ผู้อนุมัติ</dt>
            <dd style={{ margin: 0 }}>{req.teacherPersonCode ?? 'อาจารย์คนใดก็ได้'}</dd>
            <dt className="muted">ช่วงใช้งาน</dt>
            <dd style={{ margin: 0 }}>
              {thDate(req.startDate)} – {thDate(req.endDate)}
              {req.status === 'ACTIVE' && <span className="muted"> · {left >= 0 ? `เหลือ ${left} วัน` : 'เลยกำหนดแล้ว'}</span>}
            </dd>
            <dt className="muted">เหตุผล</dt>
            <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{req.reason}</dd>
            {req.reviewedAt && (
              <>
                <dt className="muted">พิจารณาเมื่อ</dt>
                <dd style={{ margin: 0 }}>{fmtDateTime(req.reviewedAt)}</dd>
              </>
            )}
            {req.rejectReason && (
              <>
                <dt className="muted">เหตุผลที่ปฏิเสธ</dt>
                <dd style={{ margin: 0 }}>{req.rejectReason}</dd>
              </>
            )}
            {req.lastError && req.status === 'PROVISION_FAILED' && (
              <>
                <dt className="muted">ข้อผิดพลาดล่าสุด</dt>
                <dd style={{ margin: 0 }} className="mono">
                  {req.lastError} (ลองแล้ว {req.provisionAttempts} ครั้ง)
                </dd>
              </>
            )}
          </dl>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {isReviewer && req.status === 'PENDING' && (
              <>
                <button className="btn btn-ok" disabled={busy} onClick={() => act('approve')}>
                  <Icon.check /> อนุมัติและสร้างพื้นที่
                </button>
                <button className="btn-danger-text" disabled={busy} onClick={() => act('reject')}>
                  ปฏิเสธ
                </button>
              </>
            )}
            {isOwner && req.status === 'PENDING' && (
              <button className="btn-danger-text" disabled={busy} onClick={() => act('cancel')}>
                ยกเลิกคำขอ
              </button>
            )}
            {can('storage:retry:any') && req.status === 'PROVISION_FAILED' && (
              <button className="btn btn-dark" disabled={busy} onClick={() => act('retry-provision')}>
                <Icon.refresh /> สั่งสร้างพื้นที่ใหม่
              </button>
            )}
          </div>
        </Card>

        <div className="panel-dark">
          <h3>พื้นที่ใช้งาน</h3>
          {req.status === 'ACTIVE' ? (
            <>
              <div className="dmeter">
                <div className="dmeter-head">
                  <span className="k">ใช้ไป</span>
                  <span className="v">
                    {gb(req.usedMib)} / {gb(req.quotaMib)} ({usedPct}%)
                  </span>
                </div>
                <div className="dmeter-bar">
                  <span className={usedPct > 90 ? 'bad' : usedPct > 70 ? 'warn' : ''} style={{ width: `${clamp(usedPct)}%` }} />
                </div>
              </div>

              {!isOwner ? (
                <p className="sub">ลิงก์ใช้งานแสดงให้เฉพาะเจ้าของพื้นที่</p>
              ) : !access ? (
                <button className="btn btn-primary btn-block" disabled={busy} onClick={reveal}>
                  {busy ? 'กำลังเปิด…' : 'แสดงลิงก์และรหัส'}
                </button>
              ) : (
                <>
                  <div className="dfield">
                    <div className="k">ลิงก์</div>
                    <div className="v" style={{ wordBreak: 'break-all' }}>
                      {access.shareUrl}
                    </div>
                  </div>
                  <button type="button" className="link-copy" onClick={() => copy(access.shareUrl, 'url')}>
                    <Icon.copy /> {copied === 'url' ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                  </button>
                  {access.sharePassword && (
                    <>
                      <div className="dfield" style={{ marginTop: 10 }}>
                        <div className="k">รหัสผ่านลิงก์</div>
                        <div className="v">{showPw ? access.sharePassword : '•'.repeat(12)}</div>
                      </div>
                      <button type="button" className="link-copy" onClick={() => setShowPw((v) => !v)}>
                        {showPw ? 'ซ่อนรหัส' : 'แสดงรหัส'}
                      </button>{' '}
                      <button type="button" className="link-copy" onClick={() => copy(access.sharePassword!, 'pw')}>
                        <Icon.copy /> {copied === 'pw' ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
                      </button>
                    </>
                  )}
                  <a className="btn btn-primary btn-block" style={{ marginTop: 14 }} href={access.shareUrl} target="_blank" rel="noopener noreferrer">
                    เปิดพื้นที่
                  </a>
                  <div className="dnote">
                    <Icon.info />
                    <span>ใช้ได้ถึง {thDate(access.expiresOn)} · อย่าส่งลิงก์และรหัสให้คนอื่น</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="sub">
              {{
                PENDING: 'รออาจารย์อนุมัติ — อนุมัติแล้วลิงก์จะขึ้นที่นี่',
                PROVISIONING: 'กำลังสร้างพื้นที่ที่ cloud…',
                PROVISION_FAILED: 'สร้างพื้นที่ที่ cloud ไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ (ยังจองพื้นที่ไว้ให้)',
                EXPIRED: `หมดอายุแล้ว — ปิดลิงก์เมื่อ ${req.expiredAt ? thDate(req.expiredAt) : '-'} ไฟล์จะถูกลบหลังพ้นช่วงเก็บรักษา`,
                RELEASED: 'คืนพื้นที่เข้าระบบแล้ว',
                REJECTED: 'คำขอถูกปฏิเสธ',
                CANCELLED: 'คำขอถูกยกเลิก',
              }[req.status as Exclude<StorageRequest['status'], 'ACTIVE'>]}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
