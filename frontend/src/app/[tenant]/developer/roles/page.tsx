'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesAPI, formsAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import { Plus, Trash2, Edit2, Shield, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { TenantRole, RolePermissions, FormPermissions, SectionActions, IntegrationPermissions, InputFormConfig } from '@/types';

// ── Section config ───────────────────────────────────────────

type BooleanSection = { key: string; label: string; type: 'boolean' };
type ActionsSection = { key: string; label: string; type: 'actions'; actions: { key: string; label: string }[] };
type SectionConfig = BooleanSection | ActionsSection;

const SECTION_CONFIGS: SectionConfig[] = [
  { key: 'dashboard', label: 'Dashboard', type: 'boolean' },
  { key: 'pages',     label: 'Pages',     type: 'boolean' },
  {
    key: 'reports', label: 'Reports', type: 'actions',
    actions: [
      { key: 'view', label: 'View' }, { key: 'add', label: 'Add' },
      { key: 'configure', label: 'Configure' }, { key: 'delete', label: 'Delete' },
    ],
  },
  {
    key: 'roles', label: 'Roles', type: 'actions',
    actions: [
      { key: 'view', label: 'View' }, { key: 'add', label: 'Add' },
      { key: 'edit', label: 'Edit' }, { key: 'delete', label: 'Delete' },
    ],
  },
  {
    key: 'integration', label: 'Integrations', type: 'actions',
    actions: [
      { key: 'view', label: 'View' }, { key: 'view_payment', label: 'View Payment' },
      { key: 'view_sms', label: 'View SMS' }, { key: 'view_email', label: 'View Email' },
      { key: 'enable', label: 'Enable' }, { key: 'save', label: 'Save' },
    ],
  },
  { key: 'settings', label: 'Settings', type: 'boolean' },
];

const FORM_ACTIONS: { key: keyof FormPermissions; label: string }[] = [
  { key: 'view', label: 'View' }, { key: 'add', label: 'Add' },
  { key: 'edit', label: 'Edit' }, { key: 'delete', label: 'Delete' },
  { key: 'export', label: 'Export' }, { key: 'import', label: 'Import' },
];

// ── Empty permission factories ────────────────────────────────

function emptyActionsPerms(): SectionActions {
  return { view: false, add: false, edit: false, delete: false };
}

function emptyIntegrationPerms(): IntegrationPermissions {
  return { view: false, view_payment: false, view_sms: false, view_email: false, enable: false, save: false };
}

function emptyPerms(): RolePermissions {
  return {
    dashboard: false,
    pages: false,
    reports: emptyActionsPerms(),
    roles: emptyActionsPerms(),
    integration: emptyIntegrationPerms(),
    settings: false,
    forms: {},
  };
}

function emptyFormPerms(): FormPermissions {
  return { view: false, add: false, edit: false, delete: false, export: false, import: false };
}

function normalizePerms(p: RolePermissions): RolePermissions {
  return {
    ...emptyPerms(),
    ...p,
    dashboard: Boolean(p.dashboard),
    settings: Boolean(p.settings),
    reports: typeof p.reports === 'boolean'
      ? { ...emptyActionsPerms(), view: p.reports }
      : { ...emptyActionsPerms(), ...(p.reports as SectionActions ?? {}) },
    roles: typeof p.roles === 'boolean'
      ? { ...emptyActionsPerms(), view: p.roles }
      : { ...emptyActionsPerms(), ...(p.roles as SectionActions ?? {}) },
    integration: typeof p.integration === 'boolean'
      ? { ...emptyIntegrationPerms(), view: p.integration }
      : { ...emptyIntegrationPerms(), ...(p.integration as IntegrationPermissions ?? {}) },
    forms: { ...(p.forms ?? {}) },
  };
}

// ── Page component ────────────────────────────────────────────

export default function RolesPage() {
  const params = useParams();
  const subdomain = params.tenant as string;
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editRole, setEditRole] = useState<TenantRole | null>(null);
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [perms, setPerms]       = useState<RolePermissions>(emptyPerms());
  const [expandedForms, setExpandedForms] = useState(true);

  const { data: rolesData } = useQuery({
    queryKey: ['roles', subdomain],
    queryFn: () => rolesAPI.list().then(r => r.data),
  });

  const { data: formsData } = useQuery({
    queryKey: ['forms-list', subdomain],
    queryFn: () => formsAPI.listConfigs({ type: 'input' }).then(r => r.data),
  });

  const roles: TenantRole[] = rolesData?.results ?? [];
  const formsList: InputFormConfig[] = Array.isArray(formsData)
    ? formsData
    : (formsData?.results ?? []);

  const saveMut = useMutation({
    mutationFn: (data: object) =>
      editRole ? rolesAPI.update(editRole._id, data) : rolesAPI.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rolesAPI.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Cannot delete role';
      alert(msg);
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditRole(null);
    setName('');
    setDesc('');
    setPerms(emptyPerms());
  }

  function openEdit(role: TenantRole) {
    setEditRole(role);
    setName(role.name);
    setDesc(role.description ?? '');
    setPerms(normalizePerms(role.permissions));
    setShowForm(true);
  }

  function toggleBooleanSection(key: string) {
    setPerms(p => ({ ...p, [key]: !p[key as keyof RolePermissions] }));
  }

  function toggleSectionAction(sectionKey: string, actionKey: string) {
    setPerms(p => {
      const current = p[sectionKey as keyof RolePermissions];
      const obj = (typeof current === 'object' && current !== null)
        ? (current as unknown as Record<string, boolean>)
        : {} as Record<string, boolean>;
      return { ...p, [sectionKey]: { ...obj, [actionKey]: !obj[actionKey] } };
    });
  }

  function toggleAllSectionActions(sectionKey: string, actions: { key: string }[], value: boolean) {
    setPerms(p => {
      const current = p[sectionKey as keyof RolePermissions];
      const obj: Record<string, boolean> = (typeof current === 'object' && current !== null)
        ? { ...(current as unknown as Record<string, boolean>) }
        : {};
      for (const a of actions) obj[a.key] = value;
      return { ...p, [sectionKey]: obj };
    });
  }

  function isSectionActionChecked(sectionKey: string, actionKey: string): boolean {
    const val = perms[sectionKey as keyof RolePermissions];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object' && val !== null) {
      return Boolean((val as unknown as Record<string, boolean>)[actionKey]);
    }
    return false;
  }

  function toggleFormAction(formName: string, action: keyof FormPermissions) {
    setPerms(p => {
      const existing = p.forms?.[formName] ?? emptyFormPerms();
      return { ...p, forms: { ...p.forms, [formName]: { ...existing, [action]: !existing[action] } } };
    });
  }

  function toggleAllFormActions(formName: string, value: boolean) {
    const all: FormPermissions = { view: value, add: value, edit: value, delete: value, export: value, import: value };
    setPerms(p => ({ ...p, forms: { ...p.forms, [formName]: all } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    saveMut.mutate({ name: name.trim(), description, permissions: perms });
  }

  return (
    <TenantShell>
      <div className="p-8 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
            <p className="text-sm text-gray-500 mt-1">Manage access control roles for your team</p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Role
            </button>
          )}
        </div>

        {/* Role Form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Shield size={16} className="text-indigo-600" />
              {editRole ? 'Edit Role' : 'New Role'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Sales Manager" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input className="form-input" value={description} onChange={e => setDesc(e.target.value)}
                    placeholder="Optional description" />
                </div>
              </div>

              {/* Section Permissions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Section Access</p>
                <div className="space-y-2">
                  {SECTION_CONFIGS.map(section => {
                    if (section.type === 'boolean') {
                      return (
                        <label key={section.key}
                          className="flex items-center gap-2 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 hover:bg-indigo-50 hover:border-indigo-200 transition-colors w-fit">
                          <input type="checkbox"
                            checked={Boolean(perms[section.key as keyof RolePermissions])}
                            onChange={() => toggleBooleanSection(section.key)}
                            className="form-checkbox text-indigo-600" />
                          <span className="text-sm font-medium text-gray-700">{section.label}</span>
                        </label>
                      );
                    }

                    const actionsSection = section as ActionsSection;
                    const allChecked = actionsSection.actions.every(a => isSectionActionChecked(section.key, a.key));
                    const someChecked = actionsSection.actions.some(a => isSectionActionChecked(section.key, a.key));

                    return (
                      <div key={section.key} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <button type="button"
                              onClick={() => toggleAllSectionActions(section.key, actionsSection.actions, !allChecked)}
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                                allChecked ? 'bg-indigo-600 text-white border-indigo-600' :
                                someChecked ? 'bg-indigo-200 border-indigo-400' :
                                'border border-gray-300 bg-white'
                              }`}>
                              {(allChecked || someChecked) && <Check size={10} className={allChecked ? 'text-white' : 'text-indigo-600'} />}
                            </button>
                            <span className="text-sm font-medium text-gray-700">{section.label}</span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 border-l border-gray-200 pl-4">
                            {actionsSection.actions.map(action => (
                              <label key={action.key} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600 hover:text-gray-900">
                                <input type="checkbox"
                                  checked={isSectionActionChecked(section.key, action.key)}
                                  onChange={() => toggleSectionAction(section.key, action.key)}
                                  className="form-checkbox text-indigo-600 w-3.5 h-3.5" />
                                {action.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Permissions */}
              <div>
                <button type="button"
                  onClick={() => setExpandedForms(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  Form Permissions
                  {expandedForms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {expandedForms && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600 w-40">Form</th>
                          {FORM_ACTIONS.map(a => (
                            <th key={a.key} className="px-2 py-2 text-center font-medium text-gray-600">{a.label}</th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium text-gray-600">All</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formsList.length === 0 && (
                          <tr><td colSpan={8} className="px-4 py-3 text-center text-gray-400 text-xs italic">No forms yet</td></tr>
                        )}
                        {formsList.map((form, idx) => {
                          const fp = perms.forms?.[form.form_name] ?? emptyFormPerms();
                          const allOn = FORM_ACTIONS.every(a => fp[a.key]);
                          return (
                            <tr key={form.form_name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-2 font-medium text-gray-800">
                                {form.display_name || form.form_name}
                              </td>
                              {FORM_ACTIONS.map(a => (
                                <td key={a.key} className="px-2 py-2 text-center">
                                  <input type="checkbox"
                                    checked={fp[a.key]}
                                    onChange={() => toggleFormAction(form.form_name, a.key)}
                                    className="form-checkbox text-indigo-600" />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center">
                                <button type="button"
                                  onClick={() => toggleAllFormActions(form.form_name, !allOn)}
                                  className={`w-5 h-5 rounded flex items-center justify-center mx-auto transition-colors ${allOn ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-transparent hover:border-indigo-400'}`}>
                                  <Check size={11} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? 'Saving…' : editRole ? 'Save Changes' : 'Create Role'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
                {saveMut.isError && (
                  <span className="text-sm text-red-600">
                    {(saveMut.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error saving role'}
                  </span>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Roles List */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {roles.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Shield size={32} className="mx-auto mb-3 opacity-30" />
              <p>No roles yet. Create one to get started.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Forms</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Users</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map(role => {
                  const inUse = (role.user_count ?? 0) > 0;
                  return (
                    <tr key={role._id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{role.name}</td>
                      <td className="px-5 py-3 text-gray-500">{role.description || '—'}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {Object.keys(role.permissions.forms ?? {}).length} form(s)
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {role.user_count ?? 0} user(s)
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(role)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100 transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <div className="relative group">
                            <button
                              onClick={() => {
                                if (!inUse && confirm(`Delete role "${role.name}"?`)) {
                                  deleteMut.mutate(role._id);
                                }
                              }}
                              disabled={inUse}
                              className={`p-1.5 rounded transition-colors ${
                                inUse
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-400 hover:text-red-600 hover:bg-gray-100'
                              }`}>
                              <Trash2 size={14} />
                            </button>
                            {inUse && (
                              <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-10">
                                <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                  Assigned to {role.user_count} user(s) — cannot delete
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TenantShell>
  );
}
