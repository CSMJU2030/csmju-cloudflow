# POSTMAN — ชุดทดสอบ API ของ CS-CloudFlow

**อัปเดต:** 2026-09-23 · **96 request · 167 assertion · รันจริงผ่านหมด**

ไฟล์อยู่ในโฟลเดอร์ `postman/`:

| ไฟล์ | คืออะไร |
|---|---|
| `CS-CloudFlow.postman_collection.json` | ชุดทดสอบ — import เข้า Postman ได้เลย |
| `CS-CloudFlow.postman_environment.json` | ตัวแปรสภาพแวดล้อม (`baseUrl`, `defaultPassword`) |
| `build-collection.py` | **ตัวสร้างไฟล์สองอันข้างบน — แก้ที่นี่เท่านั้น** |

---

## 1. ยิงทดสอบยังไง

### เตรียมก่อน

```bash
npm run db:seed      # ให้มีข้อมูลตั้งต้น
npm run dev          # เปิดเซิร์ฟเวอร์ที่ http://127.0.0.1:4000
```

### แบบที่ 1 — ใช้หน้าจอ Postman

1. เปิด Postman → **Import** → ลากไฟล์ทั้งสองเข้าไป
2. มุมขวาบน เลือก environment **`CS-CloudFlow (local)`**
3. กด **Run collection** → **Run CS-CloudFlow API**

> ⚠️ **ต้องรันเรียงตามลำดับ** ข้อหลังใช้ค่าที่ข้อก่อนหน้าเก็บไว้ (token, id ต่าง ๆ)
> ยิงข้อเดี่ยว ๆ กลางคันจะพัง เพราะ token ยังว่างอยู่

### แบบที่ 2 — รันจากบรรทัดคำสั่ง

```bash
npm install -g newman      # ครั้งแรกครั้งเดียว
npm run test:postman
```

ผลที่ควรได้:

```
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │                96 │                0 │
│              assertions │               167 │                0 │
└─────────────────────────┴───────────────────┴──────────────────┘
```

ชุดทดสอบ **รันซ้ำได้ไม่จำกัด** — สุ่ม port และ timestamp ใหม่ทุกครั้ง
และโฟลเดอร์ 8 เก็บกวาดของที่สร้างระหว่างทางทิ้งให้

---

## 2. ในชุดทดสอบมีอะไรบ้าง

| โฟลเดอร์ | จำนวน | ครอบอะไร |
|---|---|---|
| **1 · Health** | 1 | เซิร์ฟเวอร์และฐานข้อมูลพร้อมไหม |
| **2 · Auth** | 16 | login ทุก role · สมัคร · เปลี่ยนรหัสผ่าน · token หาย/ผิด/หมดอายุ |
| **3 · Users** | 11 | สิทธิ์ ADMIN · กฎ studentCode ตาม role · ลบตัวเองไม่ได้ |
| **4 · Resources** | 9 | CRUD เครื่อง · view ทรัพยากรคงเหลือ · ชื่อซ้ำ · ค่าติดลบ |
| **5 · Requests** | 25 | ยื่น → แก้ → อนุมัติ/ปฏิเสธ/ยกเลิก · IDOR · ยัดฟิลด์เกิน |
| **6 · Allocations** | 24 | จัดสรร · port ชน · GPU · ความจุเต็ม · คืนเครื่อง · ใช้ port ซ้ำ |
| **7 · Audit logs** | 5 | อ่านได้เฉพาะ ADMIN · กรองตาม action |
| **8 · เก็บกวาด** | 5 | คืนเครื่อง ลบของทดสอบ แล้วตรวจว่าทรัพยากรไม่ติดลบ |

---

## 3. ข้อที่ควรดูเป็นพิเศษ

ข้อเหล่านี้ไม่ได้ทดสอบว่า "ทำงานได้" แต่ทดสอบว่า **"ทำสิ่งที่ไม่ควรทำได้ไม่ได้จริง"**

| ข้อ | ทดสอบอะไร | ผลที่ต้องได้ |
|---|---|---|
| 2.6 / 2.7 | รหัสผ่านผิด กับ อีเมลไม่มีในระบบ | ตอบ **ข้อความเดียวกัน** — ไม่งั้นใช้ไล่หาได้ว่าอีเมลไหนมีบัญชี |
| 2.12 / 2.13 | ไม่ใส่ token กับ ใส่ token มั่ว | `TOKEN_MISSING` · `TOKEN_INVALID` — แยกกันเพื่อ debug ง่าย |
| 5.2 | ยัด `studentId` + `status` มาใน body | **400** พร้อมบอกว่าคีย์ไหนเกิน ไม่ใช่เงียบ ๆ ตัดทิ้ง |
| 5.9 | นักศึกษาอีกคนเปิดคำขอของเรา | **404 ไม่ใช่ 403** — 403 บอกใบ้ว่า id นั้นมีอยู่จริง |
| 5.11 | อาจารย์คนที่ไม่ได้ถูกระบุ กดอนุมัติ | **404** ด้วยเหตุผลเดียวกัน |
| 5.15 | แก้คำขอหลังอนุมัติแล้ว | **409 STATE_INVALID** |
| 6.8 | port ชนขณะยังใช้อยู่ | **409** — กันด้วย partial unique index ที่ชั้น DB |
| 6.17 | ใช้ port เดิมซ้ำ**หลัง**คืนเครื่อง | **201** — พิสูจน์ว่าห้ามซ้ำเฉพาะตอนที่ยังใช้อยู่ |
| 6.11c | ขอทรัพยากรเกินความจุเครื่อง | **409 CAPACITY_EXCEEDED** |
| 6.15 | คืนเครื่อง | แถวยังอยู่ (ไม่ถูกลบ) · คำขอเลื่อนเป็น `EXPIRED` |
| 8.5 | หลังรันทั้งชุด | ไม่มีเครื่องไหน `free_*` ติดลบ |

---

## 4. รูปแบบ error ที่ API ตอบ

ทุก error ออกทางเดียวกัน ฝั่งที่เรียกจึงเขียนโค้ดอ่านแบบเดียวพอ:

```json
{
  "error": {
    "code": "STATE_INVALID",
    "message": "อนุมัติไม่ได้: คำขออยู่ในสถานะ APPROVED",
    "details": { "from": "APPROVED", "to": "APPROVED", "allowedNext": ["ALLOCATED", "CANCELLED"] }
  },
  "path": "/requests/7/approve",
  "timestamp": "2026-09-23T05:25:30.000Z"
}
```

| code | HTTP | เกิดเมื่อ |
|---|---|---|
| `TOKEN_MISSING` / `TOKEN_INVALID` | 401 | ไม่ได้แนบ token / token ผิดหรือหมดอายุ |
| `CREDENTIALS_INVALID` | 401 | อีเมลหรือรหัสผ่านไม่ถูกต้อง |
| `ROLE_FORBIDDEN` | 403 | role ไม่มีสิทธิ์เรียก endpoint นี้ |
| `NOT_FOUND` | 404 | ไม่พบ — หรือมีอยู่แต่ไม่ใช่ของคุณ (จงใจตอบเหมือนกัน) |
| `VALIDATION_FAILED` | 400 | ข้อมูลใน body/query ไม่ผ่าน DTO — `details` บอกทีละฟิลด์ |
| `DATE_RANGE_INVALID` | 400 | `endDate` มาก่อน `startDate` |
| `TEACHER_INVALID` | 400 | `teacherId` ไม่ใช่ผู้ใช้ที่มี role TEACHER |
| `STUDENT_CODE_REQUIRED` / `_NOT_ALLOWED` | 400 | `studentCode` ไม่ตรงกับ role |
| `STATE_INVALID` | 409 | เปลี่ยนสถานะนอกเส้นทางที่อนุญาต |
| `DUPLICATE` | 409 | ค่าซ้ำกับที่มีอยู่ (อีเมล · ชื่อเครื่อง · port ที่ยังใช้อยู่) |
| `FK_VIOLATION` | 409 | อ้างของที่ไม่มี หรือลบของที่ยังมีคนอ้างถึง |
| `RESOURCE_UNAVAILABLE` | 409 | เครื่องอยู่ในสถานะ MAINTENANCE / OFFLINE |
| `GPU_REQUIRED` | 409 | คำขอต้องใช้ GPU แต่เครื่องไม่มี |
| `CAPACITY_EXCEEDED` | 409 | ทรัพยากรที่เหลือบนเครื่องไม่พอ |
| `ALREADY_RELEASED` | 409 | คืนเครื่องรายการที่คืนไปแล้ว |
| `RESOURCE_IN_USE` | 409 | ลบเครื่องที่เคยถูกจัดสรร — ให้เปลี่ยนเป็น OFFLINE แทน |
| `SELF_DELETE` | 409 | ลบบัญชีตัวเอง |
| `DB_RULE_VIOLATION` | 409 | trigger หรือ CHECK ที่ชั้นฐานข้อมูลตีตก |

---

## 5. ตัวแปรในชุดทดสอบ

| ตัวแปร | มาจากไหน |
|---|---|
| `baseUrl` | environment — แก้ตรงนี้ถ้าเปลี่ยนพอร์ต |
| `defaultPassword` | environment — `Passw0rd!` |
| `adminToken` · `teacherToken` · `studentToken` · ... | โฟลเดอร์ 2 เก็บให้อัตโนมัติหลัง login |
| `gpuResourceId` · `plainResourceId` · `maintResourceId` | ข้อ 4.1 คัดจากรายการเครื่องจริง ไม่ได้ hardcode |
| `approveRequestId` · `rejectRequestId` · ... | โฟลเดอร์ 5 สร้างระหว่างทาง |
| `allocPort` · `gpuPort` | สุ่มใหม่ทุกครั้งที่รัน เพื่อไม่ให้ชนของเดิม |
| `badToken` | `aaaa.bbbb.cccc` — **ต้องเป็น ASCII** เพราะ HTTP header ภาษาไทยส่งไม่ได้ |

---

## 6. อยากแก้ชุดทดสอบ

**แก้ที่ `postman/build-collection.py` เท่านั้น** แล้วรัน:

```bash
npm run postman:build
```

ห้ามแก้ JSON ตรง ๆ เพราะรอบหน้าที่ generate จะถูกเขียนทับหมด

### เรื่องที่พลาดง่าย 2 ข้อ

**1. ตัวเลขที่เป็นตัวแปร ต้องใช้ `num()`**

`json.dumps` ครอบเครื่องหมายคำพูดให้ทุกค่า จะได้ `{"teacherId": "2"}` ซึ่ง NestJS อ่านเป็น string
แล้วตีตกที่ `@IsInt`

```python
body = { "teacherId": num("teacherId") }     # ได้ {"teacherId": {{teacherId}}}  ← ถูก
body = { "teacherId": "{{teacherId}}" }      # ได้ {"teacherId": "{{teacherId}}"} ← ผิด
```

**2. อย่าใช้ `pm.sendRequest` ใน pre-request script เพื่อเตรียมข้อมูล**

callback ที่ซ้อนกันไม่ถูกรอให้จบ ตัวแปรจึงยังว่างตอนข้อถัดไปยิง — เจอมาแล้ว และหาสาเหตุนานด้วย
เพราะอาการที่เห็นคือ `400 VALIDATION_FAILED` ซึ่งดูเหมือนปัญหาที่ DTO

วิธีที่ถูกคือทำเป็น **request จริงเพิ่มอีกข้อ** (ดูฟังก์ชัน `prepare_request` ในไฟล์ builder)

---

**อ่านต่อ:** [`README.md`](README.md) · [`DATABASE.md`](DATABASE.md) · [`RUN-LOG.md`](RUN-LOG.md)
