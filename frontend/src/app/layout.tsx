import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'CS-CloudFlow',
  description: 'ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์สำหรับนักศึกษา',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        {/* โหลดฟอนต์ผ่าน link ไม่ใช่ next/font — ถ้าเน็ตเข้า Google Fonts ไม่ได้
            หน้าจะยังใช้งานได้ด้วยฟอนต์ระบบ แทนที่จะ build ไม่ผ่าน */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
