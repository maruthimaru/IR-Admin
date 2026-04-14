'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { companiesAPI } from '@/lib/api';
import { toast } from 'react-toastify';
import { X, Building2, Globe, Eye, EyeOff } from 'lucide-react';

const schema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  custom_domain: z.string()
    .min(1, 'Custom domain is required')
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, 'Enter a valid domain, e.g. acme.com'),
  plan: z.enum(['basic', 'pro', 'enterprise']),
  contact_email: z.string().email('Invalid email').or(z.literal('')),
  contact_phone: z.string().optional(),
  admin_password: z.string().min(8, 'Password must be at least 8 characters'),
  timezone: z.string().default('UTC'),
  currency: z.string().default('USD'),
});

type CreateCompanyForm = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
  onSuccess: (subdomain: string, customDomain: string) => void;
}

export default function CreateCompanyModal({ onClose, onSuccess }: Props) {
  const [isLoading, setIsLoading]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<CreateCompanyForm>({
    resolver: zodResolver(schema),
    defaultValues: { plan: 'basic', timezone: 'UTC', currency: 'USD' },
  });

  const onSubmit = async (data: CreateCompanyForm) => {
    setIsLoading(true);
    try {
      const res = await companiesAPI.create(data);
      const subdomain = res.data?.company?.subdomain ?? '';
      toast.success(
        <span>
          Company <strong>{data.name}</strong> created!{' '}
          <a
            href={`/${subdomain}/login`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            Open login page →
          </a>
        </span>,
        { autoClose: 8000 }
      );
      onSuccess(subdomain, data.custom_domain);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to create company');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Company</h2>
              <p className="text-xs text-gray-500">Set up a new tenant workspace</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">

            {/* Company Name */}
            <div className="col-span-2">
              <label className="form-label">Company Name *</label>
              <input
                {...register('name')}
                className="form-input"
                placeholder="Acme Corporation"
              />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>

            {/* Custom Domain — mandatory */}
            <div className="col-span-2">
              <label className="form-label flex items-center gap-1.5">
                <Globe size={13} className="text-gray-400" />
                Custom Domain *
              </label>
              <input
                {...register('custom_domain')}
                className="form-input"
                placeholder="acme.com"
              />
              <p className="text-xs text-gray-400 mt-1">
                The domain where the company&apos;s admin panel will be hosted.
              </p>
              {errors.custom_domain && <p className="form-error">{errors.custom_domain.message}</p>}
            </div>

            {/* Plan */}
            <div>
              <label className="form-label">Plan</label>
              <select {...register('plan')} className="form-input">
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="form-label">Currency</label>
              <select {...register('currency')} className="form-input">
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="INR">INR - Indian Rupee</option>
              </select>
            </div>

            {/* Contact Email */}
            <div className="col-span-2">
              <label className="form-label">Contact Email (Company Admin)</label>
              <input
                {...register('contact_email')}
                type="email"
                className="form-input"
                placeholder="admin@acme.com"
              />
              <p className="text-xs text-gray-400 mt-1">An admin account will be created with this email.</p>
              {errors.contact_email && <p className="form-error">{errors.contact_email.message}</p>}
            </div>

            {/* Admin Password */}
            <div className="col-span-2">
              <label className="form-label">Admin Password *</label>
              <div className="relative">
                <input
                  {...register('admin_password')}
                  type={showPassword ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Initial password for the company admin account.</p>
              {errors.admin_password && <p className="form-error">{errors.admin_password.message}</p>}
            </div>

          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary flex-1">
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating...
                </span>
              ) : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
