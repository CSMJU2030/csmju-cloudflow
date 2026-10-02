-- ═══════════════════════════════════════════════════════════════════════
--  CS-CloudFlow · migration 2 — กติกาธุรกิจที่บังคับที่ชั้นฐานข้อมูล
--
--  ทำไมต้องมีไฟล์นี้: validation ที่ API อย่างเดียวไม่พอ เพราะข้ามได้ด้วย
--  psql, Prisma Studio หรือสคริปต์ import ที่ลืมเช็ก
--  กติกาที่ "ผิดแล้วข้อมูลพัง" จึงต้องอยู่ที่ฐานข้อมูลด้วย
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────── 1. CHECK constraint ───────────────────────

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_capacity_positive_chk"
  CHECK ("total_cpu" > 0 AND "total_ram_gb" > 0 AND "total_storage_gb" > 0);

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_date_range_chk"
  CHECK ("end_date" >= "start_date");

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_amount_positive_chk"
  CHECK ("req_cpu" > 0 AND "req_ram_gb" > 0 AND "req_storage_gb" > 0);

-- รับรองให้ตัวเองไม่ได้
ALTER TABLE "requests"
  ADD CONSTRAINT "requests_student_not_teacher_chk"
  CHECK ("student_id" <> "teacher_id");

-- REJECTED ต้องมีเหตุผล · ไม่ REJECTED ต้องไม่มีเหตุผลค้างอยู่
ALTER TABLE "requests"
  ADD CONSTRAINT "requests_reject_reason_chk"
  CHECK (
    ("status" = 'REJECTED' AND "reject_reason" IS NOT NULL AND length(btrim("reject_reason")) > 0)
    OR ("status" <> 'REJECTED' AND "reject_reason" IS NULL)
  );

ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_port_range_chk"
  CHECK ("port" BETWEEN 1 AND 65535);

ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_released_after_assigned_chk"
  CHECK ("released_at" IS NULL OR "released_at" >= "assigned_at");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_not_blank_chk"
  CHECK (length(btrim("action")) > 0);

-- ─────────────────── 2. Partial unique index ───────────────────
--
-- unique ธรรมดาจะทำให้ port ที่คืนแล้วใช้ซ้ำไม่ได้ตลอดกาล
-- เติม WHERE released_at IS NULL กติกาจึงกลายเป็น "ห้ามซ้ำเฉพาะตอนที่ยังใช้อยู่"
-- และการกันชนที่ index ปิดช่องว่างระหว่าง SELECT-แล้วค่อย-INSERT ที่ concurrency หลุดได้

CREATE UNIQUE INDEX "allocations_active_port_uniq"
  ON "allocations" ("resource_id", "port")
  WHERE "released_at" IS NULL;

-- คำขอหนึ่งใบ มีการจัดสรรที่ยัง active ได้แค่รายการเดียว
CREATE UNIQUE INDEX "allocations_active_request_uniq"
  ON "allocations" ("request_id")
  WHERE "released_at" IS NULL;

-- ───────────────────────── 3. Trigger ─────────────────────────
--
-- ทำไมเป็น trigger ไม่ใช่ CHECK: CHECK มองได้แค่แถวของตัวเอง
-- เงื่อนไขที่ต้องไปอ่านตารางอื่น (role ของผู้ใช้ / สถานะของคำขอ) เขียนเป็น CHECK ไม่ได้

-- 3.1 student_id ต้องเป็น STUDENT · teacher_id ต้องเป็น TEACHER
CREATE OR REPLACE FUNCTION "fn_requests_enforce_roles"() RETURNS trigger AS $$
DECLARE
  v_student_role "user_role";
  v_teacher_role "user_role";
BEGIN
  SELECT "role" INTO v_student_role FROM "users" WHERE "id" = NEW."student_id";
  IF v_student_role IS DISTINCT FROM 'STUDENT' THEN
    RAISE EXCEPTION 'student_id % ต้องเป็นผู้ใช้ที่มี role = STUDENT (พบ: %)',
      NEW."student_id", COALESCE(v_student_role::text, 'ไม่พบผู้ใช้');
  END IF;

  SELECT "role" INTO v_teacher_role FROM "users" WHERE "id" = NEW."teacher_id";
  IF v_teacher_role IS DISTINCT FROM 'TEACHER' THEN
    RAISE EXCEPTION 'teacher_id % ต้องเป็นผู้ใช้ที่มี role = TEACHER (พบ: %)',
      NEW."teacher_id", COALESCE(v_teacher_role::text, 'ไม่พบผู้ใช้');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "requests_enforce_roles"
  BEFORE INSERT OR UPDATE OF "student_id", "teacher_id" ON "requests"
  FOR EACH ROW EXECUTE FUNCTION "fn_requests_enforce_roles"();

-- 3.2 จัดสรรได้เฉพาะคำขอที่ APPROVED และเครื่องที่ยังรับงานได้
CREATE OR REPLACE FUNCTION "fn_allocations_enforce_rules"() RETURNS trigger AS $$
DECLARE
  v_request_status  "request_status";
  v_resource_status "resource_status";
BEGIN
  SELECT "status" INTO v_request_status FROM "requests" WHERE "id" = NEW."request_id";
  IF v_request_status IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอ %', NEW."request_id";
  END IF;
  IF v_request_status NOT IN ('APPROVED', 'ALLOCATED') THEN
    RAISE EXCEPTION 'จัดสรรไม่ได้: คำขอ % อยู่ในสถานะ % (ต้อง APPROVED ก่อน)',
      NEW."request_id", v_request_status;
  END IF;

  SELECT "status" INTO v_resource_status FROM "resources" WHERE "id" = NEW."resource_id";
  IF v_resource_status IN ('MAINTENANCE', 'OFFLINE') THEN
    RAISE EXCEPTION 'จัดสรรไม่ได้: เครื่อง % อยู่ในสถานะ %',
      NEW."resource_id", v_resource_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "allocations_enforce_rules"
  BEFORE INSERT ON "allocations"
  FOR EACH ROW EXECUTE FUNCTION "fn_allocations_enforce_rules"();

-- 3.3 audit_logs เขียนได้อย่างเดียว
CREATE OR REPLACE FUNCTION "fn_audit_logs_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs เป็นตารางเขียนอย่างเดียว — ห้ามทำ % กับตารางนี้', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "fn_audit_logs_append_only"();

-- ─────────────────── 4. view resource_usage ───────────────────
--
-- ตาราง resources ไม่มีคอลัมน์ "ที่เหลือ" โดยตั้งใจ
-- ถ้าเก็บทั้ง total และ used ไว้คู่กัน วันหนึ่งมันจะไม่ตรงกัน
-- (เขียนสำเร็จแค่ตัวเดียว หรือมีคนแก้ตรง ๆ ใน pgAdmin)
-- ที่เหลือจึงคำนวณสดจาก allocations ที่ยัง active

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
