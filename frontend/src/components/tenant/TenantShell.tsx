'use client';

/**
 * Shared sidebar + main layout for all tenant pages.
 * Import this in each tenant page and wrap the page content.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import { authAPI, permissionsAPI, formsAPI } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Building2, LogOut, LayoutDashboard, FileText,
  Users, Settings, Globe, BarChart2, Plug, Shield, Lock,
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
  const setPermissions = useAuthStore(s => (s as { setPermissions?: (p: import('@/types').PermissionsResponse) => void }).setPermissions);
  const { company, clearCompany } = useTenantStore();
  const { isAdmin, canSection, formPerms } = usePermissions();

  // Refresh permissions on every page navigation so role changes apply immediately
  useEffect(() => {
    permissionsAPI.myPermissions().then(r => {
      setPermissions?.(r.data);
    }).catch(() => {});
  }, [pathname]);

  // Fetch list pages for non-admins so we can show their accessible forms in the sidebar
  const { data: listPagesData } = useQuery({
    queryKey: ['forms', 'list', 'sidebar'],
    queryFn: () => formsAPI.listConfigs({ type: 'list' }).then(r => r.data),
    enabled: !isAdmin && canSection('pages'),
    staleTime: 60_000,
  });

  const sidebarFormPages: { form_name: string; display_name: string; form_ref: string }[] =
    !isAdmin && canSection('pages')
      ? (listPagesData?.results ?? []).filter(
          (p: { form_ref: string }) => formPerms(p.form_ref).view
        )
      : [];

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

  const allNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard',    href: `/${subdomain}/dashboard`,                section: 'dashboard'    as const, adminOnly: false },
    { icon: FileText,        label: 'Forms',         href: `/${subdomain}/developer/forms`,          section: null,           adminOnly: true  },
    { icon: BarChart2,       label: 'Reports',       href: `/${subdomain}/developer/reports`,        section: 'reports'      as const, adminOnly: false },
    { icon: Globe,           label: 'Pages',         href: `/${subdomain}/developer/pages`,          section: 'pages'        as const, adminOnly: false },
    { icon: Plug,            label: 'Integrations',  href: `/${subdomain}/developer/integrations`,   section: 'integration'  as const, adminOnly: false },
    { icon: Shield,          label: 'Roles',         href: `/${subdomain}/developer/roles`,          section: 'roles'        as const, adminOnly: false },
    { icon: Users,           label: 'Users',         href: `/${subdomain}/users`,                    section: null,           adminOnly: true  },
    { icon: Settings,        label: 'Settings',      href: `/${subdomain}/settings`,                 section: 'settings'     as const, adminOnly: false },
  ];

  const navItems = allNavItems.filter(item => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (item.section) return canSection(item.section);
    return true;
  });

  // Route-level access check — maps path patterns to whether the user is allowed
  const isRouteAllowed = (() => {
    if (isAdmin) return true;
    const checks: { match: (p: string) => boolean; allowed: boolean }[] = [
      { match: p => /\/dashboard/.test(p),              allowed: canSection('dashboard') },
      { match: p => /\/developer\/reports/.test(p),     allowed: canSection('reports') },
      { match: p => /\/runtime\/report\//.test(p),      allowed: canSection('reports') },
      { match: p => /\/developer\/integrations/.test(p),allowed: canSection('integration') },
      { match: p => /\/settings/.test(p),               allowed: canSection('settings') },
      // admin-only routes always denied for end_user
      { match: p => /\/developer\/forms/.test(p),       allowed: false },
      { match: p => /\/developer\/pages/.test(p),       allowed: canSection('pages') },
      { match: p => /\/developer\/roles/.test(p),       allowed: canSection('roles') },
      { match: p => /\/users/.test(p),                  allowed: false },
    ];
    const matched = checks.find(c => c.match(pathname));
    return matched ? matched.allowed : true; // unmatched paths (e.g. runtime form pages) pass through
  })();

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
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ icon: Icon, label, href }) => {
            const isActive = pathname.startsWith(href) && href !== `/${subdomain}/developer/pages`;
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

          {/* Dynamic form page links for end-users */}
          {sidebarFormPages.length > 0 && (
            <div className="pt-1">
              <p className="px-3 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">My Forms</p>
              {sidebarFormPages.map((page) => {
                const href = `/${subdomain}/runtime/${page.form_name}`;
                const isActive = pathname === href;
                return (
                  <Link
                    key={page.form_name}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <FileText size={14} />
                    <span className="truncate">{page.display_name}</span>
                  </Link>
                );
              })}
            </div>
          )}
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
        {isRouteAllowed ? children : (
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
              <Lock size={28} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">
                You don&apos;t have permission to view this page. Contact your admin to request access.
              </p>
            </div>
            <button
              onClick={() => router.push(`/${subdomain}/dashboard`)}
              className="btn-secondary text-sm mt-2"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
