import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TenantState, Company } from '@/types';

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      company: null,
      dbName: null,

      setCompany: (company: Company) =>
        set({ company, dbName: company.db_name }),

      clearCompany: () =>
        set({ company: null, dbName: null }),
    }),
    {
      name: 'tenant-storage',
    }
  )
);
