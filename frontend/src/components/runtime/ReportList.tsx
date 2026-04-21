'use client';

/**
 * ReportList — renders a join-based report at runtime.
 * Read-only table with search, sort, pagination, and column visibility.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { reportsAPI } from '@/lib/api';
import { ReportColumn } from '@/types';
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  RefreshCw, Download, Columns, FileText,
} from 'lucide-react';
import { format } from 'date-fns';

interface ReportListProps {
  reportName: string;
}

// Resolve dot-notation paths like "branch.name" from a nested record
function getNestedValue(record: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((obj, k) => {
    if (obj !== null && obj !== undefined && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[k];
    }
    return undefined;
  }, record);
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') {
    // Date-like strings
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try { return format(new Date(value), 'MMM d, yyyy'); } catch { return value; }
    }
    // Images
    if (value.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(value)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={value} alt="" className="h-8 w-8 rounded object-cover border border-gray-200" />;
    }
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ReportList({ reportName }: ReportListProps) {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(20);
  const [search,    setSearch]    = useState('');
  const [sortBy,    setSortBy]    = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<string> | null>(null);
  const [colsOpen,    setColsOpen]    = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-data', reportName, page, pageSize, search, sortBy, sortOrder],
    queryFn:  () => reportsAPI.getData(reportName, {
      page, page_size: pageSize, search,
      sort_by: sortBy, sort_order: sortOrder,
    }).then(r => r.data),
    placeholderData: keepPreviousData,
  });

  const config:   { display_name?: string; columns?: ReportColumn[]; invoice_enabled?: boolean } = data?.config ?? {};
  const records:  Record<string, unknown>[] = data?.results ?? [];
  const total:    number = data?.total ?? 0;
  const allCols:  ReportColumn[] = config.columns ?? [];
  const totalPages = Math.ceil(total / pageSize);

  // Init visible columns once config loads
  useEffect(() => {
    if (allCols.length > 0 && visibleCols === null) {
      setVisibleCols(new Set(allCols.map(c => c.key)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCols.length]);

  // Close column picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    if (colsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colsOpen]);

  const invoiceEnabled = Boolean(config.invoice_enabled);

  const handleInvoiceRow = (record: Record<string, unknown>) => {
    sessionStorage.setItem(`invoice_row_${reportName}`, JSON.stringify(record));
    router.push(`/${subdomain}/runtime/report/${reportName}/invoice?single=true`);
  };

  const displayCols = allCols.filter(c => !visibleCols || visibleCols.has(c.key));

  const handleSort = (key: string) => {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortOrder('asc'); }
  };

  // CSV export (client-side from current page data)
  const exportCSV = () => {
    if (!records.length) return;
    const header = displayCols.map(c => `"${c.label}"`).join(',');
    const rows = records.map(r =>
      displayCols.map(c => {
        const v = getNestedValue(r, c.key);
        return `"${String(v ?? '').replace(/"/g, '""')}"`;
      }).join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${reportName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-3">Failed to load report data</p>
        <button onClick={() => refetch()} className="btn-secondary">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {config.display_name || reportName}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} rows</p>
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
          {allCols.length > 0 && (
            <div ref={colsRef} className="relative">
              <button
                onClick={() => setColsOpen(o => !o)}
                className={`flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg border transition-colors ${
                  colsOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'btn-secondary'
                }`}
              >
                <Columns size={13} /> Columns
                {visibleCols && visibleCols.size < allCols.length && (
                  <span className="ml-0.5 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {visibleCols.size}
                  </span>
                )}
              </button>

              {colsOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-56 py-2">
                  <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-100 mb-1">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Columns</span>
                    <div className="flex gap-2 text-xs text-indigo-600">
                      <button onClick={() => setVisibleCols(new Set(allCols.map(c => c.key)))} className="hover:underline">All</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setVisibleCols(new Set())} className="hover:underline">None</button>
                    </div>
                  </div>
                  {allCols.map(col => (
                    <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!visibleCols || visibleCols.has(col.key)}
                        onChange={e => setVisibleCols(prev => {
                          const next = new Set(prev ?? allCols.map(c => c.key));
                          e.target.checked ? next.add(col.key) : next.delete(col.key);
                          return next;
                        })}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>

          <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {displayCols.map(col => {
                  const sortable = !col.key.includes('.');
                  const isActive = sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      className={`table-header select-none ${sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      onClick={sortable ? () => handleSort(col.key) : undefined}
                    >
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col">
                          <span>{col.label}</span>
                          <span className="text-[10px] font-normal text-gray-400 font-mono leading-tight">{col.key}</span>
                        </div>
                        {sortable && (
                          isActive ? (
                            sortOrder === 'asc'
                              ? <ChevronUp size={12} className="text-indigo-600" />
                              : <ChevronDown size={12} className="text-indigo-600" />
                          ) : (
                            <span className="flex flex-col opacity-30" style={{ lineHeight: 0 }}>
                              <ChevronUp size={10} /><ChevronDown size={10} />
                            </span>
                          )
                        )}
                      </div>
                    </th>
                  );
                })}
                {invoiceEnabled && (
                  <th className="table-header w-24 text-center">Invoice</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(5).fill(null).map((_, i) => (
                  <tr key={i}>
                    {(displayCols.length > 0 ? displayCols : Array(3).fill(null)).map((_, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                    {invoiceEnabled && <td className="table-cell" />}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={displayCols.length || 1} className="table-cell text-center py-12 text-gray-400">
                    No records found
                  </td>
                </tr>
              ) : (
                records.map((record, i) => (
                  <tr key={String(record._id ?? i)} className="hover:bg-gray-50 transition-colors">
                    {displayCols.map(col => (
                      <td key={col.key} className="table-cell">
                        {formatCell(getNestedValue(record, col.key))}
                      </td>
                    ))}
                    {invoiceEnabled && (
                      <td className="table-cell text-center">
                        <button
                          onClick={() => handleInvoiceRow(record)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
                        >
                          <FileText size={11} /> Invoice
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>Rows per page:</span>
              <select
                className="form-input py-1 text-sm w-20"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30">«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pn = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button key={pn} onClick={() => setPage(pn)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${pn === page ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                      {pn}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30">»</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
