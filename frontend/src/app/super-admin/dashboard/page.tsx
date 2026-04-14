'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI, companiesAPI } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  Building2, Users, Activity, TrendingUp, Plus,
  ChevronRight, ArrowUpRight, ArrowDownRight, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { Company, SuperAdminStats } from '@/types';

// Placeholder trend data — replace with real API data when available
const growthData = [
  { month: 'Oct', companies: 2, users: 5 },
  { month: 'Nov', companies: 4, users: 12 },
  { month: 'Dec', companies: 5, users: 18 },
  { month: 'Jan', companies: 7, users: 26 },
  { month: 'Feb', companies: 9, users: 35 },
  { month: 'Mar', companies: 11, users: 48 },
  { month: 'Apr', companies: 13, users: 60 },
];

interface StatCard {
  label: string;
  value: number | string;
  delta?: string;
  deltaUp?: boolean;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  href: string;
}

export default function SuperAdminDashboard() {
  const { user } = useAuthStore();

  const { data: stats, isLoading: statsLoading, refetch, isFetching } = useQuery<SuperAdminStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardAPI.getStats().then(r => r.data),
  });

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ['companies', 1],
    queryFn: () => companiesAPI.list({ page: 1, page_size: 5 }).then(r => r.data),
  });

  const statCards: StatCard[] = [
    {
      label: 'Total Companies',
      value: stats?.total_companies ?? '—',
      icon: Building2,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      href: '/super-admin/companies',
    },
    {
      label: 'Active Companies',
      value: stats?.active_companies ?? '—',
      icon: Activity,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      href: '/super-admin/companies',
    },
    {
      label: 'Total Users',
      value: stats?.total_users ?? '—',
      icon: Users,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      href: '/super-admin/users',
    },
    {
      label: 'Active Users',
      value: stats?.active_users ?? '—',
      icon: TrendingUp,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600',
      href: '/super-admin/users',
    },
  ];

  const now = new Date();

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'},{' '}
            {user?.first_name} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {format(now, 'EEEE, MMMM d, yyyy')} · Platform overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center gap-2 text-sm"
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link href="/super-admin/companies" className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            New Company
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} className="card hover:shadow-md transition-all group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {statsLoading ? (
                    <span className="animate-pulse bg-gray-200 h-8 w-16 rounded-lg inline-block" />
                  ) : card.value}
                </p>
              </div>
              <div className={`${card.iconBg} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
                <card.icon size={20} className={card.iconColor} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
              <ArrowUpRight size={12} className="text-green-500" />
              <span className="text-green-600 font-medium">Live</span>
              <span className="ml-1">· Click to view</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Area Chart — Growth */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Platform Growth</h2>
              <p className="text-xs text-gray-400 mt-0.5">Companies & users over the last 7 months</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={growthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCompanies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="companies" stroke="#6366f1" strokeWidth={2}
                fill="url(#colorCompanies)" name="Companies" dot={{ r: 3, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="users" stroke="#22c55e" strokeWidth={2}
                fill="url(#colorUsers)" name="Users" dot={{ r: 3, fill: '#22c55e' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-0.5 bg-indigo-500 rounded-full inline-block" />
              Companies
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-0.5 bg-green-500 rounded-full inline-block" />
              Users
            </div>
          </div>
        </div>

        {/* Bar Chart — Monthly signups */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">Monthly Signups</h2>
            <p className="text-xs text-gray-400 mt-0.5">New companies per month</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={growthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Bar dataKey="companies" fill="#6366f1" radius={[4, 4, 0, 0]} name="Companies" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Companies */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Companies</h2>
          <Link
            href="/super-admin/companies"
            className="text-indigo-600 text-sm hover:underline flex items-center gap-1"
          >
            View all <ChevronRight size={14} />
          </Link>
        </div>

        {companiesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-4 py-2">
                <div className="h-8 w-8 bg-gray-200 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
                <div className="h-5 bg-gray-200 rounded-full w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header pl-0">Company</th>
                  <th className="table-header">Subdomain</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Created</th>
                  <th className="table-header pr-0" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companiesData?.results?.map((company: Company) => (
                  <tr key={company._id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell pl-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-indigo-600" />
                        </div>
                        <span className="font-medium text-gray-900">{company.name}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-md">
                        {company.subdomain}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="badge-primary capitalize">{company.plan}</span>
                    </td>
                    <td className="table-cell">
                      <span className={company.is_active ? 'badge-success' : 'badge-danger'}>
                        {company.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="table-cell text-gray-400 text-xs">
                      {company.created_at ? format(new Date(company.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="table-cell pr-0 text-right">
                      <Link
                        href={`/super-admin/companies/${company._id}`}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
                {!companiesData?.results?.length && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No companies yet.</p>
                      <Link href="/super-admin/companies" className="text-indigo-600 text-sm hover:underline mt-1 inline-block">
                        Create your first company →
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Create Company',
            desc: 'Onboard a new tenant company',
            href: '/super-admin/companies',
            icon: Building2,
            color: 'bg-indigo-600',
          },
          {
            label: 'Manage Users',
            desc: 'View and manage platform users',
            href: '/super-admin/users',
            icon: Users,
            color: 'bg-purple-600',
          },
          {
            label: 'Integrations',
            desc: 'Configure global integrations',
            href: '/settings/integrations',
            icon: Activity,
            color: 'bg-green-600',
          },
        ].map(action => (
          <Link
            key={action.label}
            href={action.href}
            className="card hover:shadow-md transition-all flex items-center gap-4 group"
          >
            <div className={`${action.color} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
              <action.icon size={18} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{action.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{action.desc}</p>
            </div>
            <ChevronRight size={16} className="ml-auto text-gray-300 group-hover:text-gray-500 transition-colors" />
          </Link>
        ))}
      </div>

    </div>
  );
}
