'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AuditLog, Paged } from '@/lib/types';
import { Alert, Card, Empty, Icon, fmtDateTime, initials } from '@/components/ui';

const ACTIONS = [
  'AUTH_LOGIN',
  'AUTH_REGISTER',
  'REQUEST_CREATE',
  'REQUEST_APPROVE',
  'REQUEST_REJECT',
  'REQUEST_CANCEL',
  'ALLOCATION_CREATE',
  'ALLOCATION_RELEASE',
  'USER_CREATE',
  'USER_DELETE',
  'RESOURCE_CREATE',
];

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (action) qs.set('action', action);
      const res = await api<Paged<AuditLog>>(`/audit-logs?${qs}`);
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดประวัติไม่สำเร็จ');
      setRows([]);
    }
  }, [action]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== 'ADMIN') {
    return (
      <>
        <h1 className="page-title">Audit Log</h1>
        <Alert kind="bad">หน้านี้เปิดให้เฉพาะ ADMIN — endpoint /audit-logs ตอบ 403 กับ role อื่น</Alert>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Audit Log</h1>
      <p className="page-sub">
        ทุกการกระทำที่เปลี่ยนข้อมูลถูกบันทึกไว้ที่นี่ — ตารางนี้เขียนได้อย่างเดียว แก้ย้อนหลังไม่ได้
      </p>

      <Alert kind="bad">{error}</Alert>

      <div className="toolbar">
        <select className="select" style={{ maxWidth: 240 }} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">ทุก action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button className="btn btn-sm" onClick={load}>
          <Icon.refresh /> Refresh
        </button>
      </div>

      <Card bare>
        {rows === null ? (
          <Empty>กำลังโหลด…</Empty>
        ) : rows.length === 0 ? (
          <Empty>ไม่มีบันทึกในเงื่อนไขนี้</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="mono muted">#{l.id}</td>
                      <td>
                        {l.user ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span className="avatar sm">{initials(l.user.fullName)}</span>
                            <div>
                              <div className="cell-strong">{l.user.fullName}</div>
                              <div className="cell-sub">{l.user.role}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="muted mono">(ระบบ)</span>
                        )}
                      </td>
                      <td>
                        <span className="spec plain">{l.action}</span>
                      </td>
                      <td style={{ maxWidth: 380 }}>{l.details ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDateTime(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                Showing {rows.length} of {total} entries
              </span>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
