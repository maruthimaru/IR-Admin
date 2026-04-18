'use client';

import { useParams, useRouter } from 'next/navigation';
import TenantShell from '@/components/tenant/TenantShell';
import ReportList from '@/components/runtime/ReportList';
import { ArrowLeft, Settings } from 'lucide-react';

export default function ReportRuntimePage() {
  const params      = useParams();
  const router      = useRouter();
  const subdomain   = params.tenant as string;
  const reportName  = params.reportName as string;

  return (
    <TenantShell>
      <div className="p-8 space-y-6 max-w-full">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/${subdomain}/developer/reports`)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} /> Reports
          </button>
          <button
            onClick={() => router.push(`/${subdomain}/developer/reports/${reportName}`)}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5"
          >
            <Settings size={14} /> Configure
          </button>
        </div>

        <ReportList reportName={reportName} />
      </div>
    </TenantShell>
  );
}
