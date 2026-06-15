'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PageHeader, Card, EmptyState, ErrorState, TableSkeleton,
  StatusBadge, Pagination, MoneyDisplay, Alert, Toast, type ToastType,
} from '@/components/ui';
import {
  listInventory, recordMovement, getItemMovements,
  type InventoryItem, type InventoryMovement,
} from '@/lib/api/client';

const MOVEMENT_TYPES = [
  { value: 'ENTRY',         label: 'Entrada',           sign: '+' },
  { value: 'CONSUMPTION',   label: 'Consumo',            sign: '−' },
  { value: 'ADJUSTMENT_IN', label: 'Ajuste positivo',    sign: '+' },
  { value: 'ADJUSTMENT_OUT',label: 'Ajuste negativo',    sign: '−' },
  { value: 'RETURN',        label: 'Devolución',         sign: '+' },
];

const CATEGORIES = ['CONSUMABLE','MATERIAL','INSTRUMENT','EQUIPMENT','PROSTHETIC','MEDICATION','OTHER'];
const CAT_LABEL: Record<string, string> = {
  CONSUMABLE:'Consumible', MATERIAL:'Material', INSTRUMENT:'Instrumento',
  EQUIPMENT:'Equipo', PROSTHETIC:'Prótesis', MEDICATION:'Medicamento', OTHER:'Otro',
};

export default function InventarioPage() {
  const [items, setItems]           = useState<InventoryItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [category, setCategory]     = useState('');
  const [belowReorder, setBelowReorder] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<InventoryItem | null>(null);
  const [movements, setMovements]   = useState<InventoryMovement[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);

  // Movement form
  const [movType, setMovType]       = useState('CONSUMPTION');
  const [movQty, setMovQty]         = useState('');
  const [movRef, setMovRef]         = useState('');
  const [movBy, setMovBy]           = useState('');
  const [movCost, setMovCost]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: ToastType } | null>(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listInventory({
        category: category || undefined,
        belowReorderLevel: belowReorder || undefined,
        page, pageSize: PAGE_SIZE,
      });
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [page, category, belowReorder]);

  useEffect(() => { load(); }, [load]);

  const openItem = async (item: InventoryItem) => {
    setSelected(item);
    setLoadingMov(true);
    try {
      const res = await getItemMovements(item.id);
      setMovements(res.data ?? []);
    } catch { setMovements([]); }
    finally { setLoadingMov(false); }
  };

  const handleMovement = async () => {
    if (!selected || !movQty || !movBy) {
      setToast({ msg: 'Completa tipo, cantidad y operador', type: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await recordMovement({
        itemId: selected.id,
        type: movType,
        quantity: parseInt(movQty, 10),
        unitCost: movCost ? parseInt(movCost, 10) : undefined,
        reference: movRef || undefined,
        performedBy: movBy,
        correlationId: crypto.randomUUID(),
      });
      if (res.success) {
        setToast({ msg: 'Movimiento registrado', type: 'success' });
        setMovQty(''); setMovRef(''); setMovCost('');
        // Refresh item stock
        await load();
        await openItem({ ...selected, currentStock: res.data.quantityAfter });
      } else {
        setToast({ msg: (res as { error?: { message?: string } }).error?.message ?? 'Error', type: 'error' });
      }
    } catch (e) {
      setToast({ msg: (e as Error).message, type: 'error' });
    } finally { setSubmitting(false); }
  };

  const stockColor = (item: InventoryItem) => {
    if (item.currentStock === 0) return 'text-red-600 font-bold';
    if (item.currentStock <= item.reorderLevel) return 'text-amber-600 font-semibold';
    return 'text-ink font-medium';
  };

  const needsCost = movType === 'ENTRY';

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Control de stock de materiales e insumos dentales"
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-ink-secondary">
              <input type="checkbox" checked={belowReorder} onChange={e => { setBelowReorder(e.target.checked); setPage(1); }}
                className="w-3.5 h-3.5 accent-amber-500" />
              Solo alertas
            </label>
            <select className="select w-40" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
              <option value="">Todas las categorías</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
          </div>
        }
      />

      {belowReorder && items.length > 0 && (
        <div className="mb-4">
          <Alert type="warning">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>{items.length}</strong> ítem{items.length > 1 ? 's' : ''} bajo nivel mínimo de reorden.</span>
          </Alert>
        </div>
      )}

      <div className={`grid gap-5 ${selected ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>

        {/* Inventory table */}
        <div className={selected ? 'lg:col-span-3' : ''}>
          <Card>
            {loading ? <TableSkeleton rows={8} cols={6} />
            : error ? <ErrorState message={error} onRetry={load} />
            : items.length === 0 ? (
              <EmptyState
                title={belowReorder ? 'Sin alertas de inventario' : 'Inventario vacío'}
                body={belowReorder ? 'Todos los ítems están sobre el nivel mínimo.' : 'Crea ítems de inventario para empezar.'}
              />
            ) : (
              <>
                <div className="overflow-x-auto -mx-5 -mt-5">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right">Mínimo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id} onClick={() => openItem(item)}
                          className={`cursor-pointer ${selected?.id === item.id ? 'bg-accent-light/30' : ''}`}>
                          <td><span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-border">{item.sku}</span></td>
                          <td>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-ink-muted">{item.unit}</div>
                          </td>
                          <td><span className="badge-gray">{CAT_LABEL[item.category] ?? item.category}</span></td>
                          <td className={`text-right tabular ${stockColor(item)}`}>{item.currentStock}</td>
                          <td className="text-right tabular text-ink-muted">{item.reorderLevel}</td>
                          <td>
                            {item.currentStock === 0 ? <span className="badge-red">Sin stock</span>
                            : item.currentStock <= item.reorderLevel ? <span className="badge-yellow">Bajo mínimo</span>
                            : <span className="badge-green">OK</span>}
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

        {/* Detail + movement panel */}
        {selected && (
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={selected.name}
              action={<button onClick={() => setSelected(null)} className="btn-ghost btn-sm">✕</button>}
            >
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-xs text-ink-muted mb-0.5">Stock actual</div>
                  <div className={`text-2xl font-bold tabular ${stockColor(selected)}`}>{selected.currentStock}</div>
                  <div className="text-xs text-ink-muted">{selected.unit}</div>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <div className="text-xs text-ink-muted mb-0.5">Nivel mínimo</div>
                  <div className="text-2xl font-bold tabular">{selected.reorderLevel}</div>
                  <div className="text-xs text-ink-muted">{selected.unit}</div>
                </div>
              </div>

              {/* Quick movement form */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Registrar movimiento</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="input-label">Tipo</label>
                    <select className="select" value={movType} onChange={e => setMovType(e.target.value)}>
                      {MOVEMENT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.sign} {t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Cantidad *</label>
                    <input className="input tabular" type="number" min="1" placeholder="0"
                      value={movQty} onChange={e => setMovQty(e.target.value)} />
                  </div>
                </div>
                {needsCost && (
                  <div>
                    <label className="input-label">Costo unitario (centavos) *</label>
                    <input className="input tabular" type="number" min="0" placeholder="80000"
                      value={movCost} onChange={e => setMovCost(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="input-label">Referencia (PO / Plan)</label>
                  <input className="input" placeholder="PO-2025-001" value={movRef} onChange={e => setMovRef(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Operador *</label>
                  <input className="input" placeholder="dr-garcia" value={movBy} onChange={e => setMovBy(e.target.value)} />
                </div>
                <button className="btn-primary w-full" onClick={handleMovement} disabled={submitting}>
                  {submitting ? 'Registrando...' : 'Registrar movimiento'}
                </button>
              </div>
            </Card>

            {/* Movement history */}
            <Card title="Historial de movimientos">
              {loadingMov ? <TableSkeleton rows={4} cols={3} />
              : movements.length === 0 ? (
                <EmptyState title="Sin movimientos" body="No hay movimientos registrados para este ítem." />
              ) : (
                <div className="space-y-2 -mx-5 -mb-5 overflow-y-auto max-h-64">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Stock</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id}>
                          <td><StatusBadge status={m.type} /></td>
                          <td className={`text-right tabular font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {m.quantity > 0 ? '+' : ''}{m.quantity}
                          </td>
                          <td className="text-right tabular text-ink-secondary">{m.quantityAfter}</td>
                          <td className="text-ink-muted whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleDateString('es-MX')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
