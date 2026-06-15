'use client';

import { useState } from 'react';
import {
  PageHeader, Card, EmptyState, Alert, StatusBadge,
  MoneyDisplay, Toast, ConfirmDialog, type ToastType,
} from '@/components/ui';
import { getVoucher, redeemVoucher, type DentalVoucher } from '@/lib/api/client';

const CHANNELS = [
  { value: 'QR_SCAN', label: 'Escaneo QR' },
  { value: 'MANUAL',  label: 'Manual' },
  { value: 'KIOSK',   label: 'Kiosco' },
  { value: 'API',     label: 'API' },
];

export default function VouchersPage() {
  const [token, setToken]           = useState('');
  const [voucher, setVoucher]       = useState<DentalVoucher | null>(null);
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [channel, setChannel]       = useState('QR_SCAN');
  const [redeemedBy, setRedeemedBy] = useState('');
  const [locationId, setLocationId] = useState('');
  const [redeeming, setRedeeming]   = useState(false);
  const [confirm, setConfirm]       = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: ToastType } | null>(null);

  const handleSearch = async () => {
    if (token.trim().length < 10) { setSearchError('Ingresa un token válido.'); return; }
    setSearching(true); setSearchError(null); setVoucher(null);
    try {
      const res = await getVoucher(token.trim());
      setVoucher(res.data);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleRedeem = async () => {
    if (!voucher || !redeemedBy.trim()) return;
    setRedeeming(true); setConfirm(false);
    try {
      const res = await redeemVoucher({
        token: voucher.token,
        redeemedBy: redeemedBy.trim(),
        channel,
        locationId: locationId.trim() || undefined,
        correlationId: crypto.randomUUID(),
      });
      if (res.data.result === 'SUCCESS') {
        setToast({ msg: 'Voucher canjeado exitosamente', type: 'success' });
        setVoucher(prev => prev ? { ...prev, status: 'REDEEMED', redeemedAt: new Date().toISOString() } : null);
      } else {
        setToast({ msg: `Canje rechazado: ${res.data.result}`, type: 'error' });
      }
    } catch (e) {
      setToast({ msg: (e as Error).message, type: 'error' });
    } finally {
      setRedeeming(false);
    }
  };

  const canRedeem = voucher?.status === 'ACTIVE';
  const expiresAt = voucher ? new Date(voucher.expiresAt) : null;
  const isExpiringSoon = expiresAt && voucher?.status === 'ACTIVE'
    && (expiresAt.getTime() - Date.now()) < 7 * 86400_000;

  return (
    <div>
      <PageHeader
        title="Vouchers"
        subtitle="Consulta y canje de vouchers dentales digitales"
      />

      {/* Search */}
      <Card title="Buscar voucher por token" className="mb-5">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="input-label">Token del voucher (64 caracteres hex)</label>
            <input
              className="input font-mono text-xs"
              placeholder="a3f2e1d0..."
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {searchError && <div className="text-xs text-red-600 mt-1">{searchError}</div>}
          </div>
          <button
            className="btn-primary shrink-0"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </Card>

      {/* Voucher result */}
      {!voucher && !searching && (
        <EmptyState
          title="Busca un voucher"
          body="Ingresa el token para consultar el estado y realizar el canje."
        />
      )}

      {voucher && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Voucher info */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="Información del voucher">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">ID</div>
                  <div className="font-mono text-xs">{voucher.id}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Estado</div>
                  <StatusBadge status={voucher.status} />
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Tratamiento</div>
                  <div className="font-medium">{voucher.catalogItemCode}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Beneficiario</div>
                  <div className="font-mono text-xs">{voucher.beneficiaryRef ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Valor pagado</div>
                  <MoneyDisplay amount={voucher.priceAmount} currency={voucher.priceCurrency} size="md" />
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Vence</div>
                  <div className={isExpiringSoon ? 'text-amber-700 font-medium' : ''}>
                    {expiresAt?.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {isExpiringSoon && ' ⚠ Próximo a vencer'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Emitido</div>
                  <div>{new Date(voucher.createdAt).toLocaleDateString('es-MX')}</div>
                </div>
                {voucher.redeemedAt && (
                  <div>
                    <div className="text-xs text-ink-muted mb-0.5">Canjeado</div>
                    <div>{new Date(voucher.redeemedAt).toLocaleString('es-MX')}</div>
                  </div>
                )}
              </div>

              {/* Token display */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs text-ink-muted mb-1">Token</div>
                <div className="font-mono text-[11px] bg-surface border border-border rounded p-2 break-all select-all">
                  {voucher.token}
                </div>
              </div>
            </Card>

            {/* Status alerts */}
            {voucher.status === 'REDEEMED' && (
              <Alert type="success">
                <div>
                  <div className="font-semibold text-sm">Voucher canjeado</div>
                  <div className="text-xs mt-0.5">
                    Este voucher ya fue utilizado el {voucher.redeemedAt
                      ? new Date(voucher.redeemedAt).toLocaleString('es-MX') : '—'}.
                  </div>
                </div>
              </Alert>
            )}
            {voucher.status === 'EXPIRED' && (
              <Alert type="error">Este voucher venció el {expiresAt?.toLocaleDateString('es-MX')}.</Alert>
            )}
            {voucher.status === 'CANCELLED' && (
              <Alert type="error">Este voucher fue cancelado y no puede ser canjeado.</Alert>
            )}
            {voucher.status === 'SUSPENDED' && (
              <Alert type="warning">Este voucher está suspendido pendiente revisión.</Alert>
            )}
            {isExpiringSoon && voucher.status === 'ACTIVE' && (
              <Alert type="warning">
                Voucher próximo a vencer el {expiresAt?.toLocaleDateString('es-MX')}.
              </Alert>
            )}
          </div>

          {/* Redeem panel */}
          <div>
            <Card title="Canjear voucher">
              {!canRedeem ? (
                <EmptyState
                  title="No disponible para canje"
                  body={`Estado actual: ${voucher.status}`}
                />
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Operador / Responsable *</label>
                    <input
                      className="input"
                      placeholder="dr-garcia o recepcion-01"
                      value={redeemedBy}
                      onChange={e => setRedeemedBy(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="input-label">Canal de canje</label>
                    <select className="select" value={channel} onChange={e => setChannel(e.target.value)}>
                      {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Ubicación (opcional)</label>
                    <input
                      className="input"
                      placeholder="clinic-polanco"
                      value={locationId}
                      onChange={e => setLocationId(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary w-full mt-2"
                    onClick={() => {
                      if (!redeemedBy.trim()) {
                        setToast({ msg: 'Ingresa el operador responsable.', type: 'warning' });
                        return;
                      }
                      setConfirm(true);
                    }}
                    disabled={redeeming}
                  >
                    {redeeming ? 'Procesando...' : 'Confirmar canje'}
                  </button>
                  <div className="text-xs text-ink-muted text-center">
                    Esta acción es irreversible
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Confirmar canje de voucher"
        body={`¿Seguro que deseas canjear este voucher para ${voucher?.catalogItemCode}? El operador responsable quedará registrado como "${redeemedBy}".`}
        confirmLabel="Sí, canjear"
        danger={false}
        onConfirm={handleRedeem}
        onCancel={() => setConfirm(false)}
      />

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
