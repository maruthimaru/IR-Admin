'use client';

/**
 * Dynamic Form Builder - Developer Panel
 * Allows developers to create and configure input forms visually.
 * Fields can be added, reordered, and configured.
 */

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import { FormField, FieldType } from '@/types';
import { toast } from 'react-toastify';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Save, Eye, Type, Hash, Mail, Phone, Calendar, List,
  CheckSquare, AlignLeft, Upload, DollarSign, Link, Star,
  type LucideIcon
} from 'lucide-react';

const FIELD_TYPES: { type: FieldType; label: string; icon: LucideIcon }[] = [
  { type: 'text',       label: 'Text',        icon: Type },
  { type: 'number',     label: 'Number',      icon: Hash },
  { type: 'email',      label: 'Email',       icon: Mail },
  { type: 'phone',      label: 'Phone',       icon: Phone },
  { type: 'date',       label: 'Date',        icon: Calendar },
  { type: 'select',     label: 'Dropdown',    icon: List },
  { type: 'checkbox',   label: 'Checkbox',    icon: CheckSquare },
  { type: 'textarea',   label: 'Textarea',    icon: AlignLeft },
  { type: 'file',       label: 'File Upload', icon: Upload },
  { type: 'currency',   label: 'Currency',    icon: DollarSign },
  { type: 'url',        label: 'URL',         icon: Link },
  { type: 'rating',     label: 'Rating',      icon: Star },
];

interface FormBuilderProps {
  onSuccess?: (formName: string) => void;
}

interface BuilderField extends Partial<FormField> {
  id: string;
  isExpanded?: boolean;
  optionsText?: string; // comma-separated options for select/radio
}

export default function FormBuilder({ onSuccess }: FormBuilderProps) {
  const [formName, setFormName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [layout, setLayout] = useState<'vertical' | 'horizontal' | 'grid'>('vertical');

  const createMutation = useMutation({
    mutationFn: (data: object) => formsAPI.createConfig(data),
    onSuccess: (response) => {
      toast.success(`Form "${formName}" created successfully!`);
      onSuccess?.(formName);
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to create form');
    },
  });

  const addField = (type: FieldType) => {
    const newField: BuilderField = {
      id: `field_${Date.now()}`,
      label: `New ${type} field`,
      key: `field_${Date.now()}`,
      type,
      required: false,
      placeholder: '',
      width: 'full',
      isExpanded: true,
      optionsText: type === 'select' || type === 'radio' ? 'Option 1, Option 2, Option 3' : '',
    };
    setFields(prev => [...prev, newField]);
  };

  const updateField = (id: string, updates: Partial<BuilderField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const moveField = (id: string, direction: 'up' | 'down') => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (direction === 'up' && idx > 0) {
        const arr = [...prev];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        return arr;
      }
      if (direction === 'down' && idx < prev.length - 1) {
        const arr = [...prev];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        return arr;
      }
      return prev;
    });
  };

  const generateKey = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const handleSave = () => {
    if (!formName) {
      toast.error('Form name is required');
      return;
    }
    if (fields.length === 0) {
      toast.error('Add at least one field');
      return;
    }

    const formFields = fields.map((f, i) => ({
      label: f.label,
      key: f.key || generateKey(f.label || ''),
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      width: f.width,
      order: i,
      options: f.optionsText
        ? f.optionsText.split(',').map(o => ({ label: o.trim(), value: o.trim().toLowerCase().replace(/\s+/g, '_') }))
        : [],
      is_searchable: f.is_searchable,
      is_sortable: f.is_sortable,
    }));

    createMutation.mutate({
      form_name: formName,
      display_name: displayName || formName,
      type: 'input',
      layout,
      fields: formFields,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Form Configuration</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Form Name (ID) *</label>
            <input
              type="text"
              className="form-input font-mono"
              placeholder="purchase_entry"
              value={formName}
              onChange={e => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            />
            <p className="text-xs text-gray-400 mt-1">Lowercase, underscores only. Used as collection name.</p>
          </div>
          <div>
            <label className="form-label">Display Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Purchase Entry"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="form-label">Layout</label>
          <div className="flex gap-3">
            {(['vertical', 'horizontal', 'grid'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLayout(l)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  layout === l
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Field Type Picker */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Fields</h3>
        <div className="flex flex-wrap gap-2">
          {FIELD_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => addField(type)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200
                         rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fields List */}
      {fields.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Fields ({fields.length})
          </h3>

          {fields.map((field, index) => (
            <div key={field.id} className="card border-2 border-gray-100 hover:border-indigo-100 transition-colors">
              {/* Field Header */}
              <div className="flex items-center gap-3">
                <GripVertical size={16} className="text-gray-300 cursor-grab" />

                <div className="flex-1 flex items-center gap-3">
                  <span className="text-xs badge-primary">{field.type}</span>
                  <span className="font-medium text-gray-900 text-sm">{field.label}</span>
                  <span className="text-xs font-mono text-gray-400">{field.key}</span>
                  {field.required && (
                    <span className="text-red-400 text-xs font-medium">Required</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveField(field.id!, 'up')}
                    disabled={index === 0}
                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveField(field.id!, 'down')}
                    disabled={index === fields.length - 1}
                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    onClick={() => updateField(field.id!, { isExpanded: !field.isExpanded })}
                    className="p-1.5 text-gray-400 hover:text-indigo-600"
                  >
                    {field.isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    onClick={() => removeField(field.id!)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Field Settings (Expanded) */}
              {field.isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Label *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={field.label}
                      onChange={e => {
                        updateField(field.id!, {
                          label: e.target.value,
                          key: generateKey(e.target.value),
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="form-label">Key (Field ID)</label>
                    <input
                      type="text"
                      className="form-input font-mono text-sm"
                      value={field.key}
                      onChange={e => updateField(field.id!, { key: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">Placeholder</label>
                    <input
                      type="text"
                      className="form-input"
                      value={field.placeholder}
                      onChange={e => updateField(field.id!, { placeholder: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">Width</label>
                    <select
                      className="form-input"
                      value={field.width}
                      onChange={e => updateField(field.id!, { width: e.target.value as 'full' | 'half' | 'third' })}
                    >
                      <option value="full">Full Width</option>
                      <option value="half">Half Width</option>
                      <option value="third">One Third</option>
                    </select>
                  </div>

                  {/* Options (for select/radio) */}
                  {(field.type === 'select' || field.type === 'radio' || field.type === 'multi_select') && (
                    <div className="col-span-2">
                      <label className="form-label">Options (comma-separated)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={field.optionsText}
                        placeholder="Option 1, Option 2, Option 3"
                        onChange={e => updateField(field.id!, { optionsText: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="col-span-2 flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateField(field.id!, { required: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.is_searchable}
                        onChange={e => updateField(field.id!, { is_searchable: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Searchable</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.is_sortable}
                        onChange={e => updateField(field.id!, { is_sortable: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Sortable</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {fields.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <Plus size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">Click a field type above to add fields</p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={createMutation.isPending || fields.length === 0}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={16} />
          {createMutation.isPending ? 'Creating...' : 'Save Form'}
        </button>
      </div>
    </div>
  );
}
