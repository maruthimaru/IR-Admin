'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { User } from '@/types';
import { Users, Search, Shield, Building2, UserCheck, UserX } from 'lucide-react';
import { format } from 'date-fns';

const ROLE_BADGE: Record<string, string> = {
  super_admin:   'bg-red-100 text-red-700',
  company_admin: 'bg-purple-100 text-purple-700',
  developer:     'bg-blue-100 text-blue-700',
  end_user:      'bg-gray-100 text-gray-600',
};

const ROLE_LABEL: Record<string, string> = {
  super_admin:   'Super Admin',
  company_admin: 'Company Admin',
  developer:     'Developer',
  end_user:      'End User',
};

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/auth/users/').then(r => r.data),
  });

  const users: User[] = data?.results ?? [];

  const filtered = users.filter(u => {
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.first_name.toLowerCase().includes(search.toLowerCase()) ||
      u.last_name.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data?.total ?? 0} users registered on the platform
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: data?.total ?? '—',        icon: Users,     bg: 'bg-gray-50',   color: 'text-gray-600'  },
          { label: 'Admins',   value: data?.role_counts?.company_admin ?? '—', icon: Shield,    bg: 'bg-purple-50', color: 'text-purple-600' },
          { label: 'Active',   value: data?.active_count ?? '—', icon: UserCheck, bg: 'bg-green-50',  color: 'text-green-600' },
          { label: 'Inactive', value: data?.inactive_count ?? '—', icon: UserX,   bg: 'bg-red-50',    color: 'text-red-600'   },
        ].map(card => (
          <div key={card.label} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {isLoading
                    ? <span className="animate-pulse bg-gray-200 h-7 w-10 rounded inline-block" />
                    : card.value}
                </p>
              </div>
              <div className={`${card.bg} p-2.5 rounded-xl`}>
                <card.icon size={18} className={card.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="form-input w-auto min-w-[160px]"
        >
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="company_admin">Company Admin</option>
          <option value="developer">Developer</option>
          <option value="end_user">End User</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">User</th>
                <th className="table-header">Role</th>
                <th className="table-header">Company</th>
                <th className="table-header">Status</th>
                <th className="table-header">Joined</th>
                <th className="table-header">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="table-cell">
                          <div className="animate-pulse h-4 bg-gray-200 rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                            {u.first_name?.[0]?.toUpperCase()}{u.last_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {u.first_name} {u.last_name}
                            </p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="table-cell">
                        {u.company_id ? (
                          <span className="flex items-center gap-1 text-sm text-gray-500">
                            <Building2 size={12} />
                            <span className="font-mono text-xs">{u.company_id.slice(0, 8)}…</span>
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className={u.is_active ? 'badge-success' : 'badge-danger'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell text-gray-400 text-xs">
                        {u.date_joined ? format(new Date(u.date_joined), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="table-cell text-gray-400 text-xs">
                        {u.last_login ? format(new Date(u.last_login), 'MMM d, yyyy') : 'Never'}
                      </td>
                    </tr>
                  ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-gray-400">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No users found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
