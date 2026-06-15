'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  StatCard, PageHeader, Card, EmptyState, ErrorState,
  TableSkeleton, StatusBadge, Alert, MoneyDisplay,
} from '@/components/ui';
import {
  listInventory, getRevenueAnalytics, getInventoryAnalytics,
  listPlans, currentPeriod, formatBps,
  type TreatmentPlan, type FinancialAggregate,
} from '@/lib/api/client';

export default function DashboardPage() {
  const [plans, setPlans]         = useState<TreatmentPlan[]>([]);
  const [aggregate, setAggregate] = useState<FinancialAggregate | null>(null);
  const [lowStock, setLowStock]   = useState<Array<{ name: string; sku: string; currentStock: number; reorderLevel: number; deficit: number }>>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [plansRes, analyticsRes, inventoryRes] = await Promise.allSettled([
        listPlans({ pageSize: 5 }),
        getRevenueAnalytics(currentPeriod()),
        getInventoryAnalytics(),
      ]);

      if (plansRes.status === 'fulfilled')     setPlans(plansRes.value.data ?? []);
      if (analyticsRes.status === 'fulfilled') setAggregate(analyticsRes.value.data?.aggregate ?? null);
      if (inventoryRes.status === 'fulfilled') setLowStock(inventoryRes.value.data?.lowStockItems ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const period = currentPeriod();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Resumen operativo — ${period}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card animate-pulse">
              <div className="h-3 w-20 bg-border rounded mb-3" />
              <div className="h-7 w-28 bg-border rounded" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Ingresos netos"
              value={aggregate
                ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: aggregate.currency })
                    .format((aggregate.totalNetRevenue ?? 0) / 100)
                : '—'}
              sub={period}
              accent
            />
            <StatCard
              label="Margen bruto"
              value={aggregate ? formatBps(aggregate.avgGrossMarginBps) : '—'}
              sub="promedio del período"
            />
            <StatCard
              label="Planes activos"
              value={String(plans.filter(p => p.status === 'ACTIVE' || p.status === 'DRAFT').length)}
              sub="en progreso"
            />
            <StatCard
              label="Alertas inventario"
              value={String(lowStock.length)}
              sub={lowStock.length > 0 ? 'ítems bajo mínimo' : 'sin alertas'}
              trend={lowStock.length > 0 ? 'down' : 'neutral'}
            />
          </>
        )}
      </div>

      {/* Low stock alerts */}
      {!loading && lowStock.length > 0 && (
        <div className="mb-6">
          <Alert type="warning">
            <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <span className="font-semibold">Inventario bajo mínimo</span>
              {' '}— {lowStock.length} ítem{lowStock.length > 1 ? 's' : ''} requieren reposición:
              {' '}{lowStock.slice(0, 3).map(i => i.name).join(', ')}
              {lowStock.length > 3 && ` y ${lowStock.length - 3} más`}.
            </div>
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent plans */}
        <Card title="Planes recientes">
          {loading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : plans.length === 0 ? (
            <EmptyState title="Sin planes" body="Aún no se han creado planes de tratamiento." />
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Plan</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(p => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-ink-secondary">{p.patientRef}</td>
                      <td className="max-w-[180px] truncate">{p.title}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="text-xs text-ink-muted whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Low stock detail */}
        <Card title="Inventario crítico">
          {loading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : lowStock.length === 0 ? (
            <EmptyState
              title="Inventario en orden"
              body="Todos los ítems están sobre el nivel mínimo requerido."
            />
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Mínimo</th>
                    <th className="text-right">Déficit</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.slice(0, 6).map(item => (
                    <tr key={item.sku}>
                      <td>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-ink-muted font-mono">{item.sku}</div>
                      </td>
                      <td className="text-right tabular text-red-600 font-medium">{item.currentStock}</td>
                      <td className="text-right tabular text-ink-secondary">{item.reorderLevel}</td>
                      <td className="text-right tabular">
                        <span className="badge-red">{item.deficit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
