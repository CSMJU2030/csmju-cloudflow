import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'CS-CloudFlow',
  description: 'ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์สำหรับนักศึกษา',
};

// ไม่โหลดฟอนต์จาก CDN ภายนอกด้วย <link> (ui-design-system ข้อ 16.2 ข้อ 13) — ใช้ฟอนต์ตาม globals.css
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
