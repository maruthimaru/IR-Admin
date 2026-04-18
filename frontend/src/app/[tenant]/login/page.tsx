'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authAPI, companiesAPI } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import { Eye, EyeOff, Building2, Loader2 } from 'lucide-react';

const schema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof schema>;

export default function TenantLoginPage() {
  const params   = useParams();
  const router   = useRouter();
  const subdomain = params.tenant as string;

  const { login: storeLogin, isAuthenticated, user } = useAuthStore();
  const { setCompany, company: storedCompany }        = useTenantStore();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState('');
  const [companyName, setCompanyName]   = useState('');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [companyNotFound, setCompanyNotFound] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  // Redirect if already logged in to this tenant.
  // Guard with a small delay so we don't fire during a mid-logout state flush.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated && user && user.role !== 'super_admin') {
        const tenantCompanyId = storedCompany?._id;
        const userCompanyId   = user.company_id;
        // Only redirect if the stored company actually matches the user
        if (tenantCompanyId && userCompanyId && tenantCompanyId === userCompanyId) {
          router.replace(`/${subdomain}/dashboard`);
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isAuthenticated, user, storedCompany, subdomain, router]);

  // Load company name to display on the login page
  useEffect(() => {
    const fetchCompany = async () => {
      try {
        // Use public endpoint — we can search by subdomain via companies list
        // For now hit the tenant-login with empty creds just to get company name
        // Better: add a public company-info endpoint. For now we infer from subdomain.
        setCompanyName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1));
      } catch {
        setCompanyNotFound(true);
      } finally {
        setLoadingCompany(false);
      }
    };
    fetchCompany();
  }, [subdomain]);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError('');
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : subdomain;
      const res = await authAPI.tenantLogin(host, data.email, data.password);
      const { access, refresh, user, company } = res.data;

      storeLogin({ access, refresh, user });
      setCompany(company);

      router.push(`/${subdomain}/dashboard`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingCompany) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (companyNotFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-semibold text-gray-700">Company not found</h1>
          <p className="text-gray-500 mt-2 text-sm">
            No company exists for subdomain <span className="font-mono font-medium">{subdomain}</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Company badge */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{companyName}</h1>
          <p className="text-indigo-300 text-sm mt-1 font-mono">{subdomain}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in to your workspace</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your admin credentials to continue.</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">Email address</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                className="form-input"
                placeholder="admin@company.com"
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="form-input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-2.5 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-indigo-400 mt-6">
          Powered by{' '}
          <span className="font-semibold text-indigo-300">
            {process.env.NEXT_PUBLIC_BASE_DOMAIN || 'infinitroot.com'}
          </span>
        </p>
      </div>
    </div>
  );
}
