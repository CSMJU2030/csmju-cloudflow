-- ═══════════════════════════════════════════════════════════════════════
--  CS-CloudFlow · migration 3 — ย้ายตัวตนไป Core Hub (standards 1.7.0)
--
--  1. เลิกตาราง users — ตัวตนเป็นของ Core Hub (data-dictionary ข้อ 3)
--     requests.student_id  → core_user_id ('legacy-<id>') + person_code (student_code เดิม)
--     requests.teacher_id  → teacher_person_code (ส่วนหน้าอีเมลของอาจารย์ = personCode ของบุคลากร)
--     audit_logs.user_id   → core_user_id ('legacy-<id>')
--  2. PK ทุกตารางเป็น UUID v4 (api-conventions ข้อ 6) — คัดลอก FK ตามก่อนสลับ
--  3. subject_code → course_code · req_gpu → is_gpu_required (RENAME ไม่ใช่ drop+add)
--  4. allocations / audit_logs มี created_at · updated_at ครบทุกตาราง
--
--  ข้อมูลเดิมไม่หาย: ทุกแถวถูกคัดลอกก่อน DROP · ค่า legacy-<id> ระบุได้ว่ามาจากระบบเดิม
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────── 0. ถอดของที่ผูกกับ id แบบเดิมออกก่อน ───────────────
DROP VIEW IF EXISTS "resource_usage";
DROP TRIGGER IF EXISTS "requests_enforce_roles" ON "requests";
DROP FUNCTION IF EXISTS "fn_requests_enforce_roles"();
DROP TRIGGER IF EXISTS "allocations_enforce_rules" ON "allocations";
DROP TRIGGER IF EXISTS "audit_logs_no_update" ON "audit_logs";
DROP INDEX IF EXISTS "allocations_active_port_uniq";
DROP INDEX IF EXISTS "allocations_active_request_uniq";
ALTER TABLE "requests" DROP CONSTRAINT IF EXISTS "requests_student_not_teacher_chk";

ALTER TABLE "requests"    DROP CONSTRAINT IF EXISTS "requests_student_id_fkey";
ALTER TABLE "requests"    DROP CONSTRAINT IF EXISTS "requests_teacher_id_fkey";
ALTER TABLE "allocations" DROP CONSTRAINT IF EXISTS "allocations_request_id_fkey";
ALTER TABLE "allocations" DROP CONSTRAINT IF EXISTS "allocations_resource_id_fkey";
ALTER TABLE "audit_logs"  DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";

-- ─────────────── 1. ตัวตนจาก Core Hub ───────────────
ALTER TABLE "requests"
  ADD COLUMN "core_user_id"          VARCHAR(64),
  ADD COLUMN "person_code"           VARCHAR(64),
  ADD COLUMN "teacher_person_code"   VARCHAR(64),
  ADD COLUMN "reviewer_core_user_id" VARCHAR(64);

UPDATE "requests" r
SET "core_user_id"        = 'legacy-' || r."student_id",
    "person_code"         = s."student_code",
    "teacher_person_code" = split_part(t."email", '@', 1)
FROM "users" s, "users" t
WHERE s."id" = r."student_id" AND t."id" = r."teacher_id";

-- แถวที่ผู้ใช้หายไปแล้ว (ไม่ควรมี เพราะ FK เป็น RESTRICT) ก็ยังต้องมีเจ้าของ
UPDATE "requests" SET "core_user_id" = 'legacy-' || "student_id" WHERE "core_user_id" IS NULL;
UPDATE "requests" SET "reviewer_core_user_id" = 'legacy-' || "teacher_id" WHERE "reviewed_at" IS NOT NULL;
ALTER TABLE "requests" ALTER COLUMN "core_user_id" SET NOT NULL;

ALTER TABLE "audit_logs" ADD COLUMN "core_user_id" VARCHAR(64);
UPDATE "audit_logs" SET "core_user_id" = 'legacy-' || "user_id" WHERE "user_id" IS NOT NULL;

DROP INDEX IF EXISTS "requests_student_id_idx";
DROP INDEX IF EXISTS "requests_teacher_id_idx";
DROP INDEX IF EXISTS "audit_logs_user_id_idx";
ALTER TABLE "requests"   DROP COLUMN "student_id", DROP COLUMN "teacher_id";
ALTER TABLE "audit_logs" DROP COLUMN "user_id";

DROP TABLE "users";
DROP TYPE "user_role";

-- ─────────────── 2. PK เป็น UUID v4 ───────────────
ALTER TABLE "resources"   ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "requests"    ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "allocations" ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "audit_logs"  ADD COLUMN "uid" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "allocations" ADD COLUMN "request_uid" UUID, ADD COLUMN "resource_uid" UUID;
UPDATE "allocations" a SET "request_uid"  = r."uid" FROM "requests"  r WHERE r."id" = a."request_id";
UPDATE "allocations" a SET "resource_uid" = s."uid" FROM "resources" s WHERE s."id" = a."resource_id";

DROP INDEX IF EXISTS "allocations_request_id_idx";
DROP INDEX IF EXISTS "allocations_resource_id_idx";
ALTER TABLE "allocations" DROP COLUMN "request_id", DROP COLUMN "resource_id";
ALTER TABLE "allocations" RENAME COLUMN "request_uid"  TO "request_id";
ALTER TABLE "allocations" RENAME COLUMN "resource_uid" TO "resource_id";
ALTER TABLE "allocations" ALTER COLUMN "request_id" SET NOT NULL, ALTER COLUMN "resource_id" SET NOT NULL;

ALTER TABLE "resources"   DROP CONSTRAINT "resources_pkey",   DROP COLUMN "id";
ALTER TABLE "requests"    DROP CONSTRAINT "requests_pkey",    DROP COLUMN "id";
ALTER TABLE "allocations" DROP CONSTRAINT "allocations_pkey", DROP COLUMN "id";
ALTER TABLE "audit_logs"  DROP CONSTRAINT "audit_logs_pkey",  DROP COLUMN "id";

ALTER TABLE "resources"   RENAME COLUMN "uid" TO "id";
ALTER TABLE "requests"    RENAME COLUMN "uid" TO "id";
ALTER TABLE "allocations" RENAME COLUMN "uid" TO "id";
ALTER TABLE "audit_logs"  RENAME COLUMN "uid" TO "id";

-- id ใหม่สร้างจากแอป (Prisma @default(uuid())) — ไม่ต้องมี default ฝั่งฐาน
ALTER TABLE "resources"   ALTER COLUMN "id" DROP DEFAULT, ADD CONSTRAINT "resources_pkey"   PRIMARY KEY ("id");
ALTER TABLE "requests"    ALTER COLUMN "id" DROP DEFAULT, ADD CONSTRAINT "requests_pkey"    PRIMARY KEY ("id");
ALTER TABLE "allocations" ALTER COLUMN "id" DROP DEFAULT, ADD CONSTRAINT "allocations_pkey" PRIMARY KEY ("id");
ALTER TABLE "audit_logs"  ALTER COLUMN "id" DROP DEFAULT, ADD CONSTRAINT "audit_logs_pkey"  PRIMARY KEY ("id");

ALTER TABLE "allocations" ADD CONSTRAINT "allocations_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── 3. เปลี่ยนชื่อคอลัมน์ (ข้อมูลไม่หาย) ───────────────
ALTER TABLE "requests" RENAME COLUMN "subject_code" TO "course_code";
ALTER TABLE "requests" ALTER COLUMN "course_code" TYPE VARCHAR(50);
ALTER TABLE "requests" RENAME COLUMN "req_gpu" TO "is_gpu_required";

-- ─────────────── 4. created_at / updated_at ครบทุกตาราง ───────────────
ALTER TABLE "allocations"
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "allocations" SET "created_at" = "assigned_at", "updated_at" = COALESCE("released_at", "assigned_at");
ALTER TABLE "allocations" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "audit_logs"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "audit_logs" SET "updated_at" = "created_at";

-- ─────────────── 5. index ───────────────
CREATE INDEX "requests_core_user_id_idx"        ON "requests"("core_user_id");
CREATE INDEX "requests_teacher_person_code_idx" ON "requests"("teacher_person_code");
CREATE INDEX "allocations_request_id_idx"       ON "allocations"("request_id");
CREATE INDEX "allocations_resource_id_idx"      ON "allocations"("resource_id");
CREATE INDEX "audit_logs_core_user_id_idx"      ON "audit_logs"("core_user_id");

CREATE UNIQUE INDEX "allocations_active_port_uniq"
  ON "allocations" ("resource_id", "port")
  WHERE "released_at" IS NULL;
CREATE UNIQUE INDEX "allocations_active_request_uniq"
  ON "allocations" ("request_id")
  WHERE "released_at" IS NULL;

-- ─────────────── 6. trigger และ view กลับคืน ───────────────
-- กติกา "student ต้องเป็น STUDENT / teacher ต้องเป็น TEACHER" ย้ายไปอยู่ที่ permission ของ Core Hub token
-- (fn_requests_enforce_roles ถูกลบไปแล้วในข้อ 0 เพราะอ้างตาราง users)
CREATE TRIGGER "allocations_enforce_rules"
  BEFORE INSERT ON "allocations"
  FOR EACH ROW EXECUTE FUNCTION "fn_allocations_enforce_rules"();

-- audit_logs ยังเขียนได้อย่างเดียว
CREATE TRIGGER "audit_logs_no_update"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "fn_audit_logs_append_only"();

CREATE OR REPLACE VIEW "resource_usage" AS
SELECT
  r."id"                                                   AS resource_id,
  r."server_name",
  r."status",
  r."has_gpu",
  r."total_cpu",
  r."total_ram_gb",
  r."total_storage_gb",
  COALESCE(SUM(req."req_cpu"), 0)::int                     AS used_cpu,
  COALESCE(SUM(req."req_ram_gb"), 0)::int                  AS used_ram_gb,
  COALESCE(SUM(req."req_storage_gb"), 0)::int              AS used_storage_gb,
  (r."total_cpu" - COALESCE(SUM(req."req_cpu"), 0))::int            AS free_cpu,
  (r."total_ram_gb" - COALESCE(SUM(req."req_ram_gb"), 0))::int      AS free_ram_gb,
  (r."total_storage_gb" - COALESCE(SUM(req."req_storage_gb"), 0))::int AS free_storage_gb,
  COUNT(a."id")::int                                       AS active_allocations
FROM "resources" r
LEFT JOIN "allocations" a
  ON a."resource_id" = r."id" AND a."released_at" IS NULL
LEFT JOIN "requests" req
  ON req."id" = a."request_id"
GROUP BY r."id";
