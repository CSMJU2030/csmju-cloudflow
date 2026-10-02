'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ResourceUsage, Teacher } from '@/lib/types';
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
  const { user } = useAuth();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [usage, setUsage] = useState<ResourceUsage[]>([]);

  const [teacherId, setTeacherId] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
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
        const [t, u] = await Promise.all([
          api<Teacher[]>('/users/teachers'),
          api<ResourceUsage[]>('/resources/usage'),
        ]);
        setTeachers(t);
        setUsage(u);
      } catch (e) {
        setError(e instanceof ApiError ? e.readable : 'โหลดข้อมูลตั้งต้นไม่สำเร็จ');
      }
    })();

    // รหัสวิชาที่เคยยื่นมาก่อน — ใช้เป็นตัวเลือกให้พิมพ์น้อยลง
    api<{ data: { subjectCode: string }[] }>('/requests?limit=100')
      .then((r) => setSubjects([...new Set(r.data.map((x) => x.subjectCode))].sort()))
      .catch(() => {});
  }, []);

  /**
   * มีเครื่องไหน "รับไหว" จริงไหม — เช็กกับที่เหลือจริงจาก view resource_usage
   * ไม่ใช่แค่เทียบกับเพดานที่ตั้งไว้เอง
   */
  const fits = useMemo(() => {
    const candidates = usage.filter(
      (n) => n.status === 'AVAILABLE' && (!gpu || n.has_gpu),
    );
    return candidates.some(
      (n) => n.free_cpu >= cpu && n.free_ram_gb >= ram && n.free_storage_gb >= storage,
    );
  }, [usage, cpu, ram, storage, gpu]);

  const withinGuideline = cpu <= GUIDELINE.cpu && ram <= GUIDELINE.ram && storage <= GUIDELINE.storage;

  async function submit() {
    setError('');
    if (!teacherId) return setError('เลือกอาจารย์ผู้รับรองก่อน');
    if (!subjectCode.trim()) return setError('ใส่รหัสวิชา');
    if (reason.trim().length < 10) return setError('อธิบายเหตุผลอย่างน้อย 10 ตัวอักษร');
    if (!startDate || !endDate) return setError('เลือกช่วงวันที่ใช้งาน');

    setBusy(true);
    try {
      const created = await api<{ id: number }>('/requests', {
        method: 'POST',
        body: {
          teacherId: Number(teacherId),
          subjectCode: subjectCode.trim().toUpperCase(),
          reqCpu: cpu,
          reqRamGb: ram,
          reqStorageGb: storage,
          reqGpu: gpu,
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

  if (user && user.role !== 'STUDENT') {
    return (
      <>
        <h1 className="page-title">New Resource Request</h1>
        <p className="page-sub">ยื่นคำขอได้เฉพาะบัญชีนักศึกษา</p>
        <Alert kind="bad">
          บัญชีนี้เป็น {user.role} — endpoint <code>POST /requests</code> เปิดให้เฉพาะ role STUDENT
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
                  list="subject-list"
                  placeholder="CS432"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                />
                <datalist id="subject-list">
                  {subjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label className="lbl">Faculty Advisor</label>
                <select className="select" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">Select Advisor</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
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
