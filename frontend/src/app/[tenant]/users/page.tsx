'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantUsersAPI, rolesAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import { Plus, Edit2, UserX, UserCheck, Users } from 'lucide-react';
import { TenantUser, TenantRole } from '@/types';

export default function UsersPage() {
  const params = useParams();
  const subdomain = params.tenant as string;
  const qc = useQueryClient();

  const [showForm, setShowForm]     = useState(false);
  const [editUser, setEditUser]     = useState<TenantUser | null>(null);
  const [formData, setFormData]     = useState({
    email: '', password: '', first_name: '', last_name: '',
    phone: '', tenant_role_id: '',
  });
  const [formError, setFormError]   = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['tenant-users', subdomain],
    queryFn: () => tenantUsersAPI.list().then(r => r.data),
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles', subdomain],
    queryFn: () => rolesAPI.list().then(r => r.data),
  });

  const users: TenantUser[] = usersData?.results ?? [];
  const roles: TenantRole[] = rolesData?.results ?? [];

  const saveMut = useMutation({
    mutationFn: (data: object) =>
      editUser ? tenantUsersAPI.update(editUser.id, data) : tenantUsersAPI.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-users'] }); resetForm(); },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      setFormError(e.response?.data?.error ?? 'Error saving user');
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? tenantUsersAPI.update(id, { is_active: true }) : tenantUsersAPI.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-users'] }),
  });

  function resetForm() {
    setShowForm(false);
    setEditUser(null);
    setFormData({ email: '', password: '', first_name: '', last_name: '', phone: '', tenant_role_id: '' });
    setFormError('');
  }

  function openEdit(user: TenantUser) {
    setEditUser(user);
    setFormData({
      email: user.email,
      password: '',
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone ?? '',
      tenant_role_id: user.tenant_role_id ?? '',
    });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const payload: Record<string, string> = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone,
      tenant_role_id: formData.tenant_role_id,
    };
    if (!editUser) {
      payload.email = formData.email;
      payload.password = formData.password;
    } else if (formData.password) {
      payload.password = formData.password;
    }
    saveMut.mutate(payload);
  }

  const roleName = (id?: string) => roles.find(r => r._id === id)?.name ?? '—';

  return (
    <TenantShell>
      <div className="p-8 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-sm text-gray-500 mt-1">Manage team members and their access roles</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New User
            </button>
          )}
        </div>

        {/* User Form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{editUser ? 'Edit User' : 'New User'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input className="form-input" value={formData.first_name} required
                    onChange={e => setFormData(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input className="form-input" value={formData.last_name} required
                    onChange={e => setFormData(p => ({ ...p, last_name: e.target.value }))} />
                </div>
              </div>

              {!editUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input className="form-input" type="email" value={formData.email} required
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editUser ? 'New Password (leave blank to keep)' : 'Password *'}
                </label>
                <input className="form-input" type="password" value={formData.password}
                  required={!editUser} minLength={8}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input className="form-input" value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select className="form-input" value={formData.tenant_role_id}
                    onChange={e => setFormData(p => ({ ...p, tenant_role_id: e.target.value }))}>
                    <option value="">— No role —</option>
                    {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Saving…' : editUser ? 'Save Changes' : 'Create User'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {users.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p>No users yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{user.full_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{user.email}</td>
                    <td className="px-5 py-3">
                      {user.tenant_role_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {roleName(user.tenant_role_id)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">{user.role}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(user)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        {user.role !== 'company_admin' && (
                          <button
                            onClick={() => toggleActive.mutate({ id: user.id, active: !user.is_active })}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 transition-colors"
                            title={user.is_active ? 'Deactivate' : 'Activate'}>
                            {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TenantShell>
  );
}
