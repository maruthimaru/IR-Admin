'use client';

/**
 * Runtime Page — /[tenant]/runtime/[page]
 * Renders the dynamic list page and a side-panel form for create/edit.
 * Uses the auto-created list page config (form_name_list) to drive the table,
 * and the linked input form config to drive the create/edit form.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import DynamicList from '@/components/runtime/DynamicList';
import DynamicForm from '@/components/runtime/DynamicForm';
import { ArrowLeft, Plus, X, Loader2 } from 'lucide-react';
import { InputFormConfig } from '@/types';

export default function RuntimePage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;
  const pageName  = params.page as string;    // e.g. "purchase_entry_list"

  // Derive input form name: strip "_list" suffix
  const inputFormName = pageName.endsWith('_list')
    ? pageName.slice(0, -5)
    : pageName;

  const [panelOpen, setPanelOpen]       = useState(false);
  const [editRecord, setEditRecord]     = useState<Record<string, unknown> | null>(null);
  const [panelMode, setPanelMode]       = useState<'create' | 'edit' | 'edit_with_new'>('create');
  const [editWithNewData, setEditWithNewData] = useState<Record<string, unknown> | null>(null);

  // Fetch the input form config for the create/edit form
  const { data: formConfig, isLoading: loadingForm } = useQuery({
    queryKey: ['form-config', inputFormName],
    queryFn: () => formsAPI.getConfig(inputFormName).then(r => r.data as InputFormConfig),
    retry: false,
  });

  const openCreate = () => {
    setEditRecord(null);
    setEditWithNewData(null);
    setPanelMode('create');
    setPanelOpen(true);
  };

  const openEdit = (record: Record<string, unknown>) => {
    setEditRecord(record);
    setEditWithNewData(null);
    setPanelMode('edit');
    setPanelOpen(true);
  };

  const openEditWithNew = (record: Record<string, unknown>) => {
    const ewField = formConfig?.fields.find(f => f.type === 'edit_with_new');
    if (!ewField) return;

    // Keys that must NOT be copied: _id and any uid auto-generated fields
    const uidKeys = new Set(
      (formConfig?.fields ?? []).filter(f => f.type === 'uid').map(f => f.key)
    );

    // Start with all values from the old record, minus _id and uid fields
    const preData: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      if (key === '_id' || uidKeys.has(key)) continue;
      preData[key] = val;
    }

    // Set the edit_with_new reference value
    preData[ewField.key] = ewField.reference_key ? record[ewField.reference_key] : undefined;

    setEditRecord(null);
    setEditWithNewData(preData);
    setPanelMode('edit_with_new');
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditRecord(null);
    setEditWithNewData(null);
    setPanelMode('create');
  };

  return (
    <TenantShell>
      <div className="p-8 space-y-6 max-w-full">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/${subdomain}/developer/forms`)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Forms
          </button>

          {formConfig && (
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              New Record
            </button>
          )}
        </div>

        {/* Main content */}
        <div className={`flex gap-6 ${panelOpen ? 'items-start' : ''}`}>

          {/* List — shrinks when panel open */}
          <div className={`${panelOpen ? 'flex-1 min-w-0' : 'w-full'} transition-all`}>
            <DynamicList
              pageName={pageName}
              onEditRecord={openEdit}
              onEditWithNew={openEditWithNew}
              activeRecordId={editRecord ? String(editRecord._id) : null}
            />
          </div>

          {/* Form side panel */}
          {panelOpen && formConfig && (
            <div className="w-[420px] shrink-0 bg-white border border-gray-200 rounded-xl shadow-lg">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">
                  {panelMode === 'edit' ? 'Edit Record' : panelMode === 'edit_with_new' ? 'Edit With New' : 'New Record'}
                </h3>
                <button
                  onClick={closePanel}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form */}
              <div className="p-5">
                <DynamicForm
                  config={formConfig}
                  mode={panelMode}
                  recordId={panelMode === 'edit' && editRecord ? String(editRecord._id) : undefined}
                  initialData={panelMode === 'edit' ? (editRecord ?? {}) : panelMode === 'edit_with_new' ? (editWithNewData ?? {}) : {}}
                  onSuccess={() => closePanel()}
                />
              </div>
            </div>
          )}

          {/* Loading form config */}
          {panelOpen && loadingForm && (
            <div className="w-[420px] shrink-0 bg-white border border-gray-200 rounded-xl shadow-lg flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-indigo-600" size={24} />
            </div>
          )}
        </div>

      </div>
    </TenantShell>
  );
}
