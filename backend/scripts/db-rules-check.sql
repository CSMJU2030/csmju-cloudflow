-- ═══════════════════════════════════════════════════════════════════════
--  ตรวจว่ากติกาที่ชั้นฐานข้อมูลยังทำงานอยู่ — ยิง SQL ตรง ไม่ผ่าน API
--
--  วิธีรัน:
--    psql -U postgres -d cs_cloudflow -f scripts/db-rules-check.sql
--
--  ทุกคำสั่งในไฟล์นี้ "ต้องขึ้น ERROR" — ถ้าข้อไหนผ่านฉลุย แปลว่ากติกาหลุด
--  แต่ละข้อห่อด้วย SAVEPOINT เพื่อให้รันต่อได้แม้ข้อก่อนหน้าจะ error
-- ═══════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP off
BEGIN;

\echo '--- 1) ให้ ADMIN เป็น student_id (ต้อง ERROR: trigger requests_enforce_roles) ---'
SAVEPOINT s1;
INSERT INTO requests (student_id, teacher_id, subject_code, req_cpu, req_ram_gb, req_storage_gb,
                      reason, start_date, end_date, status, updated_at)
SELECT a.id, t.id, 'CHK01', 1, 1, 1, 'ทดสอบ', '2026-10-01', '2026-10-02', 'PENDING', now()
FROM users a, users t WHERE a.role = 'ADMIN' AND t.role = 'TEACHER' LIMIT 1;
ROLLBACK TO s1;

\echo '--- 2) ตั้ง REJECTED โดยไม่ใส่เหตุผล (ต้อง ERROR: requests_reject_reason_chk) ---'
SAVEPOINT s2;
UPDATE requests SET status = 'REJECTED' WHERE status = 'PENDING';
ROLLBACK TO s2;

\echo '--- 3) end_date มาก่อน start_date (ต้อง ERROR: requests_date_range_chk) ---'
SAVEPOINT s3;
UPDATE requests SET end_date = '2020-01-01' WHERE id = (SELECT min(id) FROM requests);
ROLLBACK TO s3;

\echo '--- 4) อาจารย์รับรองให้ตัวเอง (ต้อง ERROR) ---'
SAVEPOINT s4;
INSERT INTO requests (student_id, teacher_id, subject_code, req_cpu, req_ram_gb, req_storage_gb,
                      reason, start_date, end_date, status, updated_at)
SELECT t.id, t.id, 'CHK04', 1, 1, 1, 'ทดสอบ', '2026-10-01', '2026-10-02', 'PENDING', now()
FROM users t WHERE t.role = 'TEACHER' LIMIT 1;
ROLLBACK TO s4;

\echo '--- 5) จัดสรรให้คำขอที่ยัง PENDING (ต้อง ERROR: trigger allocations_enforce_rules) ---'
SAVEPOINT s5;
INSERT INTO allocations (request_id, resource_id, ip_address, port)
SELECT r.id, (SELECT min(id) FROM resources), '10.0.0.1', 41001
FROM requests r WHERE r.status = 'PENDING' LIMIT 1;
ROLLBACK TO s5;

\echo '--- 6) จัดสรรลงเครื่องที่ปิดซ่อม (ต้อง ERROR) ---'
SAVEPOINT s6;
INSERT INTO allocations (request_id, resource_id, ip_address, port)
SELECT r.id, m.id, '10.0.0.2', 41002
FROM requests r, resources m
WHERE r.status = 'APPROVED' AND m.status = 'MAINTENANCE' LIMIT 1;
ROLLBACK TO s6;

\echo '--- 7) UPDATE บน audit_logs (ต้อง ERROR: ตารางเขียนอย่างเดียว) ---'
SAVEPOINT s7;
UPDATE audit_logs SET action = 'HACKED' WHERE id = (SELECT min(id) FROM audit_logs);
ROLLBACK TO s7;

\echo '--- 8) DELETE บน audit_logs (ต้อง ERROR) ---'
SAVEPOINT s8;
DELETE FROM audit_logs WHERE id = (SELECT min(id) FROM audit_logs);
ROLLBACK TO s8;

\echo '--- 9) port ซ้ำบนเครื่องเดิมขณะยังไม่คืน (ต้อง ERROR: allocations_active_port_uniq) ---'
SAVEPOINT s9;
INSERT INTO allocations (request_id, resource_id, ip_address, port)
SELECT request_id, resource_id, '10.0.0.3', port FROM allocations WHERE released_at IS NULL LIMIT 1;
ROLLBACK TO s9;

\echo '--- 10) ลบผู้ใช้ที่ยังมีคำขอค้าง (ต้อง ERROR: FK RESTRICT) ---'
SAVEPOINT s10;
DELETE FROM users WHERE id = (SELECT min(student_id) FROM requests);
ROLLBACK TO s10;

\echo '--- 11) IP ผิดรูปแบบ (ต้อง ERROR: ชนิด inet ตรวจให้เอง) ---'
SAVEPOINT s11;
INSERT INTO allocations (request_id, resource_id, ip_address, port)
SELECT (SELECT min(id) FROM requests), (SELECT min(id) FROM resources), '999.1.1.1', 41011;
ROLLBACK TO s11;

\echo '--- 12) port 70000 (ต้อง ERROR: allocations_port_range_chk) ---'
SAVEPOINT s12;
INSERT INTO allocations (request_id, resource_id, ip_address, port)
SELECT (SELECT min(id) FROM requests), (SELECT min(id) FROM resources), '10.0.0.4', 70000;
ROLLBACK TO s12;

\echo '--- view resource_usage (คำนวณสด ไม่ได้เก็บไว้) ---'
SELECT server_name, total_cpu, used_cpu, free_cpu, active_allocations
FROM resource_usage ORDER BY resource_id;

ROLLBACK;
\echo '--- จบการตรวจ: ไม่มีข้อมูลไหนถูกแก้จริง (ROLLBACK ทั้งหมด) ---'
