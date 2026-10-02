'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Paged, User, UserRole } from '@/lib/types';
import { Alert, Card, Empty, Icon, initials, roleLabel } from '@/components/ui';

export default function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<User[] | null>(null);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'STUDENT' as UserRole,
    studentCode: '',
  });

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (role) qs.set('role', role);
      if (q.trim()) qs.set('q', q.trim());
      const res = await api<Paged<User>>(`/users?${qs}`);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
      setRows([]);
    }
  }, [role, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function create() {
    setError('');
    setOk('');
    setBusy(true);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          ...(form.role === 'STUDENT' ? { studentCode: form.studentCode.trim() } : {}),
        },
      });
      setOk(`สร้างผู้ใช้ ${form.email} แล้ว`);
      setForm({ fullName: '', email: '', password: '', role: 'STUDENT', studentCode: '' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'สร้างผู้ใช้ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, email: string) {
    if (!window.confirm(`ลบผู้ใช้ ${email}?`)) return;
    setError('');
    setOk('');
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      setOk(`ลบ ${email} แล้ว`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.readable : 'ลบไม่สำเร็จ');
    }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <>
        <h1 className="page-title">Settings</h1>
        <Alert kind="bad">หน้านี้เปิดให้เฉพาะ ADMIN — endpoint /users ตอบ 403 กับ role อื่น</Alert>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">User Management</h1>
      <p className="page-sub">จัดการบัญชีผู้ใช้ทั้งระบบ · สร้าง TEACHER และ ADMIN ได้ที่นี่เท่านั้น</p>

      <Alert kind="bad">{error}</Alert>
      <Alert kind="ok">{ok}</Alert>

      <div className="toolbar">
        <select className="select" style={{ maxWidth: 180 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">ทุก role</option>
          <option value="STUDENT">STUDENT</option>
          <option value="TEACHER">TEACHER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <div className="search grow">
          <Icon.search />
          <input className="input" placeholder="ค้นชื่อ อีเมล หรือรหัสนักศึกษา..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="split-wide">
        <Card title="รายชื่อผู้ใช้" bare>
          {rows === null ? (
            <Empty>กำลังโหลด…</Empty>
          ) : rows.length === 0 ? (
            <Empty>ไม่พบผู้ใช้</Empty>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Student ID</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="avatar sm">{initials(u.fullName)}</span>
                          <div>
                            <div className="cell-strong">{u.fullName}</div>
                            <div className="cell-sub">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`chip chip-${u.role === 'ADMIN' ? 'approved' : u.role === 'TEACHER' ? 'pending' : 'neutral'}`}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {u.studentCode ?? '—'}
                      </td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-sm" disabled={u.id === user.id} onClick={() => remove(u.id, u.email)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="เพิ่มผู้ใช้">
          <div className="field">
            <label className="lbl">Full Name</label>
            <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl">Password</label>
            <input
              className="input"
              type="password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="lbl">Role</label>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="STUDENT">STUDENT</option>
              <option value="TEACHER">TEACHER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          {form.role === 'STUDENT' && (
            <div className="field">
              <label className="lbl">Student Code</label>
              <input
                className="input mono"
                placeholder="ตัวเลข 8–20 หลัก"
                value={form.studentCode}
                onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
              />
            </div>
          )}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={create}>
            <Icon.plus /> {busy ? 'กำลังสร้าง…' : 'Create User'}
          </button>
          <p className="cell-sub" style={{ marginTop: 10 }}>
            STUDENT ต้องมี studentCode · role อื่นต้องไม่มี — ฐานข้อมูลบังคับกติกานี้ซ้ำอีกชั้น
          </p>
        </Card>
      </div>
    </>
  );
}
