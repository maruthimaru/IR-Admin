'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import { ExternalLink, FileText, Calendar, Loader2, AlertCircle, Globe } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

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

  const { isAdmin, formPerms } = usePermissions();

  const { data, isLoading, error } = useQuery({
    queryKey: ['forms', 'list'],
    queryFn: () => formsAPI.listConfigs({ type: 'list' }).then(r => r.data),
  });

  const allPages: ListPageConfig[] = data?.results ?? [];

  // For non-admins, only show pages where the user has at least view access
  const pages = isAdmin
    ? allPages
    : allPages.filter(page => formPerms(page.form_ref).view);

  return (
    <TenantShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'Auto-generated list pages for each form. Open a page to view and manage records.'
              : 'Your accessible form pages.'}
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={28} />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <AlertCircle size={18} />
            Failed to load pages.
          </div>
        )}

        {!isLoading && pages.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <Globe size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No pages available</p>
            {isAdmin ? (
              <>
                <p className="text-sm text-gray-400 mt-1 mb-6">Pages are auto-created when you create a form</p>
                <button
                  onClick={() => router.push(`/${subdomain}/developer/forms`)}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <FileText size={16} />
                  Go to Forms
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-1">You don&apos;t have access to any form pages yet. Contact your admin.</p>
            )}
          </div>
        )}

        {pages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => {
              const fp = formPerms(page.form_ref);
              return (
                <div
                  key={page._id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5 space-y-4"
                >
                  <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <Globe size={18} className="text-indigo-600" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900">{page.display_name}</h3>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{page.form_name}</p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{page.columns?.length ?? 0} columns</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {page.created_at ? new Date(page.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>

                  {/* Permission badges for non-admins */}
                  {!isAdmin && (
                    <div className="flex flex-wrap gap-1">
                      {fp.view   && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">View</span>}
                      {fp.add    && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded">Add</span>}
                      {fp.edit   && <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">Edit</span>}
                      {fp.delete && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Delete</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => router.push(`/${subdomain}/runtime/${page.form_name}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                    >
                      <ExternalLink size={12} />
                      Open Page
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => router.push(`/${subdomain}/developer/forms/${page.form_ref}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      >
                        <FileText size={12} />
                        Edit Form
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TenantShell>
  );
}
