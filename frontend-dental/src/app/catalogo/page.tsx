'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PageHeader, Card, EmptyState, ErrorState, TableSkeleton,
  Pagination, MoneyDisplay, SearchInput,
} from '@/components/ui';
import { listCatalog, type CatalogItem } from '@/lib/api/client';

const CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'CONSULTATION',  label: 'Consultas' },
  { value: 'RESTORATION',   label: 'Restauración' },
  { value: 'ENDODONTICS',   label: 'Endodoncia' },
  { value: 'PERIODONTICS',  label: 'Periodoncia' },
  { value: 'SURGERY',       label: 'Cirugía' },
  { value: 'ORTHODONTICS',  label: 'Ortodoncia' },
  { value: 'PROSTHETICS',   label: 'Prótesis' },
  { value: 'IMPLANTS',      label: 'Implantes' },
  { value: 'PREVENTIVE',    label: 'Preventivo' },
  { value: 'COSMETIC',      label: 'Cosmético' },
  { value: 'OTHER',         label: 'Otro' },
];

const CATEGORY_COLOR: Record<string, string> = {
  CONSULTATION: 'badge-blue', RESTORATION: 'badge-teal', ENDODONTICS: 'badge-yellow',
  PERIODONTICS: 'badge-green', SURGERY: 'badge-red', ORTHODONTICS: 'badge-blue',
  PROSTHETICS: 'badge-teal', IMPLANTS: 'badge-gray', PREVENTIVE: 'badge-green',
  COSMETIC: 'badge-blue', OTHER: 'badge-gray',
};

export default function CatalogoPage() {
  const [items, setItems]       = useState<CatalogItem[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listCatalog({ category: category || undefined, page, pageSize: PAGE_SIZE });
      const data = res.data ?? [];
      // client-side search filter (API doesn't have search param)
      const filtered = search
        ? data.filter(i =>
            i.name.toLowerCase().includes(search.toLowerCase()) ||
            i.code.toLowerCase().includes(search.toLowerCase())
          )
        : data;
      setItems(filtered);
      setTotal(res.pagination?.total ?? filtered.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => { setPage(1); }, [category, search]);
  useEffect(() => { load(); }, [load]);

  const durationLabel = (min?: number) =>
    min ? (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 > 0 ? `${min % 60}min` : ''}`.trim() : `${min} min`) : '—';

  return (
    <div>
      <PageHeader
        title="Catálogo de Servicios"
        subtitle="Tratamientos disponibles con precios vigentes"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar tratamiento..." />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                category === c.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white text-ink-secondary border-border hover:border-accent/50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-5 ${selected ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>

        {/* ── Table ── */}
        <div className={selected ? 'lg:col-span-2' : ''}>
          <Card>
            {loading ? (
              <TableSkeleton rows={10} cols={5} />
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : items.length === 0 ? (
              <EmptyState
                title="Sin resultados"
                body={search || category ? 'Ajusta los filtros para ver más tratamientos.' : 'El catálogo está vacío.'}
              />
            ) : (
              <>
                <div className="overflow-x-auto -mx-5 -mt-5">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Tratamiento</th>
                        <th>Categoría</th>
                        <th>Duración</th>
                        <th className="text-right">Precio</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr
                          key={item.code}
                          onClick={() => setSelected(selected?.code === item.code ? null : item)}
                          className={`cursor-pointer ${selected?.code === item.code ? 'bg-accent-light/30' : ''}`}
                        >
                          <td>
                            <span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-border">
                              {item.code}
                            </span>
                          </td>
                          <td>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-xs text-ink-muted truncate max-w-[220px]">{item.description}</div>
                            )}
                          </td>
                          <td>
                            <span className={CATEGORY_COLOR[item.category] ?? 'badge-gray'}>
                              {CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                            </span>
                          </td>
                          <td className="tabular text-sm">{durationLabel(item.durationMinutes)}</td>
                          <td className="text-right">
                            <MoneyDisplay amount={item.price} currency={item.currency} size="md" />
                          </td>
                          <td>
                            <span className={item.isActive ? 'badge-green' : 'badge-gray'}>
                              {item.isActive ? 'Activo' : 'Inactivo'}
                            </span>
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

        {/* ── Detail panel ── */}
        {selected && (
          <div className="space-y-4">
            <Card
              title="Detalle del tratamiento"
              action={<button onClick={() => setSelected(null)} className="btn-ghost btn-sm">✕</button>}
            >
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Código</div>
                  <div className="font-mono text-sm font-medium bg-surface px-2 py-1 rounded border border-border inline-block">
                    {selected.code}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Nombre</div>
                  <div className="font-semibold text-sm">{selected.name}</div>
                </div>
                {selected.description && (
                  <div>
                    <div className="text-xs text-ink-muted mb-0.5">Descripción</div>
                    <div className="text-sm text-ink-secondary">{selected.description}</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-xs text-ink-muted mb-1">Precio</div>
                    <MoneyDisplay amount={selected.price} currency={selected.currency} size="lg" />
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <div className="text-xs text-ink-muted mb-1">Duración</div>
                    <div className="text-lg font-semibold">{durationLabel(selected.durationMinutes)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-1">Categoría</div>
                  <span className={CATEGORY_COLOR[selected.category] ?? 'badge-gray'}>
                    {CATEGORIES.find(c => c.value === selected.category)?.label ?? selected.category}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <a href="/cotizar" className="btn-primary w-full flex justify-center">
                  Cotizar este tratamiento
                </a>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
