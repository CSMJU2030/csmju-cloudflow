'use client';

import type { ReactNode } from 'react';
import type { RequestStatus, ResourceStatus, UserRole } from '@/lib/types';

/* ── ไอคอน (inline SVG ทั้งหมด ไม่พึ่ง lib ภายนอก) ─────────── */

const I = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const Icon = {
  grid: () => <I d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
  inbox: () => <I d="M4 4h16v11h-5l-1.5 3h-3L9 15H4z" />,
  server: () => <I d="M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01" />,
  history: () => <I d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />,
  gear: () => <I d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.7 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.4A1.6 1.6 0 0 0 10.4 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.6a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.5 1z" />,
  help: () => <I d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />,
  logout: () => <I d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  plus: () => <I d="M12 5v14M5 12h14" />,
  bell: () => <I d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  user: () => <I d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  search: () => <I d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" size={14} />,
  send: () => <I d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" size={14} />,
  check: () => <I d="M20 6 9 17l-5-5" />,
  ban: () => <I d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2" />,
  clip: () => <I d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z" />,
  copy: () => <I d="M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" size={13} />,
  info: () => <I d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" size={14} />,
  filter: () => <I d="M22 3H2l8 9.5V19l4 2v-8.5z" size={13} />,
  back: () => <I d="M19 12H5M12 19l-7-7 7-7" size={14} />,
  refresh: () => <I d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" size={14} />,
  node: () => <I d="M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01" size={14} />,
  cpu: () => <I d="M6 6h12v12H6zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" size={14} />,
  ram: () => <I d="M3 8h18v8H3zM7 16v3M12 16v3M17 16v3" size={14} />,
  disk: () => <I d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" size={14} />,
  gpu: () => <I d="M2 7h20v10H2zM6 11h3M13 11h5M6 14h12" size={14} />,
};

/* ── การ์ด ──────────────────────────────────────────────────── */

export function Card({
  title,
  right,
  children,
  bare,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {right}
        </div>
      )}
      {bare ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

/* ── การ์ดสถิติ ─────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  note,
  icon,
  tone = 'brand',
  chip,
  meter,
  segments,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'ok' | 'bad' | 'neutral';
  chip?: { text: string; tone: 'alert' | 'neutral' };
  meter?: { pct: number; tone?: 'ok' | 'warn' | 'bad' };
  segments?: { on: number; total: number };
}) {
  const bg = {
    brand: { background: 'var(--brand-soft)', color: 'var(--brand)' },
    ok: { background: 'var(--ok-soft)', color: 'var(--ok)' },
    bad: { background: 'var(--bad-soft)', color: 'var(--bad)' },
    neutral: { background: 'var(--surface-2)', color: 'var(--muted)' },
  }[tone];

  return (
    <div className="stat">
      <div className="stat-top">
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          {chip && <span className={`chip chip-${chip.tone}`}>{chip.text}</span>}
        </div>
        {icon && (
          <div className="stat-icon" style={bg}>
            {icon}
          </div>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
      {meter && (
        <div className="meter">
          <span className={meter.tone ?? ''} style={{ width: `${clamp(meter.pct)}%` }} />
        </div>
      )}
      {segments && (
        <div className="seg">
          {Array.from({ length: segments.total }).map((_, i) => (
            <i key={i} data-on={i < segments.on} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ป้ายสถานะ ──────────────────────────────────────────────── */

const REQUEST_LABEL: Record<RequestStatus, string> = {
  PENDING: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ALLOCATED: 'Provisioned',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export function StatusChip({ status }: { status: RequestStatus }) {
  return <span className={`chip chip-${status.toLowerCase()}`}>{REQUEST_LABEL[status]}</span>;
}

export function ResourceChip({ status }: { status: ResourceStatus }) {
  const tone =
    status === 'AVAILABLE' ? 'allocated' : status === 'FULL' ? 'approved' : status === 'MAINTENANCE' ? 'pending' : 'cancelled';
  return <span className={`chip chip-${tone}`}>{status}</span>;
}

export function roleLabel(role: UserRole) {
  return { STUDENT: 'Student', TEACHER: 'Faculty Advisor', ADMIN: 'University Admin' }[role];
}

/* ── chip สเปก — ตามแบบในตารางคำขอ ─────────────────────────── */

export function SpecChip({
  cpu,
  ram,
  gpu,
  plain,
}: {
  cpu: number;
  ram: number;
  gpu?: boolean;
  plain?: boolean;
}) {
  return (
    <span className={`spec${gpu ? ' gpu' : ''}${plain && !gpu ? ' plain' : ''}`}>
      {cpu} CPU | {ram}GB RAM{gpu ? ' | 1x GPU' : ''}
    </span>
  );
}

/* ── slider ที่ใช้ในหน้ายื่นคำขอ ────────────────────────────── */

export function Slider({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-block">
      <div className="slider-head">
        <span className="lbl" style={{ margin: 0 }}>
          {label}
        </span>
        <span className="slider-val">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <div className="slider-ends">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="switch" data-on={on} onClick={onToggle} role="switch" aria-checked={on}>
      <i />
    </button>
  );
}

/* ── แถบวัดในแผงมืด ─────────────────────────────────────────── */

export function DarkMeter({
  label,
  used,
  total,
  unit = '',
}: {
  label: string;
  used: number;
  total: number;
  unit?: string;
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const tone = pct > 90 ? 'bad' : pct > 70 ? 'warn' : '';
  return (
    <div className="dmeter">
      <div className="dmeter-head">
        <span className="k">{label}</span>
        <span className="v">
          {used} / {total}
          {unit} ({pct}%)
        </span>
      </div>
      <div className="dmeter-bar">
        <span className={tone} style={{ width: `${clamp(pct)}%` }} />
      </div>
    </div>
  );
}

/* ── เบ็ดเตล็ด ──────────────────────────────────────────────── */

export function Alert({ kind, children }: { kind: 'bad' | 'ok'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

export function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

/** จำนวนวันระหว่างสองวันที่ — ใช้แสดง "45 Days" ในตาราง */
export function days(from: string, to: string) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** เหลืออีกกี่วันจนถึงวันสิ้นสุด — ติดลบแปลว่าเลยกำหนดแล้ว */
export function daysLeft(end: string) {
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}
