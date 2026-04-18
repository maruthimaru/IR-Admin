'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import TenantShell from '@/components/tenant/TenantShell';
import FormBuilder from '@/components/builder/FormBuilder';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { InputFormConfig } from '@/types';

export default function EditFormPage() {
  const params     = useParams();
  const router     = useRouter();
  const subdomain  = params.tenant as string;
  const formName   = params.formName as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['form-config', formName],
    queryFn: () => formsAPI.getConfig(formName).then(r => r.data as InputFormConfig),
  });

  return (
    <TenantShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={() => router.push(`/${subdomain}/developer/forms`)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Forms
        </button>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Form</h1>
          <p className="text-xs font-mono text-gray-400 mt-0.5">{formName}</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={28} />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            Failed to load form configuration.
          </div>
        )}

        {data && (
          <FormBuilder
            initialConfig={data}
            onSuccess={() => {
              router.push(`/${subdomain}/developer/forms`);
            }}
          />
        )}
      </div>
    </TenantShell>
  );
}
