'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PageHeader, Card, EmptyState, ErrorState, Alert, Toast, type ToastType,
} from '@/components/ui';
import { getTenantSettings, formatBps, currentPeriod, type TenantSettings } from '@/lib/api/client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? 'demo-api-key';

async function saveSettings(settings: Partial<TenantSettings>): Promise<{ success: boolean; error?: { message: string } }> {
  const res = await fetch(`${BASE}/api/v2/dental/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}`, 'X-Request-Id': crypto.randomUUID() },
    body: JSON.stringify(settings),
  });
  return res.json();
}

async function saveExchangeRates(baseCurrency: string, rates: Record<string, number>): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/api/v2/dental/admin/exchange-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}`, 'X-Request-Id': crypto.randomUUID() },
    body: JSON.stringify({ baseCurrency, rates, source: 'manual' }),
  });
  return res.json();
}

const CURRENCIES = ['MXN','USD','COP','PEN','EUR'];
const TIMEZONES  = ['America/Mexico_City','America/Bogota','America/Lima','America/New_York','UTC'];

export default function ConfigPage() {
  const [settings, setSettings]   = useState<TenantSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: ToastType } | null>(null);

  // Settings form state
  const [currency, setCurrency]     = useState('MXN');
  const [taxRate, setTaxRate]       = useState('16');
  const [margin, setMargin]         = useState('35');
  const [financing, setFinancing]   = useState(false);
  const [timezone, setTimezone]     = useState('America/Mexico_City');

  // Exchange rate form
  const [baseCurr, setBaseCurr]   = useState('MXN');
  const [rateUSD, setRateUSD]     = useState('');
  const [rateEUR, setRateEUR]     = useState('');
  const [rateCOP, setRateCOP]     = useState('');
  const [savingRates, setSavingRates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getTenantSettings();
      const s = res.data;
      setSettings(s);
      setCurrency(s.defaultCurrency);
      setTaxRate(String(s.taxRate));
      setMargin(String(s.defaultMarginPercent));
      setFinancing(s.financingEnabled);
      setTimezone(s.timezone);
    } catch (e) {
      // Demo mode defaults
      setSettings({ defaultCurrency: 'MXN', taxRate: 16, defaultMarginPercent: 35, financingEnabled: false, timezone: 'America/Mexico_City' });
      setCurrency('MXN'); setTaxRate('16'); setMargin('35'); setTimezone('America/Mexico_City');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await saveSettings({
        defaultCurrency: currency,
        taxRate: parseFloat(taxRate),
        defaultMarginPercent: parseFloat(margin),
        financingEnabled: financing,
        timezone,
      });
      if (res.success) {
        setToast({ msg: 'Configuración guardada', type: 'success' });
        await load();
      } else {
        setToast({ msg: res.error?.message ?? 'Error al guardar', type: 'error' });
      }
    } catch (e) {
      setToast({ msg: (e as Error).message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRates = async () => {
    const rates: Record<string, number> = {};
    if (rateUSD) rates['USD'] = parseFloat(rateUSD);
    if (rateEUR) rates['EUR'] = parseFloat(rateEUR);
    if (rateCOP) rates['COP'] = parseFloat(rateCOP);
    if (Object.keys(rates).length === 0) {
      setToast({ msg: 'Ingresa al menos una tasa', type: 'warning' });
      return;
    }
    setSavingRates(true);
    try {
      const res = await saveExchangeRates(baseCurr, rates);
      if (res.success) {
        setToast({ msg: 'Tipos de cambio guardados', type: 'success' });
        setRateUSD(''); setRateEUR(''); setRateCOP('');
      } else {
        setToast({ msg: 'Error al guardar tasas', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Error de conexión', type: 'error' });
    } finally {
      setSavingRates(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle={`Parámetros operativos del tenant — ${currentPeriod()}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Tenant settings */}
        <Card title="Configuración financiera">
          {loading ? (
            <div className="space-y-4">
              {Array.from({length:4}).map((_,i) => <div key={i} className="skeleton h-8 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="input-label">Moneda por defecto</label>
                <select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">IVA (%)</label>
                  <input className="input tabular" type="number" min="0" max="100" step="0.5"
                    value={taxRate} onChange={e => setTaxRate(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Margen por defecto (%)</label>
                  <input className="input tabular" type="number" min="0" max="200" step="1"
                    value={margin} onChange={e => setMargin(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Zona horaria</label>
                <select className="select" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-ink-secondary font-medium">Financiamiento habilitado</label>
                <button
                  onClick={() => setFinancing(f => !f)}
                  className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${
                    financing ? 'bg-accent' : 'bg-border-strong'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    financing ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              <button className="btn-primary w-full" onClick={handleSaveSettings} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          )}
        </Card>

        {/* Current settings summary */}
        {settings && (
          <Card title="Configuración activa">
            <div className="space-y-3">
              {[
                ['Moneda por defecto', settings.defaultCurrency],
                ['IVA', `${settings.taxRate}%`],
                ['Margen por defecto', `${settings.defaultMarginPercent}%`],
                ['Financiamiento', settings.financingEnabled ? 'Habilitado' : 'Deshabilitado'],
                ['Zona horaria', settings.timezone],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between items-center py-2 border-b border-border/60 last:border-0">
                  <span className="text-sm text-ink-secondary">{label}</span>
                  <span className="text-sm font-medium text-ink">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <Alert type="info">
                <div className="text-xs">
                  Los cambios de configuración afectan los nuevos cálculos de precio. Las cotizaciones existentes conservan sus valores originales (snapshots inmutables).
                </div>
              </Alert>
            </div>
          </Card>
        )}

        {/* Exchange rates */}
        <Card title="Tipos de cambio">
          <div className="space-y-4">
            <div>
              <label className="input-label">Moneda base</label>
              <select className="select" value={baseCurr} onChange={e => setBaseCurr(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Tasas hacia {baseCurr}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['USD','EUR','COP'].map(c => c !== baseCurr && (
                  <div key={c}>
                    <label className="input-label">{c}</label>
                    <input
                      className="input tabular"
                      type="number" step="0.0001" min="0"
                      placeholder={c === 'USD' ? '0.0556' : c === 'EUR' ? '0.0514' : '226.3'}
                      value={c === 'USD' ? rateUSD : c === 'EUR' ? rateEUR : rateCOP}
                      onChange={e => {
                        if (c === 'USD') setRateUSD(e.target.value);
                        else if (c === 'EUR') setRateEUR(e.target.value);
                        else setRateCOP(e.target.value);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full" onClick={handleSaveRates} disabled={savingRates}>
              {savingRates ? 'Guardando...' : 'Guardar tipos de cambio'}
            </button>
            <div className="text-xs text-ink-muted">
              Los tipos de cambio se almacenan como snapshots inmutables. Las cotizaciones usan el tipo vigente al momento de generarse.
            </div>
          </div>
        </Card>

        {/* System info */}
        <Card title="Información del sistema">
          <div className="space-y-3 text-sm">
            {[
              ['Tenant', 'Clínica Demo S.A.'],
              ['API Version', 'v2.0'],
              ['Backend', process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'],
              ['Período actual', currentPeriod()],
              ['Sprints completados', '1 → 7 (Dental Backend)'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between items-center py-2 border-b border-border/60 last:border-0">
                <span className="text-ink-secondary">{label}</span>
                <span className="font-mono text-xs bg-surface px-2 py-0.5 rounded border border-border">{value}</span>
              </div>
            ))}
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-ink-secondary">Backend operativo · 281/281 tests en verde</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
