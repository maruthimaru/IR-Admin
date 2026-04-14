'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import { authAPI } from '@/lib/api';
import {
  Building2, LogOut, LayoutDashboard, FileText,
  Users, Settings, Globe,
} from 'lucide-react';

export default function TenantDashboardPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  const { user, isAuthenticated, logout } = useAuthStore();
  const { company, clearCompany }         = useTenantStore();

  // Auth is handled by [tenant]/layout.tsx

  const handleLogout = async () => {
    try {
      const refresh = localStorage.getItem('refresh_token') ?? '';
      await authAPI.logout(refresh);
    } catch { /* ignore */ }
    logout();
    clearCompany();
    router.push(`/${subdomain}/login`);
  };

  if (!user || !isAuthenticated) return null;

  const companyName = company?.name ?? subdomain;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        {/* Brand */}
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Building2 size={16} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{companyName}</p>
              <p className="text-xs text-slate-400 font-mono truncate">{subdomain}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {[
            { icon: LayoutDashboard, label: 'Dashboard',  href: `/${subdomain}/dashboard` },
            { icon: FileText,        label: 'Forms',       href: `/${subdomain}/developer/forms` },
            { icon: Users,           label: 'Users',       href: `/${subdomain}/users` },
            { icon: Globe,           label: 'Pages',       href: `/${subdomain}/developer/pages` },
            { icon: Settings,        label: 'Settings',    href: `/${subdomain}/settings` },
          ].map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
              {user.first_name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.first_name} {user.last_name}</p>
              <p className="text-xs text-slate-400 capitalize">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {user.first_name || 'Admin'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {companyName} workspace
              {company?.plan && (
                <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium capitalize">
                  {company.plan}
                </span>
              )}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Dynamic Forms',  value: '—', icon: FileText,  color: 'bg-blue-50 text-blue-600' },
              { label: 'Total Records',  value: '—', icon: LayoutDashboard, color: 'bg-purple-50 text-purple-600' },
              { label: 'Team Members',   value: '—', icon: Users,     color: 'bg-green-50 text-green-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">{label}</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={15} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Create Form',   href: `/${subdomain}/developer/forms`, icon: FileText },
                { label: 'Manage Users',  href: `/${subdomain}/users`,           icon: Users },
                { label: 'Settings',      href: `/${subdomain}/settings`,        icon: Settings },
              ].map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-indigo-300 transition-colors"
                >
                  <Icon size={15} className="text-indigo-500" />
                  {label}
                </a>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
