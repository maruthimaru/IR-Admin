'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import TenantShell from '@/components/tenant/TenantShell';
import {
  FileText, LayoutDashboard, Users, Settings,
} from 'lucide-react';

export default function TenantDashboardPage() {
  const params    = useParams();
  const subdomain = params.tenant as string;

  const { user, isAuthenticated } = useAuthStore();
  const { company }               = useTenantStore();

  if (!user || !isAuthenticated) return null;

  const companyName = company?.name ?? subdomain;

  return (
    <TenantShell>
      <div className="p-8 overflow-auto">
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
                <Link
                  key={label}
                  href={href}
                  className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-indigo-300 transition-colors"
                >
                  <Icon size={15} className="text-indigo-500" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </TenantShell>
  );
}
