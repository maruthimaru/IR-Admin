'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authAPI } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'react-toastify';
import { Eye, EyeOff, Lock, Mail, Zap, Building2, Users, BarChart3, Shield } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const features = [
  { icon: Building2, label: 'Multi-tenant companies', desc: 'Isolated databases per company' },
  { icon: Users,     label: 'Role-based access',      desc: 'Super admin, admins, developers' },
  { icon: BarChart3, label: 'Dynamic form builder',   desc: 'No-code forms and list pages' },
  { icon: Shield,    label: 'Enterprise security',    desc: 'JWT auth with token rotation' },
];

function roleRedirect(role: string, router: ReturnType<typeof useRouter>) {
  if (role === 'super_admin') router.replace('/super-admin/dashboard');
  else if (['developer', 'company_admin'].includes(role)) router.replace('/developer/forms');
  else router.replace('/app/dashboard');
}

export default function LoginPage() {
  const router = useRouter();
  const { login, logout, accessToken } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount: call backend verify — skip login screen if token is still valid
  useEffect(() => {
    if (!accessToken) {
      setChecking(false);
      return;
    }
    authAPI.verify()
      .then(({ data }) => {
        roleRedirect(data.user.role, router);
      })
      .catch(() => {
        logout();
        setChecking(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await authAPI.login(data.email, data.password);
      const { access, refresh, user } = response.data;
      login({ access, refresh, user });
      toast.success(`Welcome back, ${user.first_name}!`);
      roleRedirect(user.role, router);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-slate-400 text-sm">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden bg-[#0f0c29]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-600/30 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-700/25 blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/15 blur-[80px]" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/40">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-lg leading-none">Dynamic Admin</p>
              <p className="text-indigo-300 text-xs mt-0.5">Platform Console</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              One platform,<br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                every company.
              </span>
            </h1>
            <p className="text-slate-400 mt-4 text-base leading-relaxed max-w-sm">
              Build, manage and scale multi-tenant admin panels with dynamic forms and per-company databases.
            </p>
          </div>

          <div className="space-y-4">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="w-9 h-9 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{label}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-slate-600 text-xs">
            © {new Date().getFullYear()} Dynamic Admin · All rights reserved
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col justify-center items-center bg-white px-6 py-12">
        <div className="w-full max-w-[400px]">

          <div className="flex lg:hidden items-center gap-2 mb-10">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">Dynamic Admin</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your admin account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="admin@company.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow bg-gray-50 focus:bg-white"
                />
              </div>
              {errors.email && <p className="text-red-500 text-xs mt-1.5">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow bg-gray-50 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1.5">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-xl transition-all duration-150 shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-px active:translate-y-0 mt-2 text-sm"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
