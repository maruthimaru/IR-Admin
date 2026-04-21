'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsAPI } from '@/lib/api';
import { ReportConfig } from '@/types';
import { toast } from 'react-toastify';
import TenantShell from '@/components/tenant/TenantShell';
import { Plus, Edit2, Trash2, BarChart2, Calendar, Tag, Loader2, AlertCircle, Eye } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

const COLOURS = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-amber-50  text-amber-700  border-amber-200',
  'bg-rose-50   text-rose-700   border-rose-200',
];

export default function ReportsListPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;
  const qc        = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState('all');

  const { canSectionAction } = usePermissions();
  const canAdd       = canSectionAction('reports', 'add');
  const canConfigure = canSectionAction('reports', 'configure');
  const canDelete    = canSectionAction('reports', 'delete');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports'],
    queryFn:  () => reportsAPI.list().then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => reportsAPI.delete(name),
    onSuccess: (_, name) => {
      toast.success(`Report "${name}" deleted`);
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => toast.error('Failed to delete report'),
  });

  const reports: ReportConfig[] = data?.results ?? [];

  const categories = useMemo(() => {
    const cats = new Set<string>();
    reports.forEach(r => { if (r.category?.trim()) cats.add(r.category.trim()); });
    return Array.from(cats).sort();
  }, [reports]);

  const hasUncategorized = reports.some(r => !r.category?.trim());

  const filtered = useMemo(() => {
    if (selectedCategory === 'all')              return reports;
    if (selectedCategory === '__uncategorized__') return reports.filter(r => !r.category?.trim());
    return reports.filter(r => r.category?.trim() === selectedCategory);
  }, [reports, selectedCategory]);

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
      active
        ? 'bg-indigo-600 text-white border-indigo-600'
        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
    }`;

  return (
    <TenantShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500 mt-0.5">Join collections and build tabular reports</p>
          </div>
          {canAdd && (
            <button
              onClick={() => router.push(`/${subdomain}/developer/reports/new`)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> New Report
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={28} />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <AlertCircle size={18} /> Failed to load reports.
          </div>
        )}

        {!isLoading && reports.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <BarChart2 size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No reports yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-6">Create your first report to join collections</p>
            {canAdd && (
              <button
                onClick={() => router.push(`/${subdomain}/developer/reports/new`)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus size={16} /> Create Report
              </button>
            )}
          </div>
        )}

        {reports.length > 0 && (
          <>
            {/* Category tabs */}
            {(categories.length > 0 || hasUncategorized) && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag size={14} className="text-gray-400 shrink-0" />
                <button className={tabClass(selectedCategory === 'all')} onClick={() => setSelectedCategory('all')}>
                  All <span className="ml-1.5 text-xs opacity-70">({reports.length})</span>
                </button>
                {categories.map((cat, i) => (
                  <button key={cat} className={tabClass(selectedCategory === cat)} onClick={() => setSelectedCategory(cat)}>
                    {cat}
                    <span className="ml-1.5 text-xs opacity-70">
                      ({reports.filter(r => r.category?.trim() === cat).length})
                    </span>
                  </button>
                ))}
                {hasUncategorized && (
                  <button className={tabClass(selectedCategory === '__uncategorized__')} onClick={() => setSelectedCategory('__uncategorized__')}>
                    Uncategorized <span className="ml-1.5 text-xs opacity-70">({reports.filter(r => !r.category?.trim()).length})</span>
                  </button>
                )}
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                No reports in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((report) => {
                  const cat      = report.category?.trim();
                  const catIdx   = categories.indexOf(cat ?? '');
                  const catColor = cat ? COLOURS[catIdx % COLOURS.length] : '';
                  return (
                    <div key={report._id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                          <BarChart2 size={18} className="text-purple-600" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {cat && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${catColor}`}>{cat}</span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                            Active
                          </span>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold text-gray-900">{report.display_name}</h3>
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{report.form_name}</p>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{report.joins?.length ?? 0} join{report.joins?.length !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{report.columns?.length ?? 0} columns</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {report.created_at ? new Date(report.created_at).toLocaleDateString() : '—'}
                        </span>
                      </div>

                      <div className="text-xs text-gray-400 truncate">
                        <span className="font-medium text-gray-600">Base:</span> {report.base_collection}
                        {report.joins?.length > 0 && (
                          <> → {report.joins.map(j => j.collection).join(', ')}</>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <button
                          onClick={() => router.push(`/${subdomain}/runtime/report/${report.form_name}`)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                        >
                          <Eye size={12} /> View
                        </button>
                        {canConfigure && (
                          <button
                            onClick={() => router.push(`/${subdomain}/developer/reports/${report.form_name}`)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 size={12} /> Configure
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete report "${report.display_name}"?`)) {
                                deleteMutation.mutate(report.form_name);
                              }
                            }}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </TenantShell>
  );
}
