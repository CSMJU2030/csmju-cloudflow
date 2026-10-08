import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * frontend เป็นประตูเดียวของระบบ (connect-core-hub.md ข้อ 1)
 * ส่ง /api/* และ /auth/login · /auth/callback · /auth/logout ต่อไป backend (NestJS)
 * callback ที่ลงทะเบียนกับ Core Hub อยู่ที่ origin ของ frontend: https://csmju-cloudflow.jowave.com/auth/callback (dev: http://localhost:3208/auth/callback)
 *
 * BACKEND_URL ถูกอ่านตอน build — ตั้งก่อน `next build` ถ้า backend ไม่ได้อยู่ที่ค่า default
 * image ของ server build ด้วย http://api:4000 (frontend/Dockerfile · standards deployment.md ข้อ 3.2)
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:4208';

const nextConfig: NextConfig = {
  // image มีแค่ server ที่ trace แล้ว (DEP-04 · deployment.md ข้อ 3)
  output: 'standalone',
  // pnpm เก็บ dependency ที่รากของ workspace — ต้อง trace จากรากของ repo
  outputFileTracingRoot: path.join(__dirname, '..'),
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
