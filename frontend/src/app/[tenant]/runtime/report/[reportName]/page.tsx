'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import TenantShell from '@/components/tenant/TenantShell';
import ReportList from '@/components/runtime/ReportList';
import { usePermissions } from '@/hooks/usePermissions';
import { reportsAPI } from '@/lib/api';
import { ReportConfig } from '@/types';
import { ArrowLeft, Settings, FileText } from 'lucide-react';

export default function ReportRuntimePage() {
  const params      = useParams();
  const router      = useRouter();
  const subdomain   = params.tenant as string;
  const reportName  = params.reportName as string;

  const { canSectionAction } = usePermissions();
  const canConfigure = canSectionAction('reports', 'configure');

  const { data: reportConfig } = useQuery({
    queryKey: ['report-config', reportName],
    queryFn: () => reportsAPI.get(reportName).then(r => r.data as ReportConfig),
  });

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
          <div className="flex items-center gap-2">
            {reportConfig?.invoice_enabled && (
              <button
                onClick={() => router.push(`/${subdomain}/runtime/report/${reportName}/invoice`)}
                className="btn-secondary flex items-center gap-2 text-sm py-1.5"
              >
                <FileText size={14} /> Invoice
              </button>
            )}
            {canConfigure && (
              <button
                onClick={() => router.push(`/${subdomain}/developer/reports/${reportName}`)}
                className="btn-secondary flex items-center gap-2 text-sm py-1.5"
              >
                <Settings size={14} /> Configure
              </button>
            )}
          </div>
        </div>

        <ReportList reportName={reportName} />
      </div>
    </TenantShell>
  );
}
