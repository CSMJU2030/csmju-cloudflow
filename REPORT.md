# REPORT — csmju-cloudflow

branch `feature/cloudflow/bump-standards-v1-7-0` · standards **1.7.0** · ตรวจเมื่อ 2 ต.ค. 2569 กับ Core Hub จริง (`https://csmju2030.jowave.com`)

## ผลรัน

```
./standards/scripts/run-all-checks.sh .
  ✅ PASS  Security & Stack Scan       check-backend-nestjs.sh
  ✅ PASS  API Contract Sync           check-openapi-sync.sh        (API-01 ข้าม: ยังไม่มี generate:openapi)
  ✅ PASS  API Contract Sync           check-api-conventions.sh
  ✅ PASS  Data Dictionary Compliance  check-field-aliases.sh
  ✅ PASS  Data Dictionary Compliance  check-snake-case.sh
  ✅ PASS  Data Dictionary Compliance  check-no-hardcoded-faculty.sh
  ✅ PASS  Data Dictionary Compliance  check-money-fields.sh
  ✅ PASS  UI Token Compliance         check-ui-tokens.sh
  ✅ PASS  Code Quality                check-qa.sh                  (lint · typecheck · test · build รันจริง)
  ✅ PASS  Exception Validation        check-exceptions.sh
✅ All 19 checks passed.
```

```
CONFORMANCE_ACCOUNTS_FILE=~/.csmju/conformance-accounts.json node standards/conformance/run.js
  PASS  L2-12      role "guest" cannot write → 403
  PASS  L2-13      denied write uses FORBIDDEN
  PASS  L2-14      unknown route → 404 with an error envelope
  PASS  L2-15      every returned error code is part of the standard enum
── L3 · SSO — registration
  FAIL  L3-01      subsystem is registered in the Subsystem Registry
            → "csmju-cloudflow" not found (บัญชีเจ้าของยังไม่ได้ลงทะเบียนระบบ)
RESULT: 49 passed · 1 failed · 0 skipped · 0 warnings · retries: 0
```

- **L1 + L2: 49/49 ผ่าน** (`--level L2` → `✅ CONFORMANT — csmju-cloudflow meets standard v1.2 L2`) ทั้งยิง backend ตรง (:4208) และผ่าน proxy ของ frontend (:3208)
- **L3 หยุดที่ L3-01** เพราะยังไม่ได้ลงทะเบียน `csmju-cloudflow` ใน Core Hub — เป็นงานของ PL (agent ทำแทนไม่ได้ · ai/AGENTS.md ขั้น 5)
  พฤติกรรม SSO ของ L3 (state · callback 3 แบบ · คุกกี้ · open redirect · logout) ทดสอบแล้วใน `backend/test/app.e2e.spec.ts`
- `pnpm -r test` → 38 tests ผ่าน · `prisma migrate diff` → No difference detected (ทั้งฐานเปล่าและฐานที่มีข้อมูลเดิม)
- log ของ backend หลังยิงทุกเคส: `grep -iE "eyJ|access_token=|authorization:|cookie:"` ไม่พบ

## ไฟล์ที่สร้าง/แก้ไข

commit แยก 3 ชุด

1. `chore(cloudflow): bump standards to v1.7.0` — `.standards-version` + submodule `standards` (ตาม standards-versioning.md ข้อ 2.2)
2. `feat(cloudflow): integrate cloudflow module with PM repository structure` — ย้ายโมดูลเดิมเข้า `backend/` `frontend/` โดยไม่แตะไฟล์ PM
3. `feat(cloudflow): integrate cloudflow module with core hub` — งานด้านล่าง

| path | ทำอะไร |
|---|---|
| `package.json` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` | pnpm 12.3.4 · `allowBuilds` ของ pnpm 12 · script รวมที่ราก (**ไฟล์ PM**) |
| `subsystem.yaml` · `.env.example` | base_url :3208 · `core_hub_web_url` · `public_endpoints` ของ `/auth/*` · probes ของ `/api/v1/resources` (**ไฟล์ PM — DevOps/PM ต้อง approve**) |
| `backend/src/auth/` | ชั้น auth ใหม่ทั้งหมด: ตรวจ token 10 ขั้น (jose + JWKS ตาม kid) · SSO login/callback/logout · `/api/v1/me` · role mapping · permission |
| `backend/src/common/` | envelope `{success,data,meta}` · error filter (9 code · log แค่ path) · UUID pipe · structured log |
| `backend/src/core-hub/` | เรียก Core Hub จาก backend: รายวิชา (cache 10 นาที · stale-on-error · single-flight) · `/people/me` (ไม่ cache) |
| `backend/src/{resources,requests,allocations,audit-logs}` | ย้ายใต้ `/api/v1` · id เป็น UUID · สิทธิ์ตาม permission · 403 แทน 404 เมื่อไม่ใช่เจ้าของ · action เป็น `POST /:id/<action>` |
| `backend/prisma/` | Prisma 7.9.1 + PrismaPg · `prisma.config.ts` · migration ที่ 3 ย้ายข้อมูลเดิม (ข้อมูลไม่หาย) · seed เครื่องอย่างเดียว |
| `backend/test/` | ตัวตรวจ token 10 ขั้น · SSO · 401/403/409 · กฎสิทธิ์ |
| `frontend/` | ลบหน้า login และหน้า users · ตัวตนจาก `/api/v1/me` (คุกกี้ HttpOnly) · 401 → re-SSO · proxy `/api/*` `/auth/*` · พอร์ต 3208 · eslint |
| ลบ | `backend/src/users` · auth เดิม (bcrypt/JWT ของตัวเอง) · `backend/postman` (ยิง endpoint ที่ไม่มีแล้ว — ต้นฉบับยังอยู่ในโฟลเดอร์ CS-CloudFlow เดิม) |

## ชั้น auth ที่คัดลอกมา

- คัดลอกจาก demo-student-subsystem: **ไม่ได้คัดลอก** — repo demo เป็น private (เข้าไม่ได้ทั้งจาก cloud และเครื่อง AIE)
- เขียนตาม `standards/docs/auth-contract.md` 1.2 ทีละข้อ แล้วพิสูจน์ด้วย conformance L1–L2 กับ Core Hub จริง + unit/e2e test
- **ควรขอสิทธิ์อ่าน demo แล้วเทียบ/แทนที่ `backend/src/auth/` `backend/src/common/`** ตามที่ AGENTS.md ข้อ 2 กำหนด

## Role mapping ที่ประกาศ (ต้องตรงกับ default_role_mapping ในทะเบียน)

| core role | subsystem role |
|---|---|
| student | STUDENT |
| lecturer | TEACHER |
| staff | STAFF |
| admin | ADMIN |
| alumni · guest | — (403) |

## ข้อสมมติที่ตั้งเอง (เพราะมาตรฐานไม่ได้ระบุ)

1. อาจารย์ผู้รับรองเก็บเป็น `teacher_person_code` (personCode ของบุคลากร = ส่วนหน้าอีเมลมหาวิทยาลัย) · ไม่ระบุ = อาจารย์คนใดก็พิจารณาได้ ·
   อาจารย์เห็น/อนุมัติเฉพาะคำขอที่ระบุ personCode ของตัวเอง (อ่านจาก `/people/me` ทุกครั้ง ไม่ cache) หรือคำขอที่ไม่ระบุใคร
2. staff ได้สิทธิ์เดียวกับ admin ในระบบนี้ (จัดเครื่อง · คืนเครื่อง · ดู audit log) — conformance ต้องให้ staff สร้างข้อมูลได้
3. ข้อมูลเดิม: ผู้ยื่น → `core_user_id = legacy-<id เดิม>` + `person_code` = รหัสนักศึกษาเดิม · อาจารย์ → ส่วนหน้าอีเมลเดิม ·
   `subject_code` เดิม (เช่น `CS401`) ไม่ใช่รหัสรายวิชาของ Core Hub แต่เก็บไว้ตามเดิมเพื่อไม่ให้ประวัติหาย — คำขอใหม่ต้องใช้รหัสจาก Core Hub
4. probe ของ conformance ใช้ `/api/v1/resources` · `denied_role: guest`

## สิ่งที่ยังทำไม่ได้ / เคสที่ยังไม่ผ่าน

- **L3-01..22** — รอ PL ลงทะเบียน `csmju-cloudflow` (Callback `http://localhost:3208/auth/callback`) และ admin ระบบกลางอนุมัติ + เปิดใช้งาน แล้วรัน conformance ใหม่
- ทดสอบฝั่งนักศึกษาด้วยบัญชีจริงไม่ได้ — ไม่มีบัญชีทดสอบ role student (นักศึกษาเข้าด้วย MJU SSO เท่านั้น) · บัญชีทดสอบร่วมไม่ได้ผูกกับบุคคล (`/people/me` = null)
- หน้าเว็บยังใช้ CSS เดิมของทีม (ผ่าน UI-01 แต่ยังไม่ได้ใช้ template `csmju-subsystem-web` / `CsmjuAppShell` ตาม ui-design-system ข้อ 17.0)
- ยังไม่มี `Dockerfile` · `docker-compose.yml` (tech-stack ข้อ 1.1) และ `generate:openapi` (API-01 ข้ามอยู่)
- ชั้น auth ยังไม่ได้เทียบกับ demo-student-subsystem (private)
