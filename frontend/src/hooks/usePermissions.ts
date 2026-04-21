'use client';

import { useAuthStore } from '@/store/auth';
import { FormPermissions, RolePermissions } from '@/types';

const FULL: FormPermissions = { view: true, add: true, edit: true, delete: true, export: true, import: true };
const NONE: FormPermissions = { view: false, add: false, edit: false, delete: false, export: false, import: false };

type SectionKey = 'dashboard' | 'pages' | 'reports' | 'settings' | 'integration' | 'roles';

function isSectionEnabled(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'object' && val !== null) {
    return Object.values(val as Record<string, boolean>).some(v => v);
  }
  return false;
}

function getSectionAction(val: unknown, action: string): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'object' && val !== null) {
    return Boolean((val as Record<string, boolean>)[action]);
  }
  return false;
}

export function usePermissions() {
  const user = useAuthStore(s => s.user);
  const permissions = useAuthStore(s => (s as { permissions?: import('@/types').PermissionsResponse | null }).permissions ?? null);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin' || user?.role === 'developer';
  const fullAccess = isAdmin || (permissions?.full_access ?? false);

  function canSection(section: SectionKey): boolean {
    if (fullAccess) return true;
    const val = permissions?.permissions?.[section as keyof RolePermissions];
    return isSectionEnabled(val);
  }

  function canSectionAction(section: SectionKey, action: string): boolean {
    if (fullAccess) return true;
    const val = permissions?.permissions?.[section as keyof RolePermissions];
    return getSectionAction(val, action);
  }

  function formPerms(formName: string): FormPermissions {
    if (fullAccess) return FULL;
    const fp = permissions?.permissions?.forms?.[formName];
    if (!fp) return NONE;
    return {
      view:   fp.view   ?? false,
      add:    fp.add    ?? false,
      edit:   fp.edit   ?? false,
      delete: fp.delete ?? false,
      export: fp.export ?? false,
      import: fp.import ?? false,
    };
  }

  function can(formName: string, action: keyof FormPermissions): boolean {
    return formPerms(formName)[action];
  }

  return { fullAccess, canSection, canSectionAction, formPerms, can, isAdmin };
}
