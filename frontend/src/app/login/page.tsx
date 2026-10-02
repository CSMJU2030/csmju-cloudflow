'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Card, Icon } from '@/components/ui';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.readable : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function fill(e: string) {
    setEmail(e);
    setPassword('Passw0rd!');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="n">CS-CloudFlow</div>
          <div className="s">ระบบขอใช้ทรัพยากรเซิร์ฟเวอร์</div>
        </div>

        <Card>
          <form onSubmit={submit}>
            <Alert kind="bad">{error}</Alert>

            <div className="field">
              <label className="lbl">Email</label>
              <input
                className="input"
                type="email"
                autoComplete="username"
                placeholder="you@mju.ac.th"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="lbl">Password</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
              />
            </div>

            <button className="btn btn-primary btn-block" disabled={busy}>
              <Icon.send /> {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="hint">
            <div>บัญชีทดสอบ (รหัสผ่าน Passw0rd!)</div>
            <button className="link-copy" style={{ color: 'var(--brand)' }} onClick={() => fill('admin@mju.ac.th')}>
              admin@mju.ac.th — <b>ADMIN</b>
            </button>
            <br />
            <button className="link-copy" style={{ color: 'var(--brand)' }} onClick={() => fill('somchai.t@mju.ac.th')}>
              somchai.t@mju.ac.th — <b>TEACHER</b>
            </button>
            <br />
            <button className="link-copy" style={{ color: 'var(--brand)' }} onClick={() => fill('natdanai@mju.ac.th')}>
              natdanai@mju.ac.th — <b>STUDENT</b>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
