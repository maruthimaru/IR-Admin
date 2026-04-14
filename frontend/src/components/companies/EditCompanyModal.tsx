'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { companiesAPI } from '@/lib/api';
import { Company } from '@/types';
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
  new_admin_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .or(z.literal(''))
    .optional(),
  timezone: z.string(),
  currency: z.string(),
});

type EditCompanyForm = z.infer<typeof schema>;

interface Props {
  company: Company;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditCompanyModal({ company, onClose, onSuccess }: Props) {
  const [isLoading, setIsLoading]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<EditCompanyForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:               company.name,
      custom_domain:      company.custom_domain ?? '',
      plan:               company.plan,
      contact_email:      company.contact_email ?? '',
      contact_phone:      company.contact_phone ?? '',
      new_admin_password: '',
      timezone:           company.settings?.timezone ?? 'UTC',
      currency:           company.settings?.currency ?? 'USD',
    },
  });

  const onSubmit = async (data: EditCompanyForm) => {
    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name:          data.name,
        custom_domain: data.custom_domain,
        plan:          data.plan,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        settings: {
          timezone: data.timezone,
          currency: data.currency,
          language: company.settings?.language ?? 'en',
        },
      };
      // Only send password if provided
      if (data.new_admin_password) {
        payload.new_admin_password = data.new_admin_password;
      }

      await companiesAPI.update(company._id, payload);
      toast.success(`Company "${data.name}" updated successfully`);
      onSuccess();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      toast.error(axiosError.response?.data?.error || 'Failed to update company');
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
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Company</h2>
              <p className="text-xs text-gray-500">{company.custom_domain || company.name}</p>
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
              <input {...register('name')} className="form-input" placeholder="Acme Corporation" />
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
              <label className="form-label">Contact Email</label>
              <input
                {...register('contact_email')}
                type="email"
                className="form-input"
                placeholder="admin@acme.com"
              />
              {errors.contact_email && <p className="form-error">{errors.contact_email.message}</p>}
            </div>

            {/* Contact Phone */}
            <div className="col-span-2">
              <label className="form-label">Contact Phone</label>
              <input
                {...register('contact_phone')}
                className="form-input"
                placeholder="+1 555 000 0000"
              />
            </div>

            {/* New Admin Password — optional */}
            <div className="col-span-2">
              <label className="form-label">
                New Admin Password
                <span className="text-xs font-normal text-gray-400 ml-1">(leave blank to keep current)</span>
              </label>
              <div className="relative">
                <input
                  {...register('new_admin_password')}
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
              {errors.new_admin_password && (
                <p className="form-error">{errors.new_admin_password.message}</p>
              )}
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
                  Saving...
                </span>
              ) : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
