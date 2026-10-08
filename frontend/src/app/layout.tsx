import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AuthProvider } from '@/lib/auth';
import './globals.css';
import './cloudflow.css';

// ฟอนต์มาตรฐาน (ui-design-system ข้อ 4.1) ผ่าน next/font/local — ไฟล์ woff2 อยู่ใน repo (src/app/fonts · OFL)
// ไม่ใช้ next/font/google เพราะ build ต้องดาวน์โหลดจาก Google ทุกครั้ง: เครือข่ายที่ดาวน์โหลดไม่ได้ทำให้ build ล้ม
// (Turbopack: "next/font/google queries have exactly one entry") · ผลเหมือนกัน: self-host ไม่ยิงไป CDN
const notoThai = localFont({
  src: './fonts/noto-sans-thai-thai-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-noto-thai-th',
  // ไม่ใส่ฟอนต์สำรองต่อท้าย — อักษรละตินต้องตกไปที่ไฟล์ส่วนละตินด้านล่าง ไม่ใช่ฟอนต์สำรองของเครื่อง
  adjustFontFallback: false,
});

// Noto Sans Thai ส่วนอักษรละติน (ไฟล์แยกตาม subset) — รวมกับส่วนไทยเป็น --font-noto-thai ใน cloudflow.css
const notoThaiLatin = localFont({
  src: './fonts/noto-sans-thai-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-noto-thai-latin',
});

const jakarta = localFont({
  src: './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
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
    <html lang="th" className={`${jakarta.variable} ${notoThai.variable} ${notoThaiLatin.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-on-surface">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
