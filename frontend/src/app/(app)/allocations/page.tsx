'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Allocation, Paged, ResourceRequest, ResourceUsage } from '@/lib/types';
import { Alert, Card, Empty, Icon, fmtDateTime, personLabel } from '@/components/ui';

export default function AllocationsPage() {
  const { can } = useAuth();
  const isAdmin = can('allocation:create');

  const [rows, setRows] = useState<Allocation[] | null>(null);
  const [approved, setApproved] = useState<ResourceRequest[]>([]);
  const [nodes, setNodes] = useState<ResourceUsage[]>([]);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);

  // ฟอร์มจัดสรร
  const [requestId, setRequestId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [ip, setIp] = useState('10.10.20.');
  const [port, setPort] = useState('22001');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<Paged<Allocation>>(`/allocations?limit=100${onlyActive ? '&active=true' : ''}`);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดการจัดสรรไม่สำเร็จ');
      setRows([]);
    }

    if (isAdmin) {
      // โหลดแยกกัน — ถ้าอันหนึ่งพัง อีกอันยังขึ้น และบอกผู้ใช้ว่าพังเพราะอะไร (เดิมกลืน error เงียบ ๆ)
      const [reqs, usage] = await Promise.allSettled([
        api<Paged<ResourceRequest>>('/requests?status=APPROVED&limit=100'),
        api<Paged<ResourceUsage>>('/resource-usages?limit=100'),
      ]);
      const errs: string[] = [];
      if (reqs.status === 'fulfilled') setApproved(reqs.value.data);
      else errs.push(`โหลดคำขอที่อนุมัติแล้วไม่สำเร็จ: ${reqs.reason instanceof ApiError ? reqs.reason.readable : 'unknown'}`);
      if (usage.status === 'fulfilled') setNodes(usage.value.data);
      else errs.push(`โหลดรายการเครื่องไม่สำเร็จ: ${usage.reason instanceof ApiError ? usage.reason.readable : 'unknown'}`);
      setFormError(errs.join(' · '));
    }
  }, [isAdmin, onlyActive]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedReq = useMemo(
    () => approved.find((r) => String(r.id) === requestId),
    [approved, requestId],
  );

  async function allocate() {
    setError('');
    setOk('');
    if (!requestId || !resourceId) return setError('เลือกคำขอและเครื่องก่อน');
    setBusy(true);
    try {
      await api('/allocations', {
        method: 'POST',
        body: {
          requestId,
          resourceId,
          ipAddress: ip.trim(),
          port: Number(port),
          accessNote: note.trim() || undefined,
        },
      });
      setOk(`จัดสรรคำขอ ${requestId.slice(0, 8)} เรียบร้อย`);
      setRequestId('');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'จัดสรรไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function release(id: string) {
    if (!window.confirm(`คืนเครื่องของการจัดสรร ${id.slice(0, 8)}?`)) return;
    setError('');
    setOk('');
    setBusy(true);
    try {
      await api(`/allocations/${id}/release`, { method: 'POST', body: {} });
      setOk(`คืนเครื่องรายการ ${id.slice(0, 8)} แล้ว`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'คืนเครื่องไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Allocations</h1>
      <p className="page-sub">
        {isAdmin ? 'จัดเครื่องให้คำขอที่อนุมัติแล้ว และคืนเครื่องเมื่อใช้งานเสร็จ' : 'เครื่องที่ถูกจัดสรรให้คุณ'}
      </p>

      <Alert kind="bad">{error}</Alert>
      <Alert kind="ok">{ok}</Alert>

      <div className="split-wide">
        <Card
          title="รายการจัดสรร"
          bare
          right={
            <button className="btn btn-sm" onClick={() => setOnlyActive((v) => !v)}>
              <Icon.filter /> {onlyActive ? 'เฉพาะที่ใช้อยู่' : 'ทั้งหมด'}
            </button>
          }
        >
          {rows === null ? (
            <Empty>กำลังโหลด…</Empty>
          ) : rows.length === 0 ? (
            <Empty>ยังไม่มีการจัดสรร</Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Endpoint</th>
                    <th>Request</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="mono cell-strong">
                        {a.resource?.serverName ?? a.resourceId.slice(0, 8)}
                        {a.resource?.hasGpu && <span className="muted"> · GPU</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {a.ipAddress}:{a.port}
                      </td>
                      <td>
                        <Link href={`/requests/${a.requestId}`} className="cell-link">
                          {a.request?.courseCode ?? a.requestId.slice(0, 8)}
                        </Link>
                        <div className="cell-sub">{a.request ? personLabel(a.request.personCode, a.request.coreUserId) : ''}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {fmtDateTime(a.assignedAt)}
                      </td>
                      <td>
                        {a.releasedAt ? (
                          <span className="chip chip-expired">released</span>
                        ) : (
                          <span className="chip chip-allocated">active</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="actions">
                            {!a.releasedAt && (
                              <button className="btn btn-sm" disabled={busy} onClick={() => release(a.id)}>
                                Release
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {isAdmin && (
          <Card title="จัดสรรเครื่องใหม่">
            <Alert kind="bad">{formError}</Alert>
            <div className="field">
              <label className="lbl">Approved Request</label>
              <select className="select" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
                <option value="">เลือกคำขอที่อนุมัติแล้ว</option>
                {approved.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.personCode ?? r.id.slice(0, 8)} · {r.courseCode} · {r.reqCpu}C/{r.reqRamGb}GB{r.isGpuRequired ? ' · GPU' : ''}
                  </option>
                ))}
              </select>
              {approved.length === 0 && (
                <div className="cell-sub">ยังไม่มีคำขอสถานะ APPROVED รออยู่</div>
              )}
            </div>

            <div className="field">
              <label className="lbl">Target Node</label>
              <select className="select" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="">{nodes.length === 0 ? 'ยังไม่มีเครื่องในระบบ' : 'เลือกเครื่อง'}</option>
                {nodes.map((n) => {
                  // backend ห้ามแค่ MAINTENANCE/OFFLINE (FULL ยังจัดสรรได้ถ้าที่เหลือพอ) — หน้าเว็บต้องตรงกัน
                  const blocked = n.status === 'MAINTENANCE' || n.status === 'OFFLINE';
                  const tooSmall =
                    selectedReq &&
                    (n.freeCpu < selectedReq.reqCpu ||
                      n.freeRamGb < selectedReq.reqRamGb ||
                      n.freeStorageGb < selectedReq.reqStorageGb ||
                      (selectedReq.isGpuRequired && !n.hasGpu));
                  return (
                    <option key={n.resourceId} value={n.resourceId} disabled={blocked}>
                      {n.serverName} · free {n.freeCpu}C/{n.freeRamGb}GB/{n.freeStorageGb}GB
                      {n.hasGpu ? ' · GPU' : ''}
                      {n.status !== 'AVAILABLE' ? ` · ${n.status}` : ''}
                      {!blocked && tooSmall ? ' — ไม่พอ' : ''}
                    </option>
                  );
                })}
              </select>
              {nodes.length === 0 ? (
                <div className="cell-sub">
                  ยังไม่มีเครื่องเซิร์ฟเวอร์ในฐานข้อมูล — เพิ่มที่หน้า{' '}
                  <Link href="/resources" className="cell-link">
                    เครื่องเซิร์ฟเวอร์ (Infrastructure)
                  </Link>{' '}
                  ก่อน หรือรัน <span className="mono">pnpm db:seed</span>
                </div>
              ) : (
                nodes.every((n) => n.status === 'MAINTENANCE' || n.status === 'OFFLINE') && (
                  <div className="cell-sub">ทุกเครื่องอยู่ในสถานะ MAINTENANCE/OFFLINE — เปลี่ยนสถานะที่หน้า Infrastructure ก่อน</div>
                )
              )}
            </div>

            <div className="row-2">
              <div className="field">
                <label className="lbl">IP Address</label>
                <input className="input mono" value={ip} onChange={(e) => setIp(e.target.value)} />
              </div>
              <div className="field">
                <label className="lbl">SSH Port</label>
                <input className="input mono" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label className="lbl">Access Note</label>
              <input className="input" placeholder="ไม่บังคับ" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <button className="btn btn-primary btn-block" disabled={busy} onClick={allocate}>
              <Icon.send /> {busy ? 'กำลังจัดสรร…' : 'Provision Resource'}
            </button>
          </Card>
        )}
      </div>
    </>
  );
}
