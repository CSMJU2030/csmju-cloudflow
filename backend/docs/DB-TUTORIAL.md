# DB-TUTORIAL — ฐานข้อมูลทำงานยังไง + สอนใช้ PostgreSQL และ pgAdmin 4

**อัปเดต:** 2026-09-23 · **สำหรับ:** CS-CloudFlow · ฐานข้อมูล `cs_cloudflow`

> ไฟล์นี้สอนตั้งแต่ศูนย์ — ไม่ต้องเคยใช้ PostgreSQL มาก่อน
> ตัวอย่างทุกอันในนี้ **รันจริงกับฐานข้อมูลของโปรเจกต์นี้** ผลที่แสดงคือผลจริง ไม่ได้แต่งขึ้น
> (ผลที่เห็นคือสถานะหลังรัน `npm run db:seed` ใหม่ ๆ — ถ้ายิง Postman ไปแล้วตัวเลขจะมากกว่านี้)
>
> อ่านคู่กับ [`DATABASE.md`](DATABASE.md) (โครงตารางละเอียด) และ [`POSTMAN.md`](POSTMAN.md) (ยิงทดสอบ)

---

# ส่วนที่ 1 · ฐานข้อมูลของเราทำงานยังไง

## 1.1 ใครทำหน้าที่อะไร

```
  ผู้ใช้/Postman                NestJS API                 Prisma            PostgreSQL
  ─────────────                ───────────                ──────            ──────────
  ส่ง HTTP  ───────────────►  ตรวจ token · ตรวจสิทธิ์  ──►  แปลงเป็น SQL ──►  เก็บ/ค้นข้อมูล
                              ตรวจรูปแบบข้อมูล                                 บังคับกติกาซ้ำอีกชั้น
            ◄───────────────  ห่อเป็น JSON          ◄──  แปลงกลับเป็น JS  ◄──  คืนแถวข้อมูล
```

| ชั้น | ทำอะไร | ไฟล์ |
|---|---|---|
| **Guard** | คนเฝ้าประตู — ตรวจว่าใครเป็นใคร มีสิทธิ์ทำอะไร | `src/common/guards/*.ts` |
| **DTO + ValidationPipe** | ตรวจว่าข้อมูลที่ส่งมาหน้าตาถูกไหม | `src/*/dto/*.dto.ts` |
| **Service** | กติกาธุรกิจ — state machine · ความจุ · transaction | `src/*/[ชื่อ].service.ts` |
| **Prisma** | ล่ามแปลภาษา — เราเขียน TypeScript มันแปลเป็น SQL ให้ | `prisma/schema.prisma` |
| **PostgreSQL** | คลังเก็บของ + ยามคนสุดท้าย — บังคับกติกาที่ผิดแล้วข้อมูลพัง | `prisma/migrations/*` |

**ทำไมต้องตรวจสองที่ (API + ฐานข้อมูล)** — เพราะ API ถูก "อ้อม" ได้
ถ้าใครเปิด pgAdmin แล้ว `INSERT` ตรง ๆ หรือรันสคริปต์ import ที่ลืมเช็ก
การตรวจที่ API จะไม่ทำงานเลย กติกาที่ผิดแล้วข้อมูลพังถาวรจึงต้องอยู่ที่ฐานข้อมูลด้วย

## 1.2 เดินตามคำขอหนึ่งใบ ตั้งแต่เกิดจนจบ

สมมติ **ณัฐดนัย** (นักศึกษา) อยากขอเครื่องมาทำโปรเจกต์จบ

### ขั้น 1 · ล็อกอิน → แตะตาราง `users` + `audit_logs`

```
POST /auth/login   {"email":"natdanai@mju.ac.th","password":"Passw0rd!"}
```

1. API ค้น `users` ด้วย `email`
2. เอารหัสผ่านที่ส่งมาไป **เทียบกับ `password_hash`** ด้วย bcrypt
   — ไม่ได้ถอดรหัสกลับ เพราะ hash ถอดกลับไม่ได้ วิธีเทียบคือ hash ใหม่แล้วดูว่าตรงกันไหม
3. สร้าง JWT token ที่ข้างในเขียนว่า `{ sub: 4, role: "STUDENT" }`
4. เขียน 1 แถวลง `audit_logs` ว่า `AUTH_LOGIN`

> **จุดสำคัญ:** ตั้งแต่นี้ไป ทุก request จะบอกว่าตัวเองเป็นใครผ่าน token ไม่ใช่ผ่านตัวเลขใน body
> เพราะตัวเลขใน body ใครก็แก้ได้ แต่ token แก้แล้วลายเซ็นพัง
>
> และเวลาตรวจสิทธิ์จริง `JwtStrategy` จะ **อ่าน role จากฐานข้อมูลใหม่ทุกครั้ง** ไม่เชื่อ role ที่ฝังใน token
> ไม่งั้นคนที่เพิ่งถูกลดสิทธิ์จะยังใช้สิทธิ์เดิมได้จนกว่า token ใบเก่าจะหมดอายุ

### ขั้น 2 · สร้างคำขอ → แตะ `requests`

```
POST /requests   {"teacherId":2,"subjectCode":"CS490","reqCpu":4,...}
```

ก่อนจะได้ลงฐานข้อมูล ข้อมูลต้องผ่าน **4 ด่าน** ตามลำดับ:

| ด่าน | ตรวจอะไร | ผิดแล้วได้ |
|---|---|---|
| 1. ValidationPipe + DTO | รูปแบบถูกไหม · มี field แปลกปลอมไหม | `400 VALIDATION_FAILED` |
| 2. Service | `teacherId` เป็นอาจารย์จริงไหม · วันที่กลับหัวไหม | `400 TEACHER_INVALID` · `400 DATE_RANGE_INVALID` |
| 3. CHECK constraint | `end_date >= start_date` · จำนวนเป็นบวก | `409 DB_RULE_VIOLATION` |
| 4. Trigger | `student_id` มี role STUDENT จริงไหม | `409 DB_RULE_VIOLATION` |

ด่าน 1 ใช้ `forbidNonWhitelisted: true` — ยัดคีย์ที่ DTO ไม่รู้จักมาจะถูกตีตก **พร้อมบอกว่าตัวไหนเกิน**
ไม่ใช่เงียบ ๆ ตัดทิ้ง ซึ่งจะทำให้คนยิงเข้าใจผิดว่าค่านั้นถูกใช้ไปแล้ว

`studentId` **ไม่ได้มาจาก body** — มาจาก token (`@CurrentUser()`) และ `status` ถูกตั้งเป็น `PENDING` โดย server เสมอ
ต่อให้ผู้ใช้ส่ง `"status":"APPROVED"` มาเอง ก็โดนด่าน 1 ตีตกตั้งแต่แรก

### ขั้น 3 · อาจารย์อนุมัติ → อัปเดต `requests` + เขียน `audit_logs`

```
PATCH /requests/1/approve
```

API ค้นคำขอ **พร้อมเงื่อนไข `teacherId = ฉัน`** ในคำสั่งเดียว:

```ts
prisma.request.findFirst({ where: { id: 1, teacherId: actor.id } })
```

ถ้าไม่ใช่คำขอที่ตัวเองรับรอง จะ**หาไม่เจอ** แล้วตอบ `404` — ไม่ใช่ `403`

> **ทำไมต้อง 404** — `403` แปลว่า "ของชิ้นนี้มีอยู่ แต่คุณไม่มีสิทธิ์"
> แค่นั้นก็พอให้คนไม่หวังดีไล่ยิง id ทีละเลขเพื่อดูว่าอันไหนมีจริง
> ตอบ `404` เหมือนกันหมด เขาจึงแยกไม่ออกว่า "ไม่มี" กับ "มีแต่ไม่ใช่ของคุณ"

จากนั้นเช็ก state machine: อนุมัติได้เฉพาะคำขอที่ยัง `PENDING` ถ้าอนุมัติไปแล้วจะได้ `409 STATE_INVALID`
เส้นทางที่อนุญาตทั้งหมดอยู่ที่ตัวแปร `ALLOWED_TRANSITIONS` ใน `src/requests/requests.service.ts` ที่เดียว

### ขั้น 4 · แอดมินจัดสรรเครื่อง → แตะ `allocations` + `requests` + view

```
POST /allocations   {"requestId":1,"resourceId":1,"ipAddress":"10.20.30.99","port":2202}
```

ขั้นนี้ซับซ้อนที่สุด เพราะต้องเช็ก 5 อย่าง:

1. คำขอ `APPROVED` แล้วหรือยัง
2. เครื่องอยู่ในสถานะที่รับงานได้ไหม (ไม่ใช่ `MAINTENANCE`/`OFFLINE`)
3. คำขอต้องการ GPU แต่เครื่องไม่มีหรือเปล่า
4. **ทรัพยากรคงเหลือพอไหม** — รวมของที่ active อยู่แล้วบวกกับที่กำลังจะขอ
5. `port` ชนกับของเดิมบนเครื่องเดียวกันไหม — **ฐานข้อมูลกันให้เอง** ด้วย partial unique index

แล้วสองคำสั่งนี้ต้องสำเร็จหรือล้มไปด้วยกัน จึงห่อไว้ใน **transaction**:

```ts
await prisma.$transaction(async (tx) => {
  await tx.request.update({ ...  data: { status: 'ALLOCATED' } });   // เลื่อนสถานะคำขอ "ก่อน"
  return tx.allocation.create({ ... , include: ALLOCATION_INCLUDE }); // แล้วค่อยสร้างการจัดสรร
});
```

> **ทำไมต้อง transaction** — ถ้าเลื่อนสถานะสำเร็จแต่สร้าง allocation ล้ม
> จะได้คำขอที่ขึ้นว่า "จัดสรรแล้ว" ทั้งที่ไม่มีเครื่องจริง ข้อมูลจะโกหกทันที
> transaction บอกฐานข้อมูลว่า "เอาทั้งคู่ หรือไม่เอาเลย"
>
> **ทำไมต้องอัปเดตคำขอก่อน** — เพราะบรรทัดล่างใช้ `include` ดึงคำขอกลับมาด้วย
> ถ้าสร้าง allocation ก่อน ค่าที่ `include` ได้จะเป็นภาพเก่า (ยังเป็น `APPROVED` อยู่)
> เรื่องนี้ทำให้ชุดทดสอบแดงมาแล้วจริง ๆ ดู [`RUN-LOG.md`](RUN-LOG.md) §5

## 1.3 ทำไม `port` ถึงชนกันไม่ได้ (จุดที่ควรเข้าใจให้ลึก)

วิธีที่คนมักเขียน — และมันมีรูรั่ว:

```ts
const ชน = await prisma.allocation.findFirst({ where: { resourceId, port } });
if (ชน) throw new Error('port ซ้ำ');
await prisma.allocation.create({ ... });     // ← ช่องว่างอยู่ตรงนี้
```

ระหว่างบรรทัดที่ 1 กับบรรทัดสุดท้าย มี **ช่องว่างเวลา** อยู่
ถ้าแอดมิน 2 คนกดพร้อมกัน ทั้งคู่จะเช็กแล้วเจอว่า "ว่าง" แล้วทั้งคู่ก็ `INSERT` สำเร็จ

เราจึงให้ **ฐานข้อมูล** เป็นคนกัน ซึ่งไม่มีช่องว่างให้หลุด:

```sql
CREATE UNIQUE INDEX allocations_active_port_uniq
  ON allocations (resource_id, port)
  WHERE released_at IS NULL;     -- ← กันเฉพาะตอนที่ยังใช้อยู่
```

ท่อน `WHERE` สำคัญมาก ถ้าไม่มี port ที่คืนแล้วจะใช้ซ้ำไม่ได้ตลอดกาล
เติมเข้าไป กติกาจึงกลายเป็น *"ห้ามซ้ำเฉพาะตอนที่ยังไม่คืน"* ซึ่งตรงกับความจริง

ชุดทดสอบ Postman ข้อ 6.8 กับ 6.17 พิสูจน์สองด้านนี้: ซ้ำตอนยังใช้อยู่ → `409` · ซ้ำหลังคืนแล้ว → `201`

## 1.4 ศัพท์ที่ต้องรู้ อธิบายด้วยภาษาคน

| ศัพท์ | คืออะไร | ในโปรเจกต์นี้ |
|---|---|---|
| **Primary Key (PK)** | เลขประจำตัวของแถว ห้ามซ้ำ ห้ามว่าง | `id` ของทุกตาราง |
| **Foreign Key (FK)** | คอลัมน์ที่ชี้ไปหาแถวในอีกตาราง | `requests.student_id` → `users.id` |
| **Index** | สารบัญ — ทำให้ค้นเร็วขึ้น แต่เขียนช้าลงนิดหน่อย | `requests_status_idx` |
| **UNIQUE** | ห้ามค่าซ้ำกันในคอลัมน์นั้น | `users.email` |
| **CHECK** | กติกาที่ตรวจได้จากแถวตัวเองอย่างเดียว | `end_date >= start_date` |
| **Trigger** | โค้ดที่ฐานข้อมูลรันให้อัตโนมัติก่อน/หลังเขียน | ตรวจว่า `student_id` เป็น STUDENT จริง |
| **View** | คำสั่ง SELECT ที่ตั้งชื่อไว้ ไม่ได้เก็บข้อมูลจริง | `resource_usage` |
| **Transaction** | กลุ่มคำสั่งที่ต้องสำเร็จหรือล้มพร้อมกัน | ตอนจัดสรรเครื่อง |
| **Migration** | ไฟล์ SQL ที่บันทึกว่าโครงตารางเปลี่ยนยังไงบ้าง | `prisma/migrations/` |

---

# ส่วนที่ 2 · PostgreSQL เบื้องต้น

## 2.1 โครงสร้างซ้อนกัน 4 ชั้น — ต้องแยกให้ออก

```
PostgreSQL Server (บริการที่รันอยู่บนเครื่อง · port 5432)
└── Database: cs_cloudflow          ← ฐานข้อมูลของเรา
    └── Schema: public              ← กลุ่มของตาราง (เหมือนโฟลเดอร์)
        └── Table: users, requests, ...
            └── Row (แถวข้อมูล)
```

คนใหม่มักสับสนระหว่าง **server** กับ **database** — เครื่องหนึ่งมี server เดียว
แต่ใน server นั้นมีหลาย database ได้ และแต่ละ database ไม่เห็นข้อมูลของกันและกัน

**Role** คือผู้ใช้ของฐานข้อมูล — ของเราใช้ `postgres` ซึ่งเป็น superuser (ทำได้ทุกอย่าง)
บนเครื่องจริงควรสร้าง role แยกที่ทำได้เฉพาะเท่าที่จำเป็น แต่ตอนเรียนใช้ `postgres` ไปก่อนได้

## 2.2 เปิด psql (โปรแกรมพิมพ์คำสั่ง)

> **`psql` ไม่จำเป็นสำหรับการติดตั้งโปรเจกต์** — `npm run db:deploy` สร้างฐานข้อมูลให้เอง
> ส่วนนี้มีไว้สำหรับตอนอยากเข้าไปค้นข้อมูลหรือลองคำสั่ง SQL เอง

**Windows** — วิธีที่ง่ายที่สุดคือค้นหาในเมนู Start ว่า **SQL Shell (psql)** แล้วกด Enter รัวไปเรื่อย ๆ
(ค่า default ถูกอยู่แล้ว) จนถึงช่อง Password ให้พิมพ์ `<PASSWORD>`

ถ้าพิมพ์ `psql` ใน PowerShell แล้วขึ้นว่า **`'psql' is not recognized`** — ไม่ใช่ว่าไม่ได้ติดตั้ง
แต่ตัวติดตั้งของ Windows ไม่ได้ใส่มันลง PATH ให้ หาพาธจริงก่อน (เลขเวอร์ชันอาจเป็น 16, 17 หรือ 18):

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty FullName
```

แล้วเรียกด้วยพาธเต็ม:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d cs_cloudflow
```

หรือใส่ลง PATH ถาวร แล้วเปิด PowerShell ใหม่:

```powershell
$bin = "C:\Program Files\PostgreSQL\17\bin"
$old = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$old;$bin", "User")
```

> ⚠️ อย่าใช้ `$env:Path` เป็นค่าตั้งต้นในคำสั่งข้างบน — `$env:Path` รวม PATH ของเครื่องกับของ user
> เขียนกลับลง `"User"` จะได้สำเนาซ้ำของ PATH ทั้งเครื่องติดมาด้วย

> รหัสผ่านจะไม่ขึ้นตัวอักษรใด ๆ ตอนพิมพ์ — **ไม่ใช่คีย์บอร์ดเสีย** พิมพ์ให้จบแล้วกด Enter

## 2.3 คำสั่งของ psql (ขึ้นต้นด้วย `\` ไม่ต้องมี `;`)

| คำสั่ง | ทำอะไร |
|---|---|
| `\l` | ดูรายชื่อ database ทั้งหมด |
| `\c cs_cloudflow` | สลับไปใช้ database นี้ |
| `\dt` | ดูรายชื่อตาราง |
| `\d requests` | **ดูโครงตาราง** — คอลัมน์ index constraint trigger ครบ |
| `\dv` | ดูรายชื่อ view |
| `\du` | ดูรายชื่อ role |
| `\x` | สลับการแสดงผลเป็นแนวตั้ง (ตารางกว้าง ๆ อ่านง่ายขึ้นมาก) |
| `\q` | ออก |

ลอง `\dt` กับฐานข้อมูลของเรา จะได้แบบนี้จริง ๆ:

```
               List of relations
 Schema |        Name        | Type  |  Owner
--------+--------------------+-------+----------
 public | _prisma_migrations | table | postgres
 public | allocations        | table | postgres
 public | audit_logs         | table | postgres
 public | requests           | table | postgres
 public | resources          | table | postgres
 public | users              | table | postgres
(6 rows)
```

> `_prisma_migrations` คือตารางที่ Prisma ใช้จำว่ารัน migration ไหนไปแล้วบ้าง
> **อย่าไปแก้หรือลบ** ไม่งั้น Prisma จะสับสนว่าโครงฐานข้อมูลอยู่สถานะไหน

`\d requests` จะแสดงทุกอย่างของตาราง รวมถึงส่วนที่สำคัญที่สุดคือท้าย ๆ:

```
Check constraints:
    "requests_date_range_chk" CHECK (end_date >= start_date)
    "requests_reject_reason_chk" CHECK (...)
Foreign-key constraints:
    "requests_student_id_fkey" FOREIGN KEY (student_id) REFERENCES users(id) ...
Triggers:
    requests_enforce_roles BEFORE INSERT OR UPDATE OF student_id, teacher_id ...
```

นี่คือวิธีตรวจว่า migration ลงครบไหม — ถ้าไม่เห็นบรรทัด `Triggers:` แปลว่า
migration `business_constraints` ยังไม่ได้รัน

## 2.4 SQL 5 คำสั่งที่ใช้จริง (ต้องจบด้วย `;`)

### SELECT — อ่านข้อมูล

```sql
-- ดูทั้งตาราง
SELECT * FROM users;

-- เลือกเฉพาะคอลัมน์ที่ต้องการ + กรอง + เรียง + จำกัดจำนวน
SELECT id, full_name, role
FROM users
WHERE role = 'STUDENT'
ORDER BY id
LIMIT 10;
```

### JOIN — เชื่อมตาราง (ใช้บ่อยที่สุดในระบบนี้)

`requests` เก็บแค่ `student_id` เป็นตัวเลข ถ้าอยากเห็น**ชื่อ** ต้อง JOIN ไปหา `users`
และเพราะ `requests` ชี้ไป `users` **สองทาง** (ผู้ขอกับอาจารย์) จึงต้อง JOIN ตารางเดิมสองครั้ง
แล้วตั้งชื่อเล่น (`u` กับ `t`) ให้ต่างกัน:

```sql
SELECT r.id,
       u.full_name AS นักศึกษา,
       t.full_name AS อาจารย์,
       r.subject_code,
       r.status
FROM requests r
JOIN users u ON u.id = r.student_id
JOIN users t ON t.id = r.teacher_id
ORDER BY r.id
LIMIT 5;
```

ผลจริง (หลัง seed ใหม่ ๆ):

```
 id |   นักศึกษา    |    อาจารย์      | subject_code |  status
----+-------------+----------------+--------------+-----------
  1 | ณัฐดนัย ผู้ขอ   | อ.สมชาย ใจดี    | CS401        | ALLOCATED
  2 | ปิยะ นักศึกษา  | อ.วนิดา รักเรียน | CS302        | PENDING
  3 | ณัฐดนัย ผู้ขอ   | อ.วนิดา รักเรียน | CS450        | PENDING
```

### GROUP BY — นับ/สรุป

```sql
SELECT status, count(*) FROM requests GROUP BY status ORDER BY count DESC;
```

```
  status   | count
-----------+-------
 PENDING   |     2
 ALLOCATED |     1
```

### เรียก view — ใช้เหมือนตารางปกติ

```sql
SELECT server_name, total_cpu, used_cpu, free_cpu, active_allocations
FROM resource_usage ORDER BY resource_id;
```

```
 server_name | total_cpu | used_cpu | free_cpu | active_allocations
-------------+-----------+----------+----------+--------------------
 cs-node-01  |        32 |        8 |       24 |                  1
 cs-node-02  |        64 |        0 |       64 |                  0
 cs-node-03  |        16 |        0 |       16 |                  0
 cs-node-04  |        48 |        0 |       48 |                  0
```

`used_cpu` ไม่ได้ถูกเก็บไว้ที่ไหนเลย — มันถูก**คำนวณสด**ทุกครั้งที่เรียก view
จึงไม่มีทางไม่ตรงกับความจริง

### INSERT / UPDATE / DELETE — เขียนข้อมูล

```sql
INSERT INTO resources (server_name, total_cpu, total_ram_gb, total_storage_gb, updated_at)
VALUES ('cs-node-99', 16, 64, 1000, now());

UPDATE resources SET status = 'MAINTENANCE' WHERE server_name = 'cs-node-99';

DELETE FROM resources WHERE server_name = 'cs-node-99';
```

> 🚨 **กฎเหล็กข้อเดียวที่ห้ามลืม**
> `UPDATE` หรือ `DELETE` ที่**ไม่มี `WHERE`** จะทำกับ **ทุกแถวในตาราง** และ **ย้อนกลับไม่ได้**
>
> นิสัยที่ช่วยชีวิต: เขียน `SELECT` ด้วยเงื่อนไขเดียวกันก่อนเสมอ
> ```sql
> SELECT * FROM resources WHERE server_name = 'cs-node-99';   -- ดูก่อนว่าโดนกี่แถว
> DELETE  FROM resources WHERE server_name = 'cs-node-99';    -- ค่อยลบ
> ```

## 2.5 ลองทำให้มันพัง — วิธีที่ดีที่สุดในการเข้าใจ constraint

ลองรันคำสั่งพวกนี้ดู ทุกอันต้อง **error** และ error นั้นคือสิ่งที่เราต้องการ

```sql
-- 1. ให้ ADMIN (id=1) เป็นผู้ขอ
INSERT INTO requests (student_id, teacher_id, subject_code, req_cpu, req_ram_gb,
                      req_storage_gb, reason, start_date, end_date, updated_at)
VALUES (1, 2, 'X', 1, 1, 1, 'ลองดู', CURRENT_DATE, CURRENT_DATE, now());
```
> `ERROR: student_id 1 ต้องเป็นผู้ใช้ที่มี role = STUDENT (พบ: ADMIN)` ← trigger ตีตก

```sql
-- 2. วันสิ้นสุดก่อนวันเริ่ม
INSERT INTO requests (student_id, teacher_id, subject_code, req_cpu, req_ram_gb,
                      req_storage_gb, reason, start_date, end_date, updated_at)
VALUES (4, 2, 'X', 1, 1, 1, 'ลองดู', '2026-12-01', '2026-01-01', now());
```
> `ERROR: ... violates check constraint "requests_date_range_chk"`

```sql
-- 3. แก้ประวัติใน audit_logs
UPDATE audit_logs SET action = 'ไม่มีอะไรเกิดขึ้น' WHERE id = 1;
```
> `ERROR: audit_logs เป็นตารางเขียนอย่างเดียว — ห้ามทำ UPDATE กับตารางนี้`

```sql
-- 4. ลบผู้ใช้ที่ยังมีคำขอค้างอยู่
DELETE FROM users WHERE id = 4;
```
> `ERROR: update or delete on table "users" violates foreign key constraint`

**ทุก error ข้างบนคือฐานข้อมูลกำลังปกป้องข้อมูลของคุณ** ไม่ใช่บั๊ก

> อยากตรวจทั้งชุดรวดเดียว รันไฟล์นี้ได้เลย — 12 ข้อ ห่อด้วย `ROLLBACK` จึงไม่แตะข้อมูลจริง:
> ```
> psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql
> ```

---

# ส่วนที่ 3 · pgAdmin 4

pgAdmin 4 คือหน้าจอกราฟิกสำหรับคุยกับ PostgreSQL — ทำได้ทุกอย่างที่ psql ทำ แต่กดเอาได้

## 3.1 เปิดครั้งแรก — เรื่องรหัสผ่านที่สับสนที่สุด

ครั้งแรกที่เปิด pgAdmin จะถามหา **Master Password** — **ไม่ใช่รหัสของ PostgreSQL**

| รหัสอะไร | ใช้ตอนไหน | ค่าของเรา |
|---|---|---|
| **Master Password** | ปลดล็อก pgAdmin เอง (ตัว pgAdmin ใช้เก็บรหัสอื่น ๆ) | **คุณตั้งเองตอนนี้** จะตั้งเป็นอะไรก็ได้ จำให้ได้ก็พอ |
| **รหัสของ role `postgres`** | ตอน pgAdmin ต่อเข้า PostgreSQL | `<PASSWORD>` |

คนพลาดตรงนี้เยอะมาก — เห็นช่องรหัสผ่านแล้วกรอก `<PASSWORD>` ลงไปที่ Master Password
ซึ่ง "ได้" (เพราะจะตั้งเป็นอะไรก็ได้) แต่ทำให้เข้าใจผิดว่ามันเป็นรหัสเดียวกัน แล้วงงตอนเปลี่ยนรหัส DB ทีหลัง

## 3.2 เชื่อมต่อฐานข้อมูล (Register Server)

ปกติตอนติดตั้ง PostgreSQL บน Windows ตัวติดตั้งจะสร้าง server ให้อยู่แล้ว
ในแถบซ้ายจะเห็น **Servers › PostgreSQL 16** กดแล้วใส่รหัส `<PASSWORD>` ก็ใช้ได้เลย

ถ้าไม่เห็น ให้สร้างเอง: คลิกขวาที่ **Servers** → **Register** → **Server…**

**แท็บ General**

| ช่อง | กรอก |
|---|---|
| Name | `Local PostgreSQL 16` (ชื่ออะไรก็ได้ ไว้ให้ตัวเองดู) |

**แท็บ Connection**

| ช่อง | กรอก |
|---|---|
| Host name/address | `localhost` |
| Port | `5432` |
| Maintenance database | `postgres` |
| Username | `postgres` |
| Password | `<PASSWORD>` |
| Save password? | ✅ ติ๊ก (ไม่งั้นต้องพิมพ์ทุกครั้ง) |

กด **Save**

> ต่อไม่ได้ ขึ้นว่า `could not connect to server` → PostgreSQL ไม่ได้รันอยู่
> เปิด **Services** ของ Windows (กด Win+R พิมพ์ `services.msc`) หา `postgresql-x64-16` แล้วกด Start

## 3.3 หาตารางของเราให้เจอ

กดลงไปทีละชั้นตามนี้ — ลึกกว่าที่คนคาดไว้ คนใหม่มักหลงตรงชั้น Schemas:

```
Servers
└── PostgreSQL 16
    └── Databases
        └── cs_cloudflow          ← ของเรา
            └── Schemas
                └── public
                    ├── Tables    ← users, requests, resources, allocations, audit_logs
                    ├── Views     ← resource_usage
                    ├── Functions ← fn_requests_enforce_roles,
                    │                fn_allocations_enforce_rules,
                    │                fn_audit_logs_append_only
                    └── Types     ← user_role, request_status, resource_status
```

## 3.4 ดูและแก้ข้อมูล

คลิกขวาที่ตาราง → **View/Edit Data** → **All Rows**

จะได้ตารางแบบ Excel แก้ค่าในช่องได้เลย แล้วกด **บันทึก** (ไอคอนแผ่นดิสก์ หรือ `F6`)

> ⚠️ **แก้ตรงนี้คือการอ้อม API ทั้งหมด**
> การตรวจสิทธิ์ · การตรวจ state machine · การเขียน audit log — **ไม่ทำงานเลย**
> แต่ CHECK constraint กับ trigger ยังทำงานอยู่ (นี่คือเหตุผลที่เราวางมันไว้ที่ชั้น DB)
>
> ใช้ตอนเรียนและตอนแก้ข้อมูลทดสอบได้ แต่**อย่าใช้แก้ข้อมูลจริง** — ให้ยิงผ่าน API เสมอ

## 3.5 Query Tool — ที่ที่คุณจะใช้บ่อยที่สุด

คลิกขวาที่ `cs_cloudflow` → **Query Tool** (หรือปุ่มรูปฟ้าผ่า ⚡)

| ปุ่ม/ปุ่มลัด | ทำอะไร |
|---|---|
| **F5** หรือ ▶ | รันคำสั่งทั้งหมดในช่อง |
| **F7** | อธิบายแผนการทำงานของคำสั่ง (Explain) — ดูว่าใช้ index ไหม |
| เลือกข้อความแล้ว **F5** | รันเฉพาะส่วนที่เลือก ← **เทคนิคที่ควรติดเป็นนิสัย** |
| **Download as CSV** | ส่งผลลัพธ์ออกเป็นไฟล์ |

> **เทคนิคที่ป้องกันหายนะ:** เขียนหลายคำสั่งไว้ในช่องเดียวได้ แล้ว**ลากเลือกทีละคำสั่ง**ก่อนกด F5
> ถ้าไม่เลือกอะไรเลย pgAdmin จะรัน**ทั้งหมด** — วันที่มี `DELETE` ปนอยู่ในนั้นจะสายไปแล้ว

ลองคำสั่งนี้ใน Query Tool:

```sql
SELECT r.id, u.full_name, r.subject_code, r.status, a.ip_address, a.port
FROM requests r
JOIN users u ON u.id = r.student_id
LEFT JOIN allocations a ON a.request_id = r.id AND a.released_at IS NULL
ORDER BY r.id;
```

> `LEFT JOIN` ต่างจาก `JOIN` ตรงที่ **เก็บแถวฝั่งซ้ายไว้แม้ไม่มีคู่ทางขวา**
> คำขอที่ยังไม่ได้จัดสรรจึงยังโผล่มา โดย `ip_address` กับ `port` เป็นค่าว่าง
> ถ้าใช้ `JOIN` เฉย ๆ คำขอที่ยังไม่ถูกจัดสรรจะหายไปหมด

## 3.6 สร้าง ER Diagram อัตโนมัติ

pgAdmin วาด ER ให้จากฐานข้อมูลจริงได้ — ใช้ตรวจว่าที่ลงไปตรงกับที่ออกแบบไว้ไหม

คลิกขวาที่ `cs_cloudflow` → **ERD For Database**

จะได้แผนภาพ 5 ตารางพร้อมเส้นความสัมพันธ์ ลากจัดตำแหน่งได้ และ **Download Image** เป็นรูปเก็บไว้ได้
(เอาไปใส่รายงานได้เลย)

## 3.7 สำรองและกู้คืนข้อมูล

**สำรอง** — คลิกขวาที่ `cs_cloudflow` → **Backup…**

| ช่อง | เลือก |
|---|---|
| Filename | `cs_cloudflow_2026-09-23.backup` |
| Format | `Custom` (ยืดหยุ่นที่สุดตอนกู้คืน) |

**กู้คืน** — คลิกขวาที่ database → **Restore…** แล้วเลือกไฟล์นั้น

> ทำ backup ก่อนทุกครั้งที่จะรัน `npm run db:reset` หรือก่อนลองอะไรที่ไม่แน่ใจ
> `db:reset` **ลบข้อมูลทั้งหมด** แล้วสร้างตารางใหม่จาก migration

## 3.8 ปุ่มที่ไม่ควรกดเล่น

| อย่ากด | เพราะ |
|---|---|
| **Delete/Drop** ที่ database หรือ table | ลบทั้งก้อน ไม่มีถังขยะ ไม่มี undo |
| **Truncate** | ลบทุกแถวในตาราง เร็วและย้อนไม่ได้ |
| แก้โครงตารางผ่าน **Properties** | Prisma จะไม่รู้ว่าคุณแก้ — ครั้งหน้าที่รัน migrate มันจะพยายามแก้กลับ |

> **กฎสำหรับโปรเจกต์นี้:** เปลี่ยนโครงตารางที่ `prisma/schema.prisma` เท่านั้น
> แล้วรัน `npx prisma migrate dev --name ชื่อที่สื่อความหมาย`
> pgAdmin ใช้ **ดู · ค้น · ทดสอบ SQL · backup** — ไม่ใช่ที่สำหรับแก้โครงสร้าง
>
> อีกเรื่องที่ควรรู้: ถ้าสร้าง schema ใหม่ขณะที่เซิร์ฟเวอร์ NestJS ยังเปิดค้างอยู่
> จะเจอ `cached plan must not change result type` — ให้ปิดแล้วเปิดเซิร์ฟเวอร์ใหม่

---

# ส่วนที่ 4 · แบบฝึกหัด

ลองทำใน Query Tool ของ pgAdmin เฉลยอยู่ท้ายไฟล์

1. หาว่ามีนักศึกษากี่คนในระบบ
2. แสดงคำขอที่สถานะเป็น `PENDING` พร้อมชื่อผู้ขอ
3. หาเครื่องที่มี GPU และยังว่างอยู่ (`status = 'AVAILABLE'`)
4. นับว่าอาจารย์แต่ละคนรับรองคำขอไปกี่ใบ
5. หาคำขอที่ถูกจัดสรรแล้ว พร้อม IP และ port ที่ได้
6. ดู audit log 5 รายการล่าสุด พร้อมชื่อคนทำ
7. **โจทย์พิเศษ:** ลบเครื่องทดสอบที่ชื่อขึ้นต้นด้วย `cs-test-` ซึ่งเกิดจากการรัน Postman หลายรอบ
   (ระวัง — ต้องไม่ลบเครื่องที่มีการจัดสรรอยู่)

<details>
<summary><b>เฉลย</b> (ลองเองก่อนนะครับ)</summary>

```sql
-- 1
SELECT count(*) FROM users WHERE role = 'STUDENT';

-- 2
SELECT r.id, u.full_name, r.subject_code, r.start_date, r.end_date
FROM requests r JOIN users u ON u.id = r.student_id
WHERE r.status = 'PENDING' ORDER BY r.id;

-- 3
SELECT server_name, total_cpu, total_ram_gb FROM resources
WHERE has_gpu = true AND status = 'AVAILABLE';

-- 4
SELECT t.full_name AS อาจารย์, count(*) AS จำนวนคำขอ
FROM requests r JOIN users t ON t.id = r.teacher_id
GROUP BY t.full_name ORDER BY จำนวนคำขอ DESC;

-- 5
SELECT r.id, u.full_name, res.server_name, a.ip_address, a.port
FROM allocations a
JOIN requests r  ON r.id = a.request_id
JOIN users u     ON u.id = r.student_id
JOIN resources res ON res.id = a.resource_id
WHERE a.released_at IS NULL;

-- 6
SELECT l.created_at, COALESCE(u.full_name, '(ระบบ)') AS ใคร, l.action, l.details
FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
ORDER BY l.id DESC LIMIT 5;

-- 7  ดูก่อนเสมอว่าจะโดนกี่แถว
SELECT id, server_name FROM resources
WHERE server_name LIKE 'cs-test-%'
  AND id NOT IN (SELECT resource_id FROM allocations);

-- ตรงกับที่ตั้งใจแล้วค่อยลบ
DELETE FROM resources
WHERE server_name LIKE 'cs-test-%'
  AND id NOT IN (SELECT resource_id FROM allocations);
```

ข้อ 7 มีสองจุดที่ตั้งใจให้เจอ: `LIKE 'cs-test-%'` (`%` แทนอะไรก็ได้)
และเงื่อนไข `NOT IN` ที่กันไม่ให้ลบเครื่องที่มีประวัติการจัดสรร
ซึ่งถ้าลืมใส่ ฐานข้อมูลจะปฏิเสธเองด้วย FK `RESTRICT` อยู่ดี — แต่การพึ่งให้ error เตือน
ต่างจากการเขียนเงื่อนไขให้ถูกตั้งแต่แรก

> เครื่องชื่อ `cs-test-*` เกิดจากข้อ 4.3 ของชุดทดสอบ Postman ซึ่งโฟลเดอร์ 8 ลบทิ้งให้อยู่แล้ว
> ถ้ายังเหลือค้างอยู่ แปลว่ารันชุดทดสอบไม่จบ — และตัวที่เคยถูกจัดสรรไปแล้วจะลบไม่ได้
> (แม้จะคืนเครื่องแล้วก็ยังนับเป็นประวัติ) ทางที่ควรทำกว่าคือ
> `UPDATE resources SET status='OFFLINE'` แทนการลบ

</details>

---

# ภาคผนวก · โพยคำสั่งที่ใช้บ่อย

| อยากทำอะไร | psql | pgAdmin |
|---|---|---|
| ดูรายชื่อตาราง | `\dt` | Schemas › public › Tables |
| ดูโครงตาราง | `\d ชื่อตาราง` | คลิกขวา → Properties |
| ดูข้อมูลในตาราง | `SELECT * FROM t;` | คลิกขวา → View/Edit Data |
| รัน SQL | พิมพ์แล้วจบด้วย `;` | Query Tool → F5 |
| ดู ER Diagram | — | คลิกขวาที่ DB → ERD For Database |
| สำรองข้อมูล | `pg_dump` | คลิกขวาที่ DB → Backup |
| ออก | `\q` | ปิดโปรแกรม |

| งานฝั่งโปรเจกต์ | คำสั่ง |
|---|---|
| แก้โครงตาราง | แก้ `prisma/schema.prisma` → `npx prisma migrate dev --name ชื่อ` |
| รัน migration ที่มีอยู่ | `npm run db:deploy` |
| ล้างแล้วเริ่มใหม่ | `npm run db:reset` (⚠️ ข้อมูลหายหมด) |
| ใส่ข้อมูลตั้งต้น | `npm run db:seed` |
| เปิด GUI ของ Prisma | `npm run db:studio` |
| ตรวจกติกาชั้น DB | `psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql` |

---

**อ่านต่อ:** [`README.md`](README.md) · [`DATABASE.md`](DATABASE.md) · [`POSTMAN.md`](POSTMAN.md) · [`RUN-LOG.md`](RUN-LOG.md) · [`PROGRESS.md`](PROGRESS.md)
