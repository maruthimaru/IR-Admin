'use client';

/**
 * Dynamic Form Renderer - Runtime UI
 * Renders any form based on its JSON configuration from the database.
 * Handles validation, submission, and error display.
 */

import { useState } from 'react';
import { InputFormConfig, FormField } from '@/types';
import { formsAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import { Send, AlertCircle } from 'lucide-react';

interface DynamicFormProps {
  config: InputFormConfig;
  onSuccess?: (record: object) => void;
  initialData?: Record<string, unknown>;
  mode?: 'create' | 'edit';
  recordId?: string;
}

export default function DynamicForm({
  config,
  onSuccess,
  initialData = {},
  mode = 'create',
  recordId,
}: DynamicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initialData);
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

// ── Individual Field Renderer ────────────────────────────────

interface FieldRendererProps {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

function FieldRenderer({ field, value, error, onChange }: FieldRendererProps) {
  const inputClass = `form-input ${error ? 'border-red-400 focus:ring-red-500' : ''}`;

  const renderField = () => {
    switch (field.type) {
      case 'text':
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

      case 'textarea':
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
