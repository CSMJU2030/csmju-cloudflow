'use client';

import type { StorageStatus } from '@/lib/types';

/** ป้ายสถานะคำขอพื้นที่ — ใช้สีชุดเดียวกับคำขอเครื่อง (globals.css .chip-*) */
const LABEL: Record<StorageStatus, { text: string; tone: string }> = {
  PENDING: { text: 'รออาจารย์อนุมัติ', tone: 'pending' },
  REJECTED: { text: 'ถูกปฏิเสธ', tone: 'rejected' },
  CANCELLED: { text: 'ยกเลิกแล้ว', tone: 'cancelled' },
  PROVISIONING: { text: 'กำลังสร้างพื้นที่', tone: 'approved' },
  PROVISION_FAILED: { text: 'สร้างพื้นที่ไม่สำเร็จ', tone: 'rejected' },
  ACTIVE: { text: 'ใช้งานได้', tone: 'allocated' },
  EXPIRED: { text: 'หมดอายุ (ปิดลิงก์)', tone: 'expired' },
  RELEASED: { text: 'คืนพื้นที่แล้ว', tone: 'cancelled' },
};

export function StorageChip({ status }: { status: StorageStatus }) {
  const l = LABEL[status];
  return <span className={`chip chip-${l.tone}`}>{l.text}</span>;
}

/** MiB → "15 GB" · ทศนิยมไม่เกิน 2 ตำแหน่ง */
export function gb(mib: number) {
  const v = Math.round((mib / 1024) * 100) / 100;
  return `${v.toLocaleString('en-US')} GB`;
}

/** ใช้ไปกี่ % ของโควตา */
export function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

/** วันที่แบบไทยสั้น เช่น 28 ก.พ. 2570 */
export function thDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** สถานะที่ "ยังถือพื้นที่อยู่" — ตรงกับ backend RESERVING_STATUSES */
export const HOLDING: StorageStatus[] = ['PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED'];
