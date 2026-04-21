'use client';

/**
 * Dynamic List Renderer - Runtime UI
 * Renders any list page based on its JSON configuration.
 * Supports: pagination, search, sorting, footer aggregations,
 *           edit/delete actions, column filters, bulk select,
 *           bulk update modal, bulk import CSV.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import { ListPageConfig, FormField } from '@/types';
import { toast } from 'react-toastify';
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Edit2, Trash2, Eye, Download, RefreshCw, Upload, Filter,
  CheckSquare, Square, X, Pencil, Columns, Check, CopyPlus,
} from 'lucide-react';
import { useTenantStore } from '@/store/tenant';
import { formatFieldValue } from '@/lib/datetime';
import { usePermissions } from '@/hooks/usePermissions';

interface DynamicListProps {
  pageName: string;
  onEditRecord?: (record: Record<string, unknown>) => void;
  onEditWithNew?: (record: Record<string, unknown>) => void;
  activeRecordId?: string | null;
}

export default function DynamicList({ pageName, onEditRecord, onEditWithNew, activeRecordId }: DynamicListProps) {
  const queryClient = useQueryClient();
  const timezone = useTenantStore(s => s.company?.settings?.timezone ?? 'UTC');

  // Pagination / sort / search
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(20);
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column filters
  const [filterOpen, setFilterOpen]     = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk update modal
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkField, setBulkField]           = useState('');
  const [bulkValue, setBulkValue]           = useState('');

  // Column visibility
  const [visibleCols, setVisibleCols]   = useState<Set<string> | null>(null);
  const [columnsOpen, setColumnsOpen]   = useState(false);
  const columnsRef                       = useRef<HTMLDivElement>(null);

  // Inline list editing — sparse: only holds rows with pending changes
  const [inlineEdits, setInlineEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [savingRows,  setSavingRows]  = useState<Set<string>>(new Set());

  // Bulk import
  const importRef = useRef<HTMLInputElement>(null);

  // Build filter query params
  const filterParams = Object.fromEntries(
    Object.entries(activeFilters)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [`filter_${k}`, v])
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['list-page', pageName, page, pageSize, search, sortBy, sortOrder, filterParams],
    queryFn: () =>
      formsAPI.getListPageData(pageName, {
        page, page_size: pageSize, search,
        sort_by: sortBy,
        sort_order: sortOrder,
        ...filterParams,
      }).then(r => r.data),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ formRef, id }: { formRef: string; id: string }) =>
      formsAPI.deleteRecord(formRef, id),
    onSuccess: () => {
      toast.success('Record deleted');
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
      setSelected(new Set());
    },
    onError: () => toast.error('Failed to delete record'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ formRef, ids }: { formRef: string; ids: string[] }) =>
      formsAPI.bulkDeleteRecords(formRef, ids),
    onSuccess: (_, { ids }) => {
      toast.success(`${ids.length} records deleted`);
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
      setSelected(new Set());
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ formRef, ids, updates }: { formRef: string; ids: string[]; updates: object }) =>
      formsAPI.bulkUpdateRecords(formRef, ids, updates),
    onSuccess: (res) => {
      toast.success(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
      setBulkUpdateOpen(false);
      setBulkField('');
      setBulkValue('');
      setSelected(new Set());
    },
    onError: () => toast.error('Bulk update failed'),
  });

  const importMutation = useMutation({
    mutationFn: ({ formRef, file }: { formRef: string; file: File }) =>
      formsAPI.importRecords(formRef, file),
    onSuccess: (res) => {
      const { inserted, row_errors } = res.data;
      if (row_errors?.length) {
        toast.warn(`${inserted} imported, ${row_errors.length} rows had errors`);
      } else {
        toast.success(res.data.message);
      }
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr.response?.data?.error ?? 'Import failed');
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: ({ fRef, id, updates }: { fRef: string; id: string; updates: Record<string, unknown> }) =>
      formsAPI.updateRecord(fRef, id, updates),
    onMutate: ({ id }) => setSavingRows(prev => { const next = new Set(prev); next.add(id); return next; }),
    onSuccess: (_, { id }) => {
      toast.success('Row updated');
      setInlineEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
    },
    onError: (_err, { id }) => {
      const axErr = _err as { response?: { data?: { errors?: Record<string, string>; error?: string } } };
      const msg = axErr.response?.data?.error
        ?? Object.values(axErr.response?.data?.errors ?? {}).join(', ')
        ?? 'Failed to update row';
      toast.error(msg);
    },
    onSettled: (_data, _err, { id }) =>
      setSavingRows(prev => { const next = new Set(prev); next.delete(id); return next; }),
  });

  const config        = data?.page_config as ListPageConfig | undefined;
  const records       = data?.results ?? [];
  const total         = data?.total ?? 0;
  const footerValues  = data?.footer_values ?? {};
  const totalPages    = Math.ceil(total / pageSize);
  const sourceFields: FormField[] = (data?.page_config as { source_fields?: FormField[] })?.source_fields ?? [];
  const formRef       = config?.form_ref ?? '';

  const { formPerms } = usePermissions();
  const fp = formPerms(formRef);

  // Initialise visible columns once config loads; preserve user overrides on refetch
  useEffect(() => {
    if (config?.columns && visibleCols === null) {
      setVisibleCols(new Set(config.columns));
    }
  }, [config?.columns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close column picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    if (columnsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsOpen]);

  // The columns actually rendered (filtered by visibility)
  const allColumns    = config?.columns ?? [];
  const displayCols   = allColumns.filter(col => !visibleCols || visibleCols.has(col));

  // Field label lookup for the column picker
  const fieldLabelMap = React.useMemo(
    () => Object.fromEntries(sourceFields.map(f => [f.key, f.label])),
    [sourceFields]
  );

  // Fields that support inline list editing
  const editOnListKeys = React.useMemo(
    () => new Set(
      sourceFields
        .filter(f => f.edit_on_list && ['text', 'number', 'currency', 'textarea'].includes(f.type))
        .map(f => f.key)
    ),
    [sourceFields]
  );
  const fieldMetaMap = React.useMemo(
    () => Object.fromEntries(sourceFields.map(f => [f.key, f])),
    [sourceFields]
  );
  const hasEditOnList = editOnListKeys.size > 0;

  // Detect edit_with_new field — action icon only shown when this field is configured
  const editWithNewField = React.useMemo(
    () => sourceFields.find(f => f.type === 'edit_with_new'),
    [sourceFields]
  );

  // ── Sorting ────────────────────────────────────────────────
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Build a lookup of which columns are sortable
  const sortableKeys = React.useMemo(() => {
    const explicit = new Set(sourceFields.filter(f => f.is_sortable).map(f => f.key));
    // If no field explicitly has is_sortable, fall back to allowing all (backward compat)
    return explicit.size > 0 ? explicit : null;
  }, [sourceFields]);

  // ── Select helpers ─────────────────────────────────────────
  const allIds: string[] = records.map((r: Record<string, unknown>) => String(r._id));
  const allSelected      = allIds.length > 0 && allIds.every((id: string) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Value formatter ────────────────────────────────────────
  const fieldTypeMap = React.useMemo(
    () => Object.fromEntries(sourceFields.map(f => [f.key, f.type])),
    [sourceFields]
  );

  const fieldFormatMap = React.useMemo(
    () => Object.fromEntries(sourceFields.map(f => [f.key, {
      date_format:    f.date_format,
      time_format:    f.time_format,
      field_timezone: f.field_timezone,
    }])),
    [sourceFields]
  );

  const formatValue = (value: unknown, key: string): React.ReactNode => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'string') {
      const ftype = fieldTypeMap[key];
      if (ftype === 'date' || ftype === 'datetime' || ftype === 'time') {
        const fmt = fieldFormatMap[key];
        const tz = fmt?.field_timezone || timezone;
        return formatFieldValue(value, ftype, fmt?.date_format, fmt?.time_format, tz);
      }
      // Show thumbnail for image fields or values that look like images
      const isImageField = ftype === 'image';
      const looksLikeImage =
        value.startsWith('data:image') ||
        /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(value);
      if (value && (isImageField || looksLikeImage)) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-10 w-10 rounded-lg object-cover border border-gray-200 bg-gray-50"
          />
        );
      }
    }
    return String(value);
  };

  // ── CSV Export ─────────────────────────────────────────────
  const exportToCSV = async () => {
    if (!formRef) return;
    try {
      const res = await formsAPI.exportRecords(formRef);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a   = document.createElement('a');
      a.href = url;
      a.download = `${formRef}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported to CSV!');
    } catch {
      toast.error('Export failed');
    }
  };

  // ── Bulk update submit ─────────────────────────────────────
  const handleBulkUpdate = () => {
    if (!bulkField || bulkValue === '') return;
    bulkUpdateMutation.mutate({
      formRef,
      ids: Array.from(selected),
      updates: { [bulkField]: bulkValue },
    });
  };

  // ── Import file chosen ─────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !formRef) return;
    importMutation.mutate({ formRef, file });
    e.target.value = '';
  };

  // ── Filter helpers ─────────────────────────────────────────
  const setFilter = (key: string, val: string) => {
    setActiveFilters(prev => ({ ...prev, [key]: val }));
    setPage(1);
  };

  const clearFilters = () => {
    setActiveFilters({});
    setPage(1);
  };

  const filterableFields = sourceFields.filter(f =>
    ['select', 'radio', 'checkbox', 'switch', 'date', 'datetime', 'time', 'boolean'].includes(f.type) ||
    f.is_sortable === true
  );
  const activeFilterCount = Object.values(activeFilters).filter(v => v !== '').length;

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load list data</p>
        <button onClick={() => refetch()} className="btn-secondary mt-3">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {config?.display_name || pageName}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} records</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="form-input pl-8 py-1.5 text-sm w-44"
            />
          </div>

          {/* Column picker */}
          {allColumns.length > 0 && (
            <div ref={columnsRef} className="relative">
              <button
                onClick={() => setColumnsOpen(o => !o)}
                className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border transition-colors ${
                  columnsOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'btn-secondary'
                }`}
              >
                <Columns size={13} />
                Columns
                {visibleCols && visibleCols.size < allColumns.length && (
                  <span className="ml-0.5 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {visibleCols.size}
                  </span>
                )}
              </button>

              {columnsOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-56 py-2">
                  <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-100 mb-1">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Columns</span>
                    <div className="flex gap-2 text-xs text-indigo-600">
                      <button onClick={() => setVisibleCols(new Set(allColumns))} className="hover:underline">All</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setVisibleCols(new Set())} className="hover:underline">None</button>
                    </div>
                  </div>
                  {allColumns.map(col => (
                    <label key={col} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!visibleCols || visibleCols.has(col)}
                        onChange={e => {
                          setVisibleCols(prev => {
                            const next = new Set(prev ?? allColumns);
                            e.target.checked ? next.add(col) : next.delete(col);
                            return next;
                          });
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-sm text-gray-700">
                        {fieldLabelMap[col] || col.replace(/_/g, ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter toggle */}
          {filterableFields.length > 0 && (
            <button
              onClick={() => setFilterOpen(o => !o)}
              className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border transition-colors ${
                activeFilterCount > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'btn-secondary'
              }`}
            >
              <Filter size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>

          {/* Export */}
          {fp.export && (
            <button
              onClick={exportToCSV}
              className="btn-secondary flex items-center gap-1.5 text-sm py-1.5"
            >
              <Download size={13} />
              Export
            </button>
          )}

          {/* Import */}
          {fp.import && (
            <>
              <input
                ref={importRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
              />
              <button
                onClick={() => importRef.current?.click()}
                disabled={importMutation.isPending}
                className="btn-secondary flex items-center gap-1.5 text-sm py-1.5"
              >
                <Upload size={13} />
                {importMutation.isPending ? 'Importing...' : 'Import CSV'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && filterableFields.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Filters</span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
              >
                <X size={11} /> Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {filterableFields.map(field => {
              const isDateRange = ['date', 'datetime', 'time'].includes(field.type);
              const inputType   = field.type === 'datetime' ? 'datetime-local'
                                : field.type === 'time'     ? 'time'
                                : 'date';
              return (
                <div key={field.key} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">{field.label}</label>
                  {isDateRange ? (
                    <div className="flex items-center gap-1">
                      <input
                        type={inputType}
                        className="form-input py-1 text-sm w-36"
                        title="From"
                        value={activeFilters[`${field.key}_gte`] ?? ''}
                        onChange={e => setFilter(`${field.key}_gte`, e.target.value)}
                      />
                      <span className="text-gray-400 text-xs shrink-0">–</span>
                      <input
                        type={inputType}
                        className="form-input py-1 text-sm w-36"
                        title="To"
                        value={activeFilters[`${field.key}_lte`] ?? ''}
                        onChange={e => setFilter(`${field.key}_lte`, e.target.value)}
                      />
                    </div>
                  ) : field.options?.length ? (
                    <select
                      className="form-input py-1 text-sm w-40"
                      value={activeFilters[field.key] ?? ''}
                      onChange={e => setFilter(field.key, e.target.value)}
                    >
                      <option value="">All</option>
                      {field.options.map(opt => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : ['checkbox', 'switch', 'boolean'].includes(field.type) ? (
                    <select
                      className="form-input py-1 text-sm w-40"
                      value={activeFilters[field.key] ?? ''}
                      onChange={e => setFilter(field.key, e.target.value)}
                    >
                      <option value="">All</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      type={['number', 'currency', 'percentage'].includes(field.type) ? 'number' : 'text'}
                      className="form-input py-1 text-sm w-40"
                      placeholder={`Filter ${field.label}…`}
                      value={activeFilters[field.key] ?? ''}
                      onChange={e => setFilter(field.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700">
            {selected.size} selected
          </span>
          <button
            onClick={() => setBulkUpdateOpen(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-700 hover:text-indigo-900 border border-indigo-300 rounded px-2.5 py-1 hover:bg-indigo-100 transition-colors"
          >
            <Pencil size={12} />
            Bulk Update
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} records? This cannot be undone.`)) {
                bulkDeleteMutation.mutate({ formRef, ids: Array.from(selected) });
              }
            }}
            disabled={bulkDeleteMutation.isPending}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded px-2.5 py-1 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} />
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* Select all checkbox */}
                <th className="table-header w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-indigo-600">
                    {allSelected
                      ? <CheckSquare size={15} className="text-indigo-600" />
                      : <Square size={15} />}
                  </button>
                </th>

                {displayCols.map(col => {
                  const isSortable = sortableKeys === null || sortableKeys.has(col);
                  const isActive   = sortBy === col;
                  return (
                    <th
                      key={col}
                      className={`table-header select-none ${isSortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      onClick={isSortable ? () => handleSort(col) : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {fieldLabelMap[col] || col.replace(/_/g, ' ')}
                        {isSortable && (
                          isActive ? (
                            sortOrder === 'asc'
                              ? <ChevronUp size={12} className="text-indigo-600" />
                              : <ChevronDown size={12} className="text-indigo-600" />
                          ) : (
                            <span className="flex flex-col opacity-30" style={{ lineHeight: 0 }}>
                              <ChevronUp size={10} />
                              <ChevronDown size={10} />
                            </span>
                          )
                        )}
                      </div>
                    </th>
                  );
                })}

                {((config?.actions?.length ?? 0) > 0 || hasEditOnList || Boolean(editWithNewField)) && (
                  <th className="table-header text-right">Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(5).fill(null).map((_, i) => (
                  <tr key={i}>
                    <td className="table-cell w-10" />
                    {(displayCols.length > 0 ? displayCols : ['', '', '']).map((_, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayCols.length + 2}
                    className="table-cell text-center py-12 text-gray-400"
                  >
                    No records found
                  </td>
                </tr>
              ) : (
                records.map((record: Record<string, unknown>) => {
                  const id        = String(record._id);
                  const isChecked = selected.has(id);
                  const isActive  = activeRecordId === id;
                  const isDirty   = id in inlineEdits;
                  const isSaving  = savingRows.has(id);
                  const showActionsCol = (config?.actions?.length ?? 0) > 0 || hasEditOnList || Boolean(editWithNewField);

                  const handleInlineChange = (col: string, val: unknown) => {
                    setInlineEdits(prev => ({
                      ...prev,
                      [id]: { ...(prev[id] ?? {}), [col]: val },
                    }));
                  };

                  const handleInlineSave = () => {
                    if (!isDirty || isSaving) return;
                    inlineUpdateMutation.mutate({ fRef: formRef, id, updates: inlineEdits[id] });
                  };

                  const handleInlineDiscard = () => {
                    setInlineEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
                  };

                  return (
                    <tr
                      key={id}
                      className={`transition-colors ${
                        isDirty
                          ? 'bg-amber-50'
                          : isActive
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                          : isChecked
                          ? 'bg-indigo-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="table-cell w-10">
                        <button
                          onClick={() => toggleOne(id)}
                          className="text-gray-400 hover:text-indigo-600"
                        >
                          {isChecked
                            ? <CheckSquare size={15} className="text-indigo-600" />
                            : <Square size={15} />}
                        </button>
                      </td>

                      {displayCols.map(col => {
                        const isEditable = editOnListKeys.has(col);
                        if (isEditable) {
                          const meta = fieldMetaMap[col];
                          // For inline edit, always use the raw stored value
                          const cellVal = inlineEdits[id]?.[col] ?? record[col];
                          const isNum = meta?.type === 'number' || meta?.type === 'currency';
                          return (
                            <td key={col} className="table-cell py-1">
                              <input
                                type={isNum ? 'number' : 'text'}
                                value={cellVal !== null && cellVal !== undefined ? String(cellVal) : ''}
                                onChange={e => handleInlineChange(col, isNum ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className={`form-input py-1 text-sm w-full min-w-[80px] ${isDirty && col in (inlineEdits[id] ?? {}) ? 'border-amber-400 focus:ring-amber-400' : ''}`}
                              />
                            </td>
                          );
                        }
                        // For api_select/dependent_select with table_value_key, show the stored label.
                        // The label is stored under "{col}_{table_value_key}" to avoid collisions
                        // when multiple fields share the same table_value_key name (e.g. "name").
                        const meta = fieldMetaMap[col];
                        const storageKey = meta?.table_value_key ? `${col}_${meta.table_value_key}` : '';
                        const displayVal = storageKey && record[storageKey] !== undefined
                          ? record[storageKey]
                          : record[col];
                        return (
                          <td key={col} className="table-cell">
                            {formatValue(displayVal, col)}
                          </td>
                        );
                      })}

                      {showActionsCol && (
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-1">
                            {/* Inline save / discard — shown when row has pending changes */}
                            {isDirty && (
                              <>
                                <button
                                  onClick={handleInlineSave}
                                  disabled={isSaving}
                                  className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                                  title="Save changes"
                                >
                                  {isSaving
                                    ? <RefreshCw size={14} className="animate-spin" />
                                    : <Check size={14} />}
                                </button>
                                <button
                                  onClick={handleInlineDiscard}
                                  disabled={isSaving}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                  title="Discard changes"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                            {config?.actions?.includes('view') && fp.view && (
                              <button className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="View">
                                <Eye size={14} />
                              </button>
                            )}
                            {config?.actions?.includes('edit') && fp.edit && (
                              <button
                                onClick={() => onEditRecord?.(record)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {config?.actions?.includes('delete') && fp.delete && (
                              <button
                                onClick={() => {
                                  if (confirm('Delete this record?')) {
                                    deleteMutation.mutate({ formRef, id });
                                  }
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            {editWithNewField && (
                              <button
                                onClick={() => onEditWithNew?.(record)}
                                className="p-1.5 text-gray-400 hover:text-teal-600 rounded"
                                title="Edit With New"
                              >
                                <CopyPlus size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Aggregations */}
            {Object.keys(footerValues).length > 0 && records.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="table-cell" />
                  {displayCols.map(col => (
                    <td key={col} className="table-cell font-semibold text-gray-700">
                      {footerValues[col] !== undefined ? (
                        <span>
                          <span className="text-xs text-gray-400 uppercase mr-1">
                            {footerValues[`${col}_aggregation`]}:
                          </span>
                          {typeof footerValues[col] === 'number'
                            ? footerValues[col].toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : footerValues[col]}
                        </span>
                      ) : null}
                    </td>
                  ))}
                  {((config?.actions?.length ?? 0) > 0 || hasEditOnList || Boolean(editWithNewField)) && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination — always visible */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 gap-4 flex-wrap">
            {/* Left: rows per page + record count */}
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>Rows per page:</span>
              <select
                className="form-input py-1 text-sm w-20"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 20, 50, 100].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>
                {total === 0 ? '0' : `${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)}`} of {total.toLocaleString()}
              </span>
            </div>

            {/* Right: page buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 rounded text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Update Modal */}
      {bulkUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Bulk Update — {selected.size} records
              </h3>
              <button
                onClick={() => setBulkUpdateOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="form-label">Field to Update</label>
                <select
                  className="form-input"
                  value={bulkField}
                  onChange={e => { setBulkField(e.target.value); setBulkValue(''); }}
                >
                  <option value="">Select a field…</option>
                  {sourceFields
                    .filter(f => !['file', 'image'].includes(f.type))
                    .map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                </select>
              </div>

              {bulkField && (
                <div>
                  <label className="form-label">New Value</label>
                  {(() => {
                    const field = sourceFields.find(f => f.key === bulkField);
                    if (!field) return null;
                    if (field.options?.length) {
                      return (
                        <select
                          className="form-input"
                          value={bulkValue}
                          onChange={e => setBulkValue(e.target.value)}
                        >
                          <option value="">Select…</option>
                          {field.options.map(opt => (
                            <option key={String(opt.value)} value={String(opt.value)}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    if (field.type === 'date') {
                      return (
                        <input
                          type="date"
                          className="form-input"
                          value={bulkValue}
                          onChange={e => setBulkValue(e.target.value)}
                        />
                      );
                    }
                    if (['checkbox', 'switch'].includes(field.type)) {
                      return (
                        <select
                          className="form-input"
                          value={bulkValue}
                          onChange={e => setBulkValue(e.target.value)}
                        >
                          <option value="">Select…</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      );
                    }
                    return (
                      <input
                        type={['number', 'currency', 'percentage'].includes(field.type) ? 'number' : 'text'}
                        className="form-input"
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        value={bulkValue}
                        onChange={e => setBulkValue(e.target.value)}
                      />
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setBulkUpdateOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                disabled={!bulkField || bulkValue === '' || bulkUpdateMutation.isPending}
                className="btn-primary"
              >
                {bulkUpdateMutation.isPending ? 'Updating...' : `Update ${selected.size} Records`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
