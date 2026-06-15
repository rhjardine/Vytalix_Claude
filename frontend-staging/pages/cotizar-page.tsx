'use client';

import { useState, useCallback } from 'react';
import {
  PageHeader, Card, EmptyState, Alert, MoneyDisplay,
  StatCard, Toast, type ToastType,
} from '@/components/ui';
import {
  generateQuote, listCatalog, formatBps,
  type QuoteResult, type CatalogItem,
} from '@/lib/api/client';

interface QuoteItem { code: string; name: string; qty: number; unitPrice: number; currency: string; }

const CURRENCIES = ['MXN', 'USD', 'COP', 'EUR'];

export default function CotizarPage() {
  const [patientRef, setPatientRef]     = useState('');
  const [currency, setCurrency]         = useState('MXN');
  const [items, setItems]               = useState<QuoteItem[]>([]);
  const [quote, setQuote]               = useState<QuoteResult | null>(null);
  const [catalog, setCatalog]           = useState<CatalogItem[]>([]);
  const [showCatalog, setShowCatalog]   = useState(false);
  const [loadingCat, setLoadingCat]     = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; type: ToastType } | null>(null);

  const openCatalog = useCallback(async () => {
    setShowCatalog(true);
    if (catalog.length > 0) return;
    setLoadingCat(true);
    try {
      const res = await listCatalog({ pageSize: 50 });
      setCatalog(res.data ?? []);
    } catch { setCatalog([]); }
    finally   { setLoadingCat(false); }
  }, [catalog.length]);

  const addItem = (item: CatalogItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.code === item.code);
      if (existing) return prev.map(i => i.code === item.code ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { code: item.code, name: item.name, qty: 1, unitPrice: item.price, currency: item.currency }];
    });
    setShowCatalog(false);
    setQuote(null);
  };

  const updateQty = (code: string, delta: number) => {
    setItems(prev => prev
      .map(i => i.code === code ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
    setQuote(null);
  };

  const removeItem = (code: string) => {
    setItems(prev => prev.filter(i => i.code !== code));
    setQuote(null);
  };

  const handleGenerate = async () => {
    if (!patientRef.trim()) { setError('Ingresa la referencia del paciente.'); return; }
    if (items.length === 0) { setError('Agrega al menos un tratamiento.'); return; }
    setError(null); setGenerating(true);
    try {
      const res = await generateQuote({
        patientRef: patientRef.trim(),
        currency,
        items: items.map(i => ({ treatmentCode: i.code, quantity: i.qty })),
        correlationId: crypto.randomUUID(),
      });
      setQuote(res.data);
      setToast({ msg: 'Cotización generada correctamente', type: 'success' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  return (
    <div>
      <PageHeader title="Nueva Cotización" subtitle="Selecciona tratamientos y genera el desglose" />

      {error && (
        <div className="alert-error mb-5 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Builder panel ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Patient + currency */}
          <Card title="Datos del paciente">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Referencia paciente *</label>
                <input
                  className="input"
                  placeholder="PAC-2025-001"
                  value={patientRef}
                  onChange={e => setPatientRef(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Moneda</label>
                <select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Treatment items */}
          <Card
            title="Tratamientos"
            action={
              <button className="btn-primary btn-sm" onClick={openCatalog}>
                + Agregar tratamiento
              </button>
            }
          >
            {items.length === 0 ? (
              <EmptyState
                title="Sin tratamientos"
                body="Agrega procedimientos desde el catálogo."
                action={
                  <button className="btn-secondary btn-sm" onClick={openCatalog}>
                    Ver catálogo
                  </button>
                }
              />
            ) : (
              <div className="overflow-x-auto -mx-5 -mb-5">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tratamiento</th>
                      <th className="text-right">Precio unit.</th>
                      <th className="text-center">Cant.</th>
                      <th className="text-right">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.code}>
                        <td>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-ink-muted font-mono">{item.code}</div>
                        </td>
                        <td className="text-right">
                          <MoneyDisplay amount={item.unitPrice} currency={item.currency} />
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQty(item.code, -1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center text-ink-secondary hover:bg-surface text-xs">−</button>
                            <span className="w-6 text-center tabular text-sm font-medium">{item.qty}</span>
                            <button onClick={() => updateQty(item.code, +1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center text-ink-secondary hover:bg-surface text-xs">+</button>
                          </div>
                        </td>
                        <td className="text-right font-semibold">
                          <MoneyDisplay amount={item.unitPrice * item.qty} currency={item.currency} />
                        </td>
                        <td className="text-right">
                          <button onClick={() => removeItem(item.code)}
                            className="text-ink-muted hover:text-red-500 text-xs px-1">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ── Summary panel ── */}
        <div className="space-y-4">
          <Card title="Resumen">
            {items.length === 0 ? (
              <div className="text-xs text-ink-muted py-4 text-center">
                Agrega tratamientos para ver el resumen
              </div>
            ) : quote ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">Subtotal</span>
                  <MoneyDisplay amount={quote.subtotal.amount} currency={quote.subtotal.currency} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">Descuento</span>
                  <MoneyDisplay amount={quote.discount.amount} currency={quote.discount.currency} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">IVA (16%)</span>
                  <MoneyDisplay amount={quote.tax.amount} currency={quote.tax.currency} />
                </div>
                <div className="border-t border-border pt-3 flex justify-between">
                  <span className="font-semibold text-sm">Total</span>
                  <MoneyDisplay amount={quote.total.amount} currency={quote.total.currency} size="lg" />
                </div>

                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Márgenes</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Margen bruto</span>
                    <span className="text-accent-dark font-medium">{formatBps(quote.marginSnapshot.grossMarginBps)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Margen neto</span>
                    <span className="text-accent-dark font-medium">{formatBps(quote.marginSnapshot.netMarginBps)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Costo material</span>
                    <span className="text-ink-secondary">{formatBps(quote.marginSnapshot.materialCostBps)}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <div className="text-[11px] text-ink-muted">
                    Válida hasta: {new Date(quote.validUntil).toLocaleString('es-MX')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-secondary">Estimado</span>
                  <MoneyDisplay amount={subtotal} currency={currency} />
                </div>
                <div className="text-xs text-ink-muted">Genera la cotización para ver IVA y márgenes exactos.</div>
              </div>
            )}

            <button
              className="btn-primary w-full mt-4"
              onClick={handleGenerate}
              disabled={generating || items.length === 0}
            >
              {generating ? 'Generando...' : quote ? 'Regenerar cotización' : 'Generar cotización'}
            </button>
          </Card>

          {quote && (
            <Alert type="success">
              <div className="text-xs">
                <div className="font-semibold mb-0.5">Cotización lista</div>
                Ref: <span className="font-mono">{quote.correlationId.slice(0, 8)}…</span>
              </div>
            </Alert>
          )}
        </div>
      </div>

      {/* ── Catalog modal ── */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCatalog(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-semibold text-sm text-ink">Seleccionar tratamiento</span>
              <button onClick={() => setShowCatalog(false)} className="btn-ghost btn-sm">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadingCat ? (
                <div className="p-6"><div className="space-y-3">{Array.from({length:5}).map((_,i)=><div key={i} className="h-10 skeleton rounded"/>)}</div></div>
              ) : catalog.length === 0 ? (
                <EmptyState title="Catálogo vacío" body="No hay ítems disponibles." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tratamiento</th>
                      <th>Categoría</th>
                      <th className="text-right">Precio</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map(item => (
                      <tr key={item.code}>
                        <td>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-ink-muted font-mono">{item.code}</div>
                        </td>
                        <td><span className="badge-blue">{item.category}</span></td>
                        <td className="text-right"><MoneyDisplay amount={item.price} currency={item.currency} /></td>
                        <td className="text-right">
                          <button onClick={() => addItem(item)} className="btn-primary btn-sm">
                            + Agregar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
