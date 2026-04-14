'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authAPI } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, login, logout, refreshToken } = useAuthStore();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/auth/login');
      return;
    }

    authAPI.verify()
      .then(({ data }) => {
        if (data.user.role !== 'super_admin') {
          router.replace('/auth/login');
          return;
        }
        // Sync latest user data from backend
        login({ access: accessToken, refresh: refreshToken!, user: data.user });
        setVerified(true);
      })
      .catch(() => {
        logout();
        router.replace('/auth/login');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
