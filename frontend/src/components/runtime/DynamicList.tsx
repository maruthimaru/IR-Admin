'use client';

/**
 * Dynamic List Renderer - Runtime UI
 * Renders any list page based on its JSON configuration.
 * Supports: pagination, search, sorting, footer aggregations, edit/delete actions.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import { ListPageConfig } from '@/types';
import { toast } from 'react-toastify';
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Edit2, Trash2, Eye, Download, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

interface DynamicListProps {
  pageName: string;
  onEditRecord?: (record: Record<string, unknown>) => void;
}

export default function DynamicList({ pageName, onEditRecord }: DynamicListProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['list-page', pageName, page, search, sortBy, sortOrder],
    queryFn: () =>
      formsAPI.getListPageData(pageName, { page, search, sort_by: sortBy, sort_order: sortOrder })
        .then(r => r.data),
        placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ formRef, id }: { formRef: string; id: string }) =>
      formsAPI.deleteRecord(formRef, id),
    onSuccess: () => {
      toast.success('Record deleted');
      queryClient.invalidateQueries({ queryKey: ['list-page', pageName] });
    },
    onError: () => toast.error('Failed to delete record'),
  });

  const config = data?.page_config as ListPageConfig | undefined;
  const records = data?.results ?? [];
  const total = data?.total ?? 0;
  const footerValues = data?.footer_values ?? {};
  const pageSize = data?.page_size ?? 20;
  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const formatValue = (value: unknown, key: string): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString();

    // Try date formatting
    if (typeof value === 'string' && key.includes('date') || key.includes('_at')) {
      try {
        return format(new Date(String(value)), 'MMM d, yyyy');
      } catch { return String(value); }
    }

    return String(value);
  };

  const exportToCSV = () => {
    if (!records.length || !config?.columns) return;
    const headers = config.columns.join(',');
    const rows = records.map((r: Record<string, unknown>) =>
      config.columns.map(col => JSON.stringify(r[col] ?? '')).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV!');
  };

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {config?.display_name || pageName}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} records</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="form-input pl-8 py-1.5 text-sm w-48"
            />
          </div>

          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw size={14} />
          </button>

          <button onClick={exportToCSV} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {config?.columns?.map(col => (
                  <th
                    key={col}
                    className="table-header cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center gap-1">
                      {col.replace(/_/g, ' ')}
                      {sortBy === col && (
                        sortOrder === 'asc'
                          ? <ChevronUp size={12} className="text-indigo-600" />
                          : <ChevronDown size={12} className="text-indigo-600" />
                      )}
                    </div>
                  </th>
                ))}
                {(config?.actions?.length ?? 0) > 0 && (
                  <th className="table-header text-right">Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array(5).fill(null).map((_, i) => (
                  <tr key={i}>
                    {(config?.columns ?? ['', '', '']).map((col, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={(config?.columns?.length ?? 1) + 1}
                    className="table-cell text-center py-12 text-gray-400"
                  >
                    No records found
                  </td>
                </tr>
              ) : (
                records.map((record: Record<string, unknown>) => (
                  <tr key={String(record._id)} className="hover:bg-gray-50 transition-colors">
                    {config?.columns?.map(col => (
                      <td key={col} className="table-cell">
                        {formatValue(record[col], col)}
                      </td>
                    ))}
                    {(config?.actions?.length ?? 0) > 0 && (
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-1">
                          {config?.actions?.includes('view') && (
                            <button className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="View">
                              <Eye size={14} />
                            </button>
                          )}
                          {config?.actions?.includes('edit') && (
                            <button
                              onClick={() => onEditRecord?.(record)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {config?.actions?.includes('delete') && (
                            <button
                              onClick={() => {
                                if (confirm('Delete this record?')) {
                                  deleteMutation.mutate({
                                    formRef: config?.form_ref,
                                    id: String(record._id),
                                  });
                                }
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>

            {/* Footer Aggregations */}
            {Object.keys(footerValues).length > 0 && records.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  {config?.columns?.map(col => (
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
                  {(config?.actions?.length ?? 0) > 0 && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
