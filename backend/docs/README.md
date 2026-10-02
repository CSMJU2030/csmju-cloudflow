# เอกสารของ CS-CloudFlow เวอร์ชันก่อนย้ายเข้ามาตรฐาน CSMJU2030

ไฟล์ในโฟลเดอร์นี้เขียนตอนระบบยังมี login · ตาราง `users` · JWT ของตัวเอง และ id เป็นตัวเลข —
เก็บไว้เป็นประวัติการออกแบบ (กติกาฐานข้อมูล · state machine ของคำขอ · การจัดสรรเครื่อง) ซึ่งยังใช้อยู่

สิ่งที่เปลี่ยนแล้วและเอกสารเหล่านี้ยังไม่ได้แก้:

- ผู้ใช้ login ที่ Core Hub (SSO) — ไม่มี `POST /auth/login` · `/auth/register` · `/users` แล้ว
- endpoint อยู่ใต้ `/api/v1` · id เป็น UUID · คำตอบอยู่ใน envelope `{ success, data, meta }`
- `subject_code` → `course_code` (รหัสรายวิชาของ Core Hub) · `req_gpu` → `is_gpu_required`
- role: STUDENT · TEACHER · STAFF · ADMIN ตาม core role (ดู `../src/auth/role-mapping.ts`)

วิธีรันและ API ปัจจุบัน ดู [`../README.md`](../README.md)
