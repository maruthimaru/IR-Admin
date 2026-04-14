'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesAPI } from '@/lib/api';
import { Company } from '@/types';
import { Plus, Search, Building2, ExternalLink, Edit2, PowerOff, Power, LogIn } from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import CreateCompanyModal from '@/components/companies/CreateCompanyModal';
import EditCompanyModal from '@/components/companies/EditCompanyModal';

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch]             = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCompany, setEditingCompany]   = useState<Company | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['companies', page],
    queryFn: () => companiesAPI.list({ page, page_size: 10 }).then(r => r.data),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => companiesAPI.deactivate(id),
    onSuccess: () => {
      toast.success('Company deactivated');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('Failed to deactivate company'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => companiesAPI.reactivate(id),
    onSuccess: () => {
      toast.success('Company reactivated');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('Failed to reactivate company'),
  });

  const filtered = data?.results?.filter((c: Company) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.subdomain.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const companyUrl = (company: Company) =>
    company.custom_domain ? `https://${company.custom_domain}` : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.total ?? 0} companies registered on the platform
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Create Company
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input pl-9"
        />
      </div>

      {/* Companies Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((company: Company) => (
            <div
              key={company._id}
              className={`card hover:shadow-md transition-shadow ${!company.is_active ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    company.is_active ? 'bg-indigo-100' : 'bg-gray-100'
                  }`}>
                    <Building2 size={18} className={company.is_active ? 'text-indigo-600' : 'text-gray-400'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{company.name}</h3>
                    <p className="text-xs text-gray-500 font-mono truncate max-w-[160px]">
                      {company.custom_domain || '—'}
                    </p>
                  </div>
                </div>
                <span className={company.is_active ? 'badge-success' : 'badge-danger'}>
                  {company.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Plan</span>
                  <span className="font-medium capitalize">{company.plan}</span>
                </div>
                {company.contact_email && (
                  <div className="flex justify-between text-gray-600">
                    <span>Email</span>
                    <span className="font-medium truncate max-w-[160px]">{company.contact_email}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Created</span>
                  <span className="font-medium">
                    {company.created_at ? format(new Date(company.created_at), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                {company.is_active && companyUrl(company) && (
                  <a
                    href={companyUrl(company)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                  >
                    <ExternalLink size={12} />
                    Open
                  </a>
                )}

                <button
                  onClick={() => setEditingCompany(company)}
                  className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                >
                  <Edit2 size={12} />
                  Edit
                </button>

                {company.is_active && (
                  <a
                    href={`/${company.subdomain}/login`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                    title="Open tenant login page"
                  >
                    <LogIn size={12} />
                    Login
                  </a>
                )}

                {company.is_active ? (
                  <button
                    onClick={() => {
                      if (confirm(`Deactivate "${company.name}"? Users will lose access.`)) {
                        deactivateMutation.mutate(company._id);
                      }
                    }}
                    disabled={deactivateMutation.isPending}
                    className="ml-auto flex items-center gap-1 text-xs py-1.5 px-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                    title="Deactivate"
                  >
                    <PowerOff size={13} />
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Reactivate "${company.name}"?`)) {
                        reactivateMutation.mutate(company._id);
                      }
                    }}
                    disabled={reactivateMutation.isPending}
                    className="ml-auto flex items-center gap-1 text-xs py-1.5 px-2 rounded-lg text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
                    title="Reactivate"
                  >
                    <Power size={13} />
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p>No companies found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 10 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {Math.ceil(data.total / 10)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / 10)}
            className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateCompanyModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['companies'] });
          }}
        />
      )}


      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSuccess={() => {
            setEditingCompany(null);
            queryClient.invalidateQueries({ queryKey: ['companies'] });
          }}
        />
      )}
    </div>
  );
}
