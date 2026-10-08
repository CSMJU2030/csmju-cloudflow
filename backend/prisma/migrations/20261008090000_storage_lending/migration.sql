-- ═══════════════════════════════════════════════════════════════════════
--  CS-CloudFlow · migration 4 — ระบบยืมพื้นที่ cloud storage
--
--  เพิ่มตารางใหม่อย่างเดียว ไม่แตะตารางเดิม (resources · requests · allocations · audit_logs)
--  pool รวม (เช่น 1 TiB) แบ่งให้ยืมคนละไม่เกิน 15 GiB · หน่วยเป็น MiB แบบจำนวนเต็ม
-- ═══════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "storage_request_status" AS ENUM ('PENDING', 'REJECTED', 'CANCELLED', 'PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED', 'RELEASED');

-- CreateTable
CREATE TABLE "storage_pools" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "total_mib" INTEGER NOT NULL,
    "max_per_user_mib" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_requests" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "core_user_id" VARCHAR(64) NOT NULL,
    "person_code" VARCHAR(64),
    "teacher_person_code" VARCHAR(64),
    "course_code" VARCHAR(50) NOT NULL,
    "quota_mib" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "storage_request_status" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "reviewer_core_user_id" VARCHAR(64),
    "reviewed_at" TIMESTAMPTZ(6),
    "provider_ref" VARCHAR(200),
    "share_url_enc" TEXT,
    "share_password_enc" TEXT,
    "used_mib" INTEGER NOT NULL DEFAULT 0,
    "usage_synced_at" TIMESTAMPTZ(6),
    "provision_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "activated_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_pools_name_key" ON "storage_pools"("name");

-- CreateIndex
CREATE INDEX "storage_requests_pool_id_idx" ON "storage_requests"("pool_id");

-- CreateIndex
CREATE INDEX "storage_requests_core_user_id_idx" ON "storage_requests"("core_user_id");

-- CreateIndex
CREATE INDEX "storage_requests_teacher_person_code_idx" ON "storage_requests"("teacher_person_code");

-- CreateIndex
CREATE INDEX "storage_requests_status_idx" ON "storage_requests"("status");

-- AddForeignKey
ALTER TABLE "storage_requests" ADD CONSTRAINT "storage_requests_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "storage_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── กติกาที่ Prisma เขียนตรง ๆ ไม่ได้ ─────────────

-- ขนาดต้องเป็นบวก · ต่อคนต้องไม่เกินขนาดรวม
ALTER TABLE "storage_pools"
  ADD CONSTRAINT "storage_pools_size_chk"
  CHECK ("total_mib" > 0 AND "max_per_user_mib" > 0 AND "max_per_user_mib" <= "total_mib");

ALTER TABLE "storage_requests"
  ADD CONSTRAINT "storage_requests_quota_positive_chk" CHECK ("quota_mib" > 0);

ALTER TABLE "storage_requests"
  ADD CONSTRAINT "storage_requests_used_not_negative_chk" CHECK ("used_mib" >= 0);

ALTER TABLE "storage_requests"
  ADD CONSTRAINT "storage_requests_date_range_chk" CHECK ("end_date" >= "start_date");

-- REJECTED ต้องมีเหตุผล · สถานะอื่นต้องไม่มีเหตุผลค้าง (แบบเดียวกับตาราง requests)
ALTER TABLE "storage_requests"
  ADD CONSTRAINT "storage_requests_reject_reason_chk"
  CHECK (
    ("status" = 'REJECTED' AND "reject_reason" IS NOT NULL AND length(btrim("reject_reason")) > 0)
    OR ("status" <> 'REJECTED' AND "reject_reason" IS NULL)
  );

-- ACTIVE ต้องมีพื้นที่และลิงก์จาก provider แล้ว
ALTER TABLE "storage_requests"
  ADD CONSTRAINT "storage_requests_active_has_share_chk"
  CHECK ("status" <> 'ACTIVE' OR ("provider_ref" IS NOT NULL AND "share_url_enc" IS NOT NULL));

-- คนหนึ่งมีพื้นที่ที่ "กินโควตา" ได้ 1 ก้อนต่อ pool
-- (สถานะที่กินโควตา = PROVISIONING · PROVISION_FAILED · ACTIVE · EXPIRED)
CREATE UNIQUE INDEX "storage_requests_one_live_per_user"
  ON "storage_requests" ("pool_id", "core_user_id")
  WHERE "status" IN ('PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED');

-- คำขอที่รออาจารย์ได้ 1 ใบต่อคนต่อ pool
CREATE UNIQUE INDEX "storage_requests_one_pending_per_user"
  ON "storage_requests" ("pool_id", "core_user_id")
  WHERE "status" = 'PENDING';

-- ───────────── view พื้นที่ของแต่ละ pool (คำนวณสด) ─────────────
-- ไม่มีคอลัมน์ "ที่เหลือ" ในตาราง — เก็บไว้คู่กันวันหนึ่งจะไม่ตรงกัน
CREATE OR REPLACE VIEW "storage_pool_usage" AS
SELECT
  p."id"               AS pool_id,
  p."name",
  p."provider",
  p."is_active",
  p."total_mib",
  p."max_per_user_mib",
  COALESCE(SUM(r."quota_mib") FILTER (WHERE r."status" IN ('PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED')), 0)::int AS reserved_mib,
  COALESCE(SUM(r."used_mib")  FILTER (WHERE r."status" = 'ACTIVE'), 0)::int                                                AS used_mib,
  (p."total_mib" - COALESCE(SUM(r."quota_mib") FILTER (WHERE r."status" IN ('PROVISIONING', 'PROVISION_FAILED', 'ACTIVE', 'EXPIRED')), 0))::int AS free_mib,
  COUNT(r."id") FILTER (WHERE r."status" = 'ACTIVE')::int  AS active_count,
  COUNT(r."id") FILTER (WHERE r."status" = 'PENDING')::int AS pending_count
FROM "storage_pools" p
LEFT JOIN "storage_requests" r ON r."pool_id" = p."id"
GROUP BY p."id";
