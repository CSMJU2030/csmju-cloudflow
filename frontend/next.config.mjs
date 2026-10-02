import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // โฟลเดอร์นี้อยู่ข้างใน repo ของ backend ซึ่งมี package-lock.json ของตัวเอง
  // ถ้าไม่ปักหมุดไว้ Next.js จะเดา workspace root ไปเป็นโฟลเดอร์แม่แล้วเตือนทุกครั้งที่ build
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
