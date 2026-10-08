import type { ReactNode } from 'react';
import AppFrame from '@/components/AppFrame';

/**
 * หน้าที่ต้อง login ทั้งหมดอยู่ใต้ layout นี้
 * เป็น server component เพื่ออ่าน CORE_HUB_WEB_URL จาก env (ห้าม hardcode URL ของ Core Hub)
 * แล้วส่งให้ปุ่ม "กลับ CSMJU Portal" ของ CsmjuAppShell (ui-design-system ข้อ 5.1 · standards 1.7.3)
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame coreHubUrl={process.env.CORE_HUB_WEB_URL}>{children}</AppFrame>;
}
