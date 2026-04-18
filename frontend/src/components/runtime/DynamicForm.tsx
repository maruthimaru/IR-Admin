'use client';

/**
 * Dynamic Form Renderer - Runtime UI
 * Renders any form based on its JSON configuration from the database.
 * Handles validation, submission, and error display.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { InputFormConfig, FormField } from '@/types';
import { formsAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import { Send, AlertCircle, Image as ImageIcon, X, Fingerprint, Plus, Trash2 } from 'lucide-react';
import { getCompanyTimezone, nowInTimezone } from '@/lib/datetime';

interface DynamicFormProps {
  config: InputFormConfig;
  onSuccess?: (record: object) => void;
  initialData?: Record<string, unknown>;
  mode?: 'create' | 'edit';
  recordId?: string;
}

function computeInitialValues(
  fields: FormField[],
  initialData: Record<string, unknown>,
  mode: string,
): Record<string, unknown> {
  const values = { ...initialData };
  if (mode === 'create') {
    const companyTz = getCompanyTimezone();
    for (const field of fields) {
      if (field.default_now && !(field.key in values)) {
        if (field.type === 'date' || field.type === 'datetime' || field.type === 'time') {
          const tz = field.field_timezone || companyTz;
          values[field.key] = nowInTimezone(field.type, tz);
        }
      }
    }
  }
  return values;
}

export default function DynamicForm({
  config,
  onSuccess,
  initialData = {},
  mode = 'create',
  recordId,
}: DynamicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => computeInitialValues(config.fields, initialData, mode)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateValue = (key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }));
    // Clear error on change
    if (errors[key]) {
      setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  };

  const validateClient = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of config.fields) {
      if (field.hidden) continue;
      const value = values[field.key];

      if (field.required && (value === undefined || value === null || value === '')) {
        newErrors[field.key] = `${field.label} is required`;
        continue;
      }

      const validation = field.validation;
      if (!validation || value === undefined || value === null || value === '') continue;

      if (field.type === 'email') {
        if (!/^[^@]+@[^@]+\.[^@]+$/.test(String(value))) {
          newErrors[field.key] = 'Invalid email address';
        }
      }

      if (field.type === 'number' || field.type === 'currency') {
        const num = parseFloat(String(value));
        if (isNaN(num)) {
          newErrors[field.key] = 'Must be a valid number';
        } else {
          if (validation.min !== null && validation.min !== undefined && num < validation.min)
            newErrors[field.key] = `Minimum value is ${validation.min}`;
          if (validation.max !== null && validation.max !== undefined && num > validation.max)
            newErrors[field.key] = `Maximum value is ${validation.max}`;
        }
      }

      if (typeof value === 'string') {
        if (validation.min_length && value.length < validation.min_length)
          newErrors[field.key] = `Minimum ${validation.min_length} characters`;
        if (validation.max_length && value.length > validation.max_length)
          newErrors[field.key] = `Maximum ${validation.max_length} characters`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateClient()) return;

    setIsSubmitting(true);
    try {
      let response;
      if (mode === 'edit' && recordId) {
        response = await formsAPI.updateRecord(config.form_name, recordId, values);
        toast.success('Record updated successfully!');
      } else {
        response = await formsAPI.createRecord(config.form_name, values);
        toast.success('Record saved successfully!');
        // Reset form
        setValues({});
      }
      onSuccess?.(response.data.record);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { errors?: Record<string, string>; error?: string } } };
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
        toast.error('Please fix the validation errors');
      } else {
        toast.error(axiosError.response?.data?.error || 'Failed to save record');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group fields by width for grid layout
  const getLayoutClass = (width: string) => {
    if (config.layout === 'grid') {
      return width === 'full' ? 'col-span-2' : width === 'half' ? 'col-span-1' : 'col-span-1';
    }
    return 'w-full';
  };

  const gridClass = config.layout === 'grid' ? 'grid grid-cols-2 gap-4' : 'space-y-4';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">{config.display_name}</h2>
        {mode === 'edit' && (
          <span className="badge-warning">Editing Record</span>
        )}
      </div>

      <div className={gridClass}>
        {config.fields
          .filter(field => !field.hidden)
          .sort((a, b) => a.order - b.order)
          .map(field => (
            <div key={field.key} className={getLayoutClass(field.width)}>
              <FieldRenderer
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                onChange={(value) => updateValue(field.key, value)}
                allValues={values}
                onExtraUpdate={(key, val) => updateValue(key, val)}
                mode={mode}
                formFields={config.fields}
              />
            </div>
          ))}
      </div>

      {/* Global errors */}
      {Object.keys(errors).length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">Please fix the errors above before submitting.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex items-center gap-2"
        >
          <Send size={16} />
          {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Update Record' : 'Save Record'}
        </button>
      </div>
    </form>
  );
}

// ── Image Field ──────────────────────────────────────────────

interface ImageFieldProps {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

function ImageField({ value, error, onChange }: ImageFieldProps) {
  const [tab, setTab] = useState<'url' | 'local'>('url');
  // Local preview state — updated immediately; no need to wait for parent re-render
  const [preview, setPreview] = useState<string>(value ? String(value) : '');
  const fileRef = useRef<HTMLInputElement>(null);
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;

  // Keep preview in sync when value changes externally (e.g. edit mode pre-fill)
  useEffect(() => {
    setPreview(value ? String(value) : '');
  }, [value]);

  const handleUrlChange = (url: string) => {
    setPreview(url);
    onChange(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setPreview('');
    onChange('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const showPreview = preview.startsWith('http') || preview.startsWith('data:image');
  // URL input shows blank when a data-URL is stored (uploaded file)
  const urlInputValue = preview.startsWith('data:') ? '' : preview;

  return (
    <div className="space-y-2">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('url')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          From URL
        </button>
        <button
          type="button"
          onClick={() => setTab('local')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === 'local' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload
        </button>
      </div>

      {tab === 'url' ? (
        <input
          type="text"
          className={inputClass}
          placeholder="https://example.com/photo.jpg"
          value={urlInputValue}
          onChange={e => handleUrlChange(e.target.value)}
        />
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-lg p-5 flex flex-col items-center gap-1.5 text-sm transition-colors
              ${error ? 'border-red-400 text-red-500' : 'border-gray-300 text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'}`}
          >
            <ImageIcon size={20} className="text-gray-400" />
            <span>Click to choose image</span>
            <span className="text-xs text-gray-400">PNG, JPG, GIF, WebP</span>
          </button>
        </>
      )}

      {/* Preview */}
      {showPreview && (
        <div className="relative mt-2 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview"
            className="max-h-36 rounded-lg border border-gray-200 object-contain bg-gray-50"
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 shadow-sm text-gray-400 hover:text-red-500 transition-colors"
            title="Remove image"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Individual Field Renderer ────────────────────────────────

interface FieldRendererProps {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  allValues?: Record<string, unknown>;
  /** Called to update an extra field (e.g. table_value_key label) alongside the main value */
  onExtraUpdate?: (key: string, value: unknown) => void;
  mode?: 'create' | 'edit';
  formFields?: FormField[];
}

// ── Helpers ──────────────────────────────────────────────────

/** Build a fetch RequestInit from a field's API config (method, auth, body). */
function buildFetchOptions(field: FormField): RequestInit {
  const headers: Record<string, string> = {};

  if (field.api_auth_type === 'bearer' && field.api_auth_token) {
    headers['Authorization'] = `Bearer ${field.api_auth_token}`;
  } else if (field.api_auth_type === 'basic') {
    const creds = btoa(`${field.api_auth_username ?? ''}:${field.api_auth_password ?? ''}`);
    headers['Authorization'] = `Basic ${creds}`;
  }

  const method = field.api_method ?? 'GET';
  const options: RequestInit = { method, headers };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    if (field.api_body) options.body = field.api_body;
  }

  return options;
}

/** Walk a dot-notation path like "data" or "result.items" and return the array */
function extractArray(data: unknown, path: string): Record<string, unknown>[] {
  let cur: unknown = data;
  if (path) {
    for (const key of path.split('.')) {
      if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else return [];
    }
  }
  return Array.isArray(cur) ? (cur as Record<string, unknown>[]) : [];
}

interface SelectOption { label: string; value: string }

// ── Formula Evaluator ────────────────────────────────────────

/** Evaluate a simple arithmetic formula by substituting field keys with their values.
 *  Supports +  -  *  /  (  )  and decimal numbers. Returns null on error. */
function evalFormula(formula: string, values: Record<string, unknown>): number | null {
  if (!formula.trim()) return null;
  let expr = formula;
  // Substitute longest keys first to avoid partial matches
  const keys = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const num = parseFloat(String(values[key] ?? ''));
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), isNaN(num) ? '0' : String(num));
  }
  // Safety: only allow digits, operators, parens, dots, spaces
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + expr + ')')() as unknown;
    return typeof result === 'number' && isFinite(result) ? Math.round(result * 1e9) / 1e9 : null;
  } catch {
    return null;
  }
}

// ── Searchable Select (Combobox) ─────────────────────────────

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string;
  loading?: boolean;
}

function SearchableSelect({ options, value, onChange, placeholder, disabled, error, loading }: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;
  const selected = options.find(o => o.value === value);
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="relative">
      <input
        type="text"
        className={inputClass}
        placeholder={loading ? 'Loading…' : (disabled ? placeholder : placeholder)}
        value={open ? search : (selected?.label ?? '')}
        disabled={disabled || loading}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && !disabled && !loading && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No results</div>
          ) : (
            filtered.map(opt => (
              <div
                key={opt.value}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 ${
                  opt.value === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                }`}
                onMouseDown={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Internal records API headers (for form-source dropdowns) ────────────────

function buildInternalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window === 'undefined') return headers;
  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const raw = localStorage.getItem('tenant-storage');
    if (raw) {
      const state = JSON.parse(raw);
      const subdomain = state?.state?.company?.subdomain;
      if (subdomain) headers['X-Tenant'] = subdomain;
    }
  } catch { /* ignore */ }
  return headers;
}

const INTERNAL_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** True when value looks like a 24-char hex MongoDB ObjectId */
const isObjectId = (v: string) => /^[a-f0-9]{24}$/i.test(v);

/**
 * Fetch a single record from an internal form collection.
 * - If storedValue is an ObjectId, uses the direct GET /{id}/ endpoint.
 * - Otherwise falls back to a filter search using valueKey so that
 *   api_selects configured with value_key != "_id" still work.
 */
async function fetchSourceRecord(
  sourceForm: string,
  storedValue: string,
  valueKey: string,
): Promise<Record<string, unknown> | null> {
  const headers = buildInternalHeaders();
  if (isObjectId(storedValue)) {
    const r = await fetch(`${INTERNAL_API}/api/v1/forms/records/${sourceForm}/${storedValue}/`, { headers });
    if (!r.ok) return null;
    return r.json() as Promise<Record<string, unknown>>;
  }
  // Non-ObjectId value — search by the field that the api_select stores
  const vk = valueKey || 'name';
  const r = await fetch(
    `${INTERNAL_API}/api/v1/forms/records/${sourceForm}/?filter_${vk}=${encodeURIComponent(storedValue)}&page_size=1`,
    { headers },
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { results?: Record<string, unknown>[] };
  return data.results?.[0] ?? null;
}

// ── API Select Field ──────────────────────────────────────────

function ApiSelectField({ field, value, error, onChange, onExtraUpdate }: FieldRendererProps) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const isFormSource = (field.api_source ?? 'url') === 'form';
  const [loading, setLoading] = useState(isFormSource ? Boolean(field.source_form) : Boolean(field.api_url));
  const [fetchError, setFetchError] = useState('');
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;

  useEffect(() => {
    if (isFormSource) {
      if (!field.source_form) return;
      setLoading(true);
      setFetchError('');
      const url = `${INTERNAL_API}/api/v1/forms/records/${field.source_form}/?page_size=500`;
      fetch(url, { headers: buildInternalHeaders() })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          const items: Record<string, unknown>[] = data.results ?? [];
          const dk = field.display_key || 'name';
          const vk = field.value_key || '_id';
          setOptions(items.map(item => ({
            label: String(item[dk] ?? ''),
            value: String(item[vk] ?? ''),
          })));
        })
        .catch(e => setFetchError(String(e.message)))
        .finally(() => setLoading(false));
    } else {
      if (!field.api_url) return;
      setLoading(true);
      setFetchError('');
      fetch(field.api_url, buildFetchOptions(field))
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          const items = extractArray(data, field.response_path ?? 'data');
          const dk = field.display_key || 'name';
          const vk = field.value_key || 'id';
          setOptions(items.map(item => ({
            label: String(item[dk] ?? ''),
            value: String(item[vk] ?? ''),
          })));
        })
        .catch(e => setFetchError(String(e.message)))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormSource, field.source_form, field.api_url, field.api_method, field.api_auth_type, field.api_auth_token,
      field.api_auth_username, field.api_auth_password, field.api_body,
      field.response_path, field.display_key, field.value_key]);

  const handleSelect = (val: string) => {
    onChange(val);
    if (field.table_value_key && val) {
      const label = options.find(o => o.value === val)?.label ?? '';
      // Store under "{field.key}_{table_value_key}" to avoid collisions when
      // multiple fields share the same table_value_key name (e.g. "name").
      onExtraUpdate?.(`${field.key}_${field.table_value_key}`, label);
    }
  };

  return (
    <div className="space-y-1">
      {field.searchable_dropdown ? (
        <SearchableSelect
          options={options}
          value={String(value ?? '')}
          onChange={handleSelect}
          placeholder={loading ? 'Loading…' : `Select ${field.label}…`}
          loading={loading}
          error={error}
        />
      ) : (
        <select
          className={inputClass}
          value={String(value ?? '')}
          onChange={e => handleSelect(e.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? 'Loading…' : `Select ${field.label}…`}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
    </div>
  );
}

// ── Dependent Select Field ────────────────────────────────────

function DependentSelectField({ field, value, error, onChange, allValues, onExtraUpdate }: FieldRendererProps) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [fetchError, setFetchError] = useState('');
  const prevParentValue = useRef<string>('');
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;

  const parentValue = field.depends_on ? String(allValues?.[field.depends_on] ?? '') : '';
  const isFormSource = (field.api_source ?? 'url') === 'form';
  const [loading, setLoading] = useState(
    Boolean(parentValue && (isFormSource ? field.source_form : field.api_url))
  );

  useEffect(() => {
    const sourceReady = isFormSource ? Boolean(field.source_form) : Boolean(field.api_url);
    if (!parentValue || !sourceReady) {
      setOptions([]);
      return;
    }

    // Only clear child value when parent *changes* from one non-empty value to another.
    if (prevParentValue.current && prevParentValue.current !== parentValue) {
      onChange('');
    }
    prevParentValue.current = parentValue;

    setLoading(true);
    setFetchError('');

    if (isFormSource) {
      // Internal records API with filter param
      const filterKey = field.filter_key || 'id';
      // Backend _list_records reads filter_<fieldKey> query params
      const url = `${INTERNAL_API}/api/v1/forms/records/${field.source_form}/?page_size=500&filter_${filterKey}=${encodeURIComponent(parentValue)}`;
      fetch(url, { headers: buildInternalHeaders() })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          const items: Record<string, unknown>[] = data.results ?? [];
          const dk = field.display_key || 'name';
          const vk = field.value_key || '_id';
          setOptions(items.map(item => ({
            label: String(item[dk] ?? ''),
            value: String(item[vk] ?? ''),
          })));
        })
        .catch(e => setFetchError(String(e.message)))
        .finally(() => setLoading(false));
    } else {
      const filterKey = field.filter_key || 'id';
      const isPost = (field.api_method ?? 'GET') === 'POST';
      const url = isPost
        ? field.api_url!
        : `${field.api_url}?${filterKey}=${encodeURIComponent(parentValue)}`;

      const fetchOpts = buildFetchOptions(field);
      if (isPost) {
        if (field.api_body) {
          const resolved = field.api_body.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
            if (token === 'parent_value' || token === field.depends_on) return parentValue;
            return '';
          });
          fetchOpts.body = resolved;
        } else {
          fetchOpts.body = JSON.stringify({ [filterKey]: parentValue });
        }
      }

      fetch(url, fetchOpts)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          const items = extractArray(data, field.response_path ?? 'data');
          const dk = field.display_key || 'name';
          const vk = field.value_key || 'id';
          setOptions(items.map(item => ({
            label: String(item[dk] ?? ''),
            value: String(item[vk] ?? ''),
          })));
        })
        .catch(e => setFetchError(String(e.message)))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentValue, isFormSource, field.source_form, field.api_url, field.filter_key, field.response_path, field.display_key, field.value_key]);

  const noParent = !parentValue;
  const parentLabel = field.depends_on?.replace(/_/g, ' ') ?? 'parent';

  const placeholder = noParent
    ? `Select ${parentLabel} first…`
    : loading ? 'Loading…' : `Select ${field.label}…`;

  const handleDepSelect = (val: string) => {
    onChange(val);
    if (field.table_value_key && val) {
      const label = options.find(o => o.value === val)?.label ?? '';
      // Store under "{field.key}_{table_value_key}" to avoid collisions when
      // multiple fields share the same table_value_key name (e.g. "name").
      onExtraUpdate?.(`${field.key}_${field.table_value_key}`, label);
    }
  };

  return (
    <div className="space-y-1">
      {field.searchable_dropdown ? (
        <SearchableSelect
          options={options}
          value={String(value ?? '')}
          onChange={handleDepSelect}
          placeholder={placeholder}
          disabled={noParent}
          loading={loading}
          error={error}
        />
      ) : (
        <select
          className={inputClass}
          value={String(value ?? '')}
          onChange={e => handleDepSelect(e.target.value)}
          disabled={loading || noParent}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
    </div>
  );
}

// ── Formula Result Field ─────────────────────────────────────

function FormulaResultField({ field, allValues, error, onChange }: FieldRendererProps) {
  const computed = useMemo(
    () => evalFormula(field.formula ?? '', allValues ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field.formula, JSON.stringify(allValues)]
  );

  // Push computed value into form state whenever it changes
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    if (computed !== null && computed !== prevRef.current) {
      prevRef.current = computed;
      onChange(computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  const inputClass = `form-input bg-gray-50 cursor-not-allowed ${error ? 'border-red-400' : ''}`;
  const display = computed !== null ? String(computed) : '';

  return (
    <div className="space-y-1">
      <div className="relative">
        {field.type === 'currency' && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
        )}
        {field.type === 'percentage' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
        )}
        <input
          type="text"
          readOnly
          className={`${inputClass} ${field.type === 'currency' ? 'pl-7' : ''} ${field.type === 'percentage' ? 'pr-7' : ''}`}
          value={display}
          placeholder="Computed…"
        />
      </div>
      <p className="text-xs text-gray-400">= {field.formula}</p>
    </div>
  );
}

// ── API Number/Currency Field ────────────────────────────────

function ApiNumberField({ field, error, onChange }: FieldRendererProps) {
  const [apiValue, setApiValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!field.api_url) return;
    setLoading(true);
    setFetchError('');
    fetch(field.api_url, buildFetchOptions(field))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        // Navigate response_path
        let val: unknown = data;
        if (field.response_path) {
          for (const key of field.response_path.split('.')) {
            if (val && typeof val === 'object' && key in (val as Record<string, unknown>)) {
              val = (val as Record<string, unknown>)[key];
            } else { val = null; break; }
          }
        }
        // Extract value_key if result is still an object
        if (val && typeof val === 'object' && field.value_key) {
          val = (val as Record<string, unknown>)[field.value_key];
        }
        const num = parseFloat(String(val ?? ''));
        const result = isNaN(num) ? null : num;
        setApiValue(result);
        if (result !== null) onChange(result);
      })
      .catch(e => setFetchError(String(e.message)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.api_url, field.api_method, field.response_path, field.value_key,
      field.api_auth_type, field.api_auth_token, field.api_auth_username, field.api_auth_password]);

  const inputClass = `form-input bg-gray-50 cursor-not-allowed ${error ? 'border-red-400' : ''}`;

  return (
    <div className="space-y-1">
      <div className="relative">
        {field.type === 'currency' && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
        )}
        <input
          type="text"
          readOnly
          className={`${inputClass} ${field.type === 'currency' ? 'pl-7' : ''}`}
          value={loading ? '' : (apiValue !== null ? String(apiValue) : '')}
          placeholder={loading ? 'Fetching…' : 'API value'}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Loading…</span>
        )}
      </div>
      {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
    </div>
  );
}

// ── Combined Text Field ──────────────────────────────────────

function CombinedTextField({ field, value, error, onChange, allValues }: FieldRendererProps) {
  const [customNumber, setCustomNumber] = useState<string>('');
  const template = field.combined_template ?? '';
  const hasAutoGenerate = template.includes('{{auto_generate}}');

  // Compute the value to submit: substitute {{field_key}} with real values,
  // keep {{auto_generate}} if no custom number (backend will fill it), or replace with custom.
  const submittedValue = useMemo(() => {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (key === 'auto_generate') return customNumber || '{{auto_generate}}';
      return String(allValues?.[key] ?? '');
    });
  }, [template, allValues, customNumber]);

  // Preview shown to the user: replaces {{auto_generate}} with #### when no custom number
  const preview = useMemo(() => {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (key === 'auto_generate') return customNumber || '####';
      return String(allValues?.[key] ?? '');
    });
  }, [template, allValues, customNumber]);

  // Keep form state in sync with computed submitted value
  const prevRef = useRef<string>('');
  useEffect(() => {
    if (submittedValue !== prevRef.current) {
      prevRef.current = submittedValue;
      onChange(submittedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedValue]);

  const inputClass = `form-input ${error ? 'border-red-400' : ''}`;

  return (
    <div className="space-y-2">
      {/* Read-only preview of computed value */}
      <div className={`form-input bg-gray-50 flex items-center gap-2 ${error ? 'border-red-400' : ''}`}>
        <span className="font-mono text-sm text-gray-700 flex-1 min-w-0 truncate">
          {preview || <span className="text-gray-400 italic text-xs">Configure template in form builder</span>}
        </span>
        {hasAutoGenerate && !customNumber && (
          <span className="shrink-0 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">AUTO #</span>
        )}
      </div>
      {/* Optional custom number for the {{auto_generate}} slot */}
      {hasAutoGenerate && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            className={`${inputClass} w-36 text-sm`}
            placeholder="Custom # (optional)"
            value={customNumber}
            min={1}
            onChange={e => setCustomNumber(e.target.value)}
          />
          <p className="text-xs text-gray-400">Leave blank to auto-generate number on save</p>
        </div>
      )}
    </div>
  );
}

// ── Sub Form Field ───────────────────────────────────────────

function SubFormApiSelectCell({ field, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const isFormSource = (field.api_source ?? 'url') === 'form';
  // Start in loading state so the select is never blank on initial render (important for edit mode)
  const [loading, setLoading] = useState(isFormSource ? Boolean(field.source_form) : Boolean(field.api_url));
  const cls = 'form-input py-1 text-sm min-w-0';

  useEffect(() => {
    if (isFormSource) {
      if (!field.source_form) return;
      setLoading(true);
      fetch(`${INTERNAL_API}/api/v1/forms/records/${field.source_form}/?page_size=500`, { headers: buildInternalHeaders() })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          const items: Record<string, unknown>[] = data.results ?? [];
          setOptions(items.map(item => ({
            label: String(item[field.display_key || 'name'] ?? ''),
            value: String(item[field.value_key || '_id'] ?? ''),
          })));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      if (!field.api_url) return;
      setLoading(true);
      fetch(field.api_url, buildFetchOptions(field))
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          const items = extractArray(data, field.response_path ?? 'data');
          setOptions(items.map(item => ({
            label: String(item[field.display_key || 'name'] ?? ''),
            value: String(item[field.value_key || 'id'] ?? ''),
          })));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormSource, field.source_form, field.api_url]);

  return (
    <select className={cls} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={loading}>
      <option value="">{loading ? 'Loading…' : 'Select…'}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SubFormDependentSelectCell({ field, value, onChange, rowValues }: {
  field: FormField; value: unknown; onChange: (v: unknown) => void; rowValues: Record<string, unknown>;
}) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const parentValue = field.depends_on ? String(rowValues[field.depends_on] ?? '') : '';
  const isFormSource = (field.api_source ?? 'url') === 'form';
  // Start loading if parent value is already set (edit mode) to avoid blank flash
  const [loading, setLoading] = useState(
    Boolean(parentValue && (isFormSource ? field.source_form : field.api_url))
  );
  const cls = 'form-input py-1 text-sm min-w-0';

  useEffect(() => {
    if (!parentValue) { setOptions([]); return; }
    const ready = isFormSource ? Boolean(field.source_form) : Boolean(field.api_url);
    if (!ready) return;
    setLoading(true);
    if (isFormSource) {
      const filterKey = field.filter_key || 'id';
      const url = `${INTERNAL_API}/api/v1/forms/records/${field.source_form}/?page_size=500&filter_${filterKey}=${encodeURIComponent(parentValue)}`;
      fetch(url, { headers: buildInternalHeaders() })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          const items: Record<string, unknown>[] = data.results ?? [];
          setOptions(items.map(item => ({
            label: String(item[field.display_key || 'name'] ?? ''),
            value: String(item[field.value_key || '_id'] ?? ''),
          })));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      const filterKey = field.filter_key || 'id';
      const url = `${field.api_url}?${filterKey}=${encodeURIComponent(parentValue)}`;
      fetch(url, buildFetchOptions(field))
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          const items = extractArray(data, field.response_path ?? 'data');
          setOptions(items.map(item => ({
            label: String(item[field.display_key || 'name'] ?? ''),
            value: String(item[field.value_key || 'id'] ?? ''),
          })));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentValue, isFormSource, field.source_form, field.api_url]);

  return (
    <select className={cls} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={loading || !parentValue}>
      <option value="">{!parentValue ? `Select ${field.depends_on?.replace(/_/g, ' ')} first…` : loading ? 'Loading…' : 'Select…'}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SubFormFieldLookupCell({ field, value, onChange, rowValues, siblingFields }: {
  field: FormField; value: unknown; onChange: (v: unknown) => void;
  rowValues: Record<string, unknown>; siblingFields: FormField[];
}) {
  const [isFetching, setIsFetching] = useState(false);
  const watchedKey = field.lookup_field_key ?? '';
  const sourceFieldKey = field.lookup_source_field ?? '';
  const watchedValue = String(rowValues[watchedKey] ?? '');
  const watchedFieldConfig = siblingFields.find(f => f.key === watchedKey);
  const sourceFormName = watchedFieldConfig?.source_form ?? '';
  const watchedVk = watchedFieldConfig?.value_key || '_id';

  const prevWatched = useRef(watchedValue);

  useEffect(() => {
    if (watchedValue === prevWatched.current) return;
    prevWatched.current = watchedValue;
    if (!watchedValue) { onChange(''); return; }
    if (!sourceFormName || !sourceFieldKey) return;
    setIsFetching(true);
    fetchSourceRecord(sourceFormName, watchedValue, watchedVk)
      .then(record => { if (record?.[sourceFieldKey] !== undefined) onChange(record[sourceFieldKey]); })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValue]);

  const isNumeric = field.type === 'number' || field.type === 'currency';
  const cls = `form-input py-1 text-sm min-w-0 bg-gray-50 ${isFetching ? 'animate-pulse' : ''}`;
  return (
    <div className="relative">
      {field.type === 'currency' && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
      )}
      <input type={isNumeric ? 'number' : 'text'} readOnly
        className={`${cls} ${field.type === 'currency' ? 'pl-5' : ''}`}
        value={String(value ?? '')}
        placeholder={isFetching ? 'Loading…' : 'Auto…'} />
    </div>
  );
}

function SubFormCellRenderer({ field, value, onChange, rowValues, siblingFields }: {
  field: FormField; value: unknown; onChange: (v: unknown) => void;
  rowValues: Record<string, unknown>; siblingFields: FormField[];
}) {
  const cls = 'form-input py-1 text-sm min-w-0';

  if (field.value_source === 'field_lookup') {
    return (
      <SubFormFieldLookupCell
        field={field} value={value} onChange={onChange}
        rowValues={rowValues} siblingFields={siblingFields} />
    );
  }

  switch (field.type) {
    case 'number': case 'currency':
      return <input type="number" className={cls} value={value !== undefined ? String(value) : ''}
        onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')} />;
    case 'select':
      return (
        <select className={cls} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      );
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} className="w-4 h-4 mt-1"
        onChange={e => onChange(e.target.checked)} />;
    case 'date':
      return <input type="date" className={cls} value={String(value ?? '')} onChange={e => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className={cls} rows={2} value={String(value ?? '')} onChange={e => onChange(e.target.value)} />;
    case 'api_select':
      return <SubFormApiSelectCell field={field} value={value} onChange={onChange} />;
    case 'dependent_select':
      return <SubFormDependentSelectCell field={field} value={value} onChange={onChange} rowValues={rowValues} />;
    default:
      return <input type="text" className={cls} value={String(value ?? '')} onChange={e => onChange(e.target.value)} />;
  }
}

function SubFormField({ field, value, error, onChange, onExtraUpdate }: FieldRendererProps) {
  const rows: Record<string, unknown>[] = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const subFields = field.sub_form_fields ?? [];

  const pushSums = (currentRows: Record<string, unknown>[]) => {
    for (const sf of subFields) {
      if (sf.sum_to_main && (sf.type === 'number' || sf.type === 'currency')) {
        const sum = currentRows.reduce((acc, row) => acc + (parseFloat(String(row[sf.key] ?? '0')) || 0), 0);
        onExtraUpdate?.(`${field.key}_${sf.key}_sum`, Math.round(sum * 1e9) / 1e9);
      }
    }
  };

  // Push sums on mount so edit mode initialises the main-form sum field from existing rows
  useEffect(() => {
    if (rows.length > 0) pushSums(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addRow = () => { const r = [...rows, {}]; onChange(r); pushSums(r); };
  const delRow = (i: number) => { const r = rows.filter((_, idx) => idx !== i); onChange(r); pushSums(r); };
  const updCell = (ri: number, key: string, val: unknown) => {
    const r = rows.map((row, idx) => idx === ri ? { ...row, [key]: val } : row);
    onChange(r);
    pushSums(r);
  };

  return (
    <div className="space-y-2">
      {subFields.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          Configure sub-form columns in the Form Builder.
        </p>
      )}
      {rows.length > 0 && subFields.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {subFields.map(f => (
                  <th key={f.key} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">
                    {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="w-8 px-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 last:border-0">
                  {subFields.map(sf => (
                    <td key={sf.key} className="px-3 py-1.5">
                      <SubFormCellRenderer field={sf} value={row[sf.key]}
                        onChange={val => updCell(ri, sf.key, val)}
                        rowValues={row} siblingFields={subFields} />
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <button type="button" onClick={() => delRow(ri)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals footer for sum_to_main columns */}
            {rows.length > 0 && subFields.some(sf => sf.sum_to_main) && (
              <tfoot className="bg-violet-50 border-t-2 border-violet-200">
                <tr>
                  {subFields.map(sf => {
                    if (!sf.sum_to_main || (sf.type !== 'number' && sf.type !== 'currency')) {
                      return <td key={sf.key} className="px-3 py-1.5" />;
                    }
                    const sum = rows.reduce((acc, row) => acc + (parseFloat(String(row[sf.key] ?? '0')) || 0), 0);
                    const display = Math.round(sum * 1e9) / 1e9;
                    return (
                      <td key={sf.key} className="px-3 py-1.5 text-xs font-bold text-violet-700 whitespace-nowrap">
                        {sf.type === 'currency' ? '$' : 'Σ '}{display}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1.5 text-xs text-violet-500 font-medium">Total</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {rows.length === 0 && subFields.length > 0 && (
        <p className="text-xs text-gray-400 italic">No rows yet. Click + Add Row.</p>
      )}
      <button type="button" onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1">
        <Plus size={13} /> Add Row
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// ── Field Lookup Text Field ──────────────────────────────────

function FieldLookupTextField({ field, value, error, onChange, allValues, mode, formFields }: FieldRendererProps) {
  const [isFetching, setIsFetching] = useState(false);

  const watchedKey = field.lookup_field_key ?? '';
  const sourceFieldKey = field.lookup_source_field ?? '';
  const watchedValue = String(allValues?.[watchedKey] ?? '');
  const watchedFieldConfig = formFields?.find(f => f.key === watchedKey);
  const sourceFormName = watchedFieldConfig?.source_form ?? '';
  const watchedVk = watchedFieldConfig?.value_key || '_id';

  // Initialize to current watchedValue so that in edit mode we don't overwrite
  // the existing saved value on mount — only fetch when the dropdown *changes*.
  const prevWatched = useRef(watchedValue);

  useEffect(() => {
    if (watchedValue === prevWatched.current) return;
    prevWatched.current = watchedValue;
    if (!watchedValue) {
      onChange('');
      return;
    }
    if (!sourceFormName || !sourceFieldKey) return;
    setIsFetching(true);
    fetchSourceRecord(sourceFormName, watchedValue, watchedVk)
      .then(record => { if (record?.[sourceFieldKey] !== undefined) onChange(record[sourceFieldKey]); })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValue]);

  const isNumeric = field.type === 'number' || field.type === 'currency';
  const isTextarea = field.type === 'textarea';
  const baseInputCls = `form-input ${error ? 'border-red-400' : ''}`;

  if (mode === 'edit') {
    if (isNumeric) {
      return (
        <div className="relative">
          {field.type === 'currency' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
          )}
          <input type="number"
            className={`${baseInputCls} ${field.type === 'currency' ? 'pl-7' : ''}`}
            placeholder={field.placeholder}
            value={value !== undefined ? String(value) : ''}
            onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')} />
        </div>
      );
    }
    if (isTextarea) {
      return (
        <textarea className={baseInputCls} placeholder={field.placeholder} rows={4}
          value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
      );
    }
    return (
      <input type="text" className={baseInputCls}
        placeholder={field.placeholder} value={String(value ?? '')}
        onChange={e => onChange(e.target.value)} />
    );
  }

  const readonlyCls = `form-input bg-gray-50 ${isFetching ? 'animate-pulse' : ''} ${error ? 'border-red-400' : ''}`;
  const placeholder = isFetching ? 'Loading…' : (field.placeholder || 'Auto-populated from dropdown');

  return (
    <div className="space-y-1">
      <div className="relative">
        {field.type === 'currency' && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
        )}
        {isTextarea ? (
          <textarea readOnly rows={4}
            className={readonlyCls}
            placeholder={placeholder}
            value={String(value ?? '')} />
        ) : (
          <input type={isNumeric ? 'number' : 'text'} readOnly
            className={`${readonlyCls} ${field.type === 'currency' ? 'pl-7' : ''}`}
            placeholder={placeholder}
            value={String(value ?? '')} />
        )}
        {isFetching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">Loading…</span>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Auto-filled from <span className="font-mono">{watchedKey || '—'}</span>
      </p>
    </div>
  );
}

function FieldRenderer({ field, value, error, onChange, allValues, onExtraUpdate, mode, formFields }: FieldRendererProps) {
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;

  const renderField = () => {
    switch (field.type) {
      case 'text':
        // Combined mode: auto-build from other fields + optional auto-generate number
        if (field.value_source === 'combined' && mode !== 'edit') {
          return (
            <CombinedTextField
              field={field} value={value} error={error}
              onChange={onChange} allValues={allValues}
            />
          );
        }
        // Field lookup mode: auto-populate from form-source dropdown
        if (field.value_source === 'field_lookup') {
          return (
            <FieldLookupTextField
              field={field} value={value} error={error}
              onChange={onChange} allValues={allValues} mode={mode} formFields={formFields}
            />
          );
        }
        return (
          <input
            type="text"
            className={inputClass}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'email':
      case 'url':
      case 'phone':
        return (
          <input
            type={field.type === 'phone' ? 'tel' : field.type}
            className={inputClass}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'number':
      case 'currency':
      case 'percentage':
        if (field.value_source === 'formula') {
          return (
            <FormulaResultField
              field={field} value={value} error={error} onChange={onChange} allValues={allValues}
            />
          );
        }
        if (field.value_source === 'api') {
          return (
            <ApiNumberField
              field={field} value={value} error={error} onChange={onChange} allValues={allValues}
            />
          );
        }
        if (field.value_source === 'field_lookup') {
          return (
            <FieldLookupTextField
              field={field} value={value} error={error}
              onChange={onChange} allValues={allValues} mode={mode} formFields={formFields}
            />
          );
        }
        return (
          <div className="relative">
            {field.type === 'currency' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            )}
            {field.type === 'percentage' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
            )}
            <input
              type="number"
              className={`${inputClass} ${field.type === 'currency' ? 'pl-7' : ''} ${field.type === 'percentage' ? 'pr-7' : ''}`}
              placeholder={field.placeholder}
              value={value !== undefined ? String(value) : ''}
              onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
              min={field.validation?.min ?? undefined}
              max={field.validation?.max ?? undefined}
            />
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            className={inputClass}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'datetime':
        return (
          <input
            type="datetime-local"
            className={inputClass}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'time':
        return (
          <input
            type="time"
            className={inputClass}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'textarea':
        if (field.value_source === 'field_lookup') {
          return (
            <FieldLookupTextField
              field={field} value={value} error={error}
              onChange={onChange} allValues={allValues} mode={mode} formFields={formFields}
            />
          );
        }
        return (
          <textarea
            className={inputClass}
            placeholder={field.placeholder}
            rows={4}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );

      case 'select':
        return (
          <select
            className={inputClass}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          >
            <option value="">Select {field.label}...</option>
            {field.options?.map(opt => (
              <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map(opt => (
              <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={field.key}
                  value={String(opt.value)}
                  checked={value === opt.value}
                  onChange={() => onChange(opt.value)}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
      case 'switch':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={e => onChange(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm text-gray-700">{field.placeholder || field.label}</span>
          </label>
        );

      case 'rating':
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => onChange(star)}
                className={`text-2xl ${Number(value) >= star ? 'text-yellow-400' : 'text-gray-200'} hover:text-yellow-400 transition-colors`}
              >
                ★
              </button>
            ))}
          </div>
        );

      case 'uid':
        return (
          <div className="flex items-center gap-2 form-input bg-gray-50 cursor-not-allowed text-gray-400 select-none">
            <Fingerprint size={14} className="shrink-0 text-purple-400" />
            {value !== undefined && value !== null && value !== ''
              ? <span className="font-mono text-gray-600">{String(value)}</span>
              : <span className="italic text-xs">Auto-generated on save</span>
            }
          </div>
        );

      case 'api_select':
        return (
          <ApiSelectField
            field={field}
            value={value}
            error={error}
            onChange={onChange}
            onExtraUpdate={onExtraUpdate}
          />
        );

      case 'dependent_select':
        return (
          <DependentSelectField
            field={field}
            value={value}
            error={error}
            onChange={onChange}
            allValues={allValues}
            onExtraUpdate={onExtraUpdate}
          />
        );

      case 'image':
        return (
          <ImageField
            field={field}
            value={value}
            error={error}
            onChange={onChange}
          />
        );

      case 'color':
        return (
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={String(value ?? '#000000')}
              onChange={e => onChange(e.target.value)}
              className="h-10 w-20 rounded cursor-pointer border border-gray-300"
            />
            <span className="text-sm font-mono text-gray-500">{String(value ?? '#000000')}</span>
          </div>
        );

      case 'sub_form':
        return (
          <SubFormField
            field={field} value={value} error={error}
            onChange={onChange} allValues={allValues}
            onExtraUpdate={onExtraUpdate}
          />
        );

      default:
        return (
          <input
            type="text"
            className={inputClass}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div>
      <label className="form-label">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.help_text && (
        <p className="text-xs text-gray-400 mb-1">{field.help_text}</p>
      )}
      {renderField()}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
