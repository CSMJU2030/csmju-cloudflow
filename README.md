# csmju-cloudflow

CS Cloudflow — ระบบย่อยของโครงการ CSMJU2030 · นักศึกษายื่นขอใช้ทรัพยากรเซิร์ฟเวอร์ → อาจารย์รับรอง → เจ้าหน้าที่จัดเครื่อง ·
ยืมพื้นที่ cloud (คนละไม่เกิน 15 GB · อาจารย์อนุมัติ)

**เว็บจริง:** `https://csmju-cloudflow.jowave.com` · Callback `https://csmju-cloudflow.jowave.com/auth/callback`

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards) · ใช้ standards **1.8.4** (`.standards-version`)

## เริ่มทำงาน

```bash
git submodule update --init standards
pnpm install                       # pnpm 12.3.4 (ดู packageManager ใน package.json)
git checkout -b feature/cloudflow/<เรื่องที่ทำ>
```

ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1

## รันในเครื่อง

| ส่วน | พอร์ต | หมายเหตุ |
|---|---|---|
| frontend (Next.js) | `3208` | ประตูเดียวของระบบ · proxy `/api/*` และ `/auth/*` ไป backend · เปิดด้วย `http://localhost:3208` |
| backend (NestJS) | `4208` | bind `127.0.0.1` |
| PostgreSQL | ตาม `DATABASE_URL` | ฐานของระบบนี้เท่านั้น เช่น `cs_cloudflow` |
| Core Hub | `https://csmju2030.jowave.com` | ไม่ต้องรัน Core Hub เอง |

```bash
cp backend/.env.example backend/.env          # ใส่รหัส DB จริงเฉพาะในไฟล์นี้ (ห้าม commit)
cp frontend/.env.example frontend/.env.local
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend run db:seed             # ไม่บังคับ — เครื่องตัวอย่าง 4 เครื่อง
pnpm dev                                      # backend :4208 + frontend :3208
```

เปิด `http://localhost:3208` → ระบบพาไป login ที่ Core Hub แล้วกลับมาเอง (ต้องเป็น `localhost` ไม่ใช่ `127.0.0.1`)

## ทะเบียนใน Core Hub (PL ทำครั้งเดียว)

login `https://csmju2030.jowave.com` ด้วยบัญชี `csmju-cloudflow.admin` → หลังบ้าน → ระบบย่อย → ลงทะเบียนระบบย่อย

| ช่อง | ค่า |
|---|---|
| ชื่อระบบ | `csmju-cloudflow` |
| Callback URL | ตอนพัฒนา `http://localhost:3208/auth/callback` · **ก่อนวันเปิดใช้** ขอ admin เปลี่ยนเป็น `https://csmju-cloudflow.jowave.com/auth/callback` (deployment.md ข้อ 2) |
| Base URL | `https://csmju-cloudflow.jowave.com` |
| บทบาท | student→`STUDENT` · lecturer→`TEACHER` · staff→`STAFF` · admin→`ADMIN` (alumni · guest ไม่ติ๊ก) |

ตารางนี้ต้องตรงกับ `backend/src/auth/role-mapping.ts` เสมอ

## Deploy (standards 1.8 · `docs/deployment.md`)

ระบบขึ้น server กลางเป็น 2 image ที่ GitHub Actions build ให้เมื่อ merge เข้า `main`: `web` (Next.js :3000) · `api` (NestJS :4000)

| ไฟล์ | หน้าที่ |
|---|---|
| `frontend/Dockerfile` | copy จาก template กลาง (ห้ามแก้) · `BACKEND_URL=http://api:4000` ฝังตอน build |
| `backend/Dockerfile` · `backend/docker/entrypoint.sh` | `prisma migrate deploy` แล้ว `node dist/main.js` · user `node` · `HOST=0.0.0.0` |
| `.dockerignore` | กัน `**/.env*` และ `**/node_modules` ไม่ให้เข้า image |
| `docker-compose.yml` | ทดสอบในเครื่องแบบเดียวกับ server (read-only · RAM api 512m / web 384m) |

```bash
docker compose up -d --build     # db + api + web → เปิด http://localhost:3208
docker compose ps                # ทั้งสามต้อง healthy
docker compose down
```

env ที่ DevOps ต้องตั้งบน server ดูจาก `backend/.env.example` (ห้ามใส่ `HOST` — image ตั้ง `0.0.0.0` ไว้แล้ว) ·
ระบบยืมพื้นที่เปิดเมื่อตั้ง `STORAGE_SECRET_KEY` (ส่งให้ DevOps ทางข้อความส่วนตัว)

## ตรวจก่อนเปิด PR

```bash
pnpm -r lint && rm -rf frontend/.next && pnpm -r typecheck && pnpm -r test && pnpm -r build
./standards/scripts/run-all-checks.sh .
# บัญชีทดสอบอยู่ในไฟล์นอก repo เท่านั้น (standards/docs/conformance.md ข้อ 2.1)
CONFORMANCE_ACCOUNTS_FILE=~/.csmju/conformance-accounts.json node standards/conformance/run.js --url http://localhost:3208
```

รายละเอียด backend: [`backend/README.md`](backend/README.md) · ผลตรวจล่าสุด: [`REPORT.md`](REPORT.md)
