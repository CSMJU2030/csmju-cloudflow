# DATABASE — โครงฐานข้อมูล CS-CloudFlow

**อัปเดต:** 2026-09-23 · **ฐานข้อมูล:** `cs_cloudflow` บน PostgreSQL 16.13 · **ORM:** Prisma 6 · **schema:** `public`

> ออกแบบตาม ER Diagram ที่ได้รับ — 5 ตาราง: `users` · `resources` · `requests` · `allocations` · `audit_logs`
> ทุกอย่างในไฟล์นี้ **รันจริงจนจบแล้ว** ผลอยู่ใน [`RUN-LOG.md`](RUN-LOG.md)

---

## 1. ภาพรวมความสัมพันธ์

```
        users                                       resources
          │ 1                                           │ 1
          │                                             │
   ┌──────┴───────┐                                     │
   │ N            │ N                                   │ N
student_id    teacher_id                                │
   └──────┬───────┘                                     │
          ▼                                             ▼
       requests ──────────── 1 ─── N ──────────► allocations
          │                                             ▲
          │                                             │
          └─────────── request_id ──────────────────────┘

        users ── 1 ─── N ──► audit_logs
```

| ความสัมพันธ์ | ชนิด | บังคับด้วย |
|---|---|---|
| `users` → `requests` (ผู้ขอ) | 1 : N | FK `student_id` · `ON DELETE RESTRICT` |
| `users` → `requests` (ผู้รับรอง) | 1 : N | FK `teacher_id` · `ON DELETE RESTRICT` |
| `requests` → `allocations` | 1 : N | FK `request_id` · `ON DELETE CASCADE` |
| `resources` → `allocations` | 1 : N | FK `resource_id` · `ON DELETE RESTRICT` |
| `users` → `audit_logs` | 1 : N | FK `user_id` · `ON DELETE SET NULL` |

### ทำไม `ON DELETE` แต่ละตัวไม่เหมือนกัน

ตรงนี้ไม่ใช่รายละเอียดปลีกย่อย — มันคือคำตอบของคำถามว่า "ถ้าลบของต้นทาง ของปลายทางควรหายไปด้วยไหม"

- **RESTRICT บน `users`** — ลบผู้ใช้ที่ยังมีคำขอค้างอยู่ไม่ได้ ถ้าปล่อยให้ลบได้ คำขอจะกลายเป็นของ "ไม่มีใคร"
  แล้วประวัติการอนุมัติทั้งชุดจะอธิบายไม่ได้
- **CASCADE บน `requests` → `allocations`** — การจัดสรรไม่มีความหมายถ้าไม่มีคำขอ ลบคำขอแล้วการจัดสรรควรหายตาม
- **RESTRICT บน `resources`** — ห้ามลบเครื่องที่เคยถูกจัดสรร เพราะจะทำให้ประวัติการใช้งานขาด
  วิธีที่ถูกคือเปลี่ยน `status` เป็น `OFFLINE`
- **SET NULL บน `audit_logs`** — log ต้องอยู่ต่อแม้ผู้ใช้จะถูกลบ ไม่งั้นการลบบัญชีจะลบร่องรอยตัวเองไปด้วย

---

## 2. ตารางทีละตัว

### 2.1 `users`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `serial` PK | |
| `student_code` | `varchar(20)` UNIQUE NULL | มีเฉพาะ STUDENT — จึงเป็น nullable แต่ห้ามซ้ำ |
| `full_name` | `varchar(150)` NOT NULL | |
| `email` | `varchar(150)` UNIQUE NOT NULL | ใช้ล็อกอิน |
| `password_hash` | `varchar(255)` NOT NULL | bcrypt cost 10 — **ไม่เก็บรหัสผ่านดิบ** |
| `role` | `user_role` NOT NULL | `STUDENT` · `TEACHER` · `ADMIN` |
| `created_at` / `updated_at` | `timestamptz` | |

**ทำไม `student_code` เป็น `NULL` ได้แต่ยังคง UNIQUE** — ใน PostgreSQL ค่า `NULL` ไม่ชนกันเองใน unique index
อาจารย์กับแอดมินหลายคนจึงเป็น `NULL` พร้อมกันได้ แต่รหัสนักศึกษาจริงยังห้ามซ้ำ

### 2.2 `resources`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `serial` PK | |
| `server_name` | `varchar(100)` UNIQUE | |
| `total_cpu` / `total_ram_gb` / `total_storage_gb` | `int` NOT NULL | **ความจุรวม** ไม่ใช่ที่เหลือ |
| `has_gpu` | `bool` DEFAULT false | |
| `status` | `resource_status` | `AVAILABLE` · `FULL` · `MAINTENANCE` · `OFFLINE` |
| `created_at` / `updated_at` | `timestamptz` | |

**ตารางนี้ไม่มีคอลัมน์ "ที่เหลือ" โดยตั้งใจ** — ถ้าเก็บทั้ง `total` และ `used` ไว้คู่กัน
วันหนึ่งมันจะไม่ตรงกัน (เขียนสำเร็จแค่ตัวเดียว หรือมีคนแก้ตรง ๆ ใน pgAdmin)
ที่เหลือจึง **คำนวณสด** จาก `allocations` ที่ยัง active ผ่าน view `resource_usage`

### 2.3 `requests`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `serial` PK | |
| `student_id` | `int` FK → `users` | ต้องมี role `STUDENT` (บังคับด้วย trigger) |
| `teacher_id` | `int` FK → `users` | ต้องมี role `TEACHER` (บังคับด้วย trigger) |
| `subject_code` | `varchar(20)` | |
| `req_cpu` / `req_ram_gb` / `req_storage_gb` | `int` | ต้องเป็นบวก |
| `req_gpu` | `bool` DEFAULT false | |
| `reason` | `text` NOT NULL | |
| `start_date` / `end_date` | `date` | `end_date >= start_date` |
| `status` | `request_status` DEFAULT `PENDING` | |
| `reject_reason` | `text` NULL | **ต้องมีค่าเมื่อ REJECTED และต้องว่างเมื่อไม่ใช่** |
| `reviewed_at` | `timestamptz` NULL | เพิ่มจาก ER เดิม — ไว้ตอบว่า "พิจารณาเมื่อไหร่" |
| `created_at` / `updated_at` | `timestamptz` | |

### 2.4 `allocations`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `serial` PK | |
| `request_id` | `int` FK → `requests` | |
| `resource_id` | `int` FK → `resources` | |
| `ip_address` | `inet` | ใช้ `inet` ไม่ใช่ `varchar` — ฐานข้อมูลตรวจรูปแบบให้เอง |
| `port` | `int` | 1–65535 |
| `access_note` | `text` NULL | |
| `assigned_at` | `timestamptz` DEFAULT now() | |
| `released_at` | `timestamptz` NULL | เพิ่มจาก ER เดิม — ดูเหตุผลด้านล่าง |

**ทำไมต้องเพิ่ม `released_at`** — ถ้าไม่มี จะตอบไม่ได้ว่า port นี้ "ยังถูกใช้อยู่" หรือ "เคยถูกใช้"
ทางเลือกคือลบแถวทิ้งตอนคืนเครื่อง ซึ่งแปลว่าประวัติการใช้งานหายไปด้วย
การทำเครื่องหมายว่าคืนแล้วเก็บแถวไว้ ทำให้ทั้งกัน port ชนและเก็บประวัติได้พร้อมกัน

### 2.5 `audit_logs`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | `serial` PK | |
| `user_id` | `int` FK → `users` NULL | `NULL` = เหตุการณ์ของระบบ |
| `action` | `varchar(100)` | เช่น `REQUEST_APPROVE` |
| `details` | `text` NULL | |
| `created_at` | `timestamptz` | |

ตารางนี้ **เขียนได้อย่างเดียว** — `UPDATE`/`DELETE` ถูก trigger ปฏิเสธ
บันทึกที่แก้ย้อนหลังได้ ไม่ใช่บันทึกการตรวจสอบ มันเป็นแค่ตารางธรรมดาที่ตั้งชื่อว่า audit

---

## 3. สิ่งที่เพิ่มจาก ER Diagram เดิม และเหตุผล

ER ที่ได้รับถูกรักษาไว้ครบทุกคอลัมน์ ที่เพิ่มมามีเท่านี้ ทุกตัวมีเหตุผลเฉพาะ

| เพิ่มอะไร | ที่ไหน | ทำไม |
|---|---|---|
| `updated_at` | `users` · `resources` · `requests` | ตอบคำถาม "แก้ล่าสุดเมื่อไหร่" ได้โดยไม่ต้องไปงม log |
| `reviewed_at` | `requests` | แยก "สร้างเมื่อไหร่" ออกจาก "ถูกพิจารณาเมื่อไหร่" |
| `released_at` | `allocations` | ทำให้รู้ว่า port ยังถูกใช้อยู่ไหม โดยไม่ต้องลบประวัติ |
| `email` UNIQUE | `users` | ใช้อีเมลล็อกอิน ถ้าซ้ำได้จะไม่รู้ว่าใครเป็นใคร |
| view `resource_usage` | — | คำนวณทรัพยากรคงเหลือ แทนการเก็บซ้ำในตาราง |

---

## 4. กติกาที่บังคับที่ชั้นฐานข้อมูล

Validation ที่ API อย่างเดียวไม่พอ เพราะมันถูกข้ามได้ด้วย `psql`, Prisma Studio, หรือสคริปต์ import ที่ลืมเช็ก
กติกาที่ "ผิดแล้วข้อมูลพัง" จึงต้องอยู่ที่ฐานข้อมูลด้วย — อยู่ในไฟล์
`prisma/migrations/20260923051000_business_constraints/migration.sql`

### CHECK constraint

| ชื่อ | บังคับว่า |
|---|---|
| `resources_capacity_positive_chk` | ความจุทุกตัวเป็นบวก |
| `requests_date_range_chk` | `end_date >= start_date` |
| `requests_amount_positive_chk` | จำนวนที่ขอเป็นบวก |
| `requests_student_not_teacher_chk` | รับรองให้ตัวเองไม่ได้ |
| `requests_reject_reason_chk` | REJECTED ต้องมีเหตุผล · ไม่ REJECTED ต้องไม่มีเหตุผลค้าง |
| `allocations_port_range_chk` | port อยู่ใน 1–65535 |
| `allocations_released_after_assigned_chk` | คืนหลังจากจ่าย |
| `audit_logs_action_not_blank_chk` | `action` ห้ามเป็นช่องว่าง |

### Partial unique index — หัวใจของการกัน port ชน

```sql
CREATE UNIQUE INDEX allocations_active_port_uniq
  ON allocations (resource_id, port)
  WHERE released_at IS NULL;
```

unique ธรรมดาจะทำให้ port ที่คืนแล้วใช้ซ้ำไม่ได้ตลอดกาล
เติม `WHERE released_at IS NULL` เข้าไป กติกาจึงกลายเป็น *"ห้ามซ้ำเฉพาะตอนที่ยังใช้อยู่"* ซึ่งตรงกับความจริง

และการกันไว้ที่ index สำคัญกว่าการเช็กในโค้ด เพราะ `SELECT` แล้วค่อย `INSERT` มีช่องว่างระหว่างกลาง
ที่คำขอสองใบพร้อมกันหลุดผ่านไปได้ทั้งคู่

อีกตัวคู่กัน: `allocations_active_request_uniq` — คำขอหนึ่งใบมีการจัดสรรที่ยัง active ได้แค่รายการเดียว

### Trigger

| trigger | บังคับว่า |
|---|---|
| `requests_enforce_roles` | `student_id` ต้อง role `STUDENT` · `teacher_id` ต้อง role `TEACHER` |
| `allocations_enforce_rules` | จัดสรรได้เฉพาะคำขอที่ `APPROVED` และเครื่องที่ไม่ได้ `MAINTENANCE`/`OFFLINE` |
| `audit_logs_no_update` | ห้าม `UPDATE`/`DELETE` บน `audit_logs` |

**ทำไมสองอันแรกต้องเป็น trigger ไม่ใช่ CHECK** — `CHECK` มองได้แค่แถวของตัวเอง
เงื่อนไขที่ต้องไปอ่านตารางอื่น (role ของผู้ใช้ สถานะของคำขอ) เขียนเป็น `CHECK` ไม่ได้

### view `resource_usage`

```sql
SELECT server_name, total_cpu, used_cpu, free_cpu, active_allocations
FROM resource_usage ORDER BY resource_id;
```

```
 cs-node-01  |  32 |  8 |  24 |  1
 cs-node-02  |  64 |  0 |  64 |  0
 cs-node-03  |  16 |  0 |  16 |  0
 cs-node-04  |  48 |  0 |  48 |  0
```

`used_*` รวมจากคำขอของ allocation ที่ `released_at IS NULL` เท่านั้น — คืนเครื่องแล้วตัวเลขลดทันที

---

## 5. State machine ของ `requests`

```
                 ┌────────────► CANCELLED  (ผู้ขอยกเลิกเอง)
                 │
   PENDING ──────┼────► REJECTED   (ต้องมี reject_reason)
                 │
                 └────► APPROVED ──────► ALLOCATED ──────► EXPIRED
                            │                                 ▲
                            └────► CANCELLED                  │
                                          (คืนเครื่อง) ────────┘
```

| จาก | ไปได้ | ใครสั่ง |
|---|---|---|
| `PENDING` | `APPROVED` · `REJECTED` · `CANCELLED` | อาจารย์ที่ถูกระบุ (หรือ ADMIN) · เจ้าของคำขอ |
| `APPROVED` | `ALLOCATED` · `CANCELLED` | ADMIN (ตอนสร้าง allocation) · เจ้าของคำขอ |
| `ALLOCATED` | `EXPIRED` | ADMIN (ตอนคืนเครื่อง) |
| `REJECTED` · `CANCELLED` · `EXPIRED` | — | สถานะปลายทาง ไปต่อไม่ได้ |

เส้นทางทั้งหมดอยู่ที่ตัวแปร `ALLOWED_TRANSITIONS` ใน `src/requests/requests.service.ts` ที่เดียว —
ถ้ากระจายเงื่อนไขไว้ตามเมธอด สุดท้ายมันจะขัดกันเองโดยไม่มีใครรู้

การเปลี่ยนสถานะนอกเส้นทางนี้ตอบ `409 STATE_INVALID` พร้อมบอกว่าจากสถานะปัจจุบันไปไหนได้บ้าง

---

## 6. ติดตั้งบนเครื่องตัวเอง

ดูขั้นตอนเต็มใน [`README.md`](README.md) โดยย่อคือ:

```bash
psql -U postgres -c "CREATE DATABASE cs_cloudflow;"
cp .env.example .env          # Windows: copy .env.example .env
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

`DATABASE_URL` ใน `.env`:

```
DATABASE_URL="postgresql://postgres:<PASSWORD>@localhost:5432/cs_cloudflow?schema=public"
```

> ⚠️ ถ้ารหัสผ่านมีอักขระพิเศษ (`@ : / ? # &`) ต้อง URL-encode ก่อน
> `<PASSWORD>` ไม่มีอักขระพิเศษ จึงใส่ตรง ๆ ได้
> ⚠️ `.env` อยู่ใน `.gitignore` แล้ว — **ห้าม commit**

---

## 7. ตรวจว่ากติกายังอยู่ครบ

```bash
psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql
```

สคริปต์นี้ยิง SQL ตรง 12 ข้อ **ทุกข้อต้องขึ้น `ERROR`** — ถ้าข้อไหนผ่านฉลุย แปลว่ากติกาหลุด
ทั้งหมดห่อด้วย `ROLLBACK` จึงไม่แตะข้อมูลจริง ผลรันล่าสุดอยู่ใน [`RUN-LOG.md`](RUN-LOG.md) §3

---

**อ่านต่อ:** [`README.md`](README.md) · [`POSTMAN.md`](POSTMAN.md) · [`RUN-LOG.md`](RUN-LOG.md) · [`PROGRESS.md`](PROGRESS.md)
