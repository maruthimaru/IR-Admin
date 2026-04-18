'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '@/lib/api';
import { ReportConfig } from '@/types';
import TenantShell from '@/components/tenant/TenantShell';
import ReportBuilder from '@/components/builder/ReportBuilder';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditReportPage() {
  const params      = useParams();
  const router      = useRouter();
  const subdomain   = params.tenant as string;
  const reportName  = params.reportName as string;

  const { data, isLoading } = useQuery({
    queryKey: ['report-config', reportName],
    queryFn:  () => reportsAPI.get(reportName).then(r => r.data as ReportConfig),
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Edit Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Update joins and column configuration.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={28} />
          </div>
        ) : data ? (
          <ReportBuilder
            initialConfig={data}
            onSuccess={() => router.push(`/${subdomain}/developer/reports`)}
          />
        ) : (
          <p className="text-red-500">Report not found.</p>
        )}
      </div>
    </TenantShell>
  );
}
