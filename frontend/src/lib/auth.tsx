'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, token } from './api';
import type { LoginResult, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // ถาม backend ใหม่ทุกครั้งที่โหลดหน้า แทนที่จะเชื่อข้อมูลใน localStorage
  // ถ้า token หมดอายุหรือบัญชีถูกลบ จะรู้ทันทีไม่ใช่ตอนกดปุ่มแล้วเด้ง 401
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token.get()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api<User>('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        token.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ยังไม่ล็อกอินแล้วเปิดหน้าอื่น → ส่งกลับหน้าเข้าสู่ระบบ
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') router.replace('/login');
    if (user && pathname === '/login') router.replace('/');
  }, [user, loading, pathname, router]);

  async function signIn(email: string, password: string) {
    const result = await api<LoginResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    token.set(result.accessToken);
    setUser(result.user);
    return result.user;
  }

  function signOut() {
    token.clear();
    setUser(null);
    router.replace('/login');
  }

  async function refresh() {
    setUser(await api<User>('/auth/me'));
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใต้ AuthProvider');
  return ctx;
}
