# FRONTEND — หน้าเว็บของ CS-CloudFlow

**อัปเดต:** 2026-09-23 · **Next.js 16 (App Router)** · **React 19** · **TypeScript**
อยู่ในโฟลเดอร์ `frontend/` เรียก REST API ของ backend (NestJS) ที่พอร์ต 4000

> หน้าเว็บนี้ครอบทุกตารางใน ER Diagram — `users` · `resources` · `requests` · `allocations` · `audit_logs`
> ใช้ดูข้อมูลและเดินกระบวนการจริงได้ โดยไม่ต้องยิงผ่าน Postman
>
> หน้าตาทำตามแบบที่ได้รับ 4 หน้า: New Resource Request · Approval Dashboard ·
> Active Credential & Connection · Infrastructure Overview

---

## 1. เปิดใช้งาน

ต้องเปิด **สองหน้าต่าง** พร้อมกัน — backend กับ frontend คนละตัว

```powershell
# หน้าต่าง 1 — backend (พอร์ต 4000)
cd "C:\Users\User\OneDrive\เอกสาร\CS-CloudFlow"
npm run dev

# หน้าต่าง 2 — frontend (พอร์ต 3000)
cd "C:\Users\User\OneDrive\เอกสาร\CS-CloudFlow\frontend"
npm install        # ครั้งแรกครั้งเดียว
npm run dev
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000** → จะเด้งไปหน้าเข้าสู่ระบบ

### บัญชีที่ใช้ทดสอบ

รหัสผ่านทุกบัญชี **`Passw0rd!`**

| อีเมล | role | เห็นเมนูอะไรบ้าง |
|---|---|---|
| `admin@mju.ac.th` | ADMIN | ครบทุกเมนู รวม **ผู้ใช้** และ **ประวัติการใช้งาน** |
| `somchai.t@mju.ac.th` | TEACHER | ภาพรวม · คำขอ (เฉพาะที่ตัวเองรับรอง) · เครื่อง · การจัดสรร |
| `natdanai@mju.ac.th` | STUDENT | ภาพรวม · คำขอ (เฉพาะของตัวเอง) · เครื่อง · การจัดสรร |

> ลองล็อกอินสลับ role ดู เมนูฝั่งซ้ายจะเปลี่ยนตาม — นี่คือการเห็นผลของ `RolesGuard` ที่ฝั่ง backend

---

## 2. โครงไฟล์

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← ครอบทั้งแอปด้วย AuthProvider
│   │   ├── globals.css
│   │   ├── login/page.tsx          ← หน้าเข้าสู่ระบบ
│   │   └── (app)/                  ← กลุ่มหน้าที่ต้องล็อกอินก่อน
│   │       ├── layout.tsx          ← แถบเมนูซ้าย + กันคนยังไม่ล็อกอิน
│   │       ├── page.tsx            ← ภาพรวม (dashboard)
│   │       ├── requests/
│   │       │   ├── page.tsx        ← รายการคำขอ
│   │       │   ├── new/page.tsx    ← ยื่นคำขอใหม่
│   │       │   └── [id]/page.tsx   ← รายละเอียด + ปุ่มอนุมัติ/ปฏิเสธ/ยกเลิก
│   │       ├── resources/page.tsx  ← เครื่องและทรัพยากรคงเหลือ
│   │       ├── allocations/page.tsx← การจัดสรร + คืนเครื่อง
│   │       ├── users/page.tsx      ← จัดการผู้ใช้ (ADMIN)
│   │       └── audit-logs/page.tsx ← ประวัติการใช้งาน (ADMIN)
│   ├── components/
│   │   ├── Rail.tsx                ← เมนูซ้าย ซ่อนเมนูตาม role
│   │   └── ui.tsx                  ← ชิ้นส่วนที่ใช้ซ้ำ (ป้ายสถานะ ตาราง ปุ่ม)
│   └── lib/
│       ├── api.ts                  ← ตัวเรียก API + แปลง error ของ backend
│       ├── auth.tsx                ← เก็บ token · สถานะผู้ใช้ · กันหน้าที่ต้องล็อกอิน
│       └── types.ts                ← ชนิดข้อมูลที่ตรงกับ Prisma schema
├── .env.local                      ← NEXT_PUBLIC_API_URL
└── .env.local.example
```

---

## 3. แต่ละหน้าทำอะไร

| หน้า | เรียก endpoint | ทำอะไรได้ |
|---|---|---|
| **เข้าสู่ระบบ** | `POST /auth/login` | ล็อกอิน เก็บ token ไว้ใน localStorage |
| **ภาพรวม** | `GET /resources/usage` · `GET /requests` | แถบทรัพยากรคงเหลือของทุกเครื่อง + คำขอล่าสุด + จำนวนที่รอพิจารณา |
| **คำขอใช้ทรัพยากร** | `GET /requests` | รายการคำขอ กรองตามสถานะได้ — **เห็นเฉพาะที่เกี่ยวกับตัวเอง** |
| **ยื่นคำขอใหม่** | `GET /users/teachers` · `POST /requests` | เลือกอาจารย์ผู้รับรอง กรอกทรัพยากรที่ขอ (เฉพาะ STUDENT) |
| **รายละเอียดคำขอ** | `GET /requests/:id` · `PATCH .../approve` `/reject` `/cancel` | ปุ่มที่โผล่ขึ้นมาต่างกันตาม role และสถานะปัจจุบัน |
| **เครื่องเซิร์ฟเวอร์** | `GET /resources` · `GET /resources/usage` | ความจุรวมกับที่เหลือของแต่ละเครื่อง · สถานะ · มี GPU ไหม |
| **การจัดสรร** | `GET /allocations` · `POST /allocations` · `PATCH .../release` | ADMIN จัดเครื่องให้คำขอที่อนุมัติแล้ว และกดคืนเครื่อง |
| **ผู้ใช้** | `GET/POST/PATCH/DELETE /users` | จัดการบัญชี (ADMIN เท่านั้น) |
| **ประวัติการใช้งาน** | `GET /audit-logs` | ดูว่าใครทำอะไรเมื่อไหร่ กรองตาม action ได้ (ADMIN เท่านั้น) |

---

## 3.1 ตัวเลขไหนมาจากฐานข้อมูลจริง ตัวไหนเป็นค่าที่ตั้งไว้เอง

แบบที่ได้รับมีตัวเลขบางอย่างที่ฐานข้อมูลของเราไม่ได้เก็บไว้ ตรงนี้แยกให้ชัดว่าอะไรเป็นอะไร
จะได้ไม่เข้าใจผิดว่าระบบบังคับกติกาที่จริง ๆ แล้วไม่ได้บังคับ

### มาจากข้อมูลจริงทั้งหมด

| ที่เห็นบนหน้าจอ | คำนวณจาก |
|---|---|
| แถบ CPU/RAM/Storage ใน Infrastructure | รวมทุกเครื่องจาก view `resource_usage` |
| Utilisation ของแต่ละ node | `used_cpu / total_cpu` ของ view เดียวกัน |
| GPU Nodes In Use | นับเครื่องที่ `has_gpu` และมี `active_allocations > 0` |
| `45 Days` · `14 Days Remaining` | คำนวณจาก `start_date` / `end_date` |
| Pending / Approved / Rejected | นับจากรายการคำขอที่ API คืนมา |
| System Log Stream | `GET /audit-logs` จริง — จัดระดับ INFO/WARN/AUTH/SYSTEM/DENY จากชื่อ `action` |
| คำสั่ง `ssh ...` | ประกอบจาก `ip_address` · `port` · `student_code` ของ allocation จริง |
| Cluster Load ที่แถบบน | `used_cpu / total_cpu` รวมทุกเครื่อง |

### เป็นค่าที่ตั้งไว้ฝั่งหน้าเว็บ — backend **ไม่ได้บังคับ**

| ที่เห็น | ค่าที่ใช้ | อยู่ที่ไหน |
|---|---|---|
| `Active Quota: n/2` | `ACTIVE_REQUEST_GUIDELINE = 2` | `src/components/Topbar.tsx` |
| แถบ Quota Impact (16 vCPU · 64 GB · 500 GB) | `GUIDELINE` | `src/app/(app)/requests/new/page.tsx` |
| ช่วงของ slider (1–8 · 2–32 · 10–200) | `RANGE` | ไฟล์เดียวกัน |

ทั้งสามตัวมีไว้ช่วยผู้ขอกะขนาดเท่านั้น ยิงผ่าน Postman ข้ามค่าพวกนี้ได้หมด
(DTO ฝั่ง backend ยอมรับถึง 256 CPU / 2048 GB / 100000 GB)
**ถ้าอยากให้บังคับจริง ต้องเพิ่มการตรวจใน `RequestsService` ฝั่ง backend**

ส่วนกล่องข้อความใน Quota Impact ใช้ข้อมูลจริงประกอบด้วย — ถ้าไม่มีเครื่องไหนเหลือพอรับสเปกที่ขอ
(เทียบกับ `free_*` จาก view) มันจะเตือนแทนที่จะบอกว่า "อนุมัติอัตโนมัติ"

### ที่แบบมี แต่ยังทำไม่ได้

| ในแบบ | ทำไมยังไม่มี |
|---|---|
| คอลัมน์ IP ในตาราง Active Nodes | ตาราง `resources` ไม่มีคอลัมน์ IP — IP อยู่ที่ `allocations` แทน จึงเปลี่ยนเป็น Status + Utilisation |
| `LOAD AVG` ของแต่ละ node | ระบบไม่ได้เก็บ load เฉลี่ยจริงจากเครื่อง — ใช้ utilisation จากทรัพยากรที่จองไว้แทน |
| `Ubuntu 22.04 LTS Container` | ไม่ได้เก็บ OS ของเครื่อง — แสดงชื่อ node กับสเปกแทน |
| ปุ่ม `Request Extension` | ยังไม่มี endpoint ต่ออายุคำขอ — ตัดออกดีกว่าใส่ปุ่มที่กดแล้วไม่เกิดอะไร |
| `Release Resource Early` สำหรับนักศึกษา | `PATCH /allocations/:id/release` เปิดให้เฉพาะ ADMIN — ปุ่มจึงขึ้นเฉพาะ ADMIN |

ถ้าอยากได้ครบตามแบบจริง ๆ สองอันแรกแก้ได้ด้วยการเพิ่มคอลัมน์ `ip_address` กับ `os_image`
ใน `resources` ผ่าน migration ใหม่ (อย่าแก้ migration เดิม)

---

## 4. เรื่องที่ตั้งใจทำแบบนี้

### ถาม backend ใหม่ทุกครั้งที่โหลดหน้า ไม่เชื่อข้อมูลใน localStorage

`AuthProvider` ยิง `GET /auth/me` ทุกครั้งที่เปิดหน้า แทนที่จะอ่านข้อมูลผู้ใช้จาก localStorage
ถ้า token หมดอายุหรือบัญชีถูกลบ จะรู้ทันทีตั้งแต่โหลดหน้า ไม่ใช่ตอนกดปุ่มแล้วเด้ง 401 กลางทาง

### ซ่อนเมนูตาม role แต่ไม่ได้ถือว่านั่นคือการรักษาความปลอดภัย

`Rail.tsx` กรองเมนูตาม role ของผู้ใช้ — เมนู **ผู้ใช้** กับ **ประวัติการใช้งาน** โผล่เฉพาะ ADMIN

แต่การซ่อนปุ่มคือเรื่องของความสะดวก **ไม่ใช่การกันสิทธิ์** ใครพิมพ์ `/users` ลง address bar ตรง ๆ ก็เข้าได้
แล้วจะได้หน้าว่างพร้อมข้อความ `403` จาก backend — เพราะด่านจริงอยู่ที่ `RolesGuard` ฝั่ง API
โค้ดฝั่งหน้าเว็บทุกบรรทัดถูกส่งไปเครื่องผู้ใช้แล้ว จึงแก้ได้เสมอ

### แปลง error ของ backend เป็นข้อความที่อ่านรู้เรื่อง

backend ตอบ error รูปแบบเดียวกันหมด `{ error: { code, message, details } }`
`api.ts` ห่อมันเป็น `ApiError` ที่มี `.readable` ซึ่งรวม `details` ของ validation เข้ามาด้วย
หน้าจอจึงแสดงได้เลยว่า *"ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ (reason ต้องอธิบายอย่างน้อย 10 ตัวอักษร)"*
แทนที่จะขึ้นแค่ "เกิดข้อผิดพลาด"

### ปุ่มโผล่ตามสถานะจริง ไม่ใช่โผล่หมดแล้วค่อยบอกว่ากดไม่ได้

หน้ารายละเอียดคำขอดู `status` ปัจจุบันกับ role ของผู้ใช้ แล้วแสดงเฉพาะปุ่มที่ทำได้จริงในตอนนั้น —
ตรงกับ `ALLOWED_TRANSITIONS` ฝั่ง backend ถ้ากดแล้วยังไม่ผ่าน backend จะตอบ `409 STATE_INVALID` อยู่ดี

---

## 5. ตั้งค่า

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

ถ้าเปลี่ยนพอร์ต backend (`PORT` ใน `.env` ของ root) ต้องแก้ตรงนี้ให้ตรงด้วย

> ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` จะถูกฝังลงไปในโค้ดที่ส่งให้เบราว์เซอร์
> **ห้ามใส่ความลับใด ๆ ในตัวแปรแบบนี้** — ค่านี้เป็นแค่ URL จึงใส่ได้

---

## 6. ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| หน้าเว็บขึ้นแต่กดอะไรก็ error | backend ไม่ได้รัน | เปิด `npm run dev` ที่โฟลเดอร์ root ด้วย |
| ล็อกอินแล้วเด้งกลับหน้า login ทันที | token หมดอายุ (8 ชม.) หรือ seed ถูกล้าง | ล็อกอินใหม่ · ถ้ายังไม่ได้ให้ `npm run db:seed` |
| เปิด `/users` แล้วขึ้น 403 | ล็อกอินด้วย role ที่ไม่ใช่ ADMIN | ล็อกอินด้วย `admin@mju.ac.th` |
| `EADDRINUSE` พอร์ต 3000 | มี Next.js รันค้างอยู่ | ปิดตัวเก่า หรือ `npm run dev -- -p 3001` |
| แก้ `.env.local` แล้วไม่มีผล | Next.js อ่านไฟล์นี้ตอนสตาร์ท | ปิดแล้วเปิด `npm run dev` ใหม่ |

---

**อ่านต่อ:** [`README.md`](README.md) · [`DATABASE.md`](DATABASE.md) · [`TEST-GUIDE.md`](TEST-GUIDE.md) · [`POSTMAN.md`](POSTMAN.md)
