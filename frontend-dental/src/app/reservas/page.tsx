'use client';

import { useState } from 'react';
import {
  PageHeader, Card, EmptyState, ErrorState, Alert,
  StatusBadge, MoneyDisplay, Toast, ConfirmDialog, type ToastType,
} from '@/components/ui';
import { getBooking, type DentalBooking } from '@/lib/api/client';

const FULFILLMENT_STEPS = [
  { key: 'PURCHASED',   label: 'Comprado' },
  { key: 'SCHEDULED',   label: 'Agendado' },
  { key: 'CONFIRMED',   label: 'Confirmado' },
  { key: 'CHECKED_IN',  label: 'En clínica' },
  { key: 'COMPLETED',   label: 'Completado' },
];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? 'demo-api-key';

async function bookingAction(bookingId: string, action: 'confirm' | 'check-in' | 'complete' | 'cancel', reason?: string) {
  const body = action === 'cancel' ? JSON.stringify({ reason: reason ?? 'Cancelled by operator' }) : undefined;
  const res = await fetch(`${BASE}/api/v2/dental/commerce/bookings/${bookingId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}`, 'X-Request-Id': crypto.randomUUID() },
    body,
  });
  return res.json();
}

export default function ReservasPage() {
  const [bookingId, setBookingId]     = useState('');
  const [booking, setBooking]         = useState<DentalBooking | null>(null);
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [acting, setActing]           = useState(false);
  const [confirm, setConfirm]         = useState<{ action: string; label: string } | null>(null);
  const [toast, setToast]             = useState<{ msg: string; type: ToastType } | null>(null);

  const handleSearch = async () => {
    if (!bookingId.trim()) { setSearchError('Ingresa el ID de la reserva.'); return; }
    setSearching(true); setSearchError(null); setBooking(null);
    try {
      const res = await getBooking(bookingId.trim());
      setBooking(res.data);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleAction = async (action: 'confirm' | 'check-in' | 'complete' | 'cancel') => {
    if (!booking) return;
    setActing(true); setConfirm(null);
    try {
      const res = await bookingAction(booking.id, action);
      if (res.success) {
        setBooking(res.data);
        setToast({ msg: `Acción "${action}" aplicada correctamente`, type: 'success' });
      } else {
        setToast({ msg: res.error?.message ?? 'Error al ejecutar acción', type: 'error' });
      }
    } catch (e) {
      setToast({ msg: (e as Error).message, type: 'error' });
    } finally {
      setActing(false);
    }
  };

  const ACTIONS: Record<string, { action: 'confirm' | 'check-in' | 'complete' | 'cancel'; label: string; danger?: boolean }[]> = {
    REQUESTED:  [{ action: 'confirm', label: 'Confirmar' }, { action: 'cancel', label: 'Cancelar', danger: true }],
    CONFIRMED:  [{ action: 'check-in', label: 'Check-in paciente' }, { action: 'cancel', label: 'Cancelar', danger: true }],
    CHECKED_IN: [{ action: 'complete', label: 'Completar servicio' }],
    COMPLETED:  [],
    CANCELLED:  [],
    NO_SHOW:    [],
  };

  const currentActions = booking ? (ACTIONS[booking.status] ?? []) : [];

  const fulfillmentIdx = FULFILLMENT_STEPS.findIndex(s => s.key === (booking as DentalBooking & { fulfillmentStatus?: string })?.fulfillmentStatus);

  return (
    <div>
      <PageHeader title="Reservas" subtitle="Gestión del ciclo de vida de citas dentales" />

      {/* Search */}
      <Card title="Buscar reserva" className="mb-5">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="input-label">ID de la reserva (UUID)</label>
            <input
              className="input font-mono text-xs"
              placeholder="f47ac10b-58cc-4372-a567-..."
              value={bookingId}
              onChange={e => setBookingId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {searchError && <div className="text-xs text-red-600 mt-1">{searchError}</div>}
          </div>
          <button className="btn-primary shrink-0" onClick={handleSearch} disabled={searching}>
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </Card>

      {!booking && !searching && (
        <EmptyState title="Busca una reserva" body="Ingresa el ID de la cita para ver su estado y ejecutar acciones." />
      )}

      {booking && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Booking detail */}
          <div className="lg:col-span-2 space-y-4">
            <Card title="Detalle de la reserva">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">ID</div>
                  <div className="font-mono text-xs">{booking.id}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Estado</div>
                  <StatusBadge status={booking.status} />
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Tratamiento</div>
                  <div className="font-medium">{booking.catalogItemCode}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Paciente</div>
                  <div className="font-mono text-xs">{booking.patientRef}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Inicio</div>
                  <div>{new Date(booking.slotStart).toLocaleString('es-MX')}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Fin</div>
                  <div>{new Date(booking.slotEnd).toLocaleString('es-MX')}</div>
                </div>
                {booking.voucherId && (
                  <div className="col-span-2">
                    <div className="text-xs text-ink-muted mb-0.5">Voucher vinculado</div>
                    <div className="font-mono text-xs">{booking.voucherId}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-ink-muted mb-0.5">Creada</div>
                  <div className="text-xs">{new Date(booking.createdAt).toLocaleString('es-MX')}</div>
                </div>
              </div>
            </Card>

            {/* Fulfillment timeline */}
            <Card title="Ciclo de fulfillment">
              <div className="flex items-center gap-0">
                {FULFILLMENT_STEPS.map((step, idx) => {
                  const isDone = idx <= fulfillmentIdx;
                  const isCurrent = idx === fulfillmentIdx;
                  return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                          isCurrent ? 'border-accent bg-accent text-white'
                          : isDone   ? 'border-accent bg-accent-light text-accent-dark'
                          : 'border-border bg-surface text-ink-muted'
                        }`}>
                          {isDone && !isCurrent ? '✓' : idx + 1}
                        </div>
                        <div className={`text-[11px] mt-1.5 text-center w-16 ${
                          isCurrent ? 'text-accent font-semibold' : isDone ? 'text-ink-secondary' : 'text-ink-muted'
                        }`}>{step.label}</div>
                      </div>
                      {idx < FULFILLMENT_STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mb-5 mx-1 ${isDone && idx < fulfillmentIdx ? 'bg-accent' : 'bg-border'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Actions panel */}
          <div>
            <Card title="Acciones disponibles">
              {currentActions.length === 0 ? (
                <EmptyState
                  title="Sin acciones disponibles"
                  body={`La reserva está en estado "${booking.status}" y no admite más transiciones.`}
                />
              ) : (
                <div className="space-y-2">
                  {currentActions.map(a => (
                    <button
                      key={a.action}
                      onClick={() => setConfirm({ action: a.action, label: a.label })}
                      disabled={acting}
                      className={`w-full ${a.danger ? 'btn-danger' : 'btn-primary'}`}
                    >
                      {a.label}
                    </button>
                  ))}
                  <div className="text-xs text-ink-muted text-center pt-1">
                    Las transiciones son permanentes y quedan registradas en auditoría.
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={`Confirmar: ${confirm?.label}`}
        body={`¿Deseas ejecutar la acción "${confirm?.label}" en esta reserva? La acción quedará registrada.`}
        confirmLabel={confirm?.label}
        danger={confirm?.action === 'cancel'}
        onConfirm={() => confirm && handleAction(confirm.action as never)}
        onCancel={() => setConfirm(null)}
      />

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
