'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PageHeader, Card, EmptyState, ErrorState, TableSkeleton,
  StatusBadge, Pagination, MoneyDisplay, Toast, type ToastType,
} from '@/components/ui';
import { listPlans, getPlan, type TreatmentPlan, type TreatmentVersion } from '@/lib/api/client';
// getPlan() now returns SingleResponse<PlanDetailResponse> = { data: { plan, versions } }

export default function PlanesPage() {
  const [plans, setPlans]         = useState<TreatmentPlan[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<{ plan: TreatmentPlan; versions: TreatmentVersion[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: ToastType } | null>(null);

  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listPlans({ page, pageSize: PAGE_SIZE });
      setPlans(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await getPlan(id);
      setSelected({ plan: res.data.plan, versions: res.data.versions ?? [] });
    } catch (e) {
      setToast({ msg: (e as Error).message, type: 'error' });
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Planes de Tratamiento"
        subtitle="Historial y versiones de planes por paciente"
        action={
          <a href="/cotizar" className="btn-primary">+ Nueva cotización</a>
        }
      />

      <div className={`grid gap-5 ${selected ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

        {/* ── Plan list ── */}
        <div className={selected ? 'lg:col-span-3' : ''}>
          <Card>
            {loading ? (
              <TableSkeleton rows={8} cols={5} />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : plans.length === 0 ? (
              <EmptyState
                title="Sin planes registrados"
                body="Genera tu primera cotización para crear un plan."
                action={<a href="/cotizar" className="btn-primary btn-sm">Crear plan</a>}
              />
            ) : (
              <>
                <div className="overflow-x-auto -mx-5 -mt-5">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Paciente</th>
                        <th>Plan</th>
                        <th>Estado</th>
                        <th>Versión</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map(p => (
                        <tr
                          key={p.id}
                          onClick={() => openDetail(p.id)}
                          className={`cursor-pointer ${selected?.plan.id === p.id ? 'bg-accent-light/40' : ''}`}
                        >
                          <td className="font-mono text-xs text-ink-secondary">{p.patientRef}</td>
                          <td>
                            <div className="font-medium text-sm truncate max-w-[200px]">{p.title}</div>
                            {p.description && (
                              <div className="text-xs text-ink-muted truncate max-w-[200px]">{p.description}</div>
                            )}
                          </td>
                          <td><StatusBadge status={p.status} /></td>
                          <td className="text-xs text-ink-muted">
                            {p.currentVersionId ? (
                              <span className="badge-gray">v{/* version# resolved in detail */}—</span>
                            ) : '—'}
                          </td>
                          <td className="text-xs text-ink-muted whitespace-nowrap">
                            {new Date(p.createdAt).toLocaleDateString('es-MX')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
              </>
            )}
          </Card>
        </div>

        {/* ── Plan detail panel ── */}
        {selected && (
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={selected.plan.title}
              action={
                <button onClick={() => setSelected(null)} className="btn-ghost btn-sm">✕</button>
              }
            >
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-secondary">Paciente</span>
                  <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded">{selected.plan.patientRef}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-secondary">Estado</span>
                  <StatusBadge status={selected.plan.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-secondary">Creado</span>
                  <span className="text-xs">{new Date(selected.plan.createdAt).toLocaleString('es-MX')}</span>
                </div>
                {selected.plan.description && (
                  <div className="pt-2 text-xs text-ink-secondary border-t border-border">
                    {selected.plan.description}
                  </div>
                )}
              </div>

              {loadingDetail && (
                <div className="mt-4 space-y-2">
                  <div className="skeleton h-3 w-32" />
                  <div className="skeleton h-20 w-full" />
                </div>
              )}
            </Card>

            {/* Version history */}
            {selected.versions.length > 0 && (
              <Card title="Versiones">
                <div className="space-y-3">
                  {selected.versions.map((v) => (
                    <div key={v.id} className={`border rounded-lg p-3 ${
                      v.status === 'SEALED' ? 'border-accent/30 bg-accent-light/20'
                      : v.status === 'DRAFT' ? 'border-amber-200 bg-amber-50/50'
                      : 'border-border'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-ink">Versión {v.versionNumber}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-ink-muted">Total</span>
                          <div className="font-semibold">
                            <MoneyDisplay amount={v.totalAmount} currency={v.currency} />
                          </div>
                        </div>
                        <div>
                          <span className="text-ink-muted">Ítems</span>
                          <div className="font-semibold">{v.items.length}</div>
                        </div>
                      </div>
                      {v.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {v.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-ink-secondary">
                              <span className="truncate mr-2">{item.description}</span>
                              <span className="tabular shrink-0">×{item.quantity}</span>
                            </div>
                          ))}
                          {v.items.length > 3 && (
                            <div className="text-xs text-ink-muted">+{v.items.length - 3} más</div>
                          )}
                        </div>
                      )}
                      {v.sealedAt && (
                        <div className="mt-2 text-[11px] text-ink-muted border-t border-border/60 pt-1.5">
                          Sellado: {new Date(v.sealedAt).toLocaleString('es-MX')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
