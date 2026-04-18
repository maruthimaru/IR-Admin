'use client';

import { useParams, useRouter } from 'next/navigation';
import TenantShell from '@/components/tenant/TenantShell';
import FormBuilder from '@/components/builder/FormBuilder';
import { ArrowLeft } from 'lucide-react';

export default function NewFormPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;

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
          <h1 className="text-2xl font-bold text-gray-900">New Form</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Design your form fields. An input page and a list page will be auto-created.
          </p>
        </div>

        <FormBuilder
          onSuccess={(formName) => {
            router.push(`/${subdomain}/runtime/${formName}_list`);
          }}
        />
      </div>
    </TenantShell>
  );
}
