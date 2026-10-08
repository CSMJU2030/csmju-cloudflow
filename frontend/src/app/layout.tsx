import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import './globals.css';
import './cloudflow.css';

// ฟอนต์มาตรฐานผ่าน next/font เท่านั้น — self-host ตอน build ไม่โหลดจาก CDN (ui-design-system ข้อ 4.1)
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
});

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    template: '%s · CS Cloudflow · CSMJU',
    default: 'CS Cloudflow · CSMJU',
  },
  description: 'ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์และยืมพื้นที่ cloud สำหรับนักศึกษา',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${jakarta.variable} ${notoSansThai.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-on-surface">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
