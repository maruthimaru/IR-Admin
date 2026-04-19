'use client';

/**
 * Dynamic Form Builder - Developer Panel
 * Allows developers to create and configure input forms visually.
 * Fields can be added, reordered, and configured.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formsAPI } from '@/lib/api';
import { DATE_FORMATS, TIME_FORMATS, TIMEZONE_OPTIONS } from '@/lib/datetime';
import { FormField, FieldType, InputFormConfig, SubFormUpdateRule, SubFormUpdateTarget, ApiFilter, EditWithNewRule } from '@/types';
import { toast } from 'react-toastify';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Save, Type, Hash, Mail, Phone, Calendar, List,
  CheckSquare, AlignLeft, Upload, DollarSign, Link, Star,
  Image as ImageIcon, Globe, GitBranch, Fingerprint, Clock, LayoutList, CopyPlus,
  type LucideIcon
} from 'lucide-react';

const FIELD_TYPES: { type: FieldType; label: string; icon: LucideIcon }[] = [
  { type: 'text',             label: 'Text',            icon: Type },
  { type: 'number',           label: 'Number',          icon: Hash },
  { type: 'email',            label: 'Email',           icon: Mail },
  { type: 'phone',            label: 'Phone',           icon: Phone },
  { type: 'date',             label: 'Date',            icon: Calendar },
  { type: 'select',           label: 'Dropdown',        icon: List },
  { type: 'api_select',       label: 'API Dropdown',    icon: Globe },
  { type: 'dependent_select', label: 'Dependent Dropdown', icon: GitBranch },
  { type: 'checkbox',         label: 'Checkbox',        icon: CheckSquare },
  { type: 'textarea',         label: 'Textarea',        icon: AlignLeft },
  { type: 'file',             label: 'File Upload',     icon: Upload },
  { type: 'image',            label: 'Image',           icon: ImageIcon },
  { type: 'currency',         label: 'Currency',        icon: DollarSign },
  { type: 'url',              label: 'URL',             icon: Link },
  { type: 'rating',           label: 'Rating',          icon: Star },
  { type: 'uid',              label: 'UID (Auto)',       icon: Fingerprint },
  { type: 'time',             label: 'Time',             icon: Clock },
  { type: 'sub_form',         label: 'Sub Form',         icon: LayoutList },
  { type: 'edit_with_new',    label: 'Edit With New',    icon: CopyPlus },
];

interface FormBuilderProps {
  onSuccess?: (formName: string) => void;
  /** Pass existing config to enter edit mode */
  initialConfig?: InputFormConfig;
}

interface BuilderField extends Partial<FormField> {
  id: string;
  isExpanded?: boolean;
  optionsText?: string; // comma-separated options for select/radio
  subFormBuilderFields?: BuilderField[];
}

function configToBuilderFields(fields: FormField[]): BuilderField[] {
  return fields.map((f, i) => ({
    ...f,
    id: `field_${i}_${Date.now()}`,
    isExpanded: false,
    optionsText: f.options?.map(o => o.label).join(', ') ?? '',
    // Explicit read so falsy values from the API don't get swallowed by the spread
    show_footer_sum: f.show_footer_sum === true,
    is_sortable:     f.is_sortable === true,
    is_searchable:   f.is_searchable === true,
    subFormBuilderFields: (f.sub_form_fields ?? []).map((sf, si) => ({
      ...sf,
      id: `sub_${si}_${Date.now()}`,
      isExpanded: false,
      optionsText: sf.options?.map(o => o.label).join(', ') ?? '',
      show_footer_sum: sf.show_footer_sum === true,
      is_sortable:     sf.is_sortable     === true,
      is_searchable:   sf.is_searchable   === true,
      api_filters:     sf.api_filters     ?? [],
    })),
    update_enabled:   f.update_enabled   ?? false,
    update_targets:   f.update_targets   ?? [],
    currency_symbol:  f.currency_symbol  ?? '',
    api_filters:      f.api_filters      ?? [],
    reference_key:    f.reference_key    ?? '',
    update_on_save:   f.update_on_save   ?? false,
    ewn_update_rules: (f.ewn_update_rules ?? []) as EditWithNewRule[],
  }));
}

// ── Sub-Form Update Config ───────────────────────────────────────────────────

function RuleEditor({ rule, idx, subFormFields, targetFields, updateRule, removeRule }: {
  rule: SubFormUpdateRule;
  idx: number;
  subFormFields: { label: string; value: string }[];
  targetFields: { label: string; value: string }[];
  updateRule: (idx: number, patch: Partial<SubFormUpdateRule>) => void;
  removeRule: (idx: number) => void;
}) {
  const vt = rule.value_type ?? 'field';
  const condMap = rule.condition_map ?? [];

  const updateCondMap = (ci: number, patch: { when?: string; value?: string }) => {
    const next = condMap.map((c, i) => i === ci ? { ...c, ...patch } : c);
    updateRule(idx, { condition_map: next });
  };

  return (
    <div className="border border-orange-200 rounded-lg p-3 space-y-2 bg-white">
      {/* Header row: target field + operation + remove */}
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-0.5">Target Field</label>
          <select
            className="form-input text-xs"
            value={rule.to_key}
            onChange={e => updateRule(idx, { to_key: e.target.value })}
          >
            <option value="">— Select target field —</option>
            {targetFields.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="w-32">
          <label className="block text-xs text-gray-500 mb-0.5">Operation</label>
          <select
            className="form-input text-xs"
            value={rule.operation}
            onChange={e => updateRule(idx, { operation: e.target.value as SubFormUpdateRule['operation'] })}
          >
            <option value="set">Set (=)</option>
            <option value="increment">Add (+)</option>
            <option value="decrement">Subtract (−)</option>
            <option value="multiply">Multiply (×)</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => removeRule(idx)}
          className="mt-4 text-red-400 hover:text-red-600 text-sm px-1 shrink-0"
        >✕</button>
      </div>

      {/* Value type tabs */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Value Source</label>
        <div className="flex gap-1">
          {(['field', 'static', 'conditional'] as const).map(vType => (
            <button
              key={vType}
              type="button"
              onClick={() => updateRule(idx, { value_type: vType })}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                vt === vType
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'border-gray-300 text-gray-600 hover:border-orange-400'
              }`}
            >
              {vType === 'field' ? 'From Field' : vType === 'static' ? 'Static Value' : 'Conditional'}
            </button>
          ))}
        </div>
      </div>

      {/* From Field */}
      {vt === 'field' && (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Sub-form Field</label>
          <select
            className="form-input text-xs"
            value={rule.from_key ?? ''}
            onChange={e => updateRule(idx, { from_key: e.target.value })}
          >
            <option value="">— Select sub-form field —</option>
            {subFormFields.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Static Value */}
      {vt === 'static' && (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Static Value</label>
          <input
            type="text"
            className="form-input text-xs"
            value={rule.static_value ?? ''}
            onChange={e => updateRule(idx, { static_value: e.target.value })}
            placeholder='e.g. "sold", "in_stock", "active"'
          />
        </div>
      )}

      {/* Conditional */}
      {vt === 'conditional' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Condition Field (sub-form)</label>
            <select
              className="form-input text-xs"
              value={rule.condition_field ?? ''}
              onChange={e => updateRule(idx, { condition_field: e.target.value })}
            >
              <option value="">— Select field —</option>
              {subFormFields.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-500">Condition Map (When → Set value)</label>
            {condMap.map((c, ci) => (
              <div key={ci} className="flex gap-2 items-center">
                <input
                  type="text"
                  className="form-input text-xs flex-1"
                  placeholder="When equals…"
                  value={c.when}
                  onChange={e => updateCondMap(ci, { when: e.target.value })}
                />
                <span className="text-xs text-gray-400">→</span>
                <input
                  type="text"
                  className="form-input text-xs flex-1"
                  placeholder="Set value"
                  value={c.value}
                  onChange={e => updateCondMap(ci, { value: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => updateRule(idx, { condition_map: condMap.filter((_, i) => i !== ci) })}
                  className="text-red-400 hover:text-red-600 text-xs"
                >✕</button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateRule(idx, { condition_map: [...condMap, { when: '', value: '' }] })}
              className="text-xs text-orange-600 hover:text-orange-800 font-medium"
            >+ Add condition</button>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Default Value (no match)</label>
            <input
              type="text"
              className="form-input text-xs"
              value={rule.default_value ?? ''}
              onChange={e => updateRule(idx, { default_value: e.target.value })}
              placeholder="e.g. in_stock"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// One target block (target form + lookup key + rules)
function TargetBlock({ target, tidx, formOptions, subFormFields, allTargets, onUpdateTargets }: {
  target: SubFormUpdateTarget;
  tidx: number;
  formOptions: { label: string; value: string }[];
  subFormFields: { label: string; value: string }[];
  allTargets: SubFormUpdateTarget[];
  onUpdateTargets: (next: SubFormUpdateTarget[]) => void;
}) {
  const [open, setOpen] = useState(true);

  const { data: targetConfig } = useQuery({
    queryKey: ['form-config-target', target.target_form],
    queryFn: () => formsAPI.getConfig(target.target_form).then(r => r.data),
    enabled: Boolean(target.target_form),
  });

  const targetFields: { label: string; value: string }[] = (targetConfig?.fields ?? [])
    .filter((f: FormField) => f.key)
    .map((f: FormField) => ({ label: `${f.label} (${f.key})`, value: f.key }));

  const patch = (p: Partial<SubFormUpdateTarget>) => {
    onUpdateTargets(allTargets.map((t, i) => i === tidx ? { ...t, ...p } : t));
  };

  const updateRule = (ridx: number, rp: Partial<SubFormUpdateRule>) => {
    patch({ rules: target.rules.map((r, i) => i === ridx ? { ...r, ...rp } : r) });
  };

  const addRule = () => patch({ rules: [...target.rules, { to_key: '', operation: 'set', value_type: 'field', from_key: '' }] });

  const removeRule = (ridx: number) => patch({ rules: target.rules.filter((_, i) => i !== ridx) });

  const deleteRules: SubFormUpdateRule[] = target.delete_rules ?? [];

  const updateDeleteRule = (ridx: number, rp: Partial<SubFormUpdateRule>) => {
    patch({ delete_rules: deleteRules.map((r, i) => i === ridx ? { ...r, ...rp } : r) });
  };

  const addDeleteRule = () => patch({ delete_rules: [...deleteRules, { to_key: '', operation: 'set', value_type: 'static', static_value: '' }] });

  const removeDeleteRule = (ridx: number) => patch({ delete_rules: deleteRules.filter((_, i) => i !== ridx) });

  const removeTarget = () => onUpdateTargets(allTargets.filter((_, i) => i !== tidx));

  const label = target.target_form
    ? formOptions.find(o => o.value === target.target_form)?.label ?? target.target_form
    : `Target ${tidx + 1}`;

  return (
    <div className="border border-orange-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-orange-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}>
        <span className="text-xs font-semibold text-orange-800">{label}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={e => { e.stopPropagation(); removeTarget(); }}
            className="text-red-400 hover:text-red-600 text-xs">✕ Remove</button>
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="p-3 space-y-3 bg-white">
          {/* Target form picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Form</label>
            <select className="form-input text-sm" value={target.target_form}
              onChange={e => patch({ target_form: e.target.value, lookup_key: '', rules: [] })}>
              <option value="">— Select form —</option>
              {formOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {target.target_form && (
            <>
              {/* Lookup key */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Lookup Key — sub-form field that holds the target record ID
                </label>
                <select className="form-input text-sm" value={target.lookup_key}
                  onChange={e => patch({ lookup_key: e.target.value })}>
                  <option value="">— Select sub-form field —</option>
                  {subFormFields.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Update Rules */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">Update Rules <span className="text-gray-400 font-normal">(on add / save)</span></p>
                {target.rules.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No rules yet.</p>
                )}
                {target.rules.map((rule, ridx) => (
                  <RuleEditor key={ridx} rule={rule} idx={ridx}
                    subFormFields={subFormFields} targetFields={targetFields}
                    updateRule={updateRule} removeRule={removeRule} />
                ))}
                <button type="button" onClick={addRule}
                  className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                  + Add Rule
                </button>
              </div>

              {/* Delete Rules */}
              <div className="space-y-2 border-t border-orange-100 pt-3">
                <p className="text-xs font-medium text-red-600">Delete Rules <span className="text-gray-400 font-normal">(when row is removed)</span></p>
                {deleteRules.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No delete rules yet.</p>
                )}
                {deleteRules.map((rule, ridx) => (
                  <RuleEditor key={ridx} rule={rule} idx={ridx}
                    subFormFields={subFormFields} targetFields={targetFields}
                    updateRule={updateDeleteRule} removeRule={removeDeleteRule} />
                ))}
                <button type="button" onClick={addDeleteRule}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">
                  + Add Delete Rule
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SubFormUpdateConfig({ field, onUpdate }: {
  field: BuilderField;
  onUpdate: (patch: Partial<BuilderField>) => void;
}) {
  const { data: allFormsRaw } = useQuery({
    queryKey: ['forms', 'input-list'],
    queryFn: () => formsAPI.listConfigs({ type: 'input' }).then(r => r.data),
  });

  const formsList: { form_name: string; display_name: string }[] =
    Array.isArray(allFormsRaw) ? allFormsRaw
      : ((allFormsRaw as { results?: unknown[] } | undefined)?.results ?? []) as { form_name: string; display_name: string }[];

  const formOptions = formsList.map(f => ({ label: f.display_name || f.form_name, value: f.form_name }));

  const subFormFields = (field.subFormBuilderFields ?? [])
    .filter(sf => sf.key)
    .map(sf => ({ label: `${sf.label || sf.key} (${sf.key})`, value: sf.key! }));

  const targets: SubFormUpdateTarget[] = (field.update_targets ?? []) as SubFormUpdateTarget[];

  const addTarget = () => {
    onUpdate({ update_targets: [...targets, { target_form: '', lookup_key: '', rules: [], delete_rules: [] }] });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="form-checkbox"
          checked={field.update_enabled ?? false}
          onChange={e => onUpdate({ update_enabled: e.target.checked })} />
        <span className="text-sm font-medium text-gray-700">Enable Record Update on Save</span>
      </label>

      {field.update_enabled && (
        <div className="space-y-2 pl-1">
          {targets.length === 0 && (
            <p className="text-xs text-gray-400 italic">No target forms yet — add one below.</p>
          )}
          {targets.map((target, tidx) => (
            <TargetBlock key={tidx} target={target} tidx={tidx}
              formOptions={formOptions} subFormFields={subFormFields}
              allTargets={targets}
              onUpdateTargets={next => onUpdate({ update_targets: next })} />
          ))}
          <button type="button" onClick={addTarget}
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-3 py-1.5 hover:bg-orange-50 transition-colors">
            + Add Target Form
          </button>
        </div>
      )}
    </div>
  );
}

// ── Form Source Config sub-component ────────────────────────────────────────

interface FormSourceConfigProps {
  field: BuilderField;
  onUpdate: (patch: Partial<BuilderField>) => void;
}

function FormSourceConfig({ field, onUpdate }: FormSourceConfigProps) {
  // All input forms for the picker
  const { data: allFormsRaw } = useQuery({
    queryKey: ['forms', 'input-list'],
    queryFn: () => formsAPI.listConfigs({ type: 'input' }).then(r => r.data),
  });

  // Selected form's config for field-key pickers
  const { data: selectedConfig } = useQuery({
    queryKey: ['form-config-source', field.source_form],
    queryFn: () => formsAPI.getConfig(field.source_form!).then(r => r.data),
    enabled: Boolean(field.source_form),
  });

  const formOptions: { label: string; value: string }[] = (
    Array.isArray(allFormsRaw) ? allFormsRaw : (allFormsRaw?.results ?? [])
  ).map((f: InputFormConfig) => ({ label: f.display_name || f.form_name, value: f.form_name }));

  const fieldOptions: { label: string; value: string }[] = selectedConfig
    ? [
        { label: '_id (Record ID)', value: '_id' },
        ...(selectedConfig.fields ?? []).map((f: FormField) => ({
          label: `${f.label} (${f.key})`,
          value: f.key,
        })),
      ]
    : [];

  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">Source Form</label>
        <select
          className="form-input"
          value={field.source_form ?? ''}
          onChange={e => onUpdate({ source_form: e.target.value, display_key: '', value_key: '' })}
        >
          <option value="">— select a form —</option>
          {formOptions.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">Records from this form will populate the dropdown</p>
      </div>

      {field.source_form && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Display Key</label>
              <select
                className="form-input"
                value={field.display_key ?? ''}
                onChange={e => onUpdate({ display_key: e.target.value })}
              >
                <option value="">— select field —</option>
                {fieldOptions.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">Shown in dropdown label</p>
            </div>
            <div>
              <label className="form-label">Value Key</label>
              <select
                className="form-input"
                value={field.value_key ?? ''}
                onChange={e => onUpdate({ value_key: e.target.value })}
              >
                <option value="">— select field —</option>
                {fieldOptions.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">Stored value on submit</p>
            </div>
            <div className="col-span-2">
              <label className="form-label">Table Value Key</label>
              <select
                className="form-input"
                value={field.table_value_key ?? ''}
                onChange={e => onUpdate({ table_value_key: e.target.value })}
              >
                <option value="">— same as display key —</option>
                {fieldOptions.filter(f => f.value !== '_id').map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">Label shown in the record list (leave blank to use display key)</p>
            </div>
          </div>

          {/* Dependent select: which field in the child form holds the parent reference */}
          {field.type === 'dependent_select' && (
            <div>
              <label className="form-label">Filter Field (child form)</label>
              <select
                className="form-input"
                value={field.filter_key ?? ''}
                onChange={e => onUpdate({ filter_key: e.target.value })}
              >
                <option value="">— select field —</option>
                {fieldOptions
                  .filter(f => f.value !== '_id')
                  .map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
              </select>
              <p className="text-xs text-gray-400 mt-0.5">
                Field in <strong>{field.source_form}</strong> that stores the parent reference (e.g. parentUID)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Conditional Formula Config ───────────────────────────────────────────────

function ConditionalConfig({ field, allFields, onUpdate }: {
  field: BuilderField;
  allFields: BuilderField[];
  onUpdate: (patch: Partial<BuilderField>) => void;
}) {
  const conditions = field.conditions ?? [];
  const conditionableFields = allFields.filter(f =>
    f.id !== field.id && f.key &&
    ['select', 'radio', 'api_select', 'dependent_select'].includes(f.type ?? '')
  );
  const numKeys = allFields
    .filter(f => f.id !== field.id && (f.type === 'number' || f.type === 'currency') && f.key)
    .map(f => ({ key: f.key!, label: f.label || f.key! }));

  const updateCondition = (idx: number, patch: Partial<{ when: string; formula: string }>) => {
    const updated = conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onUpdate({ conditions: updated });
  };
  const addCondition = () => onUpdate({ conditions: [...conditions, { when: '', formula: '' }] });
  const removeCondition = (idx: number) => onUpdate({ conditions: conditions.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">Condition Field</label>
        <select className="form-input" value={field.condition_field ?? ''}
          onChange={e => onUpdate({ condition_field: e.target.value })}>
          <option value="">— select dropdown field —</option>
          {conditionableFields.map(f => (
            <option key={f.id} value={f.key}>{f.label} ({f.key})</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">The dropdown whose value determines which formula to use</p>
      </div>

      {numKeys.length > 0 && (
        <p className="text-xs text-amber-700">
          Available fields:{' '}
          {numKeys.map(({ key, label }) => (
            <code key={key} className="bg-amber-100 px-1 rounded mr-1">{key} ({label})</code>
          ))}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">Condition Rules</p>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400">When =</span>
              <input type="text" className="form-input py-1 text-sm w-24"
                placeholder="value" value={c.when}
                onChange={e => updateCondition(i, { when: e.target.value })} />
            </div>
            <span className="text-xs text-gray-400 shrink-0">→ Formula:</span>
            <input type="text" className="form-input py-1 text-sm font-mono flex-1"
              placeholder="e.g. weight * rate" value={c.formula}
              onChange={e => updateCondition(i, { formula: e.target.value })} />
            <button type="button" onClick={() => removeCondition(i)}
              className="p-1 text-gray-400 hover:text-red-500 shrink-0">
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addCondition}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium">
          + Add Rule
        </button>
      </div>

      <div>
        <label className="form-label">Default Formula <span className="font-normal text-gray-400">(when no rule matches)</span></label>
        <input type="text" className="form-input font-mono text-sm"
          placeholder="e.g. price * quantity" value={field.condition_default_formula ?? ''}
          onChange={e => onUpdate({ condition_default_formula: e.target.value })} />
      </div>
    </div>
  );
}

// ── API Filters Config ───────────────────────────────────────────────────────

function ApiFiltersConfig({ field, allFields, onUpdate }: {
  field: BuilderField;
  allFields: BuilderField[];
  onUpdate: (patch: Partial<BuilderField>) => void;
}) {
  const filters: ApiFilter[] = field.api_filters ?? [];
  const isFormSource = (field.api_source ?? 'url') === 'form';

  const addFilter = () => {
    onUpdate({ api_filters: [...filters, { param: '', value_type: 'static', static_value: '' }] });
  };

  const updateFilter = (idx: number, patch: Partial<ApiFilter>) => {
    const updated = filters.map((f, i) => i === idx ? { ...f, ...patch } : f);
    onUpdate({ api_filters: updated });
  };

  const removeFilter = (idx: number) => {
    onUpdate({ api_filters: filters.filter((_, i) => i !== idx) });
  };

  const otherFields = allFields.filter(f => f.id !== field.id && f.key);

  return (
    <div className="pt-1 border-t border-indigo-200 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-700">
          Filters
          <span className="ml-1 font-normal text-indigo-400">
            ({isFormSource ? 'filter_param=value' : '?param=value'})
          </span>
        </span>
        <button
          type="button"
          onClick={addFilter}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded border border-indigo-300 hover:bg-indigo-50"
        >
          + Add Filter
        </button>
      </div>

      {filters.length === 0 && (
        <p className="text-xs text-gray-400 italic">No filters — dropdown shows all records.</p>
      )}

      {filters.map((f, idx) => (
        <div key={idx} className="flex flex-wrap gap-2 items-start p-2 bg-white rounded border border-indigo-200">
          {/* Param name */}
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
              {isFormSource ? 'Field Key' : 'Query Param'}
            </label>
            <input
              type="text"
              className="form-input font-mono text-xs py-1"
              placeholder={isFormSource ? 'status' : 'status'}
              value={f.param}
              onChange={e => updateFilter(idx, { param: e.target.value })}
            />
          </div>

          {/* Value type toggle */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
            <div className="flex gap-0.5 bg-indigo-100 rounded p-0.5">
              {(['static', 'dynamic'] as const).map(vt => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => updateFilter(idx, { value_type: vt })}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    f.value_type === vt
                      ? 'bg-white text-indigo-700 shadow-sm font-medium'
                      : 'text-indigo-500 hover:text-indigo-700'
                  }`}
                >
                  {vt === 'static' ? 'Static' : 'Dynamic'}
                </button>
              ))}
            </div>
          </div>

          {/* Value */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
              {f.value_type === 'static' ? 'Value' : 'From Field'}
            </label>
            {f.value_type === 'static' ? (
              <input
                type="text"
                className="form-input text-xs py-1"
                placeholder="e.g. in_stock"
                value={f.static_value ?? ''}
                onChange={e => updateFilter(idx, { static_value: e.target.value })}
              />
            ) : (
              <select
                className="form-input text-xs py-1"
                value={f.field_key ?? ''}
                onChange={e => updateFilter(idx, { field_key: e.target.value })}
              >
                <option value="">— select field —</option>
                {otherFields.map(of => (
                  <option key={of.id} value={of.key}>{of.label} ({of.key})</option>
                ))}
              </select>
            )}
          </div>

          {/* Remove */}
          <button
            type="button"
            onClick={() => removeFilter(idx)}
            className="mt-4 text-red-400 hover:text-red-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Field Lookup Config ──────────────────────────────────────────────────────

interface FieldLookupConfigProps {
  field: BuilderField;
  allFields: BuilderField[];
  onUpdate: (patch: Partial<BuilderField>) => void;
}

function FieldLookupConfig({ field, allFields, onUpdate }: FieldLookupConfigProps) {
  const formSourceDropdowns = allFields.filter(f =>
    f.id !== field.id &&
    (f.type === 'api_select' || f.type === 'dependent_select') &&
    (f.api_source ?? 'url') === 'form' &&
    f.source_form && f.key
  );

  const watchedField = allFields.find(f => f.key === field.lookup_field_key);
  const sourceFormName = watchedField?.source_form;

  const { data: sourceConfig } = useQuery({
    queryKey: ['form-config-source', sourceFormName],
    queryFn: () => formsAPI.getConfig(sourceFormName!).then(r => r.data),
    enabled: Boolean(sourceFormName),
  });

  const sourceFields = sourceConfig
    ? (sourceConfig.fields ?? []).map((f: { label: string; key: string }) => ({ label: `${f.label} (${f.key})`, value: f.key }))
    : [];

  if (formSourceDropdowns.length === 0) {
    return (
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">
        Add a form-source dropdown field first (API Dropdown with &quot;Form&quot; source selected).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">Watch Dropdown Field</label>
        <select className="form-input"
          value={field.lookup_field_key ?? ''}
          onChange={e => onUpdate({ lookup_field_key: e.target.value, lookup_source_field: '' })}>
          <option value="">— select dropdown field —</option>
          {formSourceDropdowns.map(f => (
            <option key={f.id} value={f.key}>{f.label} ({f.key})</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">When this dropdown changes, the text field is auto-populated</p>
      </div>
      {field.lookup_field_key && (
        <div>
          <label className="form-label">Field to Extract from Source</label>
          <select className="form-input"
            value={field.lookup_source_field ?? ''}
            onChange={e => onUpdate({ lookup_source_field: e.target.value })}>
            <option value="">— select field —</option>
            {sourceFields.map((f: { label: string; value: string }) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-0.5">This field&apos;s value from the source record will be stored</p>
        </div>
      )}
    </div>
  );
}

// ── Edit With New Config ─────────────────────────────────────────────────────

function EditWithNewConfig({ field, allFields, onUpdate }: {
  field: BuilderField;
  allFields: BuilderField[];
  onUpdate: (patch: Partial<BuilderField>) => void;
}) {
  const rules: EditWithNewRule[] = (field.ewn_update_rules ?? []) as EditWithNewRule[];
  const siblingFields = allFields.filter(f => f.id !== field.id && f.key);

  const updateRule = (idx: number, patch: Partial<EditWithNewRule>) => {
    onUpdate({ ewn_update_rules: rules.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  };
  const addRule = () => onUpdate({ ewn_update_rules: [...rules, { field_key: '', value: '' }] });
  const removeRule = (idx: number) => onUpdate({ ewn_update_rules: rules.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      {/* Reference Key */}
      <div>
        <label className="form-label">Reference Key</label>
        <select
          className="form-input"
          value={field.reference_key ?? ''}
          onChange={e => onUpdate({ reference_key: e.target.value })}
        >
          <option value="">— select a field —</option>
          {siblingFields.map(f => (
            <option key={f.id} value={f.key}>{f.label} ({f.key})</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-0.5">
          This field&apos;s value is locked (read-only) when opening a record via &quot;Edit With New&quot;
        </p>
      </div>

      {/* Update on save toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="form-checkbox"
          checked={field.update_on_save ?? false}
          onChange={e => onUpdate({ update_on_save: e.target.checked })}
        />
        <span className="text-sm font-medium text-gray-700">Update Records on Save</span>
      </label>

      {field.update_on_save && (
        <div className="space-y-2 pl-1">
          <p className="text-xs font-medium text-gray-600">
            Update Rules — applied to the old record (matched by reference key)
          </p>
          {rules.length === 0 && (
            <p className="text-xs text-gray-400 italic">No rules yet.</p>
          )}
          {rules.map((rule, idx) => (
            <div key={idx} className="flex gap-2 items-start bg-white border border-teal-200 rounded-lg p-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-0.5">Field Key</label>
                <input
                  type="text"
                  className="form-input text-xs font-mono"
                  placeholder="e.g. status"
                  value={rule.field_key}
                  onChange={e => updateRule(idx, { field_key: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-0.5">Set Value</label>
                <input
                  type="text"
                  className="form-input text-xs"
                  placeholder='e.g. cancelled'
                  value={rule.value}
                  onChange={e => updateRule(idx, { value: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRule(idx)}
                className="mt-5 text-red-400 hover:text-red-600 text-sm px-1 shrink-0"
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRule}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium border border-teal-300 rounded px-3 py-1 hover:bg-teal-50 transition-colors"
          >
            + Add Rule
          </button>
        </div>
      )}
    </div>
  );
}

// ── Field Settings Panel ─────────────────────────────────────────────────────

interface FieldSettingsPanelProps {
  field: BuilderField;
  allFields: BuilderField[];           // sibling fields for formula/combined/dependent refs
  onUpdate: (patch: Partial<BuilderField>) => void;
  generateKey: (label: string) => string;
  isSubField?: boolean;                // if true, hide SubFormBuilder section (no infinite nesting)
  onAddPeerField?: (f: BuilderField) => void; // add a field alongside this one in the parent form
  parentSubFormKey?: string;           // key of the parent sub_form field (set when isSubField)
}

function FieldSettingsPanel({ field, allFields, onUpdate, generateKey, isSubField, onAddPeerField, parentSubFormKey }: FieldSettingsPanelProps) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
      <div>
        <label className="form-label">Label *</label>
        <input
          type="text"
          className="form-input"
          value={field.label}
          onChange={e => {
            onUpdate({
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
          onChange={e => onUpdate({ key: e.target.value })}
        />
      </div>

      <div>
        <label className="form-label">Placeholder</label>
        <input
          type="text"
          className="form-input"
          value={field.placeholder}
          onChange={e => onUpdate({ placeholder: e.target.value })}
        />
      </div>

      <div>
        <label className="form-label">Width</label>
        <select
          className="form-input"
          value={field.width}
          onChange={e => onUpdate({ width: e.target.value as 'full' | 'half' | 'third' })}
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
            onChange={e => onUpdate({ optionsText: e.target.value })}
          />
        </div>
      )}

      {/* API Dropdown config */}
      {(field.type === 'api_select' || field.type === 'dependent_select') && (
        <div className="col-span-2 space-y-3 bg-indigo-50 rounded-lg p-3 border border-indigo-100">
          {/* Header row: source tabs + searchable toggle */}
          <div className="flex items-center justify-between gap-3">
            {/* Source tabs */}
            <div className="flex gap-1 bg-indigo-100 rounded-lg p-0.5">
              {(['url', 'form'] as const).map(src => (
                <button
                  key={src}
                  type="button"
                  onClick={() => onUpdate({ api_source: src })}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    (field.api_source ?? 'url') === src
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-indigo-500 hover:text-indigo-700'
                  }`}
                >
                  {src === 'url' ? 'API URL' : 'Form'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={field.searchable_dropdown ?? false}
                onChange={e => onUpdate({ searchable_dropdown: e.target.checked })}
                className="rounded"
              />
              <span className="text-xs font-medium text-indigo-700">Searchable Dropdown</span>
            </label>
          </div>

          {/* ── Form source ── */}
          {(field.api_source ?? 'url') === 'form' ? (
            <FormSourceConfig
              field={field}
              onUpdate={onUpdate}
            />
          ) : (
            <>
            {/* URL + Method */}
            <div className="flex gap-2">
              <div className="w-28 shrink-0">
                <label className="form-label">Method</label>
                <select
                  className="form-input font-mono text-sm"
                  value={field.api_method ?? 'GET'}
                  onChange={e => onUpdate({ api_method: e.target.value as 'GET' | 'POST' })}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="form-label">API URL *</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="https://api.example.com/countries"
                  value={field.api_url ?? ''}
                  onChange={e => onUpdate({ api_url: e.target.value })}
                />
              </div>
            </div>

            {/* Response mapping */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Response Path</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="data"
                  value={field.response_path ?? 'data'}
                  onChange={e => onUpdate({ response_path: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-0.5">Key that holds the array</p>
              </div>
              <div>
                <label className="form-label">Display Key</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="name"
                  value={field.display_key ?? 'name'}
                  onChange={e => onUpdate({ display_key: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-0.5">Shown in dropdown</p>
              </div>
              <div>
                <label className="form-label">Value Key</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="id"
                  value={field.value_key ?? 'id'}
                  onChange={e => onUpdate({ value_key: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-0.5">Stored on submit</p>
              </div>
              <div>
                <label className="form-label">Table Value Key</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="name"
                  value={field.table_value_key ?? ''}
                  onChange={e => onUpdate({ table_value_key: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-0.5">Label shown in list view</p>
              </div>
            </div>

            {/* Auth */}
            <div className="space-y-2 pt-1 border-t border-indigo-200">
              <div className="flex items-center gap-3">
                <label className="form-label mb-0 whitespace-nowrap">Auth Type</label>
                <select
                  className="form-input font-mono text-sm w-44"
                  value={field.api_auth_type ?? 'none'}
                  onChange={e => onUpdate({ api_auth_type: e.target.value as 'none' | 'basic' | 'bearer' })}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                </select>
              </div>
              {field.api_auth_type === 'bearer' && (
                <div>
                  <label className="form-label">Bearer Token</label>
                  <input type="text" className="form-input font-mono text-sm" placeholder="eyJhbGci..."
                    value={field.api_auth_token ?? ''}
                    onChange={e => onUpdate({ api_auth_token: e.target.value })} />
                </div>
              )}
              {field.api_auth_type === 'basic' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Username</label>
                    <input type="text" className="form-input font-mono text-sm" placeholder="username"
                      value={field.api_auth_username ?? ''}
                      onChange={e => onUpdate({ api_auth_username: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">Password</label>
                    <input type="password" className="form-input font-mono text-sm" placeholder="••••••••"
                      value={field.api_auth_password ?? ''}
                      onChange={e => onUpdate({ api_auth_password: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* POST body */}
            {field.api_method === 'POST' && (
              <div className="pt-1 border-t border-indigo-200">
                <label className="form-label">Request Body (raw JSON)</label>
                <textarea
                  className="form-input font-mono text-sm" rows={4}
                  placeholder={
                    field.type === 'dependent_select'
                      ? `{\n  "${field.filter_key || 'country_id'}": "{{${field.depends_on || 'parent_field'}}}"\n}`
                      : '{\n  "key": "value"\n}'
                  }
                  value={field.api_body ?? ''}
                  onChange={e => onUpdate({ api_body: e.target.value })}
                />
                {field.type === 'dependent_select' && (
                  <p className="text-xs text-indigo-600 mt-1">
                    Use <code className="bg-indigo-100 px-1 rounded">{'{{' + (field.depends_on || 'parent_field') + '}}'}</code> — replaced with the parent field&apos;s value at runtime.
                  </p>
                )}
              </div>
            )}
            </>
          )}

          {/* Dependent select — shown for both source modes */}
          {field.type === 'dependent_select' && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-indigo-200">
              <div>
                <label className="form-label">Depends On (parent field)</label>
                <select
                  className="form-input"
                  value={field.depends_on ?? ''}
                  onChange={e => onUpdate({ depends_on: e.target.value })}
                >
                  <option value="">— select parent field —</option>
                  {allFields
                    .filter(f => f.id !== field.id && f.key)
                    .map(f => (
                      <option key={f.id} value={f.key}>{f.label} ({f.key})</option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Which field in THIS form is the parent value</p>
              </div>
              {/* URL source: free-text query param name */}
              {(field.api_source ?? 'url') === 'url' && (
                <div>
                  <label className="form-label">Filter Query Param</label>
                  <input
                    type="text"
                    className="form-input font-mono text-sm"
                    placeholder="country_id"
                    value={field.filter_key ?? ''}
                    onChange={e => onUpdate({ filter_key: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Appended as ?country_id=&lt;value&gt;</p>
                </div>
              )}
            </div>
          )}

          {/* Extra Filters — available for both api_select and dependent_select */}
          <ApiFiltersConfig
            field={field}
            allFields={allFields}
            onUpdate={onUpdate}
          />
        </div>
      )}

      {/* Currency Symbol */}
      {field.type === 'currency' && (
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Currency Symbol <span className="text-gray-400 font-normal">(optional — e.g. $, €, ₹, £)</span>
          </label>
          <input
            type="text"
            className="form-input text-sm w-32"
            value={field.currency_symbol ?? ''}
            onChange={e => onUpdate({ currency_symbol: e.target.value })}
            placeholder="Empty = none"
            maxLength={8}
          />
        </div>
      )}

      {/* Value Source — number / currency only */}
      {(field.type === 'number' || field.type === 'currency') && (
        <div className="col-span-2 space-y-3 bg-amber-50 rounded-lg p-3 border border-amber-100">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Value Source</p>
          <div className="flex gap-3 flex-wrap">
            {(['manual', 'api', 'formula', 'field_lookup', 'conditional'] as const).map(src => (
              <label key={src} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`value_source_${field.id}`}
                  value={src}
                  checked={(field.value_source ?? 'manual') === src}
                  onChange={() => onUpdate({ value_source: src })}
                  className="text-amber-600"
                />
                <span className="text-sm capitalize text-gray-700">{src === 'api' ? 'API Fetch' : src === 'formula' ? 'Formula' : src === 'field_lookup' ? 'Field Lookup' : src === 'conditional' ? 'Conditional' : 'Manual'}</span>
              </label>
            ))}
          </div>

          {/* Formula input */}
          {(field.value_source ?? 'manual') === 'formula' && (
            <div className="space-y-2">
              <div>
                <label className="form-label">Formula Expression</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder="e.g. price * quantity  or  a + b + c"
                  value={field.formula ?? ''}
                  onChange={e => onUpdate({ formula: e.target.value })}
                />
              </div>
              {(() => {
                const numKeys = allFields
                  .filter(f => f.id !== field.id && (f.type === 'number' || f.type === 'currency') && f.key)
                  .map(f => f.key!);
                return numKeys.length > 0 ? (
                  <p className="text-xs text-amber-700">
                    Available fields: {numKeys.map(k => (
                      <code
                        key={k}
                        className="bg-amber-100 px-1 rounded cursor-pointer hover:bg-amber-200 mr-1"
                        onClick={() => onUpdate({ formula: ((field.formula ?? '') + (field.formula ? ' + ' : '') + k) })}
                      >
                        {k}
                      </code>
                    ))}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">Add other number/currency fields first to use them in the formula.</p>
                );
              })()}
            </div>
          )}

          {/* Field lookup config for number/currency */}
          {(field.value_source ?? 'manual') === 'field_lookup' && (
            <FieldLookupConfig
              field={field}
              allFields={allFields}
              onUpdate={onUpdate}
            />
          )}

          {/* Conditional formula config */}
          {(field.value_source ?? 'manual') === 'conditional' && (
            <ConditionalConfig
              field={field}
              allFields={allFields}
              onUpdate={onUpdate}
            />
          )}

          {/* API fetch config for number/currency */}
          {(field.value_source ?? 'manual') === 'api' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="w-28 shrink-0">
                  <label className="form-label">Method</label>
                  <select
                    className="form-input font-mono text-sm"
                    value={field.api_method ?? 'GET'}
                    onChange={e => onUpdate({ api_method: e.target.value as 'GET' | 'POST' })}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="form-label">API URL *</label>
                  <input
                    type="text"
                    className="form-input font-mono text-sm"
                    placeholder="https://api.example.com/rate"
                    value={field.api_url ?? ''}
                    onChange={e => onUpdate({ api_url: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Response Path</label>
                  <input
                    type="text"
                    className="form-input font-mono text-sm"
                    placeholder="data.rate"
                    value={field.response_path ?? ''}
                    onChange={e => onUpdate({ response_path: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Dot-path to the numeric value</p>
                </div>
                <div>
                  <label className="form-label">Value Key (if object)</label>
                  <input
                    type="text"
                    className="form-input font-mono text-sm"
                    placeholder="value"
                    value={field.value_key ?? ''}
                    onChange={e => onUpdate({ value_key: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Leave blank if path returns a number</p>
                </div>
              </div>
              {/* Auth */}
              <div className="space-y-2 pt-1 border-t border-amber-200">
                <div className="flex items-center gap-3">
                  <label className="form-label mb-0 whitespace-nowrap">Auth Type</label>
                  <select
                    className="form-input font-mono text-sm w-44"
                    value={field.api_auth_type ?? 'none'}
                    onChange={e => onUpdate({ api_auth_type: e.target.value as 'none' | 'basic' | 'bearer' })}
                  >
                    <option value="none">None</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </div>
                {field.api_auth_type === 'bearer' && (
                  <div>
                    <label className="form-label">Bearer Token</label>
                    <input type="text" className="form-input font-mono text-sm" placeholder="eyJhbGci..."
                      value={field.api_auth_token ?? ''} onChange={e => onUpdate({ api_auth_token: e.target.value })} />
                  </div>
                )}
                {field.api_auth_type === 'basic' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Username</label>
                      <input type="text" className="form-input font-mono text-sm" placeholder="username"
                        value={field.api_auth_username ?? ''} onChange={e => onUpdate({ api_auth_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">Password</label>
                      <input type="password" className="form-input font-mono text-sm" placeholder="••••••••"
                        value={field.api_auth_password ?? ''} onChange={e => onUpdate({ api_auth_password: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Value Source — textarea */}
      {field.type === 'textarea' && (
        <div className="col-span-2 space-y-3 bg-teal-50 rounded-lg p-3 border border-teal-100">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Value Source</p>
          <div className="flex gap-4">
            {(['manual', 'field_lookup'] as const).map(src => (
              <label key={src} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`textarea_value_source_${field.id}`}
                  value={src}
                  checked={(field.value_source ?? 'manual') === src}
                  onChange={() => onUpdate({ value_source: src })}
                  className="text-teal-600"
                />
                <span className="text-sm text-gray-700">{src === 'field_lookup' ? 'Field Lookup' : 'Manual'}</span>
              </label>
            ))}
          </div>
          {(field.value_source ?? 'manual') === 'field_lookup' && (
            <FieldLookupConfig
              field={field}
              allFields={allFields}
              onUpdate={onUpdate}
            />
          )}
        </div>
      )}

      {/* Format + Default Now — date / datetime / time */}
      {(field.type === 'date' || field.type === 'datetime' || field.type === 'time') && (
        <div className="col-span-2 space-y-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={12} /> Date / Time Format
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Date format — not relevant for pure time */}
            {field.type !== 'time' && (
              <div>
                <label className="form-label">Date Format</label>
                <select
                  className="form-input text-sm"
                  value={field.date_format ?? 'DD/MM/YYYY'}
                  onChange={e => onUpdate({ date_format: e.target.value })}
                >
                  {DATE_FORMATS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Time format — not relevant for pure date */}
            {field.type !== 'date' && (
              <div>
                <label className="form-label">Time Format</label>
                <select
                  className="form-input text-sm"
                  value={field.time_format ?? '24h'}
                  onChange={e => onUpdate({ time_format: e.target.value as '24h' | '12h' })}
                >
                  {TIME_FORMATS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Combined format preview for datetime */}
          {field.type === 'datetime' && (
            <p className="text-xs text-blue-600">
              Preview: <span className="font-mono font-semibold">
                {field.date_format ?? 'DD/MM/YYYY'}&nbsp;{(field.time_format ?? '24h') === '24h' ? 'HH:mm' : 'hh:mm a'}
              </span>
            </p>
          )}

          {/* Timezone override */}
          <div>
            <label className="form-label">Timezone</label>
            <select
              className="form-input text-sm"
              value={field.field_timezone ?? ''}
              onChange={e => onUpdate({ field_timezone: e.target.value })}
            >
              <option value="">Use company timezone</option>
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.default_now ?? false}
              onChange={e => onUpdate({ default_now: e.target.checked })}
              className="rounded text-blue-600"
            />
            <span className="text-sm text-blue-700 font-medium">
              Default to current {field.type === 'date' ? 'date' : field.type === 'datetime' ? 'date & time' : 'time'} on new record
            </span>
          </label>
        </div>
      )}

      {/* UID info banner */}
      {field.type === 'uid' && (
        <div className="col-span-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-700 flex items-center gap-2">
          <Fingerprint size={13} className="shrink-0" />
          Auto-generated sequential number. Value is assigned automatically on save and cannot be edited.
        </div>
      )}

      {/* Edit With New config */}
      {field.type === 'edit_with_new' && (
        <div className="col-span-2 space-y-3 bg-teal-50 rounded-lg p-3 border border-teal-100">
          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide flex items-center gap-1.5">
            <CopyPlus size={12} /> Edit With New
          </p>
          <EditWithNewConfig field={field} allFields={allFields} onUpdate={onUpdate} />
        </div>
      )}

      {/* Sub Form columns builder — only in top-level fields, not sub-fields */}
      {!isSubField && field.type === 'sub_form' && (
        <div className="col-span-2 space-y-3 bg-violet-50 rounded-lg p-3 border border-violet-100">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Sub-Form Columns</p>
          <SubFormBuilder
            parentSubFormKey={field.key ?? ''}
            fields={field.subFormBuilderFields ?? []}
            allParentFields={allFields}
            onChange={subFields => onUpdate({ subFormBuilderFields: subFields })}
            onAddToParentForm={onAddPeerField}
          />
        </div>
      )}

      {/* Sub-Form Update Keys — only for top-level sub_form fields */}
      {!isSubField && field.type === 'sub_form' && (
        <div className="col-span-2 space-y-3 bg-orange-50 rounded-lg p-3 border border-orange-100">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Update Records on Save</p>
          <SubFormUpdateConfig field={field} onUpdate={onUpdate} />
        </div>
      )}

      {/* Combined/lookup value config — text fields only */}
      {field.type === 'text' && (
        <div className="col-span-2 space-y-3 bg-emerald-50 rounded-lg p-3 border border-emerald-100">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Value Source</p>
          <div className="flex gap-4 flex-wrap">
            {([
              { value: 'manual', label: 'Manual' },
              { value: 'combined', label: 'Combined (with auto-number)' },
              { value: 'field_lookup', label: 'Field Lookup' },
            ] as const).map(src => (
              <label key={src.value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`text_value_source_${field.id}`}
                  value={src.value}
                  checked={(field.value_source ?? 'manual') === src.value}
                  onChange={() => onUpdate({ value_source: src.value })}
                  className="text-emerald-600"
                />
                <span className="text-sm text-gray-700">{src.label}</span>
              </label>
            ))}
          </div>

          {(field.value_source ?? 'manual') === 'field_lookup' && (
            <FieldLookupConfig
              field={field}
              allFields={allFields}
              onUpdate={onUpdate}
            />
          )}

          {(field.value_source ?? 'manual') === 'combined' && (
            <div className="space-y-3">
              <div>
                <label className="form-label">Combined Template</label>
                <input
                  type="text"
                  className="form-input font-mono text-sm"
                  placeholder={`{{category}}-{{supplier_code}}-{{auto_generate}}`}
                  value={field.combined_template ?? ''}
                  onChange={e => onUpdate({ combined_template: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Use <code className="bg-emerald-100 px-1 rounded">{'{{field_key}}'}</code> for other fields,{' '}
                  <code className="bg-indigo-100 px-1 rounded text-indigo-700">{'{{auto_generate}}'}</code> for the sequential number
                </p>
              </div>

              {/* Quick-insert field chips */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-emerald-700">Click to insert into template:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allFields
                    .filter(f => f.id !== field.id && f.key && f.type !== 'uid')
                    .map(f => (
                      <button
                        key={f.id}
                        type="button"
                        title={f.label}
                        className="px-2 py-0.5 text-xs bg-white border border-emerald-200 rounded hover:bg-emerald-100 hover:border-emerald-400 font-mono text-emerald-800 transition-colors"
                        onClick={() => onUpdate({
                          combined_template: (field.combined_template ?? '') + `{{${f.key}}}`,
                        })}
                      >
                        {`{{${f.key}}}`}
                      </button>
                    ))}
                  <button
                    type="button"
                    className="px-2 py-0.5 text-xs bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 hover:border-indigo-400 font-mono text-indigo-700 font-semibold transition-colors"
                    onClick={() => onUpdate({
                      combined_template: (field.combined_template ?? '') + '{{auto_generate}}',
                    })}
                  >
                    {'{{auto_generate}}'}
                  </button>
                </div>
              </div>

              {field.combined_template && (
                <p className="text-xs text-emerald-700">
                  Pattern:{' '}
                  <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">
                    {field.combined_template}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="col-span-2 flex gap-6 flex-wrap">
        {field.type !== 'uid' && field.type !== 'sub_form' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={e => onUpdate({
                required: e.target.checked,
                // Turning required ON must clear hidden
                ...(e.target.checked ? { hidden: false } : {}),
              })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Required</span>
          </label>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={field.is_searchable}
            onChange={e => onUpdate({ is_searchable: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Searchable</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={field.is_sortable}
            onChange={e => onUpdate({ is_sortable: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Sortable</span>
        </label>
        {field.type !== 'uid' && field.type !== 'sub_form' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.is_unique ?? false}
              onChange={e => onUpdate({ is_unique: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Unique</span>
          </label>
        )}
        {(field.type === 'number' || field.type === 'currency') && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.show_footer_sum ?? false}
              onChange={e => onUpdate({ show_footer_sum: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Footer Sum</span>
          </label>
        )}
        {isSubField && (field.type === 'number' || field.type === 'currency') && (
          <label className="flex items-center gap-2 cursor-pointer"
            title={parentSubFormKey && field.key ? `Auto-adds hidden field: ${parentSubFormKey}_${field.key}_sum` : 'Sum to Main Form'}>
            <input
              type="checkbox"
              checked={field.sum_to_main ?? false}
              onChange={e => onUpdate({ sum_to_main: e.target.checked })}
              className="rounded text-violet-600"
            />
            <span className="text-sm text-violet-700 font-medium">
              Sum to Main Form
              {field.sum_to_main && parentSubFormKey && field.key && (
                <span className="ml-1 text-xs font-mono text-violet-500">→ {parentSubFormKey}_{field.key}_sum</span>
              )}
            </span>
          </label>
        )}
        {(['text', 'number', 'currency', 'textarea'] as const).includes(field.type as 'text' | 'number' | 'currency' | 'textarea') && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.edit_on_list ?? false}
              onChange={e => onUpdate({ edit_on_list: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Edit on List</span>
          </label>
        )}
        {/* Hide from Form — only when not required, not sub_form */}
        {!field.required && field.type !== 'sub_form' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.hidden ?? false}
              onChange={e => onUpdate({ hidden: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Hide from Form</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ── Sub Form Builder ─────────────────────────────────────────────────────────

function SubFormBuilder({ fields: subFields, allParentFields, onChange, parentSubFormKey, onAddToParentForm }: {
  fields: BuilderField[];
  allParentFields?: BuilderField[];
  onChange: (f: BuilderField[]) => void;
  parentSubFormKey?: string;
  onAddToParentForm?: (f: BuilderField) => void;
}) {
  const generateKey = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addSubField = (type: FieldType) => {
    const ts = Date.now();
    const newField: BuilderField = {
      id: `sub_${ts}`,
      label: `New ${type} field`,
      key: `sub_${ts}`,
      type,
      required: false,
      placeholder: '',
      width: 'full' as const,
      isExpanded: true,
      optionsText: type === 'select' || type === 'radio' ? 'Option 1, Option 2, Option 3' : '',
      ...(type === 'api_select' || type === 'dependent_select' ? {
        api_source: 'url' as const, source_form: '',
        api_url: '', api_method: 'GET' as const,
        response_path: 'data', display_key: 'name', value_key: 'id',
        table_value_key: '', api_auth_type: 'none' as const,
        api_auth_token: '', api_auth_username: '', api_auth_password: '',
        api_body: '', searchable_dropdown: false, api_filters: [] as ApiFilter[],
      } : {}),
      ...(type === 'date' || type === 'datetime' || type === 'time' ? {
        date_format: 'DD/MM/YYYY' as const, time_format: '24h' as const,
        field_timezone: '', default_now: false,
      } : {}),
      depends_on: type === 'dependent_select' ? '' : undefined,
      filter_key: type === 'dependent_select' ? '' : undefined,
      ...(type === 'number' || type === 'currency' ? {
        value_source: 'manual' as const, formula: '',
        api_url: '', api_method: 'GET' as const, response_path: '', value_key: '',
        api_auth_type: 'none' as const, api_auth_token: '',
        api_auth_username: '', api_auth_password: '', api_body: '',
        lookup_field_key: '', lookup_source_field: '',
        condition_field: '', conditions: [], condition_default_formula: '',
      } : {}),
      ...(type === 'textarea' ? {
        value_source: 'manual' as const,
        lookup_field_key: '', lookup_source_field: '',
      } : {}),
      ...(type === 'text' ? {
        value_source: 'manual' as const, combined_template: '',
        lookup_field_key: '', lookup_source_field: '',
      } : {}),
    };
    onChange([...subFields, newField]);
  };

  const updateSubField = (id: string, patch: Partial<BuilderField>) => {
    onChange(subFields.map(f => f.id === id ? { ...f, ...patch } : f));
    // When sum_to_main is turned ON, auto-add a matching number/currency field to the parent form
    if (patch.sum_to_main === true && onAddToParentForm && parentSubFormKey) {
      const sf = subFields.find(f => f.id === id);
      if (sf?.key && (sf.type === 'number' || sf.type === 'currency')) {
        const sumKey = `${parentSubFormKey}_${sf.key}_sum`;
        onAddToParentForm({
          id: `field_sum_${Date.now()}`,
          label: `${sf.label ?? sf.key} Sum`,
          key: sumKey,
          type: sf.type as FieldType,
          required: false,
          placeholder: '',
          width: 'full',
          isExpanded: false,
          optionsText: '',
          value_source: 'manual',
          show_footer_sum: true,
          hidden: true,  // auto-computed — hidden from form, visible in list
        });
      }
    }
  };

  const removeSubField = (id: string) =>
    onChange(subFields.filter(f => f.id !== id));

  const moveSubField = (id: string, dir: 'up' | 'down') => {
    onChange((() => {
      const idx = subFields.findIndex(f => f.id === id);
      if (dir === 'up' && idx > 0) {
        const arr = [...subFields];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        return arr;
      }
      if (dir === 'down' && idx < subFields.length - 1) {
        const arr = [...subFields];
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
        return arr;
      }
      return subFields;
    })());
  };

  // Exclude sub_form and edit_with_new from sub-form picker (no nesting)
  const availableTypes = FIELD_TYPES.filter(t => t.type !== 'sub_form' && t.type !== 'edit_with_new');

  // allParentFields is accepted but not used directly here; sub-field siblings are subFields
  void allParentFields;

  return (
    <div className="space-y-3">
      {/* Field type picker — same as main builder minus sub_form */}
      <div className="flex flex-wrap gap-1.5">
        {availableTypes.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => addSubField(type)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-violet-200 rounded-lg hover:bg-violet-50 hover:border-violet-400 hover:text-violet-700 transition-colors"
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {subFields.length === 0 && (
        <p className="text-xs text-gray-400 italic">Click a field type above to add columns.</p>
      )}

      {/* Sub-field cards */}
      {subFields.map((sf, idx) => (
        <div key={sf.id} className="bg-white border border-violet-100 rounded-lg overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-50/50">
            <span className="text-xs badge-primary shrink-0">{sf.type}</span>
            <span className="text-sm font-medium text-gray-800 flex-1 truncate">{sf.label}</span>
            <span className="text-xs font-mono text-gray-400">{sf.key}</span>
            {sf.required && <span className="text-red-400 text-xs font-medium">*</span>}
            <div className="flex items-center gap-0.5 ml-1">
              <button type="button" onClick={() => moveSubField(sf.id!, 'up')} disabled={idx === 0}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp size={13} /></button>
              <button type="button" onClick={() => moveSubField(sf.id!, 'down')} disabled={idx === subFields.length - 1}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown size={13} /></button>
              <button type="button" onClick={() => updateSubField(sf.id!, { isExpanded: !sf.isExpanded })}
                className="p-1 text-gray-400 hover:text-indigo-600">
                {sf.isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button type="button" onClick={() => removeSubField(sf.id!)}
                className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
            </div>
          </div>

          {/* Expanded settings — full parity via FieldSettingsPanel */}
          {sf.isExpanded && (
            <div className="px-3 pb-3">
              <FieldSettingsPanel
                field={sf}
                allFields={subFields}
                onUpdate={patch => updateSubField(sf.id!, patch)}
                generateKey={generateKey}
                isSubField={true}
                parentSubFormKey={parentSubFormKey}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FormBuilder({ onSuccess, initialConfig }: FormBuilderProps) {
  const isEditMode = Boolean(initialConfig);
  const queryClient = useQueryClient();

  const [formName, setFormName] = useState(initialConfig?.form_name ?? '');
  const [displayName, setDisplayName] = useState(initialConfig?.display_name ?? '');
  const [category, setCategory] = useState(initialConfig?.category ?? '');
  const [fields, setFields] = useState<BuilderField[]>(
    initialConfig?.fields ? configToBuilderFields(initialConfig.fields) : []
  );
  const [layout, setLayout] = useState<'vertical' | 'horizontal' | 'grid'>(
    (initialConfig?.layout as 'vertical' | 'horizontal' | 'grid') ?? 'vertical'
  );

  const createMutation = useMutation({
    mutationFn: (data: object) => formsAPI.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['list-page'] });
      toast.success(`Form "${formName}" created successfully!`);
      onSuccess?.(formName);
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to create form');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => formsAPI.updateConfig(formName, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-config', formName] });
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['list-page'] });
      toast.success('Form updated successfully!');
      onSuccess?.(formName);
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to update form');
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
      // API select defaults
      ...(type === 'api_select' || type === 'dependent_select' ? {
        api_source: 'url' as const,
        source_form: '',
        api_url: '', api_method: 'GET' as const,
        response_path: 'data', display_key: 'name', value_key: 'id',
        table_value_key: '',
        api_auth_type: 'none' as const,
        api_auth_token: '', api_auth_username: '', api_auth_password: '',
        api_body: '',
        searchable_dropdown: false,
        api_filters: [] as ApiFilter[],
      } : {}),
      // Date / datetime / time — format + timezone + default now
      ...(type === 'date' || type === 'datetime' || type === 'time' ? {
        date_format: 'DD/MM/YYYY' as const,
        time_format: '24h' as const,
        field_timezone: '',
        default_now: false,
      } : {}),
      depends_on: type === 'dependent_select' ? '' : undefined,
      filter_key: type === 'dependent_select' ? '' : undefined,
      // Number / currency defaults
      ...(type === 'number' || type === 'currency' ? {
        value_source: 'manual' as const,
        formula: '',
        api_url: '', api_method: 'GET' as const,
        response_path: '', value_key: '',
        api_auth_type: 'none' as const,
        api_auth_token: '', api_auth_username: '', api_auth_password: '',
        api_body: '',
        lookup_field_key: '',
        lookup_source_field: '',
        condition_field: '',
        conditions: [],
        condition_default_formula: '',
        ...(type === 'currency' ? { currency_symbol: '' } : {}),
      } : {}),
      // Textarea defaults
      ...(type === 'textarea' ? {
        value_source: 'manual' as const,
        lookup_field_key: '',
        lookup_source_field: '',
      } : {}),
      // Text field combined value defaults
      ...(type === 'text' ? {
        value_source: 'manual' as const,
        combined_template: '',
        lookup_field_key: '',
        lookup_source_field: '',
      } : {}),
      // Sub form defaults
      ...(type === 'sub_form' ? {
        subFormBuilderFields: [],
        update_enabled: false,
        update_targets: [],
      } : {}),
      // Edit With New defaults
      ...(type === 'edit_with_new' ? {
        reference_key: '',
        update_on_save: false,
        ewn_update_rules: [] as EditWithNewRule[],
      } : {}),
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

  const buildPayload = () => {
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
      show_footer_sum: f.show_footer_sum ?? false,
      // API select
      api_url:           f.api_url,
      api_method:        f.api_method,
      response_path:     f.response_path,
      display_key:       f.display_key,
      value_key:         f.value_key,
      // Auth
      api_auth_type:     f.api_auth_type,
      api_auth_token:    f.api_auth_token,
      api_auth_username: f.api_auth_username,
      api_auth_password: f.api_auth_password,
      // POST body
      api_body:          f.api_body,
      // Dependent select
      depends_on:        f.depends_on,
      filter_key:        f.filter_key,
      // Extra filters (api_select + dependent_select)
      api_filters:       f.api_filters ?? [],
      // Searchable dropdown / value source
      searchable_dropdown: f.searchable_dropdown,
      api_source:        f.api_source,
      source_form:       f.source_form,
      value_source:      f.value_source,
      formula:           f.formula,
      // API select list display
      table_value_key:   f.table_value_key ?? '',
      // Date / datetime / time
      date_format:       f.date_format ?? 'DD/MM/YYYY',
      time_format:       f.time_format ?? '24h',
      field_timezone:    f.field_timezone ?? '',
      default_now:       f.default_now ?? false,
      // Uniqueness
      is_unique:         f.is_unique ?? false,
      // Inline list edit
      edit_on_list:      f.edit_on_list ?? false,
      // Combined text field
      combined_template: f.combined_template ?? '',
      // Currency symbol
      currency_symbol: f.currency_symbol ?? '',
      // Hidden flag
      hidden: f.hidden ?? false,
      // Sub form fields
      sub_form_fields: (f.subFormBuilderFields ?? []).map((sf, si) => ({
        label: sf.label ?? '',
        key: sf.key ?? `col_${si}`,
        type: sf.type ?? 'text',
        required: sf.required ?? false,
        placeholder: sf.placeholder ?? '',
        width: sf.width ?? 'full',
        order: si,
        options: sf.optionsText
          ? sf.optionsText.split(',').map(o => ({ label: o.trim(), value: o.trim().toLowerCase().replace(/\s+/g, '_') }))
          : (sf.options ?? []),
        is_searchable:   sf.is_searchable  ?? false,
        is_sortable:     sf.is_sortable    ?? false,
        show_footer_sum: sf.show_footer_sum ?? false,
        is_unique:       sf.is_unique      ?? false,
        edit_on_list:    sf.edit_on_list   ?? false,
        hidden:          sf.hidden         ?? false,
        api_url:           sf.api_url           ?? '',
        api_method:        sf.api_method        ?? 'GET',
        response_path:     sf.response_path     ?? 'data',
        display_key:       sf.display_key       ?? 'name',
        value_key:         sf.value_key         || ((sf.api_source ?? 'url') === 'form' ? '_id' : 'id'),
        api_auth_type:     sf.api_auth_type     ?? 'none',
        api_auth_token:    sf.api_auth_token    ?? '',
        api_auth_username: sf.api_auth_username ?? '',
        api_auth_password: sf.api_auth_password ?? '',
        api_body:          sf.api_body          ?? '',
        depends_on:        sf.depends_on        ?? '',
        filter_key:        sf.filter_key        ?? '',
        searchable_dropdown: sf.searchable_dropdown ?? false,
        api_source:        sf.api_source        ?? 'url',
        source_form:       sf.source_form       ?? '',
        value_source:      sf.value_source      ?? 'manual',
        formula:           sf.formula           ?? '',
        table_value_key:   sf.table_value_key   ?? '',
        date_format:       sf.date_format       ?? 'DD/MM/YYYY',
        time_format:       sf.time_format       ?? '24h',
        field_timezone:    sf.field_timezone    ?? '',
        default_now:       sf.default_now       ?? false,
        combined_template: sf.combined_template ?? '',
        lookup_field_key:  sf.lookup_field_key  ?? '',
        lookup_source_field: sf.lookup_source_field ?? '',
        sum_to_main:       sf.sum_to_main       ?? false,
        condition_field:   sf.condition_field   ?? '',
        conditions:        sf.conditions        ?? [],
        condition_default_formula: sf.condition_default_formula ?? '',
        api_filters:       sf.api_filters       ?? [],
        sub_form_fields: [],  // no deeper nesting
      })),
      // Field lookup (text field only)
      lookup_field_key: f.lookup_field_key ?? '',
      lookup_source_field: f.lookup_source_field ?? '',
      // Conditional formula
      condition_field:   f.condition_field   ?? '',
      conditions:        f.conditions        ?? [],
      condition_default_formula: f.condition_default_formula ?? '',
      // Sub-form update keys
      update_enabled:  f.update_enabled  ?? false,
      update_targets:  f.update_targets  ?? [],
      // Edit-with-new config
      reference_key:     f.reference_key    ?? '',
      update_on_save:    f.update_on_save   ?? false,
      ewn_update_rules:  f.ewn_update_rules ?? [],
    }));
    return formFields;
  };

  const handleSave = () => {
    if (!formName) {
      toast.error('Form name is required');
      return;
    }
    if (fields.length === 0) {
      toast.error('Add at least one field');
      return;
    }

    const formFields = buildPayload();

    if (isEditMode) {
      updateMutation.mutate({
        display_name: displayName || formName,
        category,
        layout,
        fields: formFields,
      });
    } else {
      createMutation.mutate({
        form_name: formName,
        display_name: displayName || formName,
        category,
        type: 'input',
        layout,
        fields: formFields,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? 'Edit Form' : 'Form Configuration'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Form Name (ID) *</label>
            <input
              type="text"
              className={`form-input font-mono ${isEditMode ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
              placeholder="purchase_entry"
              value={formName}
              onChange={e => !isEditMode && setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              readOnly={isEditMode}
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
          <div className="col-span-2">
            <label className="form-label">Category</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Sales, Inventory, HR"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Group related forms together. Leave blank for no category.</p>
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
                <FieldSettingsPanel
                  field={field}
                  allFields={fields}
                  onUpdate={patch => updateField(field.id!, patch)}
                  generateKey={generateKey}
                  onAddPeerField={f => setFields(prev => [...prev, f])}
                />
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
          disabled={isPending || fields.length === 0}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={16} />
          {isPending
            ? (isEditMode ? 'Updating...' : 'Creating...')
            : (isEditMode ? 'Update Form' : 'Save Form')}
        </button>
      </div>
    </div>
  );
}
