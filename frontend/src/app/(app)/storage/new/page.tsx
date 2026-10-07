'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Advisor, Course, Paged, StoragePool } from '@/lib/types';
import { Alert, Card, DarkMeter, Icon } from '@/components/ui';
import { gb } from '@/components/storage';

/** ขนาดให้เลือก (GB) — ตัดตัวที่เกินเพดานต่อคนของ pool ออกเอง */
const SIZES = [5, 10, 15];

export default function NewStorageRequestPage() {
  const router = useRouter();
  const { user, can } = useAuth();
  const canCreate = can('storage:create:own');

  const [pool, setPool] = useState<StoragePool | null>(null);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  const [courseCode, setCourseCode] = useState('');
  const [teacherPersonCode, setTeacherPersonCode] = useState('');
  const [quotaGb, setQuotaGb] = useState(15);
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canCreate) return;
    api<StoragePool>('/storage-pools/current')
      .then((p) => {
        setPool(p);
        setQuotaGb((q) => Math.min(q, Math.floor(p.maxPerUserMib / 1024)));
      })
      .catch((e) => setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูล pool ไม่สำเร็จ'));
    api<Paged<Advisor>>('/advisors')
      .then((r) => setAdvisors(r.data))
      .catch(() => {});
  }, [canCreate]);

  useEffect(() => {
    if (!canCreate) return;
    const q = courseCode.trim();
    const t = setTimeout(() => {
      api<Paged<Course>>(`/courses?limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setCourses(r.data))
        .catch(() => setCourses([]));
    }, 250);
    return () => clearTimeout(t);
  }, [courseCode, canCreate]);

  const maxGb = pool ? Math.floor(pool.maxPerUserMib / 1024) : 15;
  const sizes = SIZES.filter((s) => s <= maxGb);
  const tooBig = pool ? quotaGb * 1024 > pool.freeMib : false;

  async function submit() {
    setError('');
    if (!courseCode.trim()) return setError('เลือกรายวิชาจากข้อมูลกลาง');
    if (reason.trim().length < 10) return setError('อธิบายเหตุผลอย่างน้อย 10 ตัวอักษร');
    if (!startDate || !endDate) return setError('เลือกช่วงวันที่ใช้งาน');
    if (endDate < startDate) return setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');

    setBusy(true);
    try {
      const created = await api<{ id: string }>('/storage-requests', {
        method: 'POST',
        body: {
          ...(teacherPersonCode.trim() ? { teacherPersonCode: teacherPersonCode.trim() } : {}),
          courseCode: courseCode.trim().toUpperCase(),
          quotaGb,
          reason: reason.trim(),
          startDate,
          endDate,
        },
      });
      router.push(`/storage/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ยื่นคำขอไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (user && !canCreate) {
    return (
      <>
        <h1 className="page-title">ขอยืมพื้นที่ Cloud</h1>
        <Alert kind="bad">บัญชีนี้เป็น {user.subsystemRole} — การยืมพื้นที่เปิดให้เฉพาะนักศึกษา</Alert>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">ขอยืมพื้นที่ Cloud</h1>
      <p className="page-sub">อาจารย์อนุมัติแล้ว ระบบจะสร้างพื้นที่และให้ลิงก์ใช้งานในหน้าคำขอทันที</p>

      <Alert kind="bad">{error}</Alert>

      <div className="split-wide">
        <Card title="รายละเอียดคำขอ">
          <div className="row-2">
            <div className="field">
              <label className="lbl">รายวิชา</label>
              <input
                className="input"
                list="course-list"
                placeholder="10301111-1"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
              />
              <datalist id="course-list">
                {courses.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nameTh}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="field">
              <label className="lbl">อาจารย์ผู้อนุมัติ (รหัสบุคลากร)</label>
              <input
                className="input"
                list="advisor-list"
                placeholder="ไม่ระบุ = อาจารย์คนใดก็อนุมัติได้"
                value={teacherPersonCode}
                onChange={(e) => setTeacherPersonCode(e.target.value)}
              />
              <datalist id="advisor-list">
                {advisors.map((a) => (
                  <option key={a.personCode} value={a.personCode}>
                    {a.fullNameTh}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          <div className="field">
            <label className="lbl">ขนาดพื้นที่</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-sm ${quotaGb === s ? 'btn-primary' : ''}`}
                  onClick={() => setQuotaGb(s)}
                  aria-pressed={quotaGb === s}
                >
                  {s} GB
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="lbl">ใช้ทำอะไร</label>
            <textarea
              className="textarea"
              placeholder="เช่น เก็บ dataset และไฟล์โมเดลของโปรเจกต์จบ"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="lbl">ช่วงที่ใช้งาน</label>
            <div className="date-to">
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span>ถึง</span>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </Card>

        <div className="panel-dark">
          <h3>พื้นที่รวม</h3>
          {pool ? (
            <>
              <DarkMeter label="ที่จองแล้ว (GB)" used={Math.round((pool.totalMib - pool.freeMib) / 1024)} total={Math.round(pool.totalMib / 1024)} />
              <div className="dfield" style={{ marginBottom: 12 }}>
                <div className="k">คำขอนี้</div>
                <div className="v">
                  {quotaGb} GB <span style={{ opacity: 0.6 }}>(สูงสุด {maxGb} GB ต่อคน)</span>
                </div>
              </div>
            </>
          ) : (
            <p className="sub">กำลังโหลด…</p>
          )}
          <div className="dnote">
            <Icon.info />
            <span>
              {tooBig
                ? `ตอนนี้พื้นที่รวมเหลือ ${pool ? gb(pool.freeMib) : ''} ไม่พอ — ลองลดขนาด หรือรอคนคืนพื้นที่`
                : 'จองพื้นที่จริงตอนอาจารย์อนุมัติ · หมดอายุแล้วลิงก์ถูกปิด และไฟล์ถูกลบหลัง 14 วัน'}
            </span>
          </div>
          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || tooBig}>
            <Icon.send /> {busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}
          </button>
        </div>
      </div>
    </>
  );
}
