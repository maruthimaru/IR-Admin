'use client';

/**
 * Shared sidebar + main layout for all tenant pages.
 * Import this in each tenant page and wrap the page content.
 */

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import { authAPI } from '@/lib/api';
import {
  Building2, LogOut, LayoutDashboard, FileText,
  Users, Settings, Globe, BarChart2,
} from 'lucide-react';

interface TenantShellProps {
  children: React.ReactNode;
}

export default function TenantShell({ children }: TenantShellProps) {
  const params    = useParams();
  const pathname  = usePathname();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  const { user, logout }     = useAuthStore();
  const { company, clearCompany } = useTenantStore();

  const companyName = company?.name ?? subdomain;

  const handleLogout = async () => {
    try {
      const refresh = localStorage.getItem('refresh_token') ?? '';
      await authAPI.logout(refresh);
    } catch { /* ignore */ }
    logout();
    clearCompany();
    router.push(`/${subdomain}/login`);
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard',  href: `/${subdomain}/dashboard` },
    { icon: FileText,        label: 'Forms',       href: `/${subdomain}/developer/forms` },
    { icon: BarChart2,       label: 'Reports',     href: `/${subdomain}/developer/reports` },
    { icon: Globe,           label: 'Pages',       href: `/${subdomain}/developer/pages` },
    { icon: Users,           label: 'Users',       href: `/${subdomain}/users` },
    { icon: Settings,        label: 'Settings',    href: `/${subdomain}/settings` },
  ];

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
          {navItems.map(({ icon: Icon, label, href }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
              {user?.first_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
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
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
