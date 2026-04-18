'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import TenantShell from '@/components/tenant/TenantShell';
import {
  CreditCard, MessageSquare, Mail, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Loader2, Send, Eye, EyeOff,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ configured, enabled }: { configured: boolean; enabled: boolean }) {
  if (!configured) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
      <XCircle size={11} /> Not configured
    </span>
  );
  if (enabled) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
      <CheckCircle2 size={11} /> Active
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
      <XCircle size={11} /> Disabled
    </span>
  );
}

function MaskedInput({
  label, name, value, onChange, placeholder, required,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isSecret = name.toLowerCase().includes('key') ||
    name.toLowerCase().includes('secret') ||
    name.toLowerCase().includes('token') ||
    name.toLowerCase().includes('password');

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={isSecret && !show ? 'password' : 'text'}
          className="form-input pr-9 text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {isSecret && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setShow(s => !s)}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon, title, badge, children, defaultOpen = false,
}: {
  icon: React.ElementType; title: string; badge?: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
            <Icon size={18} />
          </div>
          <span className="font-semibold text-gray-900">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ── Payment Section ──────────────────────────────────────────────────────────

function PaymentSection() {
  const qc = useQueryClient();
  const [activeProvider, setActiveProvider] = useState<'stripe' | 'razorpay' | 'cod'>('stripe');

  const [stripeForm, setStripeForm] = useState({ secret_key: '', publishable_key: '', webhook_secret: '' });
  const [razorpayForm, setRazorpayForm] = useState({ key_id: '', key_secret: '', webhook_secret: '' });
  const [codForm, setCodForm] = useState({ instructions: '', max_order_amount: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['integration-payment'],
    queryFn: () => integrationsAPI.getPaymentSettings().then(r => r.data),
  });

  const { data: codData, isLoading: codLoading } = useQuery({
    queryKey: ['integration-cod'],
    queryFn: () => integrationsAPI.getCodSettings().then(r => r.data),
  });

  const stripe = data?.stripe ?? { enabled: false, configured: false, credentials: {} };
  const razorpay = data?.razorpay ?? { enabled: false, configured: false, credentials: {} };
  const cod = codData ?? { enabled: false, configured: false, credentials: {} };

  const saveMutation = useMutation({
    mutationFn: (payload: { provider: string; enabled: boolean; credentials: object }) =>
      integrationsAPI.savePaymentSettings(payload),
    onSuccess: (_, vars) => {
      toast.success(`${vars.provider === 'stripe' ? 'Stripe' : 'Razorpay'} saved successfully`);
      qc.invalidateQueries({ queryKey: ['integration-payment'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to save');
    },
  });

  const saveCodMutation = useMutation({
    mutationFn: (payload: object) => integrationsAPI.saveCodSettings(payload),
    onSuccess: () => {
      toast.success('COD settings saved');
      qc.invalidateQueries({ queryKey: ['integration-cod'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to save');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ provider, enabled }: { provider: string; enabled: boolean }) =>
      integrationsAPI.togglePayment(provider, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration-payment'] });
    },
  });

  const handleSave = () => {
    if (activeProvider === 'cod') {
      saveCodMutation.mutate({
        enabled: true,
        settings: {
          instructions: codForm.instructions,
          max_order_amount: codForm.max_order_amount ? parseFloat(codForm.max_order_amount) : null,
        },
      });
    } else {
      saveMutation.mutate(
        activeProvider === 'stripe'
          ? { provider: 'stripe', enabled: true, credentials: stripeForm }
          : { provider: 'razorpay', enabled: true, credentials: razorpayForm }
      );
    }
  };

  const badge = (
    <div className="flex items-center gap-2">
      <StatusBadge configured={stripe.configured} enabled={stripe.enabled} />
      <StatusBadge configured={razorpay.configured} enabled={razorpay.enabled} />
      <StatusBadge configured={cod.configured || cod.enabled} enabled={cod.enabled} />
    </div>
  );

  return (
    <SectionCard icon={CreditCard} title="Payment Gateway" badge={badge}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Provider tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            {(['stripe', 'razorpay', 'cod'] as const).map(p => (
              <button
                key={p}
                onClick={() => setActiveProvider(p)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeProvider === p
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'stripe' ? 'Stripe' : p === 'razorpay' ? 'Razorpay' : 'Cash on Delivery'}
                {p === 'cod'
                  ? cod.enabled && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  : (p === 'stripe' ? stripe : razorpay).configured && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  )}
              </button>
            ))}
          </div>

          {activeProvider === 'stripe' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Connect your Stripe account to accept payments</p>
                {stripe.configured && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-600">Enabled</span>
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={stripe.enabled}
                      onChange={e => toggleMutation.mutate({ provider: 'stripe', enabled: e.target.checked })}
                    />
                  </label>
                )}
              </div>
              <MaskedInput label="Secret Key" name="secret_key" value={stripeForm.secret_key}
                onChange={v => setStripeForm(f => ({ ...f, secret_key: v }))}
                placeholder={stripe.configured ? '••••••••••• (leave blank to keep existing)' : 'sk_live_…'} required />
              <MaskedInput label="Publishable Key" name="publishable_key" value={stripeForm.publishable_key}
                onChange={v => setStripeForm(f => ({ ...f, publishable_key: v }))}
                placeholder={stripe.configured ? '••••••••••• (leave blank to keep existing)' : 'pk_live_…'} required />
              <MaskedInput label="Webhook Secret (optional)" name="webhook_secret" value={stripeForm.webhook_secret}
                onChange={v => setStripeForm(f => ({ ...f, webhook_secret: v }))}
                placeholder="whsec_…" />
            </div>
          ) : activeProvider === 'razorpay' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Connect your Razorpay account</p>
                {razorpay.configured && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-600">Enabled</span>
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={razorpay.enabled}
                      onChange={e => toggleMutation.mutate({ provider: 'razorpay', enabled: e.target.checked })}
                    />
                  </label>
                )}
              </div>
              <MaskedInput label="Key ID" name="key_id" value={razorpayForm.key_id}
                onChange={v => setRazorpayForm(f => ({ ...f, key_id: v }))}
                placeholder={razorpay.configured ? '•••••••••••' : 'rzp_live_…'} required />
              <MaskedInput label="Key Secret" name="key_secret" value={razorpayForm.key_secret}
                onChange={v => setRazorpayForm(f => ({ ...f, key_secret: v }))}
                placeholder={razorpay.configured ? '•••••••••••' : 'Your key secret'} required />
              <MaskedInput label="Webhook Secret (optional)" name="webhook_secret" value={razorpayForm.webhook_secret}
                onChange={v => setRazorpayForm(f => ({ ...f, webhook_secret: v }))}
                placeholder="Webhook secret" />
            </div>
          ) : (
            /* COD */
            codLoading ? (
              <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Cash on Delivery</p>
                    <p className="text-xs text-gray-500 mt-0.5">Allow customers to pay cash when the order is delivered. No API keys needed.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-gray-600">Enabled</span>
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={cod.enabled}
                      onChange={e => saveCodMutation.mutate({ enabled: e.target.checked, settings: { instructions: codForm.instructions, max_order_amount: codForm.max_order_amount ? parseFloat(codForm.max_order_amount) : null } })}
                    />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Instructions (optional)</label>
                  <textarea
                    className="form-input text-sm resize-none"
                    rows={2}
                    value={codForm.instructions || (cod.credentials?.instructions ?? '')}
                    onChange={e => setCodForm(f => ({ ...f, instructions: e.target.value }))}
                    placeholder="e.g. Please keep exact change ready for the delivery agent."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Order Amount (optional)</label>
                  <input
                    type="number"
                    className="form-input text-sm"
                    value={codForm.max_order_amount || (cod.credentials?.max_order_amount ?? '')}
                    onChange={e => setCodForm(f => ({ ...f, max_order_amount: e.target.value }))}
                    placeholder="Leave blank for no limit"
                  />
                </div>
              </div>
            )
          )}

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || saveCodMutation.isPending}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {(saveMutation.isPending || saveCodMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
            Save {activeProvider === 'stripe' ? 'Stripe' : activeProvider === 'razorpay' ? 'Razorpay' : 'COD'} Settings
          </button>
        </div>
      )}
    </SectionCard>
  );
}

// ── SMS Section ──────────────────────────────────────────────────────────────

function SmsSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ account_sid: '', auth_token: '', phone_number: '' });
  const [testNumber, setTestNumber] = useState('');
  const [showTest, setShowTest] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['integration-sms'],
    queryFn: () => integrationsAPI.getSmsSettings().then(r => r.data),
  });

  const configured = data?.configured ?? false;
  const enabled = data?.enabled ?? false;

  const saveMutation = useMutation({
    mutationFn: (payload: object) => integrationsAPI.saveSmsSettings(payload),
    onSuccess: () => {
      toast.success('Twilio SMS configured successfully');
      qc.invalidateQueries({ queryKey: ['integration-sms'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to save');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => integrationsAPI.testSms(testNumber),
    onSuccess: () => toast.success('Test SMS sent!'),
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Test failed');
    },
  });

  const badge = <StatusBadge configured={configured} enabled={enabled} />;

  return (
    <SectionCard icon={MessageSquare} title="SMS Service (Twilio)" badge={badge}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">Send OTPs and notifications via Twilio</p>
          <MaskedInput label="Account SID" name="account_sid" value={form.account_sid}
            onChange={v => setForm(f => ({ ...f, account_sid: v }))}
            placeholder={configured ? '•••••••••••' : 'ACxxxxxxxxxxxxxxxx'} required />
          <MaskedInput label="Auth Token" name="auth_token" value={form.auth_token}
            onChange={v => setForm(f => ({ ...f, auth_token: v }))}
            placeholder={configured ? '•••••••••••' : 'Your auth token'} required />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Twilio Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="form-input text-sm"
              value={form.phone_number}
              onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
              placeholder={configured ? '•••••••••••' : '+14155552671'}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => saveMutation.mutate({ enabled: true, credentials: form })}
              disabled={saveMutation.isPending}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Save SMS Settings
            </button>
            {configured && (
              <button
                onClick={() => setShowTest(s => !s)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <Send size={13} /> Send Test SMS
              </button>
            )}
          </div>

          {showTest && configured && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                className="form-input text-sm flex-1"
                placeholder="+1234567890"
                value={testNumber}
                onChange={e => setTestNumber(e.target.value)}
              />
              <button
                onClick={() => testMutation.mutate()}
                disabled={!testNumber || testMutation.isPending}
                className="btn-primary text-sm"
              >
                {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Email Section ────────────────────────────────────────────────────────────

function EmailSection() {
  const qc = useQueryClient();
  const [activeProvider, setActiveProvider] = useState<'sendgrid' | 'smtp'>('sendgrid');
  const [sgForm, setSgForm] = useState({ api_key: '', from_email: '' });
  const [smtpForm, setSmtpForm] = useState({ host: '', port: '587', username: '', password: '' });
  const [testEmail, setTestEmail] = useState('');
  const [showTest, setShowTest] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['integration-email'],
    queryFn: () => integrationsAPI.getEmailSettings().then(r => r.data),
  });

  const sendgrid = data?.sendgrid ?? { enabled: false, configured: false, credentials: {} };
  const smtp = data?.smtp ?? { enabled: false, configured: false, credentials: {} };
  const anyConfigured = sendgrid.configured || smtp.configured;

  const saveMutation = useMutation({
    mutationFn: (payload: { provider: string; enabled: boolean; credentials: object }) =>
      integrationsAPI.saveEmailSettings(payload),
    onSuccess: (_, vars) => {
      toast.success(`${vars.provider === 'sendgrid' ? 'SendGrid' : 'SMTP'} email configured`);
      qc.invalidateQueries({ queryKey: ['integration-email'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to save');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => integrationsAPI.testEmail(testEmail || undefined),
    onSuccess: () => toast.success('Test email sent!'),
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Test failed');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(
      activeProvider === 'sendgrid'
        ? { provider: 'sendgrid', enabled: true, credentials: sgForm }
        : { provider: 'smtp', enabled: true, credentials: { ...smtpForm, port: parseInt(smtpForm.port) || 587 } }
    );
  };

  const badge = (
    <div className="flex items-center gap-2">
      <StatusBadge configured={sendgrid.configured} enabled={sendgrid.enabled} />
      <StatusBadge configured={smtp.configured} enabled={smtp.enabled} />
    </div>
  );

  return (
    <SectionCard icon={Mail} title="Email Service" badge={badge}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Provider tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            {(['sendgrid', 'smtp'] as const).map(p => (
              <button
                key={p}
                onClick={() => setActiveProvider(p)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeProvider === p
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'sendgrid' ? 'SendGrid' : 'SMTP / Gmail'}
                {(p === 'sendgrid' ? sendgrid : smtp).configured && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                )}
              </button>
            ))}
          </div>

          {activeProvider === 'sendgrid' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Send transactional emails via SendGrid</p>
              <MaskedInput label="API Key" name="api_key" value={sgForm.api_key}
                onChange={v => setSgForm(f => ({ ...f, api_key: v }))}
                placeholder={sendgrid.configured ? '•••••••••••' : 'SG.xxxxxxxx'} required />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Email</label>
                <input
                  type="email"
                  className="form-input text-sm"
                  value={sgForm.from_email}
                  onChange={e => setSgForm(f => ({ ...f, from_email: e.target.value }))}
                  placeholder={sendgrid.configured ? (sendgrid.credentials?.from_email ?? '') : 'noreply@company.com'}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Use any SMTP server (Gmail, Outlook, etc.)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Host <span className="text-red-500">*</span></label>
                  <input type="text" className="form-input text-sm" value={smtpForm.host}
                    onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))}
                    placeholder={smtp.configured ? '•••••••••••' : 'smtp.gmail.com'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Port <span className="text-red-500">*</span></label>
                  <input type="number" className="form-input text-sm" value={smtpForm.port}
                    onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="587" />
                </div>
              </div>
              <MaskedInput label="Username / Email" name="username" value={smtpForm.username}
                onChange={v => setSmtpForm(f => ({ ...f, username: v }))}
                placeholder={smtp.configured ? '•••••••••••' : 'you@gmail.com'} required />
              <MaskedInput label="Password / App Password" name="password" value={smtpForm.password}
                onChange={v => setSmtpForm(f => ({ ...f, password: v }))}
                placeholder={smtp.configured ? '•••••••••••' : 'App password'} required />
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Save {activeProvider === 'sendgrid' ? 'SendGrid' : 'SMTP'} Settings
            </button>
            {anyConfigured && (
              <button
                onClick={() => setShowTest(s => !s)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <Send size={13} /> Send Test Email
              </button>
            )}
          </div>

          {showTest && anyConfigured && (
            <div className="flex gap-2 mt-2">
              <input
                type="email"
                className="form-input text-sm flex-1"
                placeholder="Recipient email (leave blank to use your account email)"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
              />
              <button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="btn-primary text-sm"
              >
                {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <TenantShell>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure payment gateways, SMS, and email services for your company.
            Credentials are encrypted and stored securely.
          </p>
        </div>

        <div className="space-y-4">
          <PaymentSection />
          <SmsSection />
          <EmailSection />
        </div>
      </div>
    </TenantShell>
  );
}
