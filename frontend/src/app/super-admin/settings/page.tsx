'use client';

import { useAuthStore } from '@/store/auth';
import { User, Mail, Shield, Key } from 'lucide-react';

export default function SuperAdminSettingsPage() {
  const { user } = useAuthStore();

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your platform account</p>
      </div>

      {/* Profile Card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <User size={16} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Profile</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-lg font-bold text-indigo-700">
            {user?.first_name?.[0]?.toUpperCase()}{user?.last_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.first_name} {user?.last_name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              <Shield size={10} />
              Super Admin
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="form-label">First Name</label>
            <input defaultValue={user?.first_name} className="form-input" readOnly />
          </div>
          <div>
            <label className="form-label">Last Name</label>
            <input defaultValue={user?.last_name} className="form-input" readOnly />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Email Address</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input defaultValue={user?.email} className="form-input pl-9" readOnly />
            </div>
          </div>
        </div>
      </div>

      {/* Security Card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <Key size={16} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Security</h2>
        </div>
        <p className="text-sm text-gray-500">
          Use the Change Password option from your profile to update your credentials.
        </p>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm font-medium text-gray-700">Password</p>
            <p className="text-xs text-gray-400 mt-0.5">Last changed: unknown</p>
          </div>
          <button className="btn-secondary text-sm">Change Password</button>
        </div>
      </div>
    </div>
  );
}
