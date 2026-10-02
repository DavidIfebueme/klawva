'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getDashboardMe } from '@/lib/api';
import { UserProfileResponse } from '@/types';

interface AuthContextType {
  token: string | null;
  user: UserProfileResponse | null;
  loading: boolean;
  login: (token: string, user: UserProfileResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function DashboardAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('klawva_dashboard_token');
      if (!storedToken) {
        setLoading(false);
        if (pathname !== '/dashboard/login' && pathname !== '/dashboard/auth/verify') {
          router.push('/dashboard/login');
        }
        return;
      }

      try {
        const profile = await getDashboardMe(storedToken);
        setToken(storedToken);
        setUser(profile);
      } catch (err) {
        console.error('Session validation failed', err);
        localStorage.removeItem('klawva_dashboard_token');
        if (pathname !== '/dashboard/login' && pathname !== '/dashboard/auth/verify') {
          router.push('/dashboard/login');
        }
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, [pathname, router]);

  const login = (newToken: string, newUser: UserProfileResponse) => {
    localStorage.setItem('klawva_dashboard_token', newToken);
    setToken(newToken);
    setUser(newUser);
    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('klawva_dashboard_token');
    setToken(null);
    setUser(null);
    router.push('/dashboard/login');
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useDashboardAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useDashboardAuth must be used within a DashboardAuthProvider');
  }
  return context;
}
