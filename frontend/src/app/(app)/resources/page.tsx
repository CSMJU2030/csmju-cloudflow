'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AuditLog, Paged, ResourceUsage } from '@/lib/types';
import {
  Alert,
  Card,
  Empty,
  Icon,
  ResourceChip,
  Stat,
  clamp,
  fmtTime,
} from '@/components/ui';

export default function InfrastructurePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [nodes, setNodes] = useState<ResourceUsage[] | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [onlyBusy, setOnlyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setNodes(await api<ResourceUsage[]>('/resources/usage'));
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูลเครื่องไม่สำเร็จ');
      setNodes([]);
    }

    // log stream เปิดให้เฉพาะ ADMIN — role อื่นเรียกแล้วจะได้ 403 จึงไม่ต้องยิง
    if (user?.role === 'ADMIN') {
      try {
        const res = await api<Paged<AuditLog>>('/audit-logs?limit=12');
        setLogs(res.data);
      } catch {
        /* ไม่ใช่ส่วนหลักของหน้า */
      }
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const n = nodes ?? [];
    const sum = (f: (r: ResourceUsage) => number) => n.reduce((s, r) => s + f(r), 0);
    const gpuNodes = n.filter((r) => r.has_gpu);
    return {
      cpuUsed: sum((r) => r.used_cpu),
      cpuTotal: sum((r) => r.total_cpu),
      ramUsed: sum((r) => r.used_ram_gb),
      ramTotal: sum((r) => r.total_ram_gb),
      stUsed: sum((r) => r.used_storage_gb),
      stTotal: sum((r) => r.total_storage_gb),
      gpuBusy: gpuNodes.filter((r) => r.active_allocations > 0).length,
      gpuTotal: gpuNodes.length,
    };
  }, [nodes]);

  const shown = useMemo(
    () => (onlyBusy ? (nodes ?? []).filter((n) => n.active_allocations > 0) : nodes ?? []),
    [nodes, onlyBusy],
  );

  const pct = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);

  return (
    <>
      <h1 className="page-title">Infrastructure Overview</h1>
      <p className="page-sub">Real-time capacity and node status.</p>

      <Alert kind="bad">{error}</Alert>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <Stat
          label="Total CPU Core Usage"
          value={`${pct(totals.cpuUsed, totals.cpuTotal)}%`}
          note={`${totals.cpuUsed} / ${totals.cpuTotal} Cores`}
          icon={<Icon.cpu />}
          tone="brand"
          meter={{ pct: pct(totals.cpuUsed, totals.cpuTotal) }}
        />
        <Stat
          label="RAM Allocation"
          value={`${pct(totals.ramUsed, totals.ramTotal)}%`}
          note={`${totals.ramUsed} / ${totals.ramTotal} GB`}
          icon={<Icon.ram />}
          tone="ok"
          meter={{ pct: pct(totals.ramUsed, totals.ramTotal), tone: 'ok' }}
        />
        <Stat
          label="Storage (NVMe)"
          value={`${pct(totals.stUsed, totals.stTotal)}%`}
          note={`${totals.stUsed} / ${totals.stTotal} GB`}
          icon={<Icon.disk />}
          tone="brand"
          meter={{ pct: pct(totals.stUsed, totals.stTotal) }}
        />
        <Stat
          label="GPU Nodes In Use"
          value={totals.gpuBusy}
          note={`of ${totals.gpuTotal} Available`}
          icon={<Icon.gpu />}
          tone="neutral"
          segments={{ on: totals.gpuBusy, total: Math.max(totals.gpuTotal, 1) }}
        />
      </div>

      {/*
        System Log Stream อ่านได้เฉพาะ ADMIN (endpoint /audit-logs ตอบ 403 กับ role อื่น)
        role อื่นจึงไม่แสดงแผงนี้เลย แทนที่จะโชว์กล่องว่างที่เขียนว่า "คุณดูไม่ได้"
        ซึ่งกินพื้นที่หนึ่งในสามของหน้าโดยไม่ให้ข้อมูลอะไร — ตารางขยายเต็มความกว้างแทน
      */}
      <div className={isAdmin ? 'split-wide' : ''}>
        <Card
          title="Active Nodes"
          bare
          right={
            <button className="btn btn-sm" onClick={() => setOnlyBusy((v) => !v)}>
              <Icon.filter /> {onlyBusy ? 'แสดงทั้งหมด' : 'เฉพาะที่มีงาน'}
            </button>
          }
        >
          {nodes === null ? (
            <Empty>กำลังโหลด…</Empty>
          ) : shown.length === 0 ? (
            <Empty>ไม่มีเครื่องในเงื่อนไขนี้</Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Node ID</th>
                    <th>Status</th>
                    <th>Capacity</th>
                    <th style={{ minWidth: 150 }}>Utilisation</th>
                    <th style={{ textAlign: 'right' }}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((n) => {
                    const u = pct(n.used_cpu, n.total_cpu);
                    return (
                      <tr key={n.resource_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--muted)', display: 'flex' }}>
                              <Icon.node />
                            </span>
                            <span className="cell-strong mono">{n.server_name}</span>
                          </div>
                        </td>
                        <td>
                          <ResourceChip status={n.status} />
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {n.total_cpu}C / {n.total_ram_gb}GB
                          {n.has_gpu && <span className="muted"> (GPU)</span>}
                        </td>
                        <td>
                          <div className="meter" style={{ marginTop: 0 }}>
                            <span
                              className={u > 90 ? 'bad' : u > 70 ? 'warn' : ''}
                              style={{ width: `${clamp(u)}%` }}
                            />
                          </div>
                          <div className="cell-sub">
                            {n.used_cpu}/{n.total_cpu} cores · free {n.free_cpu}
                          </div>
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {n.active_allocations}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── System log stream — ดึงจาก audit_logs จริง (ADMIN เท่านั้น) ─── */}
        {isAdmin && (
          <div className="logs">
            <div className="logs-head">
              <span>System Log Stream</span>
              <span className="dot pulse" />
            </div>

            {logs.length === 0 ? (
              <p className="log-line">ยังไม่มีบันทึก</p>
            ) : (
              logs.map((l) => {
                const lvl = levelOf(l.action);
                return (
                  <div key={l.id} className="log-line">
                    <span className="t">[{fmtTime(l.createdAt)}]</span>{' '}
                    <span className={`lvl ${lvl}`}>{lvl}</span> {l.details ?? l.action}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** จัดระดับของ log จากชื่อ action — ให้อ่านเหมือน syslog */
function levelOf(action: string): 'INFO' | 'WARN' | 'AUTH' | 'SYSTEM' | 'DENY' {
  if (action.startsWith('AUTH')) return 'AUTH';
  if (action.includes('REJECT') || action.includes('DELETE')) return 'DENY';
  if (action.includes('CANCEL')) return 'WARN';
  if (action.startsWith('ALLOCATION') || action.startsWith('RESOURCE')) return 'SYSTEM';
  return 'INFO';
}
