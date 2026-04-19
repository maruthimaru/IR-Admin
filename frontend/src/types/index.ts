// ── Core Types for Dynamic Admin Panel ──────────────────────

export type UserRole = 'super_admin' | 'company_admin' | 'developer' | 'end_user';

export interface ConditionRule {
  when: string;
  formula: string;
}

export interface ApiFilter {
  param: string;           // field key (form source) or query param name (URL source)
  value_type: 'static' | 'dynamic';
  static_value?: string;
  field_key?: string;      // other field in the same form (dynamic mode)
}

export interface SubFormUpdateTarget {
  target_form: string;
  lookup_key: string;
  rules: SubFormUpdateRule[];
  delete_rules?: SubFormUpdateRule[];
}

export interface SubFormUpdateCondition {
  when: string;   // value of condition_field that triggers this mapping
  value: string;  // static value to set in the target record
}

export interface SubFormUpdateRule {
  to_key: string;       // field key in the target record (field to write)
  operation: 'set' | 'increment' | 'decrement' | 'multiply';
  // value source
  value_type?: 'field' | 'static' | 'conditional';  // default: 'field'
  from_key?: string;           // used when value_type = 'field'
  static_value?: string;       // used when value_type = 'static'
  condition_field?: string;    // sub-form field to check (value_type = 'conditional')
  condition_map?: SubFormUpdateCondition[];
  default_value?: string;      // fallback when no condition matches
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  company_id?: string;
  phone?: string;
  avatar?: string;
  is_active: boolean;
  date_joined: string;
  last_login?: string;
}

export interface Company {
  _id: string;
  name: string;
  subdomain: string;
  db_name: string;
  plan: 'basic' | 'pro' | 'enterprise';
  is_active: boolean;
  created_at: string;
  contact_email?: string;
  contact_phone?: string;
  custom_domain?: string;
  settings: {
    timezone: string;
    currency: string;
    language: string;
  };
}

// ── Field Types ──────────────────────────────────────────────

export type FieldType =
  | 'text' | 'number' | 'email' | 'phone' | 'date' | 'datetime' | 'time'
  | 'select' | 'multi_select' | 'checkbox' | 'radio' | 'textarea'
  | 'file' | 'image' | 'currency' | 'percentage' | 'url' | 'color'
  | 'rating' | 'switch' | 'hidden' | 'formula' | 'relation'
  | 'api_select' | 'dependent_select' | 'uid' | 'sub_form' | 'edit_with_new';

export interface EditWithNewRule {
  field_key: string;
  value: string;
}

export interface FieldOption {
  label: string;
  value: string | number;
}

export interface FieldValidation {
  min?: number | null;
  max?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  pattern?: string | null;
  custom_message?: string | null;
}

export interface FormField {
  label: string;
  key: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  default_value?: unknown;
  options?: FieldOption[];
  validation?: FieldValidation;
  order: number;
  width: 'full' | 'half' | 'third';
  help_text?: string;
  is_searchable?: boolean;
  is_sortable?: boolean;
  show_footer_sum?: boolean;
  hidden?: boolean;
  // API-driven select fields
  api_url?: string;
  api_method?: 'GET' | 'POST';
  response_path?: string;       // dot-notation path to the array, e.g. "data" or "result.items"
  display_key?: string;         // object key to use as label, e.g. "name"
  value_key?: string;           // object key to use as value, e.g. "id"
  // Auth
  api_auth_type?: 'none' | 'basic' | 'bearer';
  api_auth_token?: string;      // Bearer token value
  api_auth_username?: string;   // Basic auth username
  api_auth_password?: string;   // Basic auth password
  // POST body
  api_body?: string;            // Raw JSON body string
  // Dependent select
  depends_on?: string;          // key of the parent field
  filter_key?: string;          // query-param name to pass parent value, e.g. "country_id"
  // Additional filter params (api_select + dependent_select)
  api_filters?: ApiFilter[];
  // Searchable combobox (api_select / dependent_select)
  searchable_dropdown?: boolean;
  // Data source for api_select / dependent_select
  api_source?: 'url' | 'form';   // default 'url'
  source_form?: string;           // input form name when api_source === 'form'
  // Number / currency / text value source
  value_source?: 'manual' | 'api' | 'formula' | 'combined' | 'field_lookup' | 'conditional';
  formula?: string;             // e.g. "price * quantity" using other field keys
  // API select — label stored alongside the value for list display
  table_value_key?: string;
  // Currency symbol
  currency_symbol?: string;    // e.g. '$', '€', '₹', '£'
  // Date / datetime / time — display format, timezone and default
  date_format?: string;        // e.g. 'DD/MM/YYYY'
  time_format?: '24h' | '12h';
  field_timezone?: string;     // IANA timezone override, e.g. 'Asia/Kolkata'
  default_now?: boolean;
  // Uniqueness constraint
  is_unique?: boolean;
  // Inline editing in list view
  edit_on_list?: boolean;
  // Combined text field (value auto-built from other fields + sequential number)
  combined_template?: string;  // e.g. "{{category}}-{{supplier_code}}-{{auto_generate}}"
  // Sub-form field (multi-row table inline)
  sub_form_fields?: FormField[];
  // Sum all rows of this sub-form column into a main-form field
  sum_to_main?: boolean;
  // Conditional formula (value_source === 'conditional')
  condition_field?: string;
  conditions?: ConditionRule[];
  condition_default_formula?: string;
  // Field lookup — auto-populate from a form-source dropdown
  lookup_field_key?: string;
  lookup_source_field?: string;
  // Sub-form record update on save (sub_form type only)
  update_enabled?: boolean;
  update_targets?: SubFormUpdateTarget[];  // one entry per target collection
  // Edit-with-new field config
  reference_key?: string;
  update_on_save?: boolean;
  ewn_update_rules?: EditWithNewRule[];
}

// ── Form Configuration ──────────────────────────────────────

export interface InputFormConfig {
  _id: string;
  form_name: string;
  display_name: string;
  category?: string;
  type: 'input';
  fields: FormField[];
  settings: {
    allow_edit: boolean;
    allow_delete: boolean;
    require_confirmation: boolean;
    max_records?: number;
  };
  layout: 'vertical' | 'horizontal' | 'grid';
  created_at: string;
  is_active: boolean;
}

export interface ListPageConfig {
  _id: string;
  form_name: string;
  display_name: string;
  type: 'list';
  form_ref: string;
  columns: string[];
  footer: Record<string, 'sum' | 'avg' | 'min' | 'max' | 'count'>;
  actions: ('edit' | 'delete' | 'view')[];
  filters: FormField[];
  sorting: { field: string; order: 'asc' | 'desc' };
  pagination: { enabled: boolean; page_size: number };
  search: { enabled: boolean; fields: string[] };
  export: { enabled: boolean; formats: string[] };
  created_at: string;
}

export type FormConfig = InputFormConfig | ListPageConfig;

// ── API Response Types ──────────────────────────────────────

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  user: User;
}

export interface ApiError {
  error?: string;
  errors?: Record<string, string>;
  detail?: string;
}

// ── Dashboard Types ─────────────────────────────────────────

export interface SuperAdminStats {
  total_companies: number;
  active_companies: number;
  total_users: number;
  active_users: number;
}

export interface TenantStats {
  total_forms: number;
  total_records: number;
  recent_activity: AuditLog[];
}

export interface AuditLog {
  _id: string;
  action: string;
  collection?: string;
  record_id?: string;
  user_id: string;
  created_at: string;
}

// ── Payment Types ────────────────────────────────────────────

export interface PaymentIntent {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
}

// ── Report (Join) Types ──────────────────────────────────────

export interface ReportJoin {
  collection: string;    // input form name (e.g. "branch")
  local_field: string;   // field in base collection (e.g. "branch_id")
  foreign_field: string; // field in joined collection (usually "_id")
  as: string;            // alias used in result (e.g. "branch")
}

export interface ReportColumn {
  key: string;    // dot-notation key: "field" or "alias.field"
  label: string;  // display label
  source: string; // "base" | join alias
}

export interface ReportConfig {
  _id: string;
  form_name: string;
  display_name: string;
  category?: string;
  type: 'report';
  base_collection: string;
  joins: ReportJoin[];
  columns: ReportColumn[];
  created_at: string;
  is_active: boolean;
}

// ── Store Types (Zustand) ────────────────────────────────────

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (tokens: AuthTokens) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export interface TenantState {
  company: Company | null;
  dbName: string | null;
  setCompany: (company: Company) => void;
  clearCompany: () => void;
}
