# CS-CloudFlow

ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์สำหรับนักศึกษา — นักศึกษายื่นคำขอ อาจารย์รับรอง แอดมินจัดเครื่องให้

**NestJS 10** · **Prisma 6** · **PostgreSQL 16** · ฐานข้อมูลชื่อ `cs_cloudflow`

---

## เริ่มใช้งานใน 4 คำสั่ง

เปิด PowerShell ที่โฟลเดอร์นี้แล้วรันตามลำดับ — **ไม่ต้องใช้ `psql`**

```powershell
copy .env.example .env    # (macOS/Linux: cp .env.example .env)
npm install
npm run db:generate       # สร้าง Prisma Client — ข้ามไม่ได้ ดูเหตุผลด้านล่าง
npm run db:deploy         # สร้างฐานข้อมูล cs_cloudflow ให้เอง ถ้ายังไม่มี
npm run db:seed           # ใส่ข้อมูลตั้งต้น
npm run dev               # http://127.0.0.1:4000  ·  เอกสาร API → /docs
```

> **`npm run db:deploy` สร้างฐานข้อมูลให้เองถ้ายังไม่มี** — ไม่ต้องรัน `CREATE DATABASE` ก่อน
> ขอแค่ PostgreSQL service ทำงานอยู่ และรหัสผ่านใน `.env` ถูกต้อง

> **ทำไมต้อง `db:generate`** — `@prisma/client` ที่โหลดมาจาก npm เป็นตัวเปล่า ยังไม่รู้จักตารางของเรา
> `prisma generate` คือขั้นตอนที่อ่าน `schema.prisma` แล้ว**เขียนโค้ด TypeScript ของ client ขึ้นมาใหม่**
> ปกติมันรันเองตอน `npm install` แต่ถ้าไม่ได้รัน (เช่น OneDrive ล็อกไฟล์อยู่ หรือติดตั้งด้วย `--ignore-scripts`)
> จะคอมไพล์ไม่ผ่านทันที — ดูอาการและวิธีแก้ใน [ปัญหาที่เจอบ่อย](#ปัญหาที่เจอบ่อย)

### ถ้าอยากใช้ `psql` ด้วย (ไม่บังคับ)

Windows ไม่ได้ใส่ `psql` ลง PATH ให้ตอนติดตั้ง จึงขึ้นว่า `'psql' is not recognized`
หาว่ามันอยู่ตรงไหนก่อน (เลขเวอร์ชันอาจเป็น 16, 17 หรือ 18):

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty FullName
```

ได้พาธมาแล้วเลือกทางใดทางหนึ่ง:

```powershell
# ก) ใช้ครั้งเดียว — เรียกด้วยพาธเต็ม
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d cs_cloudflow

# ข) ใช้ได้ทั้งหน้าต่างนี้ (ปิดแล้วหาย)
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"

# ค) ใส่ถาวร — เขียนทับเฉพาะ PATH ของ user ไม่แตะของเครื่อง แล้วเปิด PowerShell ใหม่
$bin = "C:\Program Files\PostgreSQL\17\bin"
$old = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$old;$bin", "User")
```

> ⚠️ ข้อ (ค) อย่าใช้ `$env:Path` เป็นค่าตั้งต้น — `$env:Path` รวม PATH ของเครื่องกับของ user ไว้ด้วยกัน
> เขียนกลับลง `"User"` จะกลายเป็นสำเนาซ้ำของ PATH ทั้งเครื่อง
>
> ถ้าไม่มีโฟลเดอร์ `C:\Program Files\PostgreSQL` เลย แปลว่ายังไม่ได้ติดตั้ง PostgreSQL
> โหลดได้ที่ postgresql.org/download/windows (ตอนติดตั้งจะให้ตั้งรหัสของ `postgres` — ใส่ `<PASSWORD>`
> ให้ตรงกับ `.env` หรือถ้าตั้งเป็นอย่างอื่น ก็ไปแก้ `DATABASE_URL` ใน `.env` ให้ตรง)

---

## บัญชีตั้งต้น

รหัสผ่านทุกบัญชี: **`Passw0rd!`**

| อีเมล | role | ใช้ทดสอบอะไร |
|---|---|---|
| `admin@mju.ac.th` | ADMIN | จัดการเครื่อง · จัดสรร · อ่าน audit log |
| `somchai.t@mju.ac.th` | TEACHER | อนุมัติ/ปฏิเสธคำขอ |
| `wanida.t@mju.ac.th` | TEACHER | ทดสอบว่าอาจารย์คนอื่นอนุมัติแทนไม่ได้ |
| `natdanai@mju.ac.th` | STUDENT | ผู้ขอหลัก |
| `student2@mju.ac.th` | STUDENT | คู่ทดสอบว่าเปิดคำขอของคนอื่นไม่ได้ |
| `student3@mju.ac.th` | STUDENT | สำรอง |

---

## โครงไฟล์

```
CS-CloudFlow/
├── prisma/
│   ├── schema.prisma                      ← โครงฐานข้อมูล 5 ตาราง 3 enum
│   ├── seed.ts                            ← ข้อมูลตั้งต้น (รันซ้ำได้)
│   └── migrations/
│       ├── 20260923050743_init/           ← ตาราง · FK · index
│       └── 20260923051000_business_constraints/
│                                          ← CHECK · trigger · partial index · view
├── src/
│   ├── main.ts                            ← bind 127.0.0.1 เท่านั้น
│   ├── app.module.ts                      ← ปิดทั้งแอปด้วย guard เป็นค่าเริ่มต้น
│   ├── common/                            ← guard · decorator · error filter
│   ├── prisma/ · audit/                   ← โมดูลกลาง
│   ├── auth/ users/ resources/            ← โมดูลงาน
│   ├── requests/ allocations/
│   └── audit-logs/ health/
├── postman/
│   ├── build-collection.py                ← ⚠️ แก้ที่นี่ แล้ว generate ใหม่
│   ├── CS-CloudFlow.postman_collection.json
│   └── CS-CloudFlow.postman_environment.json
├── scripts/db-rules-check.sql             ← ยิง SQL ตรงเพื่อตรวจกติกาชั้น DB
├── DATABASE.md  POSTMAN.md  PROGRESS.md  RUN-LOG.md  DB-TUTORIAL.md
└── .env.example                           ← คัดลอกเป็น .env (ห้าม commit .env)
```

---

## คำสั่งที่ใช้บ่อย

| ทำอะไร | คำสั่ง |
|---|---|
| เปิดเซิร์ฟเวอร์ (auto-reload) | `npm run dev` |
| สร้าง Prisma Client ใหม่ (หลังติดตั้งหรือแก้ schema) | `npm run db:generate` |
| สร้าง migration ใหม่หลังแก้ schema | `npx prisma migrate dev --name ชื่อ` |
| รัน migration ที่มีอยู่ | `npm run db:deploy` |
| ใส่ข้อมูลตั้งต้น | `npm run db:seed` |
| ล้างฐานข้อมูลแล้วเริ่มใหม่ | `npm run db:reset` |
| เปิด GUI ดูข้อมูล | `npm run db:studio` |
| ยิงชุดทดสอบทั้งชุด | `npm run test:postman` (ต้องมี `newman`) |
| สร้างไฟล์ Postman ใหม่ | `npm run postman:build` |
| ตรวจกติกาชั้นฐานข้อมูล | `psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql` |

---

## รายการ endpoint

| กลุ่ม | endpoint | ใครเรียกได้ |
|---|---|---|
| health | `GET /health` | ไม่ต้องล็อกอิน |
| auth | `POST /auth/login` · `POST /auth/register` | ไม่ต้องล็อกอิน |
| | `GET /auth/me` · `PATCH /auth/password` | ทุกคนที่ล็อกอิน |
| users | `GET /users/teachers` | ทุกคนที่ล็อกอิน |
| | `GET/POST/PATCH/DELETE /users` | ADMIN |
| resources | `GET /resources` · `GET /resources/usage` · `GET /resources/:id` | ทุกคนที่ล็อกอิน |
| | `POST/PATCH/DELETE /resources` | ADMIN |
| requests | `GET /requests` · `GET /requests/:id` | เห็นเฉพาะที่เกี่ยวกับตัวเอง |
| | `POST /requests` · `PATCH /requests/:id` | STUDENT |
| | `PATCH /requests/:id/approve` · `/reject` | TEACHER ที่ถูกระบุ · ADMIN |
| | `PATCH /requests/:id/cancel` | เจ้าของคำขอ · ADMIN |
| allocations | `GET /allocations` · `GET /allocations/:id` | ADMIN เห็นทั้งหมด · คนอื่นเห็นของตัวเอง |
| | `POST /allocations` · `PATCH /:id/release` | ADMIN |
| audit-logs | `GET /audit-logs` | ADMIN |

เอกสารแบบโต้ตอบ (Swagger): เปิด `http://127.0.0.1:4000/docs` ตอนเซิร์ฟเวอร์ทำงาน

---

## ปัญหาที่เจอบ่อย

### `Module '"@prisma/client"' has no exported member 'UserRole'` (และอีกหลายสิบบรรทัด)

อาการ: `npm run dev` แล้วขึ้น error TS2305 / TS2694 รัว ๆ บอกว่าหา `UserRole`, `RequestStatus`,
`Prisma.RequestWhereInput`, `Prisma.PrismaClientKnownRequestError` ไม่เจอ

**ไม่ใช่โค้ดผิด** — แปลว่า Prisma Client ยังไม่ถูก generate
`@prisma/client` ที่โหลดจาก npm เป็นตัวเปล่า ชนิดข้อมูลทั้งหมด (enum · WhereInput · Include)
ถูกสร้างขึ้นตอนรัน `prisma generate` โดยอ่านจาก `schema.prisma`

```powershell
npm run db:generate
```

แล้วรัน `npm run dev` ใหม่ ถ้ายังไม่หาย ปิด `npm run dev` ให้สนิทก่อนแล้วลองอีกครั้ง
(watch mode จับไฟล์ไว้อยู่ ทำให้เขียนทับไม่ได้ — บน OneDrive ยิ่งเจอง่าย)

**ต้องรันคำสั่งนี้ซ้ำทุกครั้งที่:** เพิ่งโคลนโปรเจกต์มา · ลบ `node_modules` แล้วติดตั้งใหม่ · แก้ `schema.prisma`

### `'psql' is not recognized`

ไม่จำเป็นต้องใช้ `psql` เลย — `npm run db:deploy` สร้างฐานข้อมูลให้เอง
ถ้าอยากใช้จริง ๆ ดูวิธีใส่ PATH ใน [ส่วนเริ่มใช้งาน](#เริ่มใช้งานใน-4-คำสั่ง) ด้านบน

### `P1001: Can't reach database server at localhost:5432`

PostgreSQL service ไม่ได้ทำงาน — กด Win+R พิมพ์ `services.msc` หา `postgresql-x64-*` แล้วกด Start

### `cached plan must not change result type`

เกิดตอนสร้าง schema ใหม่ขณะเซิร์ฟเวอร์ยังเปิดค้าง — ปิด `npm run dev` แล้วเปิดใหม่

---

## ข้อควรระวัง

1. ❌ **ห้าม commit `.env`** — มีรหัสผ่านฐานข้อมูลและ `JWT_SECRET` อยู่ (อยู่ใน `.gitignore` แล้ว)
2. ❌ **ห้ามแก้ไฟล์ migration ที่รันไปแล้ว** — สร้าง migration ใหม่ทับแทน
   ไม่งั้นเครื่องของคนอื่นที่รันไปแล้วจะไม่ตรงกับของคุณ
3. ❌ **ห้ามแก้ JSON ของ Postman ตรง ๆ** — แก้ที่ `postman/build-collection.py` แล้ว generate ใหม่
4. ❌ **ห้ามเปลี่ยน `HOST` เป็น `0.0.0.0`** — คนในวงเน็ตเดียวกันจะยิงถึงทันที
5. ⚠️ **เปลี่ยน `JWT_SECRET` เป็นค่าสุ่มจริงก่อนขึ้นเครื่องจริง** — `.env.example` เขียนวิธีสุ่มไว้แล้ว

---

**อ่านต่อ:** [`DATABASE.md`](DATABASE.md) โครงฐานข้อมูล · [`POSTMAN.md`](POSTMAN.md) วิธียิงทดสอบ · [`DB-TUTORIAL.md`](DB-TUTORIAL.md) สอนใช้ PostgreSQL + pgAdmin ตั้งแต่ศูนย์ · [`RUN-LOG.md`](RUN-LOG.md) ผลรันจริง · [`PROGRESS.md`](PROGRESS.md) บันทึกงาน
