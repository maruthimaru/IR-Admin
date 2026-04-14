/**
 * Integration Settings API Client
 * Wraps all per-company integration settings endpoints.
 */
import api from './api';

export const integrationsSettingsAPI = {
  // ── Overview ──────────────────────────────────────────────
  getOverview: () =>
    api.get('/integrations/settings/').then(r => r.data),

  // ── Payment ───────────────────────────────────────────────
  getPaymentSettings: () =>
    api.get('/integrations/settings/payment/').then(r => r.data),

  savePayment: (data: {
    provider: 'stripe' | 'razorpay';
    enabled?: boolean;
    credentials: Record<string, string>;
  }) => api.post('/integrations/settings/payment/', data).then(r => r.data),

  togglePayment: (provider: string, enabled: boolean) =>
    api.post('/integrations/settings/payment/toggle/', { provider, enabled }).then(r => r.data),

  // ── SMS ───────────────────────────────────────────────────
  getSMSSettings: () =>
    api.get('/integrations/settings/sms/').then(r => r.data),

  saveSMS: (data: {
    enabled?: boolean;
    credentials: { account_sid: string; auth_token: string; phone_number: string };
  }) => api.post('/integrations/settings/sms/', data).then(r => r.data),

  testSMS: (to_number: string) =>
    api.post('/integrations/settings/sms/test/', { to_number }).then(r => r.data),

  // ── Email ──────────────────────────────────────────────────
  getEmailSettings: () =>
    api.get('/integrations/settings/email/').then(r => r.data),

  saveEmail: (data: {
    provider: 'sendgrid' | 'smtp';
    enabled?: boolean;
    credentials: Record<string, string>;
  }) => api.post('/integrations/settings/email/', data).then(r => r.data),

  testEmail: (to_email: string) =>
    api.post('/integrations/settings/email/test/', { to_email }).then(r => r.data),

  // ── Runtime (use configured credentials) ──────────────────
  createPayment: (amount: number, currency?: string, description?: string) =>
    api.post('/integrations/payment/create/', { amount, currency, description }).then(r => r.data),

  sendSMS: (to_number: string, message: string) =>
    api.post('/integrations/sms/send/', { to_number, message }).then(r => r.data),

  sendEmail: (to_email: string, subject: string, html_content: string) =>
    api.post('/integrations/email/send/', { to_email, subject, html_content }).then(r => r.data),
};
