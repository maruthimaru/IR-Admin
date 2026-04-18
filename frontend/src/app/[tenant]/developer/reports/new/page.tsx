'use client';

import { useParams, useRouter } from 'next/navigation';
import TenantShell from '@/components/tenant/TenantShell';
import ReportBuilder from '@/components/builder/ReportBuilder';
import { ArrowLeft } from 'lucide-react';

export default function NewReportPage() {
  const params    = useParams();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  return (
    <TenantShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => router.push(`/${subdomain}/developer/reports`)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} /> Back to Reports
        </button>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Join multiple collections and choose which fields to display.
          </p>
        </div>

        <ReportBuilder
          onSuccess={(reportName) => router.push(`/${subdomain}/runtime/report/${reportName}`)}
        />
      </div>
    </TenantShell>
  );
}
