'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { reportsAPI } from '@/lib/api';
import { ReportConfig, InvoiceConfig } from '@/types';
import { ArrowLeft, Printer, Download, Loader2 } from 'lucide-react';

// ── Template helpers ────────────────────────────────────────────

function resolveTemplate(template: string, firstRecord: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = firstRecord[key.trim()];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

function getCellValue(record: Record<string, unknown>, key: string): unknown {
  if (key.includes('.')) {
    const parts = key.split('.');
    let val: unknown = record;
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p];
      else return '';
    }
    return val;
  }
  return record[key];
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── Page component ──────────────────────────────────────────────

export default function InvoicePage() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const subdomain    = params.tenant as string;
  const reportName   = params.reportName as string;
  const isSingle     = searchParams.get('single') === 'true';

  const [showHeaderFooter, setShowHeaderFooter] = useState(true);
  const [singleRecord, setSingleRecord] = useState<Record<string, unknown> | null>(null);

  // Read sessionStorage for single-row mode
  useEffect(() => {
    if (isSingle) {
      try {
        const raw = sessionStorage.getItem(`invoice_row_${reportName}`);
        if (raw) setSingleRecord(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }, [isSingle, reportName]);

  const { data: reportConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ['report-config', reportName],
    queryFn: () => reportsAPI.get(reportName).then(r => r.data as ReportConfig),
  });

  const { data: reportData, isLoading: loadingData } = useQuery({
    queryKey: ['report-data', reportName, 'invoice'],
    queryFn: () => reportsAPI.getData(reportName, { page_size: 1000 }).then(r => r.data),
    // Skip full fetch in single-row mode once we have the session record
    enabled: !!reportConfig && !(isSingle && singleRecord !== null),
  });

  const isLoading = loadingConfig || (!isSingle && loadingData) || (isSingle && singleRecord === null && loadingData);

  const invoice: InvoiceConfig | undefined = reportConfig?.invoice_config;
  const allColumns = reportConfig?.columns ?? [];

  // In single mode use the one stored row; otherwise use all fetched records
  const records: Record<string, unknown>[] = isSingle && singleRecord
    ? [singleRecord]
    : (reportData?.results ?? []);

  const firstRecord = records[0] ?? {};

  // Determine which columns to show in body
  const bodyColumnKeys = invoice?.body_columns?.length
    ? invoice.body_columns
    : allColumns.map(c => c.key);

  const bodyColumns = bodyColumnKeys
    .map(key => allColumns.find(c => c.key === key))
    .filter(Boolean) as NonNullable<(typeof allColumns)[number]>[];

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  if (!reportConfig?.invoice_enabled || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-6">
        <p className="text-gray-500">Invoice is not enabled for this report.</p>
        <button onClick={() => router.push(`/${subdomain}/runtime/report/${reportName}`)}
          className="btn-secondary">Go Back</button>
      </div>
    );
  }

  return (
    <>
      {/* ── Print styles injected globally ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-page { box-shadow: none !important; margin: 0 !important; padding: 20mm !important; }
        }
      `}</style>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3 max-w-5xl mx-auto">
          <button
            onClick={() => router.push(`/${subdomain}/runtime/report/${reportName}`)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} /> Back to Report
          </button>

          <div className="flex items-center gap-3">
            {/* Header / Footer toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setShowHeaderFooter(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  showHeaderFooter
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                With Header &amp; Footer
              </button>
              <button
                onClick={() => setShowHeaderFooter(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  !showHeaderFooter
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Without Header &amp; Footer
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center gap-2 text-sm py-1.5"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={handlePrint}
              className="btn-primary flex items-center gap-2 text-sm py-1.5"
            >
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Invoice document ── */}
      <div className="bg-gray-100 min-h-screen pt-20 pb-12 no-print-bg">
        <div
          className="invoice-page bg-white max-w-4xl mx-auto shadow-lg"
          style={{ padding: '40px 48px', minHeight: '297mm' }}
        >
          {/* ── Document Title ── */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-widest text-gray-900 uppercase">
              {invoice.title || 'INVOICE'}
            </h1>
          </div>

          {/* ── Header ── */}
          {showHeaderFooter && (
            <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-200">
              {/* Left — company info */}
              <div className="space-y-0.5">
                {invoice.header_left_lines.map((line, i) => (
                  line.trim() ? (
                    <p key={i} className={`text-gray-700 ${i === 0 ? 'font-bold text-lg' : 'text-sm'}`}>
                      {line}
                    </p>
                  ) : null
                ))}
              </div>

              {/* Right — invoice details */}
              <div className="text-right space-y-1 min-w-[200px]">
                {invoice.header_right_fields.map((field, i) => (
                  field.label || field.value ? (
                    <div key={i} className="flex items-baseline justify-end gap-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {field.label}
                      </span>
                      <span className="text-sm text-gray-900 font-medium min-w-[100px] text-right">
                        {resolveTemplate(field.value, firstRecord)}
                      </span>
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          )}

          {/* ── Body — data table ── */}
          <div className="mb-8">
            {records.length === 0 ? (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                No data available
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-3 py-2 text-left text-xs font-semibold w-10">#</th>
                    {bodyColumns.map(col => (
                      <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                      {bodyColumns.map(col => (
                        <td key={col.key} className="px-3 py-2 text-gray-700">
                          {formatCellValue(getCellValue(record, col.key))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Footer ── */}
          {showHeaderFooter && (
            <div className="pt-6 border-t border-gray-200">
              {invoice.footer_notes?.trim() && (
                <p className="text-xs text-gray-500 mb-6 max-w-lg">{invoice.footer_notes}</p>
              )}
              {invoice.footer_fields.some(f => f.label || f.value) && (
                <div className="flex justify-between items-end mt-4">
                  <div className="space-y-4">
                    {invoice.footer_fields
                      .filter((_, i) => i % 2 === 0)
                      .map((field, i) => (
                        field.label || field.value ? (
                          <div key={i} className="border-t border-gray-300 pt-1 min-w-[160px]">
                            <p className="text-xs text-gray-500">{field.label}</p>
                            <p className="text-sm font-medium text-gray-800">
                              {resolveTemplate(field.value, firstRecord)}
                            </p>
                          </div>
                        ) : null
                      ))}
                  </div>
                  <div className="space-y-4 text-right">
                    {invoice.footer_fields
                      .filter((_, i) => i % 2 !== 0)
                      .map((field, i) => (
                        field.label || field.value ? (
                          <div key={i} className="border-t border-gray-300 pt-1 min-w-[160px]">
                            <p className="text-xs text-gray-500">{field.label}</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {resolveTemplate(field.value, firstRecord)}
                            </p>
                          </div>
                        ) : null
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Page footer line */}
          <div className="mt-12 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-300">
              {reportConfig.display_name} · {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
