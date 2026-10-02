# PROGRESS — บันทึกความคืบหน้า CS-CloudFlow

> ไฟล์นี้อัปเดตทุกครั้งที่มีงานคืบ — ใครมาอ่านทีหลังจะได้รู้ว่าทำอะไรไปแล้ว และเหลืออะไร

---

## 2026-09-23 · รอบที่ 2 — เขียนใหม่ทั้งชุดด้วย NestJS

**ขอบเขต:** แปลง ER Diagram เป็น Prisma schema สำหรับ PostgreSQL · REST API บน NestJS · ชุดทดสอบ Postman

**ทำไมเขียนใหม่:** รอบที่ 1 เป็น Express และอยู่ในเครื่องชั่วคราวที่ถูกล้างไปแล้ว
รอบนี้ย้ายมาเป็น NestJS ตามที่ต้องการ และวางไฟล์ไว้บนเครื่องจริงเพื่อไม่ให้หายอีก

### ทำอะไรไปแล้ว

| # | งาน | สถานะ |
|---|---|---|
| 1 | แปลง ER → `prisma/schema.prisma` (5 model · 3 enum) | ✅ |
| 2 | Migration `init` — ตาราง · FK · index | ✅ |
| 3 | Migration `business_constraints` — CHECK 8 · trigger 3 · partial index 2 · view 1 | ✅ |
| 4 | `prisma/seed.ts` — ผู้ใช้ 6 · เครื่อง 4 · คำขอ 3 · จัดสรร 1 (รันซ้ำได้) | ✅ |
| 5 | NestJS API 9 module · 29 endpoint | ✅ |
| 6 | JWT auth + RolesGuard ปิดทั้งแอปเป็นค่าเริ่มต้น | ✅ |
| 7 | Error filter รวมศูนย์ — ทุก error รูปแบบเดียวกัน | ✅ |
| 8 | Swagger ที่ `/docs` | ✅ |
| 9 | Postman collection + environment (สร้างด้วยสคริปต์) | ✅ 96 request |
| 10 | `scripts/db-rules-check.sql` — ตรวจกติกาชั้น DB 12 ข้อ | ✅ |
| 11 | รันจริง: migrate + seed + newman + SQL ตรง | ✅ 167 assertion · 0 แดง |
| 12 | เอกสาร `README` · `DATABASE` · `POSTMAN` · `RUN-LOG` · `PROGRESS` | ✅ |

### โครงไฟล์

```
CS-CloudFlow/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       ├── 20260923050743_init/
│       └── 20260923051000_business_constraints/
├── src/
│   ├── main.ts · app.module.ts
│   ├── common/{decorators,guards,filters,dto}
│   ├── prisma/ · audit/
│   ├── auth/ · users/ · resources/ · requests/ · allocations/ · audit-logs/ · health/
├── postman/
│   ├── build-collection.py          ← แก้ที่นี่ แล้ว generate ใหม่
│   ├── CS-CloudFlow.postman_collection.json
│   └── CS-CloudFlow.postman_environment.json
├── scripts/db-rules-check.sql
├── README.md · DATABASE.md · POSTMAN.md · RUN-LOG.md · PROGRESS.md
└── .env.example                     ← คัดลอกเป็น .env (ห้าม commit .env)
```

### การตัดสินใจที่ควรรู้

| ตัดสินใจอะไร | ทำไม |
|---|---|
| ไม่เก็บ "ทรัพยากรที่ใช้ไป" ในตาราง `resources` | เก็บทั้ง total และ used ไว้คู่กัน วันหนึ่งมันจะไม่ตรงกัน — ใช้ view `resource_usage` คำนวณสดแทน |
| เพิ่ม `released_at` ใน `allocations` | ทำให้รู้ว่า port ยังถูกใช้อยู่ไหม โดยไม่ต้องลบแถวทิ้ง (ซึ่งจะทำให้ประวัติหาย) |
| กัน port ชนด้วย partial unique index ไม่ใช่โค้ด | `SELECT` แล้วค่อย `INSERT` มีช่องว่างระหว่างกลาง ที่คำขอสองใบพร้อมกันหลุดผ่านได้ทั้งคู่ |
| บังคับ role ด้วย trigger ไม่ใช่ CHECK | `CHECK` อ่านได้แค่แถวตัวเอง อ่าน role จากตาราง `users` ไม่ได้ |
| `audit_logs` ห้าม UPDATE/DELETE | บันทึกที่แก้ย้อนหลังได้ ไม่ใช่บันทึกการตรวจสอบ |
| ของคนอื่นตอบ `404` ไม่ใช่ `403` | `403` บอกใบ้ว่า id นั้นมีอยู่จริง ซึ่งพอให้ไล่ยิงหาได้ |
| ใช้ชนิด `inet` แทน `varchar` สำหรับ IP | ฐานข้อมูลตรวจรูปแบบให้เอง ไม่ต้องหวังพึ่งโค้ดอย่างเดียว |
| ใส่ `JwtAuthGuard` + `RolesGuard` เป็น `APP_GUARD` ทั้งแอป | ปิดทั้งหมดก่อนแล้วค่อยเปิดเฉพาะจุดด้วย `@Public()` — ปลอดภัยกว่าไล่ใส่ guard ทีละ controller ซึ่งลืมได้ |
| `JwtStrategy` อ่าน role จาก DB ใหม่ทุกครั้ง | ถ้าเชื่อ role ที่ฝังใน token คนที่ถูกลดสิทธิ์จะยังใช้สิทธิ์เดิมได้จนกว่า token เดิมจะหมดอายุ |
| `forbidNonWhitelisted: true` ใน ValidationPipe | ยัดคีย์เกินมาแล้วถูกตีตกพร้อมบอกว่าตัวไหนเกิน ดีกว่าเงียบ ๆ ตัดทิ้งซึ่งทำให้เข้าใจผิดว่าค่าถูกใช้ |
| เทียบ bcrypt เสมอแม้ไม่พบผู้ใช้ตอน login | ถ้าตอบเร็วกว่าตอนอีเมลไม่มีอยู่ จะใช้จับได้ว่าอีเมลไหนมีบัญชีจริง |
| `AuditService.log()` รับ `tx` ได้ | ให้บันทึกอยู่ใน transaction เดียวกับงานจริง — งาน rollback แล้ว log ต้องหายด้วย ไม่งั้น log จะเล่าเรื่องที่ไม่เคยเกิด |

### ปัญหาที่เจอระหว่างทำ

สรุปสั้น ๆ — รายละเอียดเต็มพร้อมข้อความ error อยู่ใน [`RUN-LOG.md`](RUN-LOG.md) §5

1. `num()` ใน Postman builder ไม่ทำงาน เพราะ body ถูก `json.dumps` สองชั้น (ตัวคั่นเป็น `\"`)
2. `pm.sendRequest` ใน pre-request script — callback ที่ซ้อนกันไม่ถูกรอให้จบ เปลี่ยนเป็น request จริงแทน
3. `SELECT *` บน view พังเมื่อ schema ถูกสร้างใหม่ขณะเซิร์ฟเวอร์ยังเปิด — ไล่ชื่อคอลัมน์แทน
4. ลำดับใน transaction: ต้องอัปเดตตารางแม่ก่อน แล้วค่อยอ่านผ่าน `include` ไม่งั้นได้ภาพเก่า
5. `nest build` วางไฟล์ผิดที่เพราะ `prisma/seed.ts` ถูกนับรวมใน tsconfig

---

## เหลืออะไรต่อ

| งาน | หมายเหตุ |
|---|---|
| หน้าเว็บฝั่ง client | ยังไม่เริ่ม — API พร้อมให้เรียกแล้ว ดู `/docs` |
| งานอัตโนมัติเปลี่ยนคำขอที่เลยกำหนดเป็น `EXPIRED` | ตอนนี้เปลี่ยนตอน ADMIN กดคืนเครื่องเท่านั้น คำขอที่เลย `end_date` แล้วยังค้างเป็น `ALLOCATED` |
| อีเมลแจ้งเตือนตอนคำขอถูกอนุมัติ/ปฏิเสธ | ยังไม่มี |
| rate limit ที่ `/auth/login` | ตอนนี้ยิงเดารหัสผ่านได้ไม่จำกัดจำนวนครั้ง — `@nestjs/throttler` |
| refresh token | ตอนนี้ token อายุ 8 ชม. หมดแล้วต้องล็อกอินใหม่ |
| unit test ฝั่งโค้ด | ตอนนี้ทดสอบผ่าน Postman อย่างเดียว ซึ่งครอบพฤติกรรมแต่ไม่ครอบ edge case ในฟังก์ชันย่อย |
| เปลี่ยน `JWT_SECRET` เป็นค่าสุ่มจริงก่อนขึ้นเครื่องจริง | `.env.example` เขียนวิธีสุ่มไว้แล้ว |

---

## ห้ามทำ

1. ❌ **ห้าม commit `.env`** — มีรหัสผ่านฐานข้อมูลและ `JWT_SECRET` อยู่ข้างใน (อยู่ใน `.gitignore` แล้ว)
2. ❌ **ห้ามแก้ไฟล์ migration ที่รันไปแล้ว** — ให้สร้าง migration ใหม่ทับแทน
   ไม่งั้นเครื่องของคนอื่นที่รันไปแล้วจะไม่ตรงกับของคุณ
3. ❌ **ห้ามแก้ JSON ของ Postman ตรง ๆ** — แก้ที่ `postman/build-collection.py` แล้ว generate ใหม่
4. ❌ **ห้ามเปลี่ยน `HOST` เป็น `0.0.0.0`** — คนในวงเน็ตเดียวกันจะยิงถึงทันที
5. ❌ **ห้ามย้าย validation ที่ชั้น DB ออกไปไว้ที่โค้ดอย่างเดียว** — `psql` และ Prisma Studio ข้าม API ได้
