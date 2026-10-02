import type { NextConfig } from 'next';

/**
 * frontend เป็นประตูเดียวของระบบ (connect-core-hub.md ข้อ 1)
 * ส่ง /api/* และ /auth/login · /auth/callback · /auth/logout ต่อไป backend (NestJS)
 * callback ที่ลงทะเบียนกับ Core Hub จึงใช้พอร์ตของ frontend: http://localhost:3208/auth/callback
 *
 * BACKEND_URL ถูกอ่านตอน build — ตั้งก่อน `next build` ถ้า backend ไม่ได้อยู่ที่ค่า default
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:4208';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/auth/login', destination: `${BACKEND_URL}/auth/login` },
      { source: '/auth/callback', destination: `${BACKEND_URL}/auth/callback` },
      { source: '/auth/logout', destination: `${BACKEND_URL}/auth/logout` },
    ];
  },
};

export default nextConfig;
