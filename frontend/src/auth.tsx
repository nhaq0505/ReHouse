import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type User } from './api';

interface AuthValue {
  user: User | null;
  ready: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const setUser = useCallback((next: User | null) => { queryClient.clear(); setUserState(next); }, [queryClient]);
  const refresh = useCallback(async () => {
    try {
      const next = await api.auth.me();
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, [setUser]);
  const signOut = useCallback(async () => {
    try { await api.auth.logout(); } finally { setUser(null); }
  }, [setUser]);
  useEffect(() => {
    if (/^\/(?:t|tenant)\/[^/]+/.test(window.location.pathname)) { setReady(true); return; }
    void refresh();
  }, [refresh]);
  const value = useMemo(() => ({ user, ready, setUser, refresh, signOut }), [user, ready, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
