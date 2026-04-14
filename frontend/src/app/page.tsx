'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authAPI } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();
  const { accessToken, login, logout } = useAuthStore();

  useEffect(() => {
    if (!accessToken) {
      router.replace('/auth/login');
      return;
    }

    authAPI.verify()
      .then(({ data }) => {
        // Token is valid — sync user from backend and go to dashboard
        const stored = useAuthStore.getState();
        login({
          access: stored.accessToken!,
          refresh: stored.refreshToken!,
          user: data.user,
        });
        const role = data.user.role;
        if (role === 'super_admin') router.replace('/super-admin/dashboard');
        else if (['developer', 'company_admin'].includes(role)) router.replace('/developer/forms');
        else router.replace('/app/dashboard');
      })
      .catch(() => {
        logout();
        router.replace('/auth/login');
      });
  }, [accessToken, login, logout, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm">Checking session…</p>
      </div>
    </div>
  );
}
