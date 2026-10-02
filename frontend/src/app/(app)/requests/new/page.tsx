'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Advisor, Course, Paged, ResourceUsage } from '@/lib/types';
import { Alert, Card, DarkMeter, Icon, Slider, Switch } from '@/components/ui';

/**
 * เพดานที่ถือว่า "อยู่ในเกณฑ์ปกติของงานวิชาการ"
 *
 * ⚠️ เป็นค่าสำหรับแสดงผลฝั่งหน้าเว็บเท่านั้น — backend รับได้มากกว่านี้
 * (DTO จำกัดที่ 256 CPU / 2048 GB / 100000 GB) ค่านี้มีไว้ช่วยผู้ขอกะขนาด
 * ไม่ใช่กติกาที่บังคับ ถ้าอยากบังคับจริงต้องเพิ่มการตรวจใน RequestsService
 */
const GUIDELINE = { cpu: 16, ram: 64, storage: 500 };

/** ช่วงของ slider — เลือกให้ครอบงานของนักศึกษาตามปกติ */
const RANGE = {
  cpu: { min: 1, max: 8 },
  ram: { min: 2, max: 32 },
  storage: { min: 10, max: 200 },
};

export default function NewRequestPage() {
  const router = useRouter();
  const { user, can } = useAuth();
  const canCreate = can('request:create:own');

  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [usage, setUsage] = useState<ResourceUsage[]>([]);

  const [teacherPersonCode, setTeacherPersonCode] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cpu, setCpu] = useState(4);
  const [ram, setRam] = useState(16);
  const [storage, setStorage] = useState(50);
  const [gpu, setGpu] = useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await api<Paged<ResourceUsage>>('/resource-usages?limit=100');
        setUsage(u.data);
      } catch (e) {
        setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูลตั้งต้นไม่สำเร็จ');
      }
    })();

    // อาจารย์ที่ปรึกษาจาก Core Hub (/people/me) — บัญชีที่ยังไม่ผูกกับบุคคลจะได้รายการว่าง
    if (!canCreate) return;
    api<Paged<Advisor>>('/advisors')
      .then((r) => setAdvisors(r.data))
      .catch(() => {});
  }, [canCreate]);

  // รายวิชามาจากข้อมูลกลางของ Core Hub (ผ่าน backend ของระบบนี้) — ค้นตามที่พิมพ์
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

  /**
   * มีเครื่องไหน "รับไหว" จริงไหม — เช็กกับที่เหลือจริงจาก view resource_usage
   * ไม่ใช่แค่เทียบกับเพดานที่ตั้งไว้เอง
   */
  const fits = useMemo(() => {
    const candidates = usage.filter((n) => n.status === 'AVAILABLE' && (!gpu || n.hasGpu));
    return candidates.some(
      (n) => n.freeCpu >= cpu && n.freeRamGb >= ram && n.freeStorageGb >= storage,
    );
  }, [usage, cpu, ram, storage, gpu]);

  const withinGuideline = cpu <= GUIDELINE.cpu && ram <= GUIDELINE.ram && storage <= GUIDELINE.storage;

  async function submit() {
    setError('');
    if (!courseCode.trim()) return setError('เลือกรายวิชาจากข้อมูลกลาง');
    if (reason.trim().length < 10) return setError('อธิบายเหตุผลอย่างน้อย 10 ตัวอักษร');
    if (!startDate || !endDate) return setError('เลือกช่วงวันที่ใช้งาน');

    setBusy(true);
    try {
      const created = await api<{ id: string }>('/requests', {
        method: 'POST',
        body: {
          ...(teacherPersonCode.trim() ? { teacherPersonCode: teacherPersonCode.trim() } : {}),
          courseCode: courseCode.trim().toUpperCase(),
          reqCpu: cpu,
          reqRamGb: ram,
          reqStorageGb: storage,
          isGpuRequired: gpu,
          reason: reason.trim(),
          startDate,
          endDate,
        },
      });
      router.push(`/requests/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ยื่นคำขอไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (user && !can('request:create:own')) {
    return (
      <>
        <h1 className="page-title">New Resource Request</h1>
        <p className="page-sub">ยื่นคำขอได้เฉพาะบัญชีนักศึกษา</p>
        <Alert kind="bad">
          บัญชีนี้เป็น {user.subsystemRole} — การยื่นคำขอเปิดให้เฉพาะนักศึกษา
        </Alert>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">New Resource Request</h1>
      <p className="page-sub">Submit technical requirements for your academic project environment.</p>

      <Alert kind="bad">{error}</Alert>

      <div className="split-wide">
        <div style={{ display: 'grid', gap: 16 }}>
          {/* ── Project Details ─────────────────────────── */}
          <Card title="Project Details">
            <div className="row-2">
              <div className="field">
                <label className="lbl">Course Association</label>
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
                <label className="lbl">Faculty Advisor (รหัสบุคลากร)</label>
                <input
                  className="input"
                  list="advisor-list"
                  placeholder="ไม่ระบุ = อาจารย์คนใดก็พิจารณาได้"
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
              <label className="lbl">Technical Purpose</label>
              <textarea
                className="textarea"
                placeholder="Briefly describe the computational tasks..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="lbl">Duration Required</label>
              <div className="date-to">
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <span>to</span>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </Card>

          {/* ── Hardware Specifications ─────────────────── */}
          <Card title="Hardware Specifications">
            <Slider label="vCPU Cores" unit="Cores" value={cpu} min={RANGE.cpu.min} max={RANGE.cpu.max} onChange={setCpu} />
            <Slider label="Memory (RAM)" unit="GB" value={ram} min={RANGE.ram.min} max={RANGE.ram.max} step={2} onChange={setRam} />
            <Slider
              label="Storage Volume"
              unit="GB"
              value={storage}
              min={RANGE.storage.min}
              max={RANGE.storage.max}
              step={10}
              onChange={setStorage}
            />

            <div className="toggle-row">
              <div>
                <div className="t-title">Hardware Acceleration (GPU)</div>
                <div className="t-sub">Require NVIDIA T4 for parallel processing tasks.</div>
              </div>
              <Switch on={gpu} onToggle={() => setGpu((v) => !v)} />
            </div>
          </Card>
        </div>

        {/* ── Quota Impact ──────────────────────────────── */}
        <div className="panel-dark">
          <h3>Quota Impact</h3>

          <DarkMeter label="Compute Limit (vCPU)" used={cpu} total={GUIDELINE.cpu} />
          <DarkMeter label="Memory Limit (GB)" used={ram} total={GUIDELINE.ram} />
          <DarkMeter label="Storage Limit (GB)" used={storage} total={GUIDELINE.storage} />

          <div className="dnote">
            <Icon.info />
            <span>
              {!fits
                ? 'ตอนนี้ไม่มีเครื่องที่ว่างพอรับสเปกนี้ — ยื่นได้ แต่แอดมินอาจต้องรอเครื่องว่างก่อนจัดสรร'
                : withinGuideline
                  ? 'This configuration falls within standard academic allocation guidelines. Approval is likely automatic.'
                  : 'สเปกนี้สูงกว่าเกณฑ์ปกติของงานวิชาการ — อาจารย์อาจขอให้ชี้แจงเพิ่ม'}
            </span>
          </div>

          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            <Icon.send /> {busy ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </>
  );
}
