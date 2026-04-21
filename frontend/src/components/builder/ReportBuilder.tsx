'use client';

/**
 * Report Builder — lets developers create join-based reports
 * across multiple form collections.
 *
 * Steps:
 * 1. Basic info + base collection
 * 2. Add joins (local_field → foreign collection._id)
 * 3. Load & pick columns from all sources
 */

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formsAPI, reportsAPI } from '@/lib/api';
import { ReportConfig, ReportJoin, ReportColumn, InvoiceConfig } from '@/types';
import InvoiceBuilder, { emptyInvoiceConfig } from './InvoiceBuilder';
import { toast } from 'react-toastify';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface BuilderJoin extends ReportJoin {
  _id: string; // local UI id
}

interface ColumnCandidate {
  key: string;
  label: string;
  source: string;
  sourceLabel: string;
  selected: boolean;
  customLabel: string;
  fieldType: string;
  group_by: boolean;
  aggregation: string;
}

interface InputFormMeta {
  form_name: string;
  display_name: string;
  fields?: { key: string; label: string; type: string }[];
}

interface ReportBuilderProps {
  onSuccess?: (reportName: string) => void;
  initialConfig?: ReportConfig;
}

// ── Main component ────────────────────────────────────────────

export default function ReportBuilder({ onSuccess, initialConfig }: ReportBuilderProps) {
  const isEditMode = Boolean(initialConfig);
  const qc = useQueryClient();

  const [formName,       setFormName]       = useState(initialConfig?.form_name ?? '');
  const [displayName,    setDisplayName]    = useState(initialConfig?.display_name ?? '');
  const [category,       setCategory]       = useState(initialConfig?.category ?? '');
  const [baseCollection, setBaseCollection] = useState(initialConfig?.base_collection ?? '');
  const [joins,          setJoins]          = useState<BuilderJoin[]>(
    initialConfig?.joins?.map((j, i) => ({ ...j, _id: `join_${i}` })) ?? []
  );
  const [groupingEnabled,  setGroupingEnabled]  = useState(initialConfig?.grouping_enabled ?? false);
  const [invoiceEnabled,   setInvoiceEnabled]   = useState(initialConfig?.invoice_enabled ?? false);
  const [invoiceConfig,    setInvoiceConfig]    = useState<InvoiceConfig>(
    initialConfig?.invoice_config ?? emptyInvoiceConfig()
  );
  // Column candidates — loaded by "Load Fields" button
  const [candidates,    setCandidates]    = useState<ColumnCandidate[]>(
    // Re-hydrate saved columns so edit mode shows them pre-selected
    initialConfig?.columns?.map(col => ({
      key: col.key, label: col.label, source: col.source,
      sourceLabel: col.source, selected: true, customLabel: col.label,
      fieldType: '', group_by: col.group_by ?? false, aggregation: col.aggregation ?? 'none',
    })) ?? []
  );
  const [loadingFields, setLoadingFields] = useState(false);

  // All input forms (for dropdowns)
  const { data: formsData } = useQuery({
    queryKey: ['forms', 'input'],
    queryFn: () => formsAPI.listConfigs({ type: 'input' }).then(r => r.data),
  });
  const inputForms: InputFormMeta[] = formsData?.results ?? [];

  // Base collection fields (for local_field dropdowns in joins)
  const { data: baseFormConfig } = useQuery({
    queryKey: ['form-config', baseCollection],
    queryFn:  () => formsAPI.getConfig(baseCollection).then(r => r.data),
    enabled:  !!baseCollection,
  });
  const baseFields: { key: string; label: string }[] = baseFormConfig?.fields ?? [];

  // ── Join helpers ──────────────────────────────────────────

  const addJoin = () => {
    setJoins(prev => [...prev, {
      _id: `join_${Date.now()}`,
      collection: '', local_field: '', foreign_field: '_id', as: '',
    }]);
  };

  const updateJoin = (_id: string, patch: Partial<BuilderJoin>) =>
    setJoins(prev => prev.map(j => j._id === _id ? { ...j, ...patch } : j));

  const removeJoin = (_id: string) =>
    setJoins(prev => prev.filter(j => j._id !== _id));

  // ── Load available fields for column selection ─────────────

  const loadFields = async () => {
    if (!baseCollection) { toast.warn('Select a base collection first'); return; }
    setLoadingFields(true);
    try {
      const next: ColumnCandidate[] = [];
      const existingMap = Object.fromEntries(
        candidates.filter(c => c.selected).map(c => [c.key, { label: c.customLabel, group_by: c.group_by, aggregation: c.aggregation }])
      );

      // Helper: fetch a form's fields — prefer already-loaded data, fall back to API
      const getFormFields = async (formName: string) => {
        const cached = inputForms.find(f => f.form_name === formName);
        if (cached?.fields?.length) return cached.fields;
        const res = await formsAPI.getConfig(formName);
        return (res.data.fields ?? []) as { key: string; label: string; type?: string }[];
      };

      // Base form fields
      const baseLabel  = inputForms.find(f => f.form_name === baseCollection)?.display_name || baseCollection;
      const baseFields = await getFormFields(baseCollection);
      for (const f of baseFields) {
        if (!f.key) continue;
        const ex = existingMap[f.key];
        next.push({
          key: f.key, label: f.label || f.key, source: 'base', sourceLabel: baseLabel,
          selected: f.key in existingMap,
          customLabel: ex?.label ?? f.label,
          fieldType: f.type || '',
          group_by: ex?.group_by ?? false,
          aggregation: ex?.aggregation ?? 'none',
        });
      }

      // Each valid join's fields
      for (const join of joins) {
        if (!join.collection || !join.as) continue;
        try {
          const joinLabel  = inputForms.find(f => f.form_name === join.collection)?.display_name || join.collection;
          const joinFields = await getFormFields(join.collection);
          for (const f of joinFields) {
            if (!f.key) continue;
            const key = `${join.as}.${f.key}`;
            const ex = existingMap[key];
            next.push({
              key, label: f.label || f.key, source: join.as, sourceLabel: joinLabel,
              selected: key in existingMap,
              customLabel: ex?.label ?? f.label,
              fieldType: f.type || '',
              group_by: ex?.group_by ?? false,
              aggregation: ex?.aggregation ?? 'none',
            });
          }
        } catch {
          toast.warn(`Could not load fields for join "${join.as}" (${join.collection})`);
        }
      }

      setCandidates(next);
      toast.success(`${next.length} fields loaded`);
    } catch {
      toast.error('Failed to load fields');
    } finally {
      setLoadingFields(false);
    }
  };

  const toggleCandidate = (key: string) =>
    setCandidates(prev => prev.map(c => c.key === key ? { ...c, selected: !c.selected } : c));

  const updateLabel = (key: string, label: string) =>
    setCandidates(prev => prev.map(c => c.key === key ? { ...c, customLabel: label } : c));

  const updateGroupBy = (key: string, value: boolean) =>
    setCandidates(prev => prev.map(c => c.key === key ? { ...c, group_by: value } : c));

  const updateAggregation = (key: string, value: string) =>
    setCandidates(prev => prev.map(c => c.key === key ? { ...c, aggregation: value } : c));

  // ── Mutations ─────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: object) => reportsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Report "${formName}" created!`);
      onSuccess?.(formName);
    },
    onError: (e: unknown) => {
      const ae = e as { response?: { data?: { error?: string } } };
      toast.error(ae.response?.data?.error || 'Failed to create report');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => reportsAPI.update(formName, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['report-config', formName] });
      toast.success('Report updated!');
      onSuccess?.(formName);
    },
    onError: (e: unknown) => {
      const ae = e as { response?: { data?: { error?: string } } };
      toast.error(ae.response?.data?.error || 'Failed to update report');
    },
  });

  const handleSave = () => {
    if (!formName)        { toast.error('Report name is required'); return; }
    if (!baseCollection)  { toast.error('Base collection is required'); return; }

    const selectedColumns: ReportColumn[] = candidates
      .filter(c => c.selected)
      .map(c => ({
        key: c.key, label: c.customLabel || c.label, source: c.source,
        group_by: groupingEnabled ? c.group_by : false,
        aggregation: (groupingEnabled ? (c.aggregation || 'none') : 'none') as ReportColumn['aggregation'],
      }));

    if (selectedColumns.length === 0) { toast.error('Select at least one column'); return; }

    const payload = {
      display_name:     displayName || formName,
      category,
      base_collection:  baseCollection,
      grouping_enabled: groupingEnabled,
      invoice_enabled:  invoiceEnabled,
      invoice_config:   invoiceEnabled ? invoiceConfig : emptyInvoiceConfig(),
      joins: joins
        .filter(j => j.collection && j.local_field && j.as)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ _id, ...rest }) => rest),
      columns: selectedColumns,
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate({ form_name: formName, ...payload });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Group candidates by source for display
  const groups = candidates.reduce<Record<string, ColumnCandidate[]>>((acc, c) => {
    const gk = c.source === 'base' ? '__base__' : c.source;
    (acc[gk] = acc[gk] || []).push(c);
    return acc;
  }, {});

  const getGroupLabel = (gk: string): string => {
    if (gk === '__base__') {
      return inputForms.find(f => f.form_name === baseCollection)?.display_name || baseCollection || 'Base';
    }
    const joinCollection = joins.find(j => j.as === gk)?.collection;
    return inputForms.find(f => f.form_name === joinCollection)?.display_name || joinCollection || gk;
  };

  const selectedCount = candidates.filter(c => c.selected).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Basic Info ── */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? 'Edit Report' : 'Report Configuration'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Report Name (ID) *</label>
            <input
              type="text"
              className={`form-input font-mono ${isEditMode ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              placeholder="purchase_report"
              value={formName}
              readOnly={isEditMode}
              onChange={e => !isEditMode && setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            />
            <p className="text-xs text-gray-400 mt-1">Lowercase, underscores only.</p>
          </div>
          <div>
            <label className="form-label">Display Name</label>
            <input type="text" className="form-input" placeholder="Purchase Report"
              value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input type="text" className="form-input" placeholder="e.g. Finance, Inventory"
              value={category} onChange={e => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Base Collection *</label>
            <select
              className="form-input"
              value={baseCollection}
              onChange={e => { setBaseCollection(e.target.value); setCandidates([]); }}
            >
              <option value="">— select primary form —</option>
              {inputForms.map(f => (
                <option key={f.form_name} value={f.form_name}>
                  {f.display_name} ({f.form_name})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">The primary collection rows come from.</p>
          </div>
        </div>
      </div>

      {/* ── Joins ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Joins</h3>
            <p className="text-xs text-gray-400 mt-0.5">Link related collections to pull in extra fields per row.</p>
          </div>
          <button onClick={addJoin} className="flex items-center gap-1.5 text-xs btn-secondary py-1.5">
            <Plus size={12} /> Add Join
          </button>
        </div>

        {joins.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-5 border-2 border-dashed border-gray-200 rounded-lg">
            No joins yet. Click "Add Join" to link a related collection.
          </p>
        ) : (
          <div className="space-y-3">
            {joins.map((join, idx) => (
              <JoinRow
                key={join._id}
                join={join}
                index={idx}
                inputForms={inputForms}
                baseFields={baseFields}
                onUpdate={patch => updateJoin(join._id, patch)}
                onRemove={() => removeJoin(join._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Columns ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Columns
              {selectedCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {selectedCount} selected
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Choose which fields appear in the report table and set their labels.
            </p>
          </div>
          <button
            onClick={loadFields}
            disabled={!baseCollection || loadingFields}
            className="flex items-center gap-1.5 text-xs btn-secondary py-1.5 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loadingFields ? 'animate-spin' : ''} />
            {loadingFields ? 'Loading...' : 'Load Fields'}
          </button>
        </div>

        {/* Grouping toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <input
            type="checkbox"
            checked={groupingEnabled}
            onChange={e => setGroupingEnabled(e.target.checked)}
            className="form-checkbox text-amber-500"
          />
          <div>
            <span className="text-sm font-medium text-amber-800">Enable Group &amp; Sum</span>
            <p className="text-xs text-amber-600 mt-0.5">
              Group rows by selected fields and aggregate number / currency values.
            </p>
          </div>
        </label>

        {candidates.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-400">
              {baseCollection
                ? 'Click "Load Fields" to discover available columns from the base collection and joins.'
                : 'Select a base collection first, then click "Load Fields".'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groups).map(([gk, fields]) => {
              const isBase = gk === '__base__';
              const gLabel = getGroupLabel(gk);
              return (
                <div key={gk}>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold mb-2 ${
                    isBase ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isBase ? 'Base' : 'Join'}: {gLabel}
                  </div>
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                    {fields.map((f, fi) => {
                      const isNumeric = ['number', 'currency', 'percentage'].includes(f.fieldType);
                      return (
                        <div
                          key={f.key || `${gk}_${fi}`}
                          className={`flex items-center gap-3 px-3 py-2 ${f.selected ? 'bg-indigo-50/40' : 'bg-white hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={f.selected}
                            onChange={() => toggleCandidate(f.key)}
                            className="rounded text-indigo-600 shrink-0"
                          />
                          <span className="text-xs font-mono text-gray-400 w-36 truncate shrink-0">{f.key}</span>
                          {f.selected ? (
                            <input
                              type="text"
                              className="form-input py-1 text-sm flex-1"
                              value={f.customLabel}
                              onChange={e => updateLabel(f.key, e.target.value)}
                              placeholder="Column label"
                            />
                          ) : (
                            <span className="text-sm text-gray-500 flex-1">{f.label}</span>
                          )}
                          {/* Grouping controls */}
                          {groupingEnabled && f.selected && (
                            <>
                              <label className="flex items-center gap-1 cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={f.group_by}
                                  onChange={e => updateGroupBy(f.key, e.target.checked)}
                                  className="rounded text-amber-500"
                                />
                                <span className="text-xs text-amber-700 whitespace-nowrap">Group By</span>
                              </label>
                              {(isNumeric || (!f.group_by)) && (
                                <select
                                  value={f.aggregation || 'none'}
                                  onChange={e => updateAggregation(f.key, e.target.value)}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 shrink-0"
                                >
                                  <option value="none">No Agg</option>
                                  <option value="sum">Sum</option>
                                  <option value="avg">Avg</option>
                                  <option value="min">Min</option>
                                  <option value="max">Max</option>
                                  <option value="count">Count</option>
                                </select>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Invoice ── */}
      <InvoiceBuilder
        enabled={invoiceEnabled}
        config={invoiceConfig}
        columns={candidates.filter(c => c.selected).map(c => ({ key: c.key, label: c.customLabel || c.label, source: c.source }))}
        onToggle={setInvoiceEnabled}
        onChange={setInvoiceConfig}
      />

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={isPending} className="btn-primary flex items-center gap-2">
          <Save size={16} />
          {isPending
            ? (isEditMode ? 'Updating...' : 'Creating...')
            : (isEditMode ? 'Update Report' : 'Save Report')}
        </button>
      </div>
    </div>
  );
}

// ── JoinRow ───────────────────────────────────────────────────

interface JoinRowProps {
  join: BuilderJoin;
  index: number;
  inputForms: InputFormMeta[];
  baseFields: { key: string; label: string }[];
  onUpdate: (patch: Partial<BuilderJoin>) => void;
  onRemove: () => void;
}

function JoinRow({ join, index, inputForms, baseFields, onUpdate, onRemove }: JoinRowProps) {
  // Auto-fill alias when collection is picked (if alias still empty)
  const handleCollectionChange = (collection: string) => {
    onUpdate({ collection, as: join.as || collection.split('_').pop() || collection });
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Join #{index + 1}
        </span>
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Join collection */}
        <div>
          <label className="form-label">Join Collection *</label>
          <select
            className="form-input"
            value={join.collection}
            onChange={e => handleCollectionChange(e.target.value)}
          >
            <option value="">— select form —</option>
            {inputForms.map(f => (
              <option key={f.form_name} value={f.form_name}>
                {f.display_name} ({f.form_name})
              </option>
            ))}
          </select>
        </div>

        {/* Alias */}
        <div>
          <label className="form-label">Alias *</label>
          <input
            type="text"
            className="form-input font-mono text-sm"
            placeholder="branch"
            value={join.as}
            onChange={e => onUpdate({ as: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          />
          <p className="text-xs text-gray-400 mt-0.5">Used as prefix for joined fields, e.g. <code>branch.name</code></p>
        </div>

        {/* Local field (from base collection) */}
        <div>
          <label className="form-label">Local Field *</label>
          {baseFields.length > 0 ? (
            <select
              className="form-input"
              value={join.local_field}
              onChange={e => onUpdate({ local_field: e.target.value })}
            >
              <option value="">— select field —</option>
              {baseFields.map(f => (
                <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="form-input font-mono text-sm"
              placeholder="branch_id"
              value={join.local_field}
              onChange={e => onUpdate({ local_field: e.target.value })}
            />
          )}
          <p className="text-xs text-gray-400 mt-0.5">Field in the base collection that holds the reference.</p>
        </div>

        {/* Foreign field */}
        <div>
          <label className="form-label">Foreign Field</label>
          <input
            type="text"
            className="form-input font-mono text-sm"
            placeholder="_id"
            value={join.foreign_field}
            onChange={e => onUpdate({ foreign_field: e.target.value })}
          />
          <p className="text-xs text-gray-400 mt-0.5">Field in the joined collection to match against (usually <code>_id</code>).</p>
        </div>
      </div>
    </div>
  );
}
