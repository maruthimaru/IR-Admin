'use client';

/**
 * Company Integration Settings Page
 * Allows company admins to enable/configure their own:
 *  - Payment gateway: Stripe or Razorpay
 *  - SMS: Twilio
 *  - Email: SendGrid or SMTP
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsSettingsAPI } from '@/lib/integrations-api';
import { toast } from 'react-toastify';
import {
  CreditCard, MessageSquare, Mail, CheckCircle2,
  AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp,
  Save, TestTube, ToggleLeft, ToggleRight, Zap, type LucideIcon
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type PaymentProvider = 'stripe' | 'razorpay' | null;
type EmailProvider = 'sendgrid' | 'smtp' | null;

// ── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationSettingsPage() {
  const queryClient = useQueryClient();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['integration-overview'],
    queryFn: () => integrationsSettingsAPI.getOverview(),
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integration Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure your company's payment, SMS, and email services.
          Credentials are encrypted and stored securely.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Payment Section */}
          <PaymentSection
            stripeData={overview?.integrations?.stripe}
            razorpayData={overview?.integrations?.razorpay}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['integration-overview'] })}
          />

          {/* SMS Section */}
          <SMSSection
            twilioData={overview?.integrations?.twilio}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['integration-overview'] })}
          />

          {/* Email Section */}
          <EmailSection
            sendgridData={overview?.integrations?.sendgrid}
            smtpData={overview?.integrations?.smtp}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['integration-overview'] })}
          />
        </div>
      )}
    </div>
  );
}

// ── Reusable Components ───────────────────────────────────────────────────────

function SectionCard({
  title, subtitle, icon: Icon, iconBg, iconColor, badge, children
}: {
  title: string; subtitle: string; icon: LucideIcon;
  iconBg: string; iconColor: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="card space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`${iconBg} p-3 rounded-xl`}>
            <Icon size={20} className={iconColor} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (!configured) return <span className="badge bg-gray-100 text-gray-500">Not configured</span>;
  if (enabled) return <span className="badge-success flex items-center gap-1"><CheckCircle2 size={11} /> Active</span>;
  return <span className="badge-warning flex items-center gap-1"><AlertCircle size={11} /> Disabled</span>;
}

function MaskedInput({ label, name, value, onChange, required = false }: {
  label: string; name: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="form-input pr-10 font-mono text-sm"
          placeholder={value.includes('••') ? value : ''}
          autoComplete="off"
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── Payment Section ───────────────────────────────────────────────────────────

function PaymentSection({ stripeData, razorpayData, onSaved }: {
  stripeData?: { enabled: boolean; configured: boolean; credentials: Record<string, string> };
  razorpayData?: { enabled: boolean; configured: boolean; credentials: Record<string, string> };
  onSaved: () => void;
}) {
  const [activeProvider, setActiveProvider] = useState<PaymentProvider>(
    stripeData?.configured ? 'stripe' : razorpayData?.configured ? 'razorpay' : null
  );
  const [expanded, setExpanded] = useState(!stripeData?.configured && !razorpayData?.configured);

  // Stripe form
  const [stripeForm, setStripeForm] = useState({
    secret_key: stripeData?.credentials?.secret_key || '',
    publishable_key: stripeData?.credentials?.publishable_key || '',
    webhook_secret: stripeData?.credentials?.webhook_secret || '',
  });

  // Razorpay form
  const [razorpayForm, setRazorpayForm] = useState({
    key_id: razorpayData?.credentials?.key_id || '',
    key_secret: razorpayData?.credentials?.key_secret || '',
    webhook_secret: razorpayData?.credentials?.webhook_secret || '',
  });

  type PaymentSavePayload = {
    provider: 'stripe' | 'razorpay';
    enabled?: boolean;
    credentials: Record<string, string>;
  };

  const saveMutation = useMutation({
    mutationFn: (data: PaymentSavePayload) => integrationsSettingsAPI.savePayment(data),
    onSuccess: (_, vars) => {
      toast.success(`${vars.provider === 'stripe' ? 'Stripe' : 'Razorpay'} configured successfully!`);
      setExpanded(false);
      onSaved();
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to save credentials');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ provider, enabled }: { provider: string; enabled: boolean }) =>
      integrationsSettingsAPI.togglePayment(provider, enabled),
    onSuccess: (_, { provider, enabled }) => {
      toast.success(`${provider} ${enabled ? 'enabled' : 'disabled'}`);
      onSaved();
    },
  });

  const isConfigured = stripeData?.configured || razorpayData?.configured;

  return (
    <SectionCard
      title="Payment Gateway"
      subtitle="Accept online payments from customers"
      icon={CreditCard}
      iconBg="bg-green-50"
      iconColor="text-green-600"
      badge={<StatusBadge enabled={stripeData?.enabled || razorpayData?.enabled || false} configured={!!isConfigured} />}
    >
      {/* Toggle expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {isConfigured ? 'Edit Credentials' : 'Configure Payment Gateway'}
      </button>

      {expanded && (
        <div className="space-y-5 pt-2">
          {/* Provider Tabs */}
          <div className="flex gap-2">
            {(['stripe', 'razorpay'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setActiveProvider(p)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                  activeProvider === p
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {p === 'stripe' ? '⚡ Stripe' : '🟠 Razorpay'}
                {p === 'stripe' && stripeData?.configured && (
                  <span className="ml-2 text-xs badge-success">Saved</span>
                )}
                {p === 'razorpay' && razorpayData?.configured && (
                  <span className="ml-2 text-xs badge-success">Saved</span>
                )}
              </button>
            ))}
          </div>

          {/* Stripe Form */}
          {activeProvider === 'stripe' && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                Find your keys at <strong>dashboard.stripe.com → Developers → API keys</strong>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <MaskedInput label="Secret Key" name="secret_key" required
                  value={stripeForm.secret_key}
                  onChange={v => setStripeForm(f => ({ ...f, secret_key: v }))} />
                <MaskedInput label="Publishable Key" name="publishable_key" required
                  value={stripeForm.publishable_key}
                  onChange={v => setStripeForm(f => ({ ...f, publishable_key: v }))} />
                <MaskedInput label="Webhook Secret (optional)" name="webhook_secret"
                  value={stripeForm.webhook_secret}
                  onChange={v => setStripeForm(f => ({ ...f, webhook_secret: v }))} />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => saveMutation.mutate({ provider: 'stripe' as const, credentials: stripeForm, enabled: true })}
                  disabled={saveMutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save size={14} />
                  {saveMutation.isPending ? 'Saving...' : 'Save & Verify'}
                </button>
                {stripeData?.configured && (
                  <button
                    onClick={() => toggleMutation.mutate({ provider: 'stripe', enabled: !stripeData.enabled })}
                    className="btn-secondary flex items-center gap-1.5 text-sm"
                  >
                    {stripeData.enabled
                      ? <><ToggleRight size={16} className="text-green-500" /> Disable</>
                      : <><ToggleLeft size={16} /> Enable</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Razorpay Form */}
          {activeProvider === 'razorpay' && (
            <div className="space-y-4">
              <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-700">
                Find your keys at <strong>dashboard.razorpay.com → Settings → API Keys</strong>.
                Best for INR / Indian payments.
              </div>
              <div className="grid grid-cols-1 gap-4">
                <MaskedInput label="Key ID" name="key_id" required
                  value={razorpayForm.key_id}
                  onChange={v => setRazorpayForm(f => ({ ...f, key_id: v }))} />
                <MaskedInput label="Key Secret" name="key_secret" required
                  value={razorpayForm.key_secret}
                  onChange={v => setRazorpayForm(f => ({ ...f, key_secret: v }))} />
                <MaskedInput label="Webhook Secret (optional)" name="webhook_secret"
                  value={razorpayForm.webhook_secret}
                  onChange={v => setRazorpayForm(f => ({ ...f, webhook_secret: v }))} />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => saveMutation.mutate({ provider: 'razorpay' as const, credentials: razorpayForm, enabled: true })}
                  disabled={saveMutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save size={14} />
                  {saveMutation.isPending ? 'Saving...' : 'Save & Verify'}
                </button>
                {razorpayData?.configured && (
                  <button
                    onClick={() => toggleMutation.mutate({ provider: 'razorpay', enabled: !razorpayData.enabled })}
                    className="btn-secondary flex items-center gap-1.5 text-sm"
                  >
                    {razorpayData.enabled
                      ? <><ToggleRight size={16} className="text-green-500" /> Disable</>
                      : <><ToggleLeft size={16} /> Enable</>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── SMS Section ────────────────────────────────────────────────────────────────

function SMSSection({ twilioData, onSaved }: {
  twilioData?: { enabled: boolean; configured: boolean; credentials: Record<string, string> };
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(!twilioData?.configured);
  const [testNumber, setTestNumber] = useState('');
  const [form, setForm] = useState({
    account_sid: twilioData?.credentials?.account_sid || '',
    auth_token: twilioData?.credentials?.auth_token || '',
    phone_number: twilioData?.credentials?.phone_number || '',
  });

  type SMSSavePayload = {
    enabled?: boolean;
    credentials: { account_sid: string; auth_token: string; phone_number: string };
  };

  const saveMutation = useMutation({
    mutationFn: (data: SMSSavePayload) => integrationsSettingsAPI.saveSMS(data),
    onSuccess: () => {
      toast.success('Twilio SMS configured!');
      setExpanded(false);
      onSaved();
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to save');
    },
  });

  const testMutation = useMutation({
    mutationFn: (number: string) => integrationsSettingsAPI.testSMS(number),
    onSuccess: () => toast.success('Test SMS sent! Check your phone.'),
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Test failed');
    },
  });

  return (
    <SectionCard
      title="SMS (Twilio)"
      subtitle="Send OTPs, notifications, and alerts via SMS"
      icon={MessageSquare}
      iconBg="bg-red-50"
      iconColor="text-red-600"
      badge={<StatusBadge enabled={twilioData?.enabled || false} configured={!!twilioData?.configured} />}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {twilioData?.configured ? 'Edit Credentials' : 'Configure Twilio'}
      </button>

      {expanded && (
        <div className="space-y-4">
          <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700">
            Get credentials at <strong>console.twilio.com → Account Info</strong>.
            Phone number from <strong>Phone Numbers → Active Numbers</strong>.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <MaskedInput label="Account SID" name="account_sid" required
                value={form.account_sid}
                onChange={v => setForm(f => ({ ...f, account_sid: v }))} />
            </div>
            <div className="col-span-2">
              <MaskedInput label="Auth Token" name="auth_token" required
                value={form.auth_token}
                onChange={v => setForm(f => ({ ...f, auth_token: v }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Twilio Phone Number *</label>
              <input
                type="text"
                value={form.phone_number}
                onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                className="form-input font-mono"
                placeholder="+14155552671"
              />
              <p className="text-xs text-gray-400 mt-1">E.164 format: +[country code][number]</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => saveMutation.mutate({ credentials: form, enabled: true })}
              disabled={saveMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Verifying...' : 'Save & Verify'}
            </button>
          </div>

          {/* Test SMS */}
          {twilioData?.configured && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-2">Test your configuration</p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={testNumber}
                  onChange={e => setTestNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="form-input flex-1 text-sm"
                />
                <button
                  onClick={() => testMutation.mutate(testNumber)}
                  disabled={!testNumber || testMutation.isPending}
                  className="btn-secondary flex items-center gap-1.5 text-sm whitespace-nowrap"
                >
                  <TestTube size={14} />
                  Send Test SMS
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Email Section ─────────────────────────────────────────────────────────────

function EmailSection({ sendgridData, smtpData, onSaved }: {
  sendgridData?: { enabled: boolean; configured: boolean; credentials: Record<string, string> };
  smtpData?: { enabled: boolean; configured: boolean; credentials: Record<string, string> };
  onSaved: () => void;
}) {
  const [activeProvider, setActiveProvider] = useState<EmailProvider>(
    sendgridData?.configured ? 'sendgrid' : smtpData?.configured ? 'smtp' : null
  );
  const [expanded, setExpanded] = useState(!sendgridData?.configured && !smtpData?.configured);
  const [testEmail, setTestEmail] = useState('');

  const [sendgridForm, setSendgridForm] = useState({
    api_key: sendgridData?.credentials?.api_key || '',
    from_email: sendgridData?.credentials?.from_email || '',
  });

  const [smtpForm, setSmtpForm] = useState({
    host: smtpData?.credentials?.host || 'smtp.gmail.com',
    port: smtpData?.credentials?.port || '587',
    username: smtpData?.credentials?.username || '',
    password: smtpData?.credentials?.password || '',
  });

  type EmailSavePayload = {
    provider: 'sendgrid' | 'smtp';
    enabled?: boolean;
    credentials: Record<string, string>;
  };

  const saveMutation = useMutation({
    mutationFn: (data: EmailSavePayload) => integrationsSettingsAPI.saveEmail(data),
    onSuccess: () => {
      toast.success('Email configured!');
      setExpanded(false);
      onSaved();
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to save');
    },
  });

  const testMutation = useMutation({
    mutationFn: (email: string) => integrationsSettingsAPI.testEmail(email),
    onSuccess: () => toast.success('Test email sent! Check your inbox.'),
    onError: () => toast.error('Test email failed'),
  });

  const isConfigured = sendgridData?.configured || smtpData?.configured;

  return (
    <SectionCard
      title="Email Service"
      subtitle="Send transactional emails, OTPs, and invoices"
      icon={Mail}
      iconBg="bg-blue-50"
      iconColor="text-blue-600"
      badge={<StatusBadge enabled={sendgridData?.enabled || smtpData?.enabled || false} configured={!!isConfigured} />}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {isConfigured ? 'Edit Credentials' : 'Configure Email'}
      </button>

      {expanded && (
        <div className="space-y-5">
          {/* Provider Tabs */}
          <div className="flex gap-2">
            {(['sendgrid', 'smtp'] as const).map(p => (
              <button key={p} type="button" onClick={() => setActiveProvider(p)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                  activeProvider === p
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {p === 'sendgrid' ? '📧 SendGrid' : '⚙️ SMTP'}
                {p === 'sendgrid' && sendgridData?.configured && (
                  <span className="ml-2 text-xs badge-success">Saved</span>
                )}
                {p === 'smtp' && smtpData?.configured && (
                  <span className="ml-2 text-xs badge-success">Saved</span>
                )}
              </button>
            ))}
          </div>

          {activeProvider === 'sendgrid' && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                Get your API key at <strong>app.sendgrid.com → Settings → API Keys</strong>
              </div>
              <MaskedInput label="SendGrid API Key" name="api_key" required
                value={sendgridForm.api_key}
                onChange={v => setSendgridForm(f => ({ ...f, api_key: v }))} />
              <div>
                <label className="form-label">From Email</label>
                <input type="email" value={sendgridForm.from_email}
                  onChange={e => setSendgridForm(f => ({ ...f, from_email: e.target.value }))}
                  className="form-input" placeholder="noreply@yourcompany.com" />
              </div>
              <button
                onClick={() => saveMutation.mutate({ provider: 'sendgrid' as const, credentials: sendgridForm, enabled: true })}
                disabled={saveMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={14} />
                {saveMutation.isPending ? 'Saving...' : 'Save & Verify'}
              </button>
            </div>
          )}

          {activeProvider === 'smtp' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                Works with Gmail (App Password), Outlook, or any SMTP server.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">SMTP Host *</label>
                  <input type="text" value={smtpForm.host}
                    onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))}
                    className="form-input" placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className="form-label">Port</label>
                  <input type="number" value={smtpForm.port}
                    onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))}
                    className="form-input" placeholder="587" />
                </div>
                <div>
                  <label className="form-label">Username *</label>
                  <input type="text" value={smtpForm.username}
                    onChange={e => setSmtpForm(f => ({ ...f, username: e.target.value }))}
                    className="form-input" placeholder="you@gmail.com" />
                </div>
                <MaskedInput label="Password / App Password *" name="smtp_password"
                  value={smtpForm.password}
                  onChange={v => setSmtpForm(f => ({ ...f, password: v }))} />
              </div>
              <button
                onClick={() => saveMutation.mutate({ provider: 'smtp' as const, credentials: smtpForm, enabled: true })}
                disabled={saveMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={14} />
                {saveMutation.isPending ? 'Saving...' : 'Save & Verify'}
              </button>
            </div>
          )}

          {/* Test Email */}
          {isConfigured && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-2">Test your configuration</p>
              <div className="flex gap-2">
                <input type="email" value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="send test to..."
                  className="form-input flex-1 text-sm" />
                <button
                  onClick={() => testMutation.mutate(testEmail)}
                  disabled={!testEmail || testMutation.isPending}
                  className="btn-secondary flex items-center gap-1.5 text-sm whitespace-nowrap"
                >
                  <TestTube size={14} />
                  Send Test Email
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
