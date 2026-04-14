'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Building2, Users, FileText, List,
  Settings, LogOut, Zap, Activity,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/super-admin/dashboard',  icon: LayoutDashboard },
  { label: 'Companies',  href: '/super-admin/companies',  icon: Building2 },
  { label: 'Users',      href: '/super-admin/users',      icon: Users },
];

const SUPER_ADMIN_BOTTOM: NavItem[] = [
  { label: 'Integrations', href: '/settings/integrations', icon: Activity },
  { label: 'Settings',     href: '/super-admin/settings',  icon: Settings },
];

const DEVELOPER_NAV: NavItem[] = [
  { label: 'My Forms',    href: '/developer/forms',       icon: FileText },
  { label: 'List Pages',  href: '/developer/list-pages',  icon: List },
];

const DEVELOPER_BOTTOM: NavItem[] = [
  { label: 'Integrations', href: '/settings/integrations', icon: Activity },
  { label: 'Settings',     href: '/developer/settings',    icon: Settings },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <item.icon
        size={16}
        className={isActive ? 'text-indigo-600' : 'text-slate-400'}
      />
      {item.label}
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
    </Link>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, refreshToken } = useAuthStore();

  const handleLogout = async () => {
    try {
      if (refreshToken) await authAPI.logout(refreshToken);
    } finally {
      logout();
      router.push('/auth/login');
      toast.success('Signed out');
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const mainNav  = isSuperAdmin ? SUPER_ADMIN_NAV    : DEVELOPER_NAV;
  const bottomNav = isSuperAdmin ? SUPER_ADMIN_BOTTOM : DEVELOPER_BOTTOM;

  return (
    <aside className="w-[var(--sidebar-width)] min-h-screen bg-white border-r border-slate-200 flex flex-col">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-200">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-none">Dynamic Admin</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Main
        </p>
        {mainNav.map(item => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <div className="pt-5 space-y-0.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
            Manage
          </p>
          {bottomNav.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
            {user?.first_name?.[0]?.toUpperCase()}{user?.last_name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate leading-none">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
