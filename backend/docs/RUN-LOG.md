# RUN-LOG — บันทึกผลการรันจริง

**รันเมื่อ:** 2026-09-23 · **API:** `http://127.0.0.1:4000` (NestJS 10) · **DB:** PostgreSQL 16.13 / `cs_cloudflow`

> ไฟล์นี้บันทึกผลจากการรันจริง ไม่ใช่ผลที่คาดว่าจะได้
> รันซ้ำเอง: `npm run test:postman` (ชุดเต็ม) · `psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql` (กติกาชั้น DB)

---

## 1. ติดตั้งฐานข้อมูล

| ขั้น | คำสั่ง | ผล |
|---|---|---|
| ตรวจ schema | `npx prisma validate` | ✅ `The schema at prisma/schema.prisma is valid` |
| สร้างตาราง | `npx prisma migrate deploy` | ✅ ลง 2 migration: `init` · `business_constraints` |
| ข้อมูลตั้งต้น | `npm run db:seed` | ✅ `{ users: 6, resources: 4, requests: 3, allocations: 1, auditLogs: 2 }` |
| คอมไพล์ | `npm run build` | ✅ ไม่มี error |
| เปิดเซิร์ฟเวอร์ | `node dist/main.js` | ✅ `GET /health → {"status":"ok","database":"up"}` |

Route ที่ NestJS ลงทะเบียนได้ครบ 8 controller — `auth` · `users` · `resources` · `requests` · `allocations` · `audit-logs` · `health` และ Swagger ที่ `/docs`

---

## 2. ชุดทดสอบเต็ม (newman)

```
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│              iterations │                 1 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │                96 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│            test-scripts │                96 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│      prerequest-scripts │                 5 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│              assertions │               167 │                0 │
├─────────────────────────┴───────────────────┴──────────────────┤
│ total run duration: 3.1s                                       │
│ average response time: 18ms [min: 3ms, max: 170ms]             │
└────────────────────────────────────────────────────────────────┘
```

รันซ้ำอีกรอบ**โดยไม่ล้างฐานข้อมูล** → `167 assertion · 0 failed` เหมือนเดิม
แปลว่าชุดทดสอบไม่ทิ้งสถานะค้างที่ทำให้รอบถัดไปพัง

---

## 3. กติกาชั้นฐานข้อมูล (ยิง SQL ตรง ไม่ผ่าน API)

ทดสอบด้วย `scripts/db-rules-check.sql` เพื่อยืนยันว่า **อ้อม API แล้วก็ยังผ่านไม่ได้**
ทั้ง 12 ข้อ ต้องขึ้น `ERROR` — และขึ้นครบทุกข้อ

| # | ลองทำอะไร | ผลจริง |
|---|---|---|
| 1 | ให้ ADMIN เป็น `student_id` | `ERROR: student_id 1 ต้องเป็นผู้ใช้ที่มี role = STUDENT (พบ: ADMIN)` |
| 2 | ตั้ง `REJECTED` โดยไม่ใส่เหตุผล | `ERROR: violates check constraint "requests_reject_reason_chk"` |
| 3 | `end_date` มาก่อน `start_date` | `ERROR: violates check constraint "requests_date_range_chk"` |
| 4 | อาจารย์รับรองให้ตัวเอง | `ERROR: student_id 2 ต้องเป็นผู้ใช้ที่มี role = STUDENT (พบ: TEACHER)` |
| 5 | จัดสรรให้คำขอที่ยัง `PENDING` | `ERROR: จัดสรรไม่ได้: คำขอ 2 อยู่ในสถานะ PENDING (ต้อง APPROVED ก่อน)` |
| 6 | จัดสรรลงเครื่องที่ปิดซ่อม | `ERROR: จัดสรรไม่ได้: เครื่อง 4 อยู่ในสถานะ MAINTENANCE` |
| 7 | `UPDATE` บน `audit_logs` | `ERROR: audit_logs เป็นตารางเขียนอย่างเดียว — ห้ามทำ UPDATE กับตารางนี้` |
| 8 | `DELETE` บน `audit_logs` | `ERROR: ... ห้ามทำ DELETE กับตารางนี้` |
| 9 | `port` ซ้ำขณะยังไม่คืน | `ERROR: duplicate key value violates unique constraint "allocations_active_port_uniq"` |
| 10 | ลบผู้ใช้ที่ยังมีคำขอ | `ERROR: violates foreign key constraint "requests_student_id_fkey"` |
| 11 | IP ผิดรูปแบบ (`999.1.1.1`) | `ERROR: invalid input syntax for type inet: "999.1.1.1"` |
| 12 | `port` = 70000 | `ERROR: violates check constraint "allocations_port_range_chk"` |

### view `resource_usage` — คำนวณสด ไม่ได้เก็บไว้

```
 server_name | total_cpu | used_cpu | free_cpu | active_allocations
-------------+-----------+----------+----------+--------------------
 cs-node-01  |        32 |        8 |       24 |                  1
 cs-node-02  |        64 |        0 |       64 |                  0
 cs-node-03  |        16 |        0 |       16 |                  0
 cs-node-04  |        48 |        0 |       48 |                  0
```

---

## 4. ตัวอย่างผลจริงที่น่าสนใจ

**`studentId` มาจาก token ไม่ใช่ body**

```json
{ "id": 4, "studentId": 4, "status": "PENDING",
  "student": { "fullName": "ณัฐดนัย ผู้ขอ" },
  "teacher": { "fullName": "อ.สมชาย ใจดี" } }
```

**ยัดฟิลด์เกินแล้วถูกตีตกพร้อมบอกว่าตัวไหนเกิน**

```json
{ "error": { "code": "VALIDATION_FAILED",
  "message": "ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ",
  "details": ["property studentId should not exist", "property status should not exist"] } }
```

**เปลี่ยนสถานะนอกเส้นทาง — บอกด้วยว่าจากตรงนี้ไปไหนได้บ้าง**

```json
{ "error": { "code": "STATE_INVALID",
  "message": "อนุมัติไม่ได้: คำขออยู่ในสถานะ APPROVED",
  "details": { "from": "APPROVED", "to": "APPROVED", "allowedNext": ["ALLOCATED", "CANCELLED"] } } }
```

**จัดสรรสำเร็จ และคำขอเปลี่ยนสถานะในคำสั่งเดียวกัน**

```json
{ "id": 2, "port": 22033, "releasedAt": null,
  "resource": { "serverName": "cs-node-03", "hasGpu": false },
  "request":  { "id": 4, "status": "ALLOCATED" } }
```

**audit log บันทึกทุกการกระทำที่เปลี่ยนข้อมูล**

```
12  ALLOCATION_CREATE  จัดสรรคำขอ #4 ลงเครื่อง #3 10.10.20.33:22033
11  REQUEST_APPROVE    อนุมัติคำขอ #4
10  AUTH_LOGIN         เข้าสู่ระบบ: admin@mju.ac.th
```

---

## 5. ปัญหาที่เจอระหว่างทำ และวิธีแก้

บันทึกไว้เพราะสองข้อแรกอาการหลอกมาก — ข้อความ error ชี้ไปคนละที่กับต้นเหตุจริง

| เจออะไร | สาเหตุจริง | แก้ยังไง |
|---|---|---|
| Postman ส่ง `"teacherId": "2"` เป็น string ทุกครั้ง แม้ใส่ `num()` แล้ว | body ถูก `json.dumps` **สองชั้น** ตัวคั่นในไฟล์จึงเป็น `\"` ไม่ใช่ `"` — regex ที่ถอดคำพูดจึงไม่ match | ให้ `strip_num_marks()` รองรับทั้ง `"` และ `\"` |
| ข้อ 6.x ตอบ `400 VALIDATION_FAILED` ทั้งที่ body ดูถูก | ใช้ `pm.sendRequest` ใน pre-request script เตรียมข้อมูล — callback ที่ซ้อนกันไม่ถูกรอให้จบ ตัวแปรจึงยังว่าง แล้ว `{{spareRequestId}}` ถูกส่งไปเป็นข้อความดิบ | เปลี่ยนเป็น request จริงสองข้อ (ยื่น + อนุมัติ) ผ่านฟังก์ชัน `prepare_request` |
| `GET /resources/usage` ตอบ `cached plan must not change result type` | เซิร์ฟเวอร์ยังเปิดค้างตอน drop/create schema ใหม่ — prepared statement ที่แคชไว้อ้าง view ตัวเก่า | เลิกใช้ `SELECT *` ไล่ชื่อคอลัมน์ทีละตัวใน `$queryRaw` |
| ข้อ 6.15 คืนเครื่องแล้ว `request.status` ยังเป็น `ALLOCATED` | ใน transaction อัปเดต allocation ก่อนปิดคำขอ ค่าที่ `include` กลับมาจึงเป็นภาพเก่า | สลับลำดับ — ปิดคำขอก่อน แล้วค่อยอัปเดต allocation |
| `nest build` วางไฟล์ไว้ที่ `dist/src/main.js` ไม่ใช่ `dist/main.js` | `prisma/seed.ts` ถูกนับรวมใน tsconfig ทำให้ rootDir เลื่อนขึ้นไปที่รากโปรเจกต์ | ใส่ `"include": ["src/**/*"]` และ exclude `prisma` |

---

## 6. รันซ้ำเองยังไง

```bash
# หน้าต่าง 1
npm run dev

# หน้าต่าง 2 — เลือกอย่างใดอย่างหนึ่ง
npm run test:postman                                              # ชุดเต็ม 96 request
psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql    # กติกาชั้น DB 12 ข้อ
```

อยากล้างกลับไปที่จุดเริ่ม: `npm run db:reset` แล้ว `npm run db:seed`

---

**อ่านต่อ:** [`README.md`](README.md) · [`DATABASE.md`](DATABASE.md) · [`POSTMAN.md`](POSTMAN.md) · [`PROGRESS.md`](PROGRESS.md)
