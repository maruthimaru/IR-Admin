'use client';

import { Plus, Trash2 } from 'lucide-react';
import { InvoiceConfig, InvoiceHeaderField, ReportColumn } from '@/types';

interface InvoiceBuilderProps {
  enabled: boolean;
  config: InvoiceConfig;
  columns: ReportColumn[];
  onToggle: (enabled: boolean) => void;
  onChange: (config: InvoiceConfig) => void;
}

export function emptyInvoiceConfig(): InvoiceConfig {
  return {
    title: 'INVOICE',
    header_left_lines: ['', '', ''],
    header_right_fields: [
      { label: 'Invoice #', value: '' },
      { label: 'Date', value: '' },
    ],
    body_columns: [],
    footer_notes: '',
    footer_fields: [{ label: 'Authorized by', value: '_______________' }],
  };
}

export default function InvoiceBuilder({ enabled, config, columns, onToggle, onChange }: InvoiceBuilderProps) {
  const set = (patch: Partial<InvoiceConfig>) => onChange({ ...config, ...patch });

  // ── Header Left ──────────────────────────────────────────────
  const updateLeftLine = (i: number, val: string) => {
    const lines = [...config.header_left_lines];
    lines[i] = val;
    set({ header_left_lines: lines });
  };
  const addLeftLine    = () => set({ header_left_lines: [...config.header_left_lines, ''] });
  const removeLeftLine = (i: number) => set({ header_left_lines: config.header_left_lines.filter((_, idx) => idx !== i) });

  // ── Header Right ─────────────────────────────────────────────
  const updateRightField = (i: number, patch: Partial<InvoiceHeaderField>) => {
    const fields = config.header_right_fields.map((f, idx) => idx === i ? { ...f, ...patch } : f);
    set({ header_right_fields: fields });
  };
  const addRightField    = () => set({ header_right_fields: [...config.header_right_fields, { label: '', value: '' }] });
  const removeRightField = (i: number) => set({ header_right_fields: config.header_right_fields.filter((_, idx) => idx !== i) });

  // ── Body columns ─────────────────────────────────────────────
  const toggleBodyColumn = (key: string) => {
    const cols = config.body_columns.includes(key)
      ? config.body_columns.filter(k => k !== key)
      : [...config.body_columns, key];
    set({ body_columns: cols });
  };

  // ── Footer Fields ────────────────────────────────────────────
  const updateFooterField = (i: number, patch: Partial<InvoiceHeaderField>) => {
    const fields = config.footer_fields.map((f, idx) => idx === i ? { ...f, ...patch } : f);
    set({ footer_fields: fields });
  };
  const addFooterField    = () => set({ footer_fields: [...config.footer_fields, { label: '', value: '' }] });
  const removeFooterField = (i: number) => set({ footer_fields: config.footer_fields.filter((_, idx) => idx !== i) });

  return (
    <div className="card space-y-5">
      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onToggle(e.target.checked)}
          className="form-checkbox text-indigo-600 w-4 h-4"
        />
        <div>
          <p className="text-sm font-semibold text-gray-900">Enable Invoice for this Report</p>
          <p className="text-xs text-gray-400 mt-0.5">When enabled, users can generate a printable invoice from the report view.</p>
        </div>
      </label>

      {!enabled && (
        <p className="text-xs text-gray-400 italic text-center py-2 border-t border-gray-100">
          Enable invoice to configure the template.
        </p>
      )}

      {enabled && (
        <div className="space-y-5 pt-2 border-t border-gray-100">

          {/* Title */}
          <div>
            <label className="form-label">Document Title</label>
            <input
              className="form-input w-64"
              value={config.title}
              onChange={e => set({ title: e.target.value })}
              placeholder="e.g. INVOICE, PURCHASE ORDER"
            />
          </div>

          {/* Header */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left — company info */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Header Left (Company Info)</p>
              <div className="space-y-1.5">
                {config.header_left_lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      className="form-input text-sm flex-1"
                      value={line}
                      onChange={e => updateLeftLine(i, e.target.value)}
                      placeholder={`Line ${i + 1}`}
                    />
                    <button type="button" onClick={() => removeLeftLine(i)}
                      className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addLeftLine}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-1">
                  <Plus size={12} /> Add line
                </button>
              </div>
            </div>

            {/* Right — invoice details */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Header Right (Invoice Details)</p>
              <div className="space-y-1.5">
                {config.header_right_fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      className="form-input text-sm w-28"
                      value={f.label}
                      onChange={e => updateRightField(i, { label: e.target.value })}
                      placeholder="Label"
                    />
                    <input
                      className="form-input text-sm flex-1 font-mono"
                      value={f.value}
                      onChange={e => updateRightField(i, { value: e.target.value })}
                      placeholder="{{column_key}}"
                    />
                    <button type="button" onClick={() => removeRightField(i)}
                      className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addRightField}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-1">
                  <Plus size={12} /> Add field
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Use <code className="bg-gray-100 px-1 rounded font-mono">{'{{column_key}}'}</code> to insert a value from the report data.
              </p>
            </div>
          </div>

          {/* Body columns */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Body — Columns to Show in Invoice Table
            </p>
            {columns.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Load and select columns first, then come back to choose which appear in the invoice.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {columns.map(col => {
                  const checked = config.body_columns.includes(col.key);
                  return (
                    <label key={col.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBodyColumn(col.key)}
                        className="form-checkbox text-indigo-600 w-3 h-3"
                      />
                      {col.label || col.key}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="grid grid-cols-2 gap-6">
            {/* Notes */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Footer Notes / Terms</p>
              <textarea
                className="form-input text-sm resize-none h-20"
                value={config.footer_notes}
                onChange={e => set({ footer_notes: e.target.value })}
                placeholder="e.g. Thank you for your business. Payment due within 30 days."
              />
            </div>

            {/* Footer fields */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Footer Fields</p>
              <div className="space-y-1.5">
                {config.footer_fields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      className="form-input text-sm w-28"
                      value={f.label}
                      onChange={e => updateFooterField(i, { label: e.target.value })}
                      placeholder="Label"
                    />
                    <input
                      className="form-input text-sm flex-1 font-mono"
                      value={f.value}
                      onChange={e => updateFooterField(i, { value: e.target.value })}
                      placeholder="Value or {{column_key}}"
                    />
                    <button type="button" onClick={() => removeFooterField(i)}
                      className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addFooterField}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-1">
                  <Plus size={12} /> Add field
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
