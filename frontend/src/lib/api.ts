/**
 * API Client - Axios instance with JWT auth, refresh, and error handling
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - attach JWT token + X-Tenant header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Attach tenant subdomain for local dev (where subdomain routing isn't active)
      try {
        const tenantRaw = localStorage.getItem('tenant-storage');
        if (tenantRaw) {
          const tenantState = JSON.parse(tenantRaw);
          const subdomain = tenantState?.state?.company?.subdomain;
          if (subdomain) {
            config.headers['X-Tenant'] = subdomain;
          }
        }
      } catch { /* ignore */ }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/api/v1/auth/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;
        localStorage.setItem('access_token', access);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access}`;
        }

        return api(originalRequest);
      } catch {
        // Refresh failed - clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// ── API Methods ───────────────────────────────────────────────

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login/', { email, password }),
  tenantLogin: (subdomain: string, email: string, password: string) =>
    api.post('/auth/tenant-login/', { subdomain, email, password }),
  register: (data: object) =>
    api.post('/auth/register/', data),
  logout: (refresh: string) =>
    api.post('/auth/logout/', { refresh }),
  verify: () =>
    api.get('/auth/verify/'),
  getProfile: () =>
    api.get('/auth/profile/'),
  updateProfile: (data: object) =>
    api.put('/auth/profile/', data),
  changePassword: (data: object) =>
    api.post('/auth/change-password/', data),
  refreshToken: (refresh: string) =>
    api.post('/auth/refresh/', { refresh }),
};

export const companiesAPI = {
  list: (params?: object) =>
    api.get('/core/companies/', { params }),
  create: (data: object) =>
    api.post('/core/companies/', data),
  get: (id: string) =>
    api.get(`/core/companies/${id}/`),
  update: (id: string, data: object) =>
    api.put(`/core/companies/${id}/`, data),
  deactivate: (id: string) =>
    api.delete(`/core/companies/${id}/`),
  reactivate: (id: string) =>
    api.put(`/core/companies/${id}/`, { is_active: true }),
};

export const dashboardAPI = {
  getStats: () =>
    api.get('/core/dashboard/'),
};

export const formsAPI = {
  // Config CRUD
  listConfigs: (params?: object) =>
    api.get('/forms/configs/', { params }),
  createConfig: (data: object) =>
    api.post('/forms/configs/', data),
  getConfig: (formName: string) =>
    api.get(`/forms/configs/${formName}/`),
  updateConfig: (formName: string, data: object) =>
    api.put(`/forms/configs/${formName}/`, data),
  deleteConfig: (formName: string) =>
    api.delete(`/forms/configs/${formName}/`),

  // Records (runtime data)
  listRecords: (formName: string, params?: object) =>
    api.get(`/forms/records/${formName}/`, { params }),
  createRecord: (formName: string, data: object) =>
    api.post(`/forms/records/${formName}/`, data),
  getRecord: (formName: string, recordId: string) =>
    api.get(`/forms/records/${formName}/${recordId}/`),
  updateRecord: (formName: string, recordId: string, data: object) =>
    api.put(`/forms/records/${formName}/${recordId}/`, data),
  deleteRecord: (formName: string, recordId: string) =>
    api.delete(`/forms/records/${formName}/${recordId}/`),

  // Bulk operations
  bulkUpdateRecords: (formName: string, recordIds: string[], updates: object) =>
    api.patch(`/forms/records/${formName}/bulk-update/`, { record_ids: recordIds, updates }),
  bulkDeleteRecords: (formName: string, recordIds: string[]) =>
    api.delete(`/forms/records/${formName}/bulk-delete/`, { data: { record_ids: recordIds } }),

  // Export / Import
  exportRecords: (formName: string) =>
    api.get(`/forms/records/${formName}/export/`, { responseType: 'blob' }),
  importRecords: (formName: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/forms/records/${formName}/import/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // List page
  getListPageData: (pageName: string, params?: object) =>
    api.get(`/forms/list-page/${pageName}/`, { params }),
};

export const reportsAPI = {
  list:    (params?: object) => api.get('/forms/reports/', { params }),
  create:  (data: object)   => api.post('/forms/reports/', data),
  get:     (name: string)   => api.get(`/forms/reports/${name}/`),
  update:  (name: string, data: object) => api.put(`/forms/reports/${name}/`, data),
  delete:  (name: string)   => api.delete(`/forms/reports/${name}/`),
  getData: (name: string, params?: object) => api.get(`/forms/reports/${name}/data/`, { params }),
};

export const integrationsAPI = {
  createPaymentIntent: (amount: number, currency?: string) =>
    api.post('/integrations/payment/create-intent/', { amount, currency }),
  confirmPayment: (paymentIntentId: string) =>
    api.post('/integrations/payment/confirm/', { payment_intent_id: paymentIntentId }),
  createRefund: (paymentIntentId: string, amount?: number) =>
    api.post('/integrations/payment/refund/', { payment_intent_id: paymentIntentId, amount }),
  sendEmail: (data: object) =>
    api.post('/integrations/email/send/', data),
  sendOtpEmail: (email: string, name?: string) =>
    api.post('/integrations/email/send-otp/', { email, name }),
  sendSms: (phoneNumber: string, message: string) =>
    api.post('/integrations/sms/send/', { phone_number: phoneNumber, message }),
  sendOtpSms: (phoneNumber: string) =>
    api.post('/integrations/sms/send-otp/', { phone_number: phoneNumber }),
  getStatus: () =>
    api.get('/integrations/status/'),
};

export default api;
