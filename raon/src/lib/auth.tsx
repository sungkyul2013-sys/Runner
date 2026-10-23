import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { clearCache } from './hooks';
import { vt } from './motion';
import type { AcademyInfo, Me } from '../../shared/types';

interface AuthState {
  me: Me | null;
  ready: boolean;
  needsSetup: boolean;
  academy: AcademyInfo;
  setMe(me: Me | null): void;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState>(null!);
const FALLBACK: AcademyInfo = { name: '라온국어', phone: '', address: '' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [academy, setAcademy] = useState<AcademyInfo>(FALLBACK);

  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>('/auth/me');
      setMe(m);
      setAcademy(m.academy);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        const s = await api.get<{ needsSetup: boolean; academy: AcademyInfo }>('/setup').catch(() => null);
        if (s) {
          setNeedsSetup(s.needsSetup);
          setAcademy(s.academy);
        }
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = academy.name;
  }, [academy.name]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    clearCache();
    document.body.classList.remove('no-scroll');
    vt(() => setMe(null), 'leave');
  }, []);

  const set = useCallback((m: Me | null) => {
    // 다른 계정으로 바뀌면 앞 사람의 데이터를 지운다
    clearCache();
    setMe(m);
    if (m) {
      setAcademy(m.academy);
      setNeedsSetup(false);
    }
  }, []);

  return <Ctx.Provider value={{ me, ready, needsSetup, academy, setMe: set, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
