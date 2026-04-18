'use client';

/**
 * Developer Pages List
 * Shows all list-page configs (auto-created alongside input forms).
 * Lets developers navigate to the runtime view or tweak config.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import {
  ExternalLink, FileText, Calendar, Loader2, AlertCircle, Globe,
} from 'lucide-react';

interface ListPageConfig {
  _id: string;
  form_name: string;
  display_name: string;
  form_ref: string;
  columns: string[];
  created_at: string;
}

export default function DeveloperPagesPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['forms', 'list'],
    queryFn: () => formsAPI.listConfigs({ type: 'list' }).then(r => r.data),
  });

  const pages: ListPageConfig[] = data?.results ?? [];

  return (
    <TenantShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auto-generated list pages for each form. Open a page to view and manage records.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={28} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <AlertCircle size={18} />
            Failed to load pages.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && pages.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <Globe size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No pages yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-6">
              Pages are auto-created when you create a form
            </p>
            <button
              onClick={() => router.push(`/${subdomain}/developer/forms`)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <FileText size={16} />
              Go to Forms
            </button>
          </div>
        )}

        {/* Pages grid */}
        {pages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => (
              <div
                key={page._id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5 space-y-4"
              >
                {/* Card header */}
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <Globe size={18} className="text-indigo-600" />
                </div>

                {/* Title */}
                <div>
                  <h3 className="font-semibold text-gray-900">{page.display_name}</h3>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{page.form_name}</p>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{page.columns?.length ?? 0} columns</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {page.created_at
                      ? new Date(page.created_at).toLocaleDateString()
                      : '—'}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button
                    onClick={() => router.push(`/${subdomain}/runtime/${page.form_name}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open Page
                  </button>
                  <button
                    onClick={() => router.push(`/${subdomain}/developer/forms/${page.form_ref}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <FileText size={12} />
                    Edit Form
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TenantShell>
  );
}
