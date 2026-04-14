'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useTenantStore } from '@/store/tenant';
import { authAPI } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params    = useParams();
  const pathname  = usePathname();
  const router    = useRouter();
  const subdomain = params.tenant as string;

  const { isAuthenticated, logout }   = useAuthStore();
  const { company, clearCompany }     = useTenantStore();

  const [checking, setChecking] = useState(true);

  const isLoginPage = pathname === `/${subdomain}/login`;

  useEffect(() => {
    const verify = async () => {
      // If already on login page, no check needed
      if (isLoginPage) {
        setChecking(false);
        return;
      }

      // No local session at all → go to login
      if (!isAuthenticated) {
        router.replace(`/${subdomain}/login`);
        return;
      }

      try {
        // Validate token with backend
        const res = await authAPI.verify();
        const { user: verifiedUser } = res.data;

        // Super admins can't access tenant workspace
        if (verifiedUser.role === 'super_admin') {
          router.replace('/super-admin/dashboard');
          return;
        }

        // User must belong to this tenant's company
        const tenantCompanyId = company?._id;
        const userCompanyId   = verifiedUser.company_id;

        if (!userCompanyId || !tenantCompanyId || userCompanyId !== tenantCompanyId) {
          logout();
          clearCompany();
          router.replace(`/${subdomain}/login`);
          return;
        }

        setChecking(false);
      } catch {
        // Token invalid / expired
        logout();
        clearCompany();
        router.replace(`/${subdomain}/login`);
      }
    };

    verify();
  }, [pathname]); // re-run on route change

  // On login page render immediately
  if (isLoginPage) return <>{children}</>;

  // Checking session — show spinner
  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return <>{children}</>;
}
