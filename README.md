# csmju-cloudflow

CS Cloudflow — ระบบย่อยของโครงการ CSMJU2030 · นักศึกษายื่นขอใช้ทรัพยากรเซิร์ฟเวอร์ → อาจารย์รับรอง → เจ้าหน้าที่จัดเครื่อง

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards) · ใช้ standards **1.7.0** (`.standards-version`)

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
| Callback URL | `http://localhost:3208/auth/callback` |
| Base URL | เว้นว่าง |
| บทบาท | student→`STUDENT` · lecturer→`TEACHER` · staff→`STAFF` · admin→`ADMIN` (alumni · guest ไม่ติ๊ก) |

ตารางนี้ต้องตรงกับ `backend/src/auth/role-mapping.ts` เสมอ

## ตรวจก่อนเปิด PR

```bash
pnpm -r lint && rm -rf frontend/.next && pnpm -r typecheck && pnpm -r test && pnpm -r build
./standards/scripts/run-all-checks.sh .
# บัญชีทดสอบอยู่ในไฟล์นอก repo เท่านั้น (standards/docs/conformance.md ข้อ 2.1)
CONFORMANCE_ACCOUNTS_FILE=~/.csmju/conformance-accounts.json node standards/conformance/run.js
```

รายละเอียด backend: [`backend/README.md`](backend/README.md) · ผลตรวจล่าสุด: [`REPORT.md`](REPORT.md)
