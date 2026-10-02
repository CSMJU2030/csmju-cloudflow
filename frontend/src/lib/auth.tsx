'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, goToLogin } from './api';
import type { Me } from './types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  /** 401 ซ้ำหลัง re-SSO ไม่ถึง 30 วินาที — ให้ผู้ใช้กดปุ่มเข้าสู่ระบบเอง */
  needsLogin: boolean;
  signOut: () => void;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * ตัวตนมาจาก GET /api/v1/me (คุกกี้ session ของ Core Hub SSO) — ระบบนี้ไม่มีหน้า login ของตัวเอง
 * ยังไม่ login → พาไป /auth/login ซึ่ง redirect ไป Core Hub
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<Me>('/me');
        if (!cancelled) setUser(me);
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status === 401) {
          // api() พาไป SSO ให้แล้ว ถ้าไม่ได้พา (กันวน) ให้แสดงปุ่ม
          setNeedsLogin(true);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ต่ออายุล่วงหน้า: token อายุ 15 นาที — ก่อนหมด 1 นาทีพาไป re-SSO ตอนผู้ใช้เปลี่ยนหน้า/กลับมาที่แท็บ
  useEffect(() => {
    if (!user) return;
    const check = () => {
      if (Date.parse(user.session.expiresAt) - Date.now() < 60_000) goToLogin(true);
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [user]);

  function signOut() {
    // ออกทั้งระบบ: POST /auth/logout ลบคุกกี้แล้ว 303 ไปหน้า /logout ของ Core Hub (ต้องเป็น top-level form)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  }

  // คงตัวตลอดอายุของ user — หน้าที่ใส่ can ใน dependency ของ useCallback/useEffect จะไม่โหลดซ้ำวนไม่จบ
  const can = useCallback(
    (...permissions: string[]) => Boolean(user && permissions.some((p) => user.permissions.includes(p))),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, needsLogin, signOut, can }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใต้ AuthProvider');
  return ctx;
}
