// ── Core Types for Dynamic Admin Panel ──────────────────────

export type UserRole = 'super_admin' | 'company_admin' | 'developer' | 'end_user';

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
  | 'text' | 'number' | 'email' | 'phone' | 'date' | 'datetime'
  | 'select' | 'multi_select' | 'checkbox' | 'radio' | 'textarea'
  | 'file' | 'image' | 'currency' | 'percentage' | 'url' | 'color'
  | 'rating' | 'switch' | 'hidden' | 'formula' | 'relation';

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
  hidden?: boolean;
}

// ── Form Configuration ──────────────────────────────────────

export interface InputFormConfig {
  _id: string;
  form_name: string;
  display_name: string;
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
