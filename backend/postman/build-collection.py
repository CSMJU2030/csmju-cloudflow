#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────
#  สร้างไฟล์ Postman collection + environment ของ CS-CloudFlow
#
#  ⚠️  แก้ที่ไฟล์นี้เท่านั้น แล้วรัน  python3 postman/build-collection.py
#      อย่าแก้ JSON ที่ generate ออกมาตรง ๆ — รอบหน้าจะโดนเขียนทับ
# ─────────────────────────────────────────────────────────────────────────
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECTION = os.path.join(HERE, "CS-CloudFlow.postman_collection.json")
ENVIRONMENT = os.path.join(HERE, "CS-CloudFlow.postman_environment.json")

NUM_MARK = "@@NUM@@"


def num(var: str) -> str:
    """
    ใส่ตัวแปร Postman ลงใน body เป็น "ตัวเลข" ไม่ใช่ string

    ทำไมต้องมี: json.dumps จะครอบเครื่องหมายคำพูดให้ทุกค่า ทำให้ได้
    {"teacherId": "2"} ซึ่ง NestJS อ่านเป็น string แล้วตีตกที่ @IsInt
    ฟังก์ชันนี้ฝัง marker ไว้ แล้วถอดคำพูดออกตอนเขียนไฟล์
    """
    return f"{NUM_MARK}{{{{{var}}}}}"


def strip_num_marks(text: str) -> str:
    """
    ถอดเครื่องหมายคำพูดรอบตัวแปรที่ทำเครื่องหมายไว้ด้วย num()

    body ของ request ถูก json.dumps สองชั้น (ชั้นในเป็น raw string) ตัวคั่นจึงเป็น \\"
    ต้องรองรับทั้งสองแบบ ไม่งั้นตัวเลขจะยังถูกส่งเป็น string แล้วติด @IsInt
    """
    text = re.sub(r'\\"' + NUM_MARK + r'\{\{(\w+)\}\}\\"', r"{{\1}}", text)
    return re.sub(r'"' + NUM_MARK + r'\{\{(\w+)\}\}"', r"{{\1}}", text)


# ───────────────────────── helper สร้าง request ─────────────────────────


def req(
    name,
    method,
    path,
    *,
    token=None,
    body=None,
    tests=None,
    query=None,
    prerequest=None,
    desc=None,
):
    headers = []
    if token:
        headers.append({"key": "Authorization", "value": f"Bearer {{{{{token}}}}}"})
    if body is not None:
        headers.append({"key": "Content-Type", "value": "application/json"})

    url = {
        "raw": "{{baseUrl}}/" + path.lstrip("/") + (("?" + "&".join(f"{k}={v}" for k, v in query.items())) if query else ""),
        "host": ["{{baseUrl}}"],
        "path": [p for p in path.strip("/").split("/") if p],
    }
    if query:
        url["query"] = [{"key": k, "value": str(v)} for k, v in query.items()]

    item = {
        "name": name,
        "request": {
            "method": method,
            "header": headers,
            "url": url,
            **({"description": desc} if desc else {}),
            **(
                {"body": {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False, indent=2)}}
                if body is not None
                else {}
            ),
        },
        "event": [],
    }

    if prerequest:
        item["event"].append(
            {"listen": "prerequest", "script": {"type": "text/javascript", "exec": prerequest}}
        )
    if tests:
        item["event"].append({"listen": "test", "script": {"type": "text/javascript", "exec": tests}})
    return item


def folder(name, items, desc=""):
    return {"name": name, "description": desc, "item": items}


def status(code, label=None):
    return [f'pm.test("{label or f"ตอบ {code}"}", () => pm.response.to.have.status({code}));']


def err(code, http):
    return [
        f'pm.test("ตอบ {http} + code {code}", () => {{',
        f"  pm.response.to.have.status({http});",
        f'  pm.expect(pm.response.json().error.code).to.eql("{code}");',
        "});",
    ]


# ═══════════════════════════ 1 · Health ═══════════════════════════

health = folder(
    "1 · Health",
    [
        req(
            "1.1 GET /health — เซิร์ฟเวอร์และฐานข้อมูลพร้อมไหม",
            "GET",
            "/health",
            tests=status(200)
            + [
                'pm.test("database = up", () => pm.expect(pm.response.json().database).to.eql("up"));',
                'pm.test("ตอบเร็วกว่า 2 วินาที", () => pm.expect(pm.response.responseTime).to.be.below(2000));',
            ],
        )
    ],
    "เช็กก่อนเสมอ — ถ้าข้อนี้แดง ที่เหลือไม่ต้องดู",
)

# ═══════════════════════════ 2 · Auth ═══════════════════════════

login_tests = lambda var, role: status(200) + [
    "const d = pm.response.json();",
    f'pm.test("ได้ accessToken", () => pm.expect(d.accessToken).to.be.a("string").and.not.empty);',
    f'pm.test("role = {role}", () => pm.expect(d.user.role).to.eql("{role}"));',
    'pm.test("ผลลัพธ์ไม่มี passwordHash หลุดออกมา", () => pm.expect(pm.response.text()).to.not.include("passwordHash"));',
    f'pm.collectionVariables.set("{var}", d.accessToken);',
]

auth = folder(
    "2 · Auth — เข้าสู่ระบบและสมัครสมาชิก",
    [
        req(
            "2.1 login ADMIN",
            "POST",
            "/auth/login",
            body={"email": "admin@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=login_tests("adminToken", "ADMIN")
            + ['pm.collectionVariables.set("adminId", pm.response.json().user.id);'],
        ),
        req(
            "2.2 login TEACHER (อ.สมชาย)",
            "POST",
            "/auth/login",
            body={"email": "somchai.t@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=login_tests("teacherToken", "TEACHER")
            + ['pm.collectionVariables.set("teacherId", pm.response.json().user.id);'],
        ),
        req(
            "2.3 login TEACHER คนที่สอง (อ.วนิดา) — ไว้ทดสอบว่าอนุมัติแทนกันไม่ได้",
            "POST",
            "/auth/login",
            body={"email": "wanida.t@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=login_tests("teacher2Token", "TEACHER")
            + ['pm.collectionVariables.set("teacher2Id", pm.response.json().user.id);'],
        ),
        req(
            "2.4 login STUDENT (ผู้ขอหลัก)",
            "POST",
            "/auth/login",
            body={"email": "natdanai@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=login_tests("studentToken", "STUDENT")
            + ['pm.collectionVariables.set("studentId", pm.response.json().user.id);'],
        ),
        req(
            "2.5 login STUDENT คนที่สอง — คู่ทดสอบ IDOR",
            "POST",
            "/auth/login",
            body={"email": "student2@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=login_tests("student2Token", "STUDENT"),
        ),
        req(
            "2.6 login รหัสผ่านผิด → 401",
            "POST",
            "/auth/login",
            body={"email": "natdanai@mju.ac.th", "password": "ผิดแน่นอน-wrong-password"},
            tests=err("CREDENTIALS_INVALID", 401)
            + [
                'pm.test("ข้อความไม่บอกว่าอีเมลมีอยู่จริงหรือไม่", () => {',
                "  const m = pm.response.json().error.message;",
                '  pm.expect(m).to.include("อีเมลหรือรหัสผ่าน");',
                "});",
            ],
            desc="ตอบเหมือนกันทั้งกรณีอีเมลไม่มีและรหัสผ่านผิด — ไม่งั้นจะใช้ไล่หาว่าอีเมลไหนมีบัญชี",
        ),
        req(
            "2.7 login อีเมลที่ไม่มีในระบบ → 401 (ข้อความเดียวกับ 2.6)",
            "POST",
            "/auth/login",
            body={"email": "ghost-no-such-user@mju.ac.th", "password": "{{defaultPassword}}"},
            tests=err("CREDENTIALS_INVALID", 401),
        ),
        req(
            "2.8 สมัครนักศึกษาใหม่ → 201",
            "POST",
            "/auth/register",
            prerequest=[
                "const s = Date.now().toString().slice(-9);",
                'pm.collectionVariables.set("newEmail", `newstudent${s}@mju.ac.th`);',
                'pm.collectionVariables.set("newCode", `67${s}`.slice(0, 12));',
            ],
            body={
                "studentCode": "{{newCode}}",
                "fullName": "นักศึกษาสมัครใหม่",
                "email": "{{newEmail}}",
                "password": "{{defaultPassword}}",
            },
            tests=status(201)
            + [
                "const d = pm.response.json();",
                'pm.test("role ถูกบังคับเป็น STUDENT", () => pm.expect(d.user.role).to.eql("STUDENT"));',
                'pm.collectionVariables.set("newStudentToken", d.accessToken);',
                'pm.collectionVariables.set("newStudentId", d.user.id);',
            ],
            desc="สมัครเองได้เฉพาะ STUDENT — จะยัด role มาใน body ก็ไม่มีผล",
        ),
        req(
            "2.9 สมัครด้วยอีเมลซ้ำ → 409",
            "POST",
            "/auth/register",
            body={
                "studentCode": "6799999999",
                "fullName": "คนซ้ำ",
                "email": "{{newEmail}}",
                "password": "{{defaultPassword}}",
            },
            tests=err("DUPLICATE", 409),
        ),
        req(
            "2.10 สมัครด้วยรหัสผ่านสั้นเกิน → 400",
            "POST",
            "/auth/register",
            body={
                "studentCode": "6798765432",
                "fullName": "รหัสสั้น",
                "email": "shortpw@mju.ac.th",
                "password": "123",
            },
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "2.11 GET /auth/me",
            "GET",
            "/auth/me",
            token="studentToken",
            tests=status(200)
            + [
                'pm.test("เป็นคนเดียวกับที่ล็อกอิน", () => pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get("studentId")));',
                'pm.test("ไม่มี passwordHash", () => pm.expect(pm.response.json()).to.not.have.property("passwordHash"));',
            ],
        ),
        req(
            "2.12 GET /auth/me ไม่ใส่ token → 401 TOKEN_MISSING",
            "GET",
            "/auth/me",
            tests=err("TOKEN_MISSING", 401),
        ),
        req(
            "2.13 GET /auth/me ใส่ token มั่ว → 401 TOKEN_INVALID",
            "GET",
            "/auth/me",
            token="badToken",
            tests=err("TOKEN_INVALID", 401),
        ),
        req(
            "2.14 เปลี่ยนรหัสผ่านโดยใส่รหัสเดิมผิด → 401",
            "PATCH",
            "/auth/password",
            token="newStudentToken",
            body={"currentPassword": "ไม่ใช่รหัสเดิม", "newPassword": "NewPassw0rd!"},
            tests=err("CREDENTIALS_INVALID", 401),
        ),
        req(
            "2.15 เปลี่ยนรหัสผ่านสำเร็จ แล้วล็อกอินด้วยรหัสใหม่",
            "PATCH",
            "/auth/password",
            token="newStudentToken",
            body={"currentPassword": "{{defaultPassword}}", "newPassword": "NewPassw0rd!"},
            tests=status(200),
        ),
        req(
            "2.16 ล็อกอินด้วยรหัสใหม่ → 200",
            "POST",
            "/auth/login",
            body={"email": "{{newEmail}}", "password": "NewPassw0rd!"},
            tests=status(200)
            + ['pm.collectionVariables.set("newStudentToken", pm.response.json().accessToken);'],
        ),
    ],
    "ตัวตนของผู้ยิงมาจาก token เสมอ ไม่เคยมาจาก body",
)

# ═══════════════════════════ 3 · Users ═══════════════════════════

users = folder(
    "3 · Users — จัดการผู้ใช้",
    [
        req(
            "3.1 GET /users/teachers (นักศึกษาเรียกได้)",
            "GET",
            "/users/teachers",
            token="studentToken",
            tests=status(200)
            + [
                "const rows = pm.response.json();",
                'pm.test("มีอาจารย์อย่างน้อย 2 คน", () => pm.expect(rows.length).to.be.at.least(2));',
                'pm.test("ทุกแถวไม่มี passwordHash", () => pm.expect(pm.response.text()).to.not.include("passwordHash"));',
            ],
        ),
        req(
            "3.2 GET /users (ADMIN) → 200",
            "GET",
            "/users",
            token="adminToken",
            query={"limit": 100},
            tests=status(200)
            + [
                "const d = pm.response.json();",
                'pm.test("มี meta สำหรับแบ่งหน้า", () => pm.expect(d.meta).to.have.keys("total", "page", "limit", "pageCount"));',
                'pm.test("มีผู้ใช้อย่างน้อย 6 คน", () => pm.expect(d.meta.total).to.be.at.least(6));',
            ],
        ),
        req(
            "3.3 GET /users (STUDENT) → 403",
            "GET",
            "/users",
            token="studentToken",
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "3.4 GET /users?role=TEACHER — กรองด้วย role",
            "GET",
            "/users",
            token="adminToken",
            query={"role": "TEACHER"},
            tests=status(200)
            + [
                'pm.test("ทุกแถวเป็น TEACHER", () => pm.response.json().data.forEach(u => pm.expect(u.role).to.eql("TEACHER")));',
            ],
        ),
        req(
            "3.5 GET /users?role=ไม่มีค่านี้ → 400",
            "GET",
            "/users",
            token="adminToken",
            query={"role": "SUPERUSER"},
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "3.6 ADMIN สร้าง TEACHER ใหม่ → 201",
            "POST",
            "/users",
            token="adminToken",
            prerequest=[
                'pm.collectionVariables.set("tmpTeacherEmail", `teacher${Date.now()}@mju.ac.th`);'
            ],
            body={
                "fullName": "อ.ทดสอบ ชั่วคราว",
                "email": "{{tmpTeacherEmail}}",
                "password": "{{defaultPassword}}",
                "role": "TEACHER",
            },
            tests=status(201)
            + [
                'pm.test("studentCode เป็น null เพราะไม่ใช่นักศึกษา", () => pm.expect(pm.response.json().studentCode).to.eql(null));',
                'pm.collectionVariables.set("tmpTeacherId", pm.response.json().id);',
            ],
        ),
        req(
            "3.7 สร้าง STUDENT โดยไม่ใส่ studentCode → 400",
            "POST",
            "/users",
            token="adminToken",
            body={
                "fullName": "นักศึกษาไร้รหัส",
                "email": "nocode@mju.ac.th",
                "password": "{{defaultPassword}}",
                "role": "STUDENT",
            },
            tests=err("STUDENT_CODE_REQUIRED", 400),
        ),
        req(
            "3.8 สร้าง TEACHER พร้อม studentCode → 400",
            "POST",
            "/users",
            token="adminToken",
            body={
                "studentCode": "6700000000",
                "fullName": "อ.มีรหัสนักศึกษา",
                "email": "teacherwithcode@mju.ac.th",
                "password": "{{defaultPassword}}",
                "role": "TEACHER",
            },
            tests=err("STUDENT_CODE_NOT_ALLOWED", 400),
        ),
        req(
            "3.9 แก้ชื่อผู้ใช้ที่เพิ่งสร้าง → 200",
            "PATCH",
            "/users/{{tmpTeacherId}}",
            token="adminToken",
            body={"fullName": "อ.ทดสอบ เปลี่ยนชื่อแล้ว"},
            tests=status(200)
            + [
                'pm.test("ชื่อเปลี่ยนจริง", () => pm.expect(pm.response.json().fullName).to.include("เปลี่ยนชื่อแล้ว"));'
            ],
        ),
        req(
            "3.10 ADMIN ลบบัญชีตัวเอง → 409",
            "DELETE",
            "/users/{{adminId}}",
            token="adminToken",
            tests=err("SELF_DELETE", 409),
        ),
        req(
            "3.11 ลบผู้ใช้ที่ไม่มีอยู่ → 404",
            "DELETE",
            "/users/999999",
            token="adminToken",
            tests=err("NOT_FOUND", 404),
        ),
    ],
    "สร้าง TEACHER/ADMIN ได้เฉพาะ ADMIN — สมัครเองได้แค่ STUDENT",
)

# ═══════════════════════════ 4 · Resources ═══════════════════════════

resources = folder(
    "4 · Resources — เครื่องและทรัพยากรคงเหลือ",
    [
        req(
            "4.1 GET /resources — เก็บ id ของเครื่องแต่ละแบบไว้ใช้ต่อ",
            "GET",
            "/resources",
            token="adminToken",
            query={"limit": 100},
            tests=status(200)
            + [
                "const rows = pm.response.json().data;",
                'pm.test("มีเครื่องอย่างน้อย 4 ตัว", () => pm.expect(rows.length).to.be.at.least(4));',
                "",
                "const gpu   = rows.find(r => r.hasGpu && r.status === 'AVAILABLE');",
                "const plain = rows.find(r => !r.hasGpu && r.status === 'AVAILABLE');",
                "const maint = rows.find(r => r.status === 'MAINTENANCE');",
                "",
                'pm.test("มีเครื่อง GPU ที่ว่าง", () => pm.expect(gpu).to.not.be.undefined);',
                'pm.test("มีเครื่องธรรมดาที่ว่าง", () => pm.expect(plain).to.not.be.undefined);',
                'pm.test("มีเครื่องที่ปิดซ่อม", () => pm.expect(maint).to.not.be.undefined);',
                "",
                'pm.collectionVariables.set("gpuResourceId", gpu.id);',
                'pm.collectionVariables.set("plainResourceId", plain.id);',
                'pm.collectionVariables.set("maintResourceId", maint.id);',
            ],
        ),
        req(
            "4.2 GET /resources/usage — ที่เหลือคำนวณสด ไม่ได้เก็บไว้",
            "GET",
            "/resources/usage",
            token="adminToken",
            tests=status(200)
            + [
                "const rows = pm.response.json();",
                'pm.test("free = total − used ทุกแถว", () => rows.forEach(r => {',
                "  pm.expect(r.free_cpu).to.eql(r.total_cpu - r.used_cpu);",
                "  pm.expect(r.free_ram_gb).to.eql(r.total_ram_gb - r.used_ram_gb);",
                "  pm.expect(r.free_storage_gb).to.eql(r.total_storage_gb - r.used_storage_gb);",
                "}));",
                'pm.test("ไม่มีเครื่องไหนถูกใช้เกินความจุ", () => rows.forEach(r => pm.expect(r.free_cpu).to.be.at.least(0)));',
            ],
        ),
        req(
            "4.3 ADMIN เพิ่มเครื่องใหม่ → 201",
            "POST",
            "/resources",
            token="adminToken",
            prerequest=['pm.collectionVariables.set("tmpServerName", `cs-test-${Date.now()}`);'],
            body={
                "serverName": "{{tmpServerName}}",
                "totalCpu": 24,
                "totalRamGb": 96,
                "totalStorageGb": 1500,
                "hasGpu": False,
            },
            tests=status(201)
            + [
                'pm.test("status เริ่มต้นเป็น AVAILABLE", () => pm.expect(pm.response.json().status).to.eql("AVAILABLE"));',
                'pm.collectionVariables.set("tmpResourceId", pm.response.json().id);',
            ],
        ),
        req(
            "4.4 เพิ่มเครื่องชื่อซ้ำ → 409",
            "POST",
            "/resources",
            token="adminToken",
            body={
                "serverName": "{{tmpServerName}}",
                "totalCpu": 8,
                "totalRamGb": 16,
                "totalStorageGb": 200,
            },
            tests=err("DUPLICATE", 409),
        ),
        req(
            "4.5 นักศึกษาเพิ่มเครื่อง → 403",
            "POST",
            "/resources",
            token="studentToken",
            body={
                "serverName": "cs-hacker-01",
                "totalCpu": 8,
                "totalRamGb": 16,
                "totalStorageGb": 200,
            },
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "4.6 เพิ่มเครื่องที่ CPU ติดลบ → 400",
            "POST",
            "/resources",
            token="adminToken",
            body={
                "serverName": "cs-negative-01",
                "totalCpu": -4,
                "totalRamGb": 16,
                "totalStorageGb": 200,
            },
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "4.7 GET /resources/:id → 200",
            "GET",
            "/resources/{{tmpResourceId}}",
            token="studentToken",
            tests=status(200)
            + [
                'pm.test("มีรายการจัดสรรที่ยังใช้อยู่ติดมาด้วย", () => pm.expect(pm.response.json()).to.have.property("allocations"));'
            ],
        ),
        req(
            "4.8 เปลี่ยนสถานะเครื่องเป็น MAINTENANCE → 200",
            "PATCH",
            "/resources/{{tmpResourceId}}",
            token="adminToken",
            body={"status": "MAINTENANCE"},
            tests=status(200)
            + ['pm.test("status เปลี่ยนแล้ว", () => pm.expect(pm.response.json().status).to.eql("MAINTENANCE"));'],
        ),
        req(
            "4.9 GET เครื่องที่ไม่มีอยู่ → 404",
            "GET",
            "/resources/999999",
            token="adminToken",
            tests=err("NOT_FOUND", 404),
        ),
    ],
    "ตาราง resources เก็บแค่ 'ความจุรวม' — ที่เหลือคำนวณจาก allocations ทุกครั้ง",
)

# ═══════════════════════════ 5 · Requests ═══════════════════════════

create_body = {
    "teacherId": num("teacherId"),
    "subjectCode": "CS401",
    "reqCpu": 4,
    "reqRamGb": 16,
    "reqStorageGb": 200,
    "reqGpu": False,
    "reason": "ยิงจากชุดทดสอบ Postman เพื่อตรวจกระบวนการอนุมัติทั้งเส้น",
    "startDate": "2026-10-01",
    "endDate": "2026-12-31",
}

requests_folder = folder(
    "5 · Requests — ยื่น แก้ อนุมัติ ปฏิเสธ ยกเลิก",
    [
        req(
            "5.1 นักศึกษายื่นคำขอ → 201",
            "POST",
            "/requests",
            token="studentToken",
            body=create_body,
            tests=status(201)
            + [
                "const d = pm.response.json();",
                'pm.test("สถานะเริ่มต้นเป็น PENDING", () => pm.expect(d.status).to.eql("PENDING"));',
                'pm.test("studentId มาจาก token ไม่ใช่ body", () => pm.expect(d.studentId).to.eql(pm.collectionVariables.get("studentId")));',
                'pm.test("rejectReason ต้องว่าง", () => pm.expect(d.rejectReason).to.eql(null));',
                'pm.test("reviewedAt ยังว่าง", () => pm.expect(d.reviewedAt).to.eql(null));',
                'pm.collectionVariables.set("approveRequestId", d.id);',
            ],
        ),
        req(
            "5.2 ยัด studentId / status มาใน body → 400",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "studentId": 1, "status": "APPROVED"},
            tests=err("VALIDATION_FAILED", 400)
            + [
                'pm.test("บอกว่าคีย์ไหนเกินมา", () => {',
                "  const t = JSON.stringify(pm.response.json().error.details);",
                '  pm.expect(t).to.include("studentId");',
                '  pm.expect(t).to.include("status");',
                "});",
            ],
            desc="ยกระดับสิทธิ์ตัวเองด้วยการยัดฟิลด์ — ต้องถูกตีตกพร้อมบอกว่าตัวไหนเกิน",
        ),
        req(
            "5.3 endDate มาก่อน startDate → 400",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "startDate": "2026-12-31", "endDate": "2026-10-01"},
            tests=err("DATE_RANGE_INVALID", 400),
        ),
        req(
            "5.4 ใส่ teacherId ที่เป็นนักศึกษา → 400",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "teacherId": num("studentId")},
            tests=err("TEACHER_INVALID", 400),
            desc="กติกาเดียวกันนี้ถูกบังคับซ้ำที่ชั้นฐานข้อมูลด้วย trigger requests_enforce_roles",
        ),
        req(
            "5.5 reason สั้นเกินไป → 400",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "reason": "ขอ"},
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "5.6 อาจารย์ยื่นคำขอเอง → 403",
            "POST",
            "/requests",
            token="teacherToken",
            body=create_body,
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "5.7 นักศึกษาดูรายการของตัวเอง — ต้องไม่เห็นของคนอื่น",
            "GET",
            "/requests",
            token="studentToken",
            query={"limit": 100},
            tests=status(200)
            + [
                "const me = pm.collectionVariables.get('studentId');",
                'pm.test("ทุกใบเป็นของตัวเอง", () => pm.response.json().data.forEach(r => pm.expect(r.studentId).to.eql(me)));',
            ],
        ),
        req(
            "5.8 อาจารย์เห็นเฉพาะใบที่ตัวเองเป็นผู้รับรอง",
            "GET",
            "/requests",
            token="teacherToken",
            query={"limit": 100},
            tests=status(200)
            + [
                "const me = pm.collectionVariables.get('teacherId');",
                'pm.test("ทุกใบมี teacherId เป็นตัวเอง", () => pm.response.json().data.forEach(r => pm.expect(r.teacherId).to.eql(me)));',
            ],
        ),
        req(
            "5.9 นักศึกษาอีกคนเปิดคำขอของเรา → 404 (ไม่ใช่ 403)",
            "GET",
            "/requests/{{approveRequestId}}",
            token="student2Token",
            tests=err("NOT_FOUND", 404),
            desc="403 จะบอกใบ้ว่า id นั้นมีอยู่จริง ซึ่งพอให้ไล่ยิงหาได้ว่ามีคำขอเลขไหนบ้าง",
        ),
        req(
            "5.10 เจ้าของแก้คำขอตอนยัง PENDING → 200",
            "PATCH",
            "/requests/{{approveRequestId}}",
            token="studentToken",
            body={"reqCpu": 8, "reason": "แก้ไขคำขอ: ต้องใช้ CPU มากกว่าเดิมเพราะเพิ่มชุดข้อมูล"},
            tests=status(200)
            + ['pm.test("reqCpu เปลี่ยนเป็น 8", () => pm.expect(pm.response.json().reqCpu).to.eql(8));'],
        ),
        req(
            "5.11 อาจารย์คนที่ไม่ได้ถูกระบุ กดอนุมัติ → 404",
            "PATCH",
            "/requests/{{approveRequestId}}/approve",
            token="teacher2Token",
            tests=err("NOT_FOUND", 404),
        ),
        req(
            "5.12 นักศึกษากดอนุมัติเอง → 403",
            "PATCH",
            "/requests/{{approveRequestId}}/approve",
            token="studentToken",
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "5.13 อาจารย์ที่ถูกระบุอนุมัติ → 200",
            "PATCH",
            "/requests/{{approveRequestId}}/approve",
            token="teacherToken",
            tests=status(200)
            + [
                "const d = pm.response.json();",
                'pm.test("สถานะเป็น APPROVED", () => pm.expect(d.status).to.eql("APPROVED"));',
                'pm.test("reviewedAt ถูกประทับเวลาแล้ว", () => pm.expect(d.reviewedAt).to.not.be.null);',
            ],
        ),
        req(
            "5.14 อนุมัติซ้ำ → 409",
            "PATCH",
            "/requests/{{approveRequestId}}/approve",
            token="teacherToken",
            tests=err("STATE_INVALID", 409),
        ),
        req(
            "5.15 แก้คำขอหลังอนุมัติแล้ว → 409",
            "PATCH",
            "/requests/{{approveRequestId}}",
            token="studentToken",
            body={"reqCpu": 32},
            tests=err("STATE_INVALID", 409),
        ),
        # ── ใบที่สอง: ไว้ทดสอบการปฏิเสธ ──
        req(
            "5.16 ยื่นคำขอใบที่สอง (ไว้ทดสอบการปฏิเสธ)",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "subjectCode": "CS402"},
            tests=status(201)
            + ['pm.collectionVariables.set("rejectRequestId", pm.response.json().id);'],
        ),
        req(
            "5.17 ปฏิเสธโดยไม่ใส่เหตุผล → 400",
            "PATCH",
            "/requests/{{rejectRequestId}}/reject",
            token="teacherToken",
            body={"rejectReason": ""},
            tests=err("VALIDATION_FAILED", 400),
            desc="ฐานข้อมูลก็บังคับข้อนี้ซ้ำอีกชั้นด้วย CHECK requests_reject_reason_chk",
        ),
        req(
            "5.18 ปฏิเสธพร้อมเหตุผล → 200",
            "PATCH",
            "/requests/{{rejectRequestId}}/reject",
            token="teacherToken",
            body={"rejectReason": "ทรัพยากรที่ขอสูงเกินความจำเป็นของรายวิชานี้"},
            tests=status(200)
            + [
                "const d = pm.response.json();",
                'pm.test("สถานะเป็น REJECTED", () => pm.expect(d.status).to.eql("REJECTED"));',
                'pm.test("เหตุผลถูกเก็บไว้", () => pm.expect(d.rejectReason).to.include("สูงเกิน"));',
            ],
        ),
        req(
            "5.19 อนุมัติใบที่ถูกปฏิเสธไปแล้ว → 409",
            "PATCH",
            "/requests/{{rejectRequestId}}/approve",
            token="teacherToken",
            tests=err("STATE_INVALID", 409),
        ),
        # ── ใบที่สาม: ไว้ทดสอบการยกเลิก ──
        req(
            "5.20 ยื่นคำขอใบที่สาม (ไว้ทดสอบการยกเลิก)",
            "POST",
            "/requests",
            token="studentToken",
            body={**create_body, "subjectCode": "CS403"},
            tests=status(201)
            + ['pm.collectionVariables.set("cancelRequestId", pm.response.json().id);'],
        ),
        req(
            "5.21 นักศึกษาอีกคนกดยกเลิกใบของเรา → 404",
            "PATCH",
            "/requests/{{cancelRequestId}}/cancel",
            token="student2Token",
            tests=err("NOT_FOUND", 404),
        ),
        req(
            "5.22 เจ้าของกดยกเลิก → 200",
            "PATCH",
            "/requests/{{cancelRequestId}}/cancel",
            token="studentToken",
            tests=status(200)
            + ['pm.test("สถานะเป็น CANCELLED", () => pm.expect(pm.response.json().status).to.eql("CANCELLED"));'],
        ),
        req(
            "5.23 ยกเลิกซ้ำ → 409",
            "PATCH",
            "/requests/{{cancelRequestId}}/cancel",
            token="studentToken",
            tests=err("STATE_INVALID", 409),
        ),
        req(
            "5.24 GET /requests?status=PENDING — กรองสถานะ",
            "GET",
            "/requests",
            token="adminToken",
            query={"status": "PENDING", "limit": 100},
            tests=status(200)
            + [
                'pm.test("ทุกใบเป็น PENDING", () => pm.response.json().data.forEach(r => pm.expect(r.status).to.eql("PENDING")));'
            ],
        ),
        req(
            "5.25 GET /requests?status=ไม่มีค่านี้ → 400",
            "GET",
            "/requests",
            token="adminToken",
            query={"status": "WAITING"},
            tests=err("VALIDATION_FAILED", 400),
        ),
    ],
    "เส้นทางสถานะ: PENDING → APPROVED → ALLOCATED → EXPIRED (แตกไป REJECTED / CANCELLED ได้)",
)

# ═══════════════════════════ 6 · Allocations ═══════════════════════════

def prepare_request(label, var, subject, extra, note):
    """
    เตรียมคำขอที่อนุมัติแล้วไว้ใช้ทดสอบ — ทำเป็น request จริงสองข้อ (ยื่น + อนุมัติ)
    ไม่ใช้ pm.sendRequest ใน pre-request script เพราะ callback ที่ซ้อนกันไม่ถูกรอให้จบ
    ตัวแปรจึงยังว่างตอนข้อถัดไปยิง
    """
    body = {
        "teacherId": num("teacherId"),
        "subjectCode": subject,
        "reqCpu": 2,
        "reqRamGb": 8,
        "reqStorageGb": 50,
        "reason": note,
        "startDate": "2026-10-01",
        "endDate": "2026-11-01",
        **extra,
    }
    return [
        req(
            f"{label}a เตรียมคำขอ ({subject})",
            "POST",
            "/requests",
            token="studentToken",
            body=body,
            tests=status(201) + [f'pm.collectionVariables.set("{var}", pm.response.json().id);'],
        ),
        req(
            f"{label}b อาจารย์อนุมัติคำขอที่เตรียมไว้",
            "PATCH",
            "/requests/{{" + var + "}}/approve",
            token="teacherToken",
            tests=status(200)
            + ['pm.test("พร้อมจัดสรร", () => pm.expect(pm.response.json().status).to.eql("APPROVED"));'],
        ),
    ]


allocations = folder(
    "6 · Allocations — จัดสรรเครื่องและคืนเครื่อง",
    [
        req(
            "6.1 นักศึกษาจัดสรรเครื่องเอง → 403",
            "POST",
            "/allocations",
            token="studentToken",
            body={
                "requestId": num("approveRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.99",
                "port": 29999,
            },
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "6.2 ADMIN จัดสรรเครื่องให้คำขอที่ APPROVED → 201",
            "POST",
            "/allocations",
            token="adminToken",
            prerequest=[
                "// สุ่ม port ใหม่ทุกครั้ง เพื่อให้รันชุดทดสอบซ้ำได้โดยไม่ชนของเดิม",
                "pm.collectionVariables.set('allocPort', 30000 + Math.floor(Math.random() * 20000));",
            ],
            body={
                "requestId": num("approveRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.50",
                "port": num("allocPort"),
                "accessNote": "ssh student@10.10.20.50",
            },
            tests=status(201)
            + [
                "const d = pm.response.json();",
                'pm.test("คำขอเลื่อนเป็น ALLOCATED ในคำสั่งเดียวกัน", () => pm.expect(d.request.status).to.eql("ALLOCATED"));',
                'pm.test("releasedAt ยังว่าง = ยังใช้อยู่", () => pm.expect(d.releasedAt).to.eql(null));',
                'pm.collectionVariables.set("allocationId", d.id);',
            ],
        ),
        req(
            "6.3 จัดสรรซ้ำให้คำขอเดิม → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("approveRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.51",
                "port": 31111,
            },
            tests=err("STATE_INVALID", 409),
            desc="คำขอกลายเป็น ALLOCATED แล้ว จึงไม่ผ่านด่าน APPROVED อีก",
        ),
        req(
            "6.4 จัดสรรให้คำขอที่ถูกยกเลิกไปแล้ว → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("cancelRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.52",
                "port": 31222,
            },
            tests=err("STATE_INVALID", 409),
        ),
        *prepare_request(
            "6.5", "spareRequestId", "CS410", {}, "คำขอสำรองสำหรับทดสอบเงื่อนไขการจัดสรร"
        ),
        req(
            "6.5c จัดสรรลงเครื่องที่ปิดซ่อม → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("spareRequestId"),
                "resourceId": num("maintResourceId"),
                "ipAddress": "10.10.20.53",
                "port": 31333,
            },
            tests=err("RESOURCE_UNAVAILABLE", 409),
        ),
        req(
            "6.6 ip ไม่ใช่ IP ที่ถูกต้อง → 400",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("spareRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "999.1.1.1",
                "port": 31444,
            },
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "6.7 port เกิน 65535 → 400",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("spareRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.54",
                "port": 70000,
            },
            tests=err("VALIDATION_FAILED", 400),
        ),
        req(
            "6.8 port ชนกับที่ยังใช้อยู่บนเครื่องเดียวกัน → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("spareRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.55",
                "port": num("allocPort"),
            },
            tests=[
                'pm.test("ตอบ 409", () => pm.response.to.have.status(409));',
                'pm.test("เป็นเรื่อง port ซ้ำ", () => {',
                "  const c = pm.response.json().error.code;",
                '  pm.expect(["DUPLICATE", "DB_RULE_VIOLATION", "CONFLICT"]).to.include(c);',
                "});",
            ],
            desc="กันด้วย partial unique index allocations_active_port_uniq ที่ชั้นฐานข้อมูล",
        ),
        *prepare_request(
            "6.9",
            "gpuRequestId",
            "CS450",
            {"reqGpu": True},
            "ต้องใช้ GPU สำหรับทดสอบเงื่อนไขการจัดสรร",
        ),
        req(
            "6.9c คำขอที่ต้องใช้ GPU แต่จัดลงเครื่องที่ไม่มี GPU → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("gpuRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.56",
                "port": 31555,
            },
            tests=err("GPU_REQUIRED", 409),
        ),
        req(
            "6.10 คำขอเดียวกันจัดลงเครื่องที่มี GPU → 201",
            "POST",
            "/allocations",
            token="adminToken",
            prerequest=[
                "pm.collectionVariables.set('gpuPort', 40000 + Math.floor(Math.random() * 20000));"
            ],
            body={
                "requestId": num("gpuRequestId"),
                "resourceId": num("gpuResourceId"),
                "ipAddress": "10.10.20.57",
                "port": num("gpuPort"),
            },
            tests=status(201)
            + [
                'pm.test("ลงเครื่องที่มี GPU จริง", () => pm.expect(pm.response.json().resource.hasGpu).to.eql(true));',
                'pm.collectionVariables.set("gpuAllocationId", pm.response.json().id);',
            ],
        ),
        *prepare_request(
            "6.11",
            "bigRequestId",
            "CS460",
            {"reqCpu": 256, "reqRamGb": 2048, "reqStorageGb": 99999},
            "คำขอขนาดใหญ่เกินความจุ ไว้ทดสอบว่าระบบกันไว้จริง",
        ),
        req(
            "6.11c ขอทรัพยากรเกินความจุของเครื่อง → 409",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("bigRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.58",
                "port": 31666,
            },
            tests=err("CAPACITY_EXCEEDED", 409),
        ),
        req(
            "6.12 GET /allocations (ADMIN) → เห็นทั้งหมด",
            "GET",
            "/allocations",
            token="adminToken",
            query={"limit": 100},
            tests=status(200)
            + ['pm.test("มีอย่างน้อย 1 รายการ", () => pm.expect(pm.response.json().meta.total).to.be.at.least(1));'],
        ),
        req(
            "6.13 GET /allocations?active=true — เฉพาะที่ยังใช้อยู่",
            "GET",
            "/allocations",
            token="adminToken",
            query={"active": "true", "limit": 100},
            tests=status(200)
            + [
                'pm.test("ทุกรายการยังไม่ถูกคืน", () => pm.response.json().data.forEach(a => pm.expect(a.releasedAt).to.eql(null)));'
            ],
        ),
        req(
            "6.14 นักศึกษาเห็นเฉพาะการจัดสรรของตัวเอง",
            "GET",
            "/allocations",
            token="student2Token",
            query={"limit": 100},
            tests=status(200)
            + [
                'pm.test("ไม่เห็นของคนอื่น", () => pm.response.json().data.forEach(a => pm.expect(a.request.studentId).to.not.eql(pm.collectionVariables.get("studentId"))));'
            ],
        ),
        req(
            "6.15 คืนเครื่อง → 200 และคำขอกลายเป็น EXPIRED",
            "PATCH",
            "/allocations/{{allocationId}}/release",
            token="adminToken",
            body={"note": "จบภาคการศึกษาแล้ว"},
            tests=status(200)
            + [
                "const d = pm.response.json();",
                'pm.test("releasedAt ถูกประทับเวลา", () => pm.expect(d.releasedAt).to.not.be.null);',
                'pm.test("แถวยังอยู่ ไม่ได้ถูกลบ", () => pm.expect(d.id).to.eql(pm.collectionVariables.get("allocationId")));',
                'pm.test("คำขอเลื่อนเป็น EXPIRED", () => pm.expect(d.request.status).to.eql("EXPIRED"));',
            ],
            desc="คืนเครื่อง = ประทับ releasedAt ไม่ใช่ลบแถว — ประวัติการใช้งานจึงยังอยู่",
        ),
        req(
            "6.16 คืนซ้ำ → 409",
            "PATCH",
            "/allocations/{{allocationId}}/release",
            token="adminToken",
            body={},
            tests=err("ALREADY_RELEASED", 409),
        ),
        req(
            "6.17 ใช้ port เดิมซ้ำหลังคืนเครื่องแล้ว → 201",
            "POST",
            "/allocations",
            token="adminToken",
            body={
                "requestId": num("spareRequestId"),
                "resourceId": num("plainResourceId"),
                "ipAddress": "10.10.20.59",
                "port": num("allocPort"),
                "accessNote": "port เดิมที่คืนมาแล้ว กลับมาใช้ได้",
            },
            tests=status(201)
            + [
                'pm.test("ใช้ port เดิมได้จริง", () => pm.expect(pm.response.json().port).to.eql(Number(pm.collectionVariables.get("allocPort"))));',
                'pm.collectionVariables.set("reusedAllocationId", pm.response.json().id);',
            ],
            desc="พิสูจน์ว่า partial unique index ห้ามซ้ำ 'เฉพาะตอนที่ยังใช้อยู่' ไม่ใช่ตลอดกาล",
        ),
        req(
            "6.18 คืนเครื่องรายการที่ไม่มีอยู่ → 404",
            "PATCH",
            "/allocations/999999/release",
            token="adminToken",
            body={},
            tests=err("NOT_FOUND", 404),
        ),
    ],
    "จัดสรรได้เฉพาะคำขอที่ APPROVED · เครื่องต้องว่างและมีทรัพยากรพอ",
)

# ═══════════════════════════ 7 · Audit logs ═══════════════════════════

audit = folder(
    "7 · Audit logs — ประวัติการใช้งาน",
    [
        req(
            "7.1 GET /audit-logs (ADMIN) → 200",
            "GET",
            "/audit-logs",
            token="adminToken",
            query={"limit": 20},
            tests=status(200)
            + [
                "const rows = pm.response.json().data;",
                'pm.test("มีบันทึกอยู่", () => pm.expect(rows.length).to.be.at.least(1));',
                'pm.test("เรียงใหม่สุดขึ้นก่อน", () => { if (rows.length > 1) pm.expect(rows[0].id).to.be.above(rows[1].id); });',
            ],
        ),
        req(
            "7.2 GET /audit-logs (STUDENT) → 403",
            "GET",
            "/audit-logs",
            token="studentToken",
            tests=err("ROLE_FORBIDDEN", 403),
        ),
        req(
            "7.3 กรองตาม action=ALLOCATION_CREATE",
            "GET",
            "/audit-logs",
            token="adminToken",
            query={"action": "ALLOCATION_CREATE", "limit": 20},
            tests=status(200)
            + [
                "const rows = pm.response.json().data;",
                'pm.test("มีบันทึกการจัดสรร", () => pm.expect(rows.length).to.be.at.least(1));',
                'pm.test("ทุกแถวเป็น action เดียวกัน", () => rows.forEach(r => pm.expect(r.action).to.eql("ALLOCATION_CREATE")));',
            ],
        ),
        req(
            "7.4 กรองตาม action=REQUEST_APPROVE",
            "GET",
            "/audit-logs",
            token="adminToken",
            query={"action": "REQUEST_APPROVE", "limit": 20},
            tests=status(200)
            + [
                'pm.test("มีบันทึกการอนุมัติ", () => pm.expect(pm.response.json().data.length).to.be.at.least(1));'
            ],
        ),
        req(
            "7.5 limit เกิน 100 → 400",
            "GET",
            "/audit-logs",
            token="adminToken",
            query={"limit": 5000},
            tests=err("VALIDATION_FAILED", 400),
        ),
    ],
    "ตาราง audit_logs เขียนได้อย่างเดียว — trigger ปฏิเสธ UPDATE/DELETE ที่ชั้นฐานข้อมูล",
)

# ═══════════════════════════ 8 · เก็บกวาด ═══════════════════════════

cleanup = folder(
    "8 · เก็บกวาดหลังทดสอบ",
    [
        req(
            "8.1 คืนเครื่องที่จองไว้ตอนทดสอบ (GPU)",
            "PATCH",
            "/allocations/{{gpuAllocationId}}/release",
            token="adminToken",
            body={"note": "เก็บกวาดหลังรันชุดทดสอบ"},
            tests=status(200),
        ),
        req(
            "8.2 คืนเครื่องที่ใช้ port ซ้ำ",
            "PATCH",
            "/allocations/{{reusedAllocationId}}/release",
            token="adminToken",
            body={"note": "เก็บกวาดหลังรันชุดทดสอบ"},
            tests=status(200),
        ),
        req(
            "8.3 ลบ TEACHER ที่สร้างไว้ตอนทดสอบ",
            "DELETE",
            "/users/{{tmpTeacherId}}",
            token="adminToken",
            tests=status(200),
        ),
        req(
            "8.4 ลบเครื่องที่สร้างไว้ตอนทดสอบ",
            "DELETE",
            "/resources/{{tmpResourceId}}",
            token="adminToken",
            tests=status(200),
        ),
        req(
            "8.5 ตรวจว่าไม่มีเครื่องไหนถูกใช้เกินความจุหลังรันทั้งชุด",
            "GET",
            "/resources/usage",
            token="adminToken",
            tests=status(200)
            + [
                'pm.test("free ทุกค่าไม่ติดลบ", () => pm.response.json().forEach(r => {',
                "  pm.expect(r.free_cpu, r.server_name).to.be.at.least(0);",
                "  pm.expect(r.free_ram_gb, r.server_name).to.be.at.least(0);",
                "  pm.expect(r.free_storage_gb, r.server_name).to.be.at.least(0);",
                "}));",
            ],
        ),
    ],
    "รันชุดทดสอบซ้ำได้โดยไม่ทิ้งขยะสะสม",
)

# ═══════════════════════════ ประกอบร่าง ═══════════════════════════

collection = {
    "info": {
        "name": "CS-CloudFlow API",
        "description": (
            "ชุดทดสอบ REST API ของ CS-CloudFlow (NestJS + Prisma + PostgreSQL)\n\n"
            "**วิธีใช้:** เลือก environment `CS-CloudFlow (local)` แล้วกด Run collection "
            "— ทุกโฟลเดอร์ต้องรันเรียงตามลำดับ เพราะข้อหลังใช้ค่าที่ข้อก่อนหน้าเก็บไว้\n\n"
            "**ก่อนรัน:** เปิดเซิร์ฟเวอร์ `npm run dev` และรัน `npm run db:seed` แล้ว\n\n"
            "⚠️ ไฟล์นี้ generate จาก `postman/build-collection.py` — อย่าแก้ JSON ตรง ๆ"
        ),
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "item": [health, auth, users, resources, requests_folder, allocations, audit, cleanup],
    "variable": [
        {"key": "baseUrl", "value": "http://127.0.0.1:4000"},
        {"key": "defaultPassword", "value": "Passw0rd!"},
        # token มั่วต้องเป็น ASCII ล้วน — HTTP header ภาษาไทยส่งไม่ได้
        {"key": "badToken", "value": "aaaa.bbbb.cccc"},
        *[
            {"key": k, "value": ""}
            for k in [
                "adminToken", "teacherToken", "teacher2Token", "studentToken", "student2Token",
                "newStudentToken", "adminId", "teacherId", "teacher2Id", "studentId",
                "newEmail", "newCode", "newStudentId", "tmpTeacherEmail", "tmpTeacherId",
                "tmpServerName", "tmpResourceId", "gpuResourceId", "plainResourceId",
                "maintResourceId", "approveRequestId", "rejectRequestId", "cancelRequestId",
                "spareRequestId", "gpuRequestId", "bigRequestId", "allocationId",
                "gpuAllocationId", "reusedAllocationId", "allocPort", "gpuPort",
            ]
        ],
    ],
}

environment = {
    "name": "CS-CloudFlow (local)",
    "values": [
        {"key": "baseUrl", "value": "http://127.0.0.1:4000", "type": "default", "enabled": True},
        {"key": "defaultPassword", "value": "Passw0rd!", "type": "default", "enabled": True},
    ],
    "_postman_variable_scope": "environment",
}


def write(path, data):
    text = strip_num_marks(json.dumps(data, ensure_ascii=False, indent=2))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    return text


def count_items(node):
    if "item" in node:
        return sum(count_items(c) for c in node["item"])
    return 1


if __name__ == "__main__":
    write(COLLECTION, collection)
    write(ENVIRONMENT, environment)
    total = sum(count_items(f) for f in collection["item"])
    print(f"สร้างไฟล์เรียบร้อย — {len(collection['item'])} โฟลเดอร์ · {total} request")
    print(f"  {COLLECTION}")
    print(f"  {ENVIRONMENT}")
