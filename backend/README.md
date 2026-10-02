# CS-CloudFlow — backend

NestJS 11 + Prisma 7 (PrismaPg) + PostgreSQL · ผู้ใช้ login ที่ Core Hub (SSO) เท่านั้น — ระบบนี้ไม่มีหน้า login ไม่มีรหัสผ่าน และไม่มีตาราง users

ภาพรวม · วิธีรันทั้งระบบ · การลงทะเบียนกับ Core Hub อยู่ใน [`../README.md`](../README.md)

## โครงสร้าง

```text
src/
├── main.ts                 prefix /api · /auth/login|callback|logout อยู่นอก /api · envelope + error filter
├── app.module.ts           CoreHubJwtGuard (401) + PermissionsGuard (403) เป็น APP_GUARD
├── config/                 อ่านและตรวจ env ตอนบูต
├── auth/                   ชั้น auth ตาม standards/docs/auth-contract.md (ตรวจ token 10 ขั้น · SSO 1.1)
│   ├── jwks.service.ts           ดึง/แคช JWKS ตาม kid
│   ├── core-hub-token.verifier.ts
│   ├── sso.controller.ts         GET /auth/login · GET /auth/callback · POST /auth/logout
│   ├── me.controller.ts          GET /api/v1/me
│   ├── role-mapping.ts           student→STUDENT · lecturer→TEACHER · staff→STAFF · admin→ADMIN
│   └── permissions.ts            เมทริกซ์สิทธิ์ที่เดียวของระบบ
├── core-hub/               เรียก Core Hub จาก backend (รายวิชา · /people/me) ด้วย token ของผู้ใช้
├── resources/ requests/ allocations/ audit-logs/   โมดูลธุรกิจ
└── generated/prisma/       Prisma Client (สร้างด้วย prisma generate · ไม่อยู่ใน git)
prisma/
├── schema.prisma
├── migrations/             ห้ามลบ ห้าม squash
└── seed.ts                 seed เครื่อง 4 เครื่อง
test/                       jest: ตัวตรวจ token 10 ขั้น · SSO · 401/403/409
```

## คำสั่ง

```bash
cp .env.example .env              # แล้วใส่รหัส DB จริงเฉพาะในไฟล์นี้
pnpm exec prisma migrate deploy   # สร้าง/อัปเดตตาราง (ใช้ pnpm exec ไม่ใช่ npx)
pnpm run db:seed                  # ไม่บังคับ
pnpm run start:dev                # http://127.0.0.1:4208  · Swagger ที่ /docs (ไม่เปิดตอน production)

pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run db:diff                  # ต้องได้ "No difference detected."
```

## API

| Method & path | permission |
|---|---|
| `GET /api/health` | public |
| `GET /auth/login` · `GET /auth/callback` · `POST /auth/logout` | public (SSO) |
| `GET /api/v1/me` | ทุก role ที่แมปได้ |
| `GET /api/v1/resources` · `/:id` · `GET /api/v1/resource-usages` | `resource:read` |
| `POST` · `PATCH` · `DELETE /api/v1/resources[/:id]` | `resource:create|update|delete` (STAFF · ADMIN) |
| `GET /api/v1/requests` · `/:id` | `request:read:own|any` · `request:review:own` |
| `POST /api/v1/requests` · `PATCH /:id` | `request:create:own` · `request:update:own` (STUDENT) |
| `POST /api/v1/requests/:id/approve` · `/reject` | `request:review:own` (TEACHER ที่ถูกระบุ) · `request:review:any` (STAFF · ADMIN) |
| `POST /api/v1/requests/:id/cancel` | `request:cancel:own|any` |
| `GET /api/v1/allocations` · `/:id` | `allocation:read:own|any` |
| `POST /api/v1/allocations` · `POST /:id/release` | `allocation:create` · `allocation:release` (STAFF · ADMIN) |
| `GET /api/v1/audit-logs` | `audit-log:read` (STAFF · ADMIN) |
| `GET /api/v1/courses` | รายวิชาจาก Core Hub (cache 10 นาที) |
| `GET /api/v1/advisors` | อาจารย์ที่ปรึกษาของนักศึกษาจาก Core Hub `/people/me` (ไม่ cache) |

id ทุกตัวเป็น UUID v4 · คำตอบอยู่ใน envelope `{ success, data, meta? }` · error code มี 9 ค่าตาม `standards/contracts/error-codes.json`

## ข้อมูลที่เก็บ

ตามมาตรฐาน 1.7.0 ระบบนี้เก็บได้แค่ `core_user_id` (claim `sub`) · `person_code` (จาก `/people/me` ตอนยื่นคำขอ) และ `course_code` ของ Core Hub —
ไม่เก็บชื่อหรืออีเมลของใคร · อาจารย์ผู้รับรองเก็บเป็น `teacher_person_code` (ว่าง = อาจารย์คนใดก็พิจารณาได้)

migration `20261002090000_core_hub_identity` ย้ายข้อมูลจากระบบเดิมโดยไม่ทิ้งแถวใด: ผู้ยื่นเดิมเป็น `legacy-<id>` + รหัสนักศึกษาเดิม ·
อาจารย์เดิมเป็นส่วนหน้าอีเมล · id เดิมทุกตารางเปลี่ยนเป็น UUID
