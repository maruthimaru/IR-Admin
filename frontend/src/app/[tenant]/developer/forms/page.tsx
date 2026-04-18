'use client';

/**
 * Developer Forms List
 * Shows all input forms configured for this tenant, grouped by category.
 */

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import TenantShell from '@/components/tenant/TenantShell';
import {
  Plus, Edit2, Trash2, List, FileText, Calendar,
  Loader2, AlertCircle, Tag,
} from 'lucide-react';

interface FormConfig {
  _id: string;
  form_name: string;
  display_name: string;
  category?: string;
  type: string;
  fields: { key: string; label: string; type: string }[];
  created_at: string;
  is_active: boolean;
}

// Consistent colour per category name (cycles through palette)
const CATEGORY_COLOURS = [
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-orange-50 text-orange-700 border-orange-200',
  'bg-sky-50 text-sky-700 border-sky-200',
];

function getCategoryColour(cat: string, allCats: string[]) {
  const idx = allCats.indexOf(cat);
  return CATEGORY_COLOURS[idx % CATEGORY_COLOURS.length];
}

export default function DeveloperFormsPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;
  const qc        = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['forms', 'input'],
    queryFn: () => formsAPI.listConfigs({ type: 'input' }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (formName: string) => formsAPI.deleteConfig(formName),
    onSuccess: (_, formName) => {
      toast.success(`Form "${formName}" deleted`);
      qc.invalidateQueries({ queryKey: ['forms'] });
    },
    onError: () => toast.error('Failed to delete form'),
  });

  const forms: FormConfig[] = data?.results ?? [];

  // Unique sorted categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    forms.forEach(f => { if (f.category?.trim()) cats.add(f.category.trim()); });
    return Array.from(cats).sort();
  }, [forms]);

  const hasUncategorized = forms.some(f => !f.category?.trim());

  const filteredForms = useMemo(() => {
    if (selectedCategory === 'all') return forms;
    if (selectedCategory === '__uncategorized__') return forms.filter(f => !f.category?.trim());
    return forms.filter(f => f.category?.trim() === selectedCategory);
  }, [forms, selectedCategory]);

  const confirmDelete = (form: FormConfig) => {
    if (
      confirm(
        `Delete form "${form.display_name}"?\n\nThis will permanently delete the form configuration and ALL its records. This cannot be undone.`
      )
    ) {
      deleteMutation.mutate(form.form_name);
    }
  };

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
            <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
            <p className="text-sm text-gray-500 mt-0.5">Design and manage your data entry forms</p>
          </div>
          <button
            onClick={() => router.push(`/${subdomain}/developer/forms/new`)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            New Form
          </button>
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
            Failed to load forms. Make sure your tenant is configured correctly.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && forms.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
            <FileText size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-500">No forms yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-6">Create your first form to get started</p>
            <button
              onClick={() => router.push(`/${subdomain}/developer/forms/new`)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Create Form
            </button>
          </div>
        )}

        {forms.length > 0 && (
          <>
            {/* Category Tabs */}
            {(categories.length > 0 || hasUncategorized) && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag size={14} className="text-gray-400 shrink-0" />
                <button
                  className={tabClass(selectedCategory === 'all')}
                  onClick={() => setSelectedCategory('all')}
                >
                  All
                  <span className="ml-1.5 text-xs opacity-70">({forms.length})</span>
                </button>

                {categories.map(cat => (
                  <button
                    key={cat}
                    className={tabClass(selectedCategory === cat)}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                    <span className="ml-1.5 text-xs opacity-70">
                      ({forms.filter(f => f.category?.trim() === cat).length})
                    </span>
                  </button>
                ))}

                {hasUncategorized && (
                  <button
                    className={tabClass(selectedCategory === '__uncategorized__')}
                    onClick={() => setSelectedCategory('__uncategorized__')}
                  >
                    Uncategorized
                    <span className="ml-1.5 text-xs opacity-70">
                      ({forms.filter(f => !f.category?.trim()).length})
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Forms Grid */}
            {filteredForms.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                No forms in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredForms.map((form) => {
                  const cat = form.category?.trim();
                  const catColour = cat ? getCategoryColour(cat, categories) : '';
                  return (
                    <div
                      key={form._id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all p-5 space-y-4"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                          <FileText size={18} className="text-indigo-600" />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {cat && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${catColour}`}>
                              {cat}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            form.is_active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {form.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <div>
                        <h3 className="font-semibold text-gray-900">{form.display_name}</h3>
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{form.form_name}</p>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{form.fields?.length ?? 0} fields</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {form.created_at
                            ? new Date(form.created_at).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <button
                          onClick={() => router.push(`/${subdomain}/runtime/${form.form_name}_list`)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                        >
                          <List size={12} />
                          Records
                        </button>
                        <button
                          onClick={() => router.push(`/${subdomain}/developer/forms/${form.form_name}`)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                        >
                          <Edit2 size={12} />
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(form)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
                          title="Delete form"
                        >
                          <Trash2 size={12} />
                        </button>
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
