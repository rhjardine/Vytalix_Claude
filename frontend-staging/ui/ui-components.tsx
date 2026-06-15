'use client';

import React from 'react';

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? 'h-4 w-full'}`} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-border/60">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-3.5 ${j === 0 ? 'w-32' : j === cols - 1 ? 'w-16' : 'w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  DRAFT:      'badge-gray',
  ACTIVE:     'badge-teal',
  COMPLETED:  'badge-green',
  CANCELLED:  'badge-red',
  ARCHIVED:   'badge-gray',
  SEALED:     'badge-blue',
  SUPERSEDED: 'badge-gray',
  REJECTED:   'badge-red',
  REDEEMED:   'badge-green',
  EXPIRED:    'badge-yellow',
  SUSPENDED:  'badge-red',
  REQUESTED:  'badge-yellow',
  CONFIRMED:  'badge-teal',
  CHECKED_IN: 'badge-blue',
  NO_SHOW:    'badge-red',
  ENTRY:      'badge-green',
  CONSUMPTION:'badge-yellow',
  ADJUSTMENT_IN:  'badge-teal',
  ADJUSTMENT_OUT: 'badge-red',
  RETURN:     'badge-blue',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', ACTIVE: 'Activo', COMPLETED: 'Completado',
  CANCELLED: 'Cancelado', ARCHIVED: 'Archivado', SEALED: 'Sellado',
  SUPERSEDED: 'Reemplazado', REJECTED: 'Rechazado', REDEEMED: 'Canjeado',
  EXPIRED: 'Vencido', SUSPENDED: 'Suspendido', REQUESTED: 'Solicitada',
  CONFIRMED: 'Confirmada', CHECKED_IN: 'En clínica', NO_SHOW: 'No asistió',
  ENTRY: 'Entrada', CONSUMPTION: 'Consumo', ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste −', RETURN: 'Devolución',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_MAP[status] ?? 'badge-gray';
  return <span className={cls}>{STATUS_LABEL[status] ?? status}</span>;
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  title, body, action,
}: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <div className="empty-state-title">{title}</div>
      {body && <div className="empty-state-body mt-1">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div className="text-sm font-medium text-ink-secondary mb-1">Error al cargar</div>
      <div className="text-xs text-ink-muted mb-4 max-w-xs">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm">
          Reintentar
        </button>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, trend, accent = false,
}: { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral'; accent?: boolean }) {
  return (
    <div className={`kpi-card ${accent ? 'border-accent/30 bg-accent-light/30' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${accent ? 'text-accent-dark' : ''}`}>{value}</div>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend === 'up' && <span className="text-green-600 text-xs">↑</span>}
          {trend === 'down' && <span className="text-red-500 text-xs">↓</span>}
          <span className="text-xs text-ink-muted">{sub}</span>
        </div>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

export function Card({
  title, action, children, className,
}: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className ?? ''}`}>
      {title && (
        <div className="card-header">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

export function Alert({
  type = 'info', children,
}: { type?: 'info' | 'warning' | 'error' | 'success'; children: React.ReactNode }) {
  const cls = { info: 'alert-info', warning: 'alert-warning', error: 'alert-error', success: 'alert-success' }[type];
  return <div className={cls}>{children}</div>;
}

// ── Pagination bar ────────────────────────────────────────────────────────────

export function Pagination({
  page, total, pageSize, onChange,
}: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-ink-muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div className="flex gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn-secondary btn-sm">
          ‹
        </button>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages} className="btn-secondary btn-sm">
          ›
        </button>
      </div>
    </div>
  );
}

// ── Search input ──────────────────────────────────────────────────────────────

export function SearchInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Buscar...'}
        className="input pl-8 w-64"
      />
    </div>
  );
}

// ── Money display ─────────────────────────────────────────────────────────────

export function MoneyDisplay({
  amount, currency = 'MXN', size = 'md',
}: { amount: number; currency?: string; size?: 'sm' | 'md' | 'lg' }) {
  const formatted = new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amount / 100);

  const cls = { sm: 'text-xs', md: 'text-sm font-medium', lg: 'text-xl font-semibold' }[size];
  return <span className={`tabular ${cls}`}>{formatted}</span>;
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open, title, body, confirmLabel = 'Confirmar', danger = false,
  onConfirm, onCancel,
}: {
  open: boolean; title: string; body?: string; confirmLabel?: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-sm font-semibold text-ink mb-2">{title}</h3>
        {body && <p className="text-sm text-ink-secondary mb-5">{body}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export function Toast({
  message, type = 'info', onClose,
}: { message: string; type?: ToastType; onClose: () => void }) {
  const bg = { success: 'bg-green-700', error: 'bg-red-700', warning: 'bg-amber-700', info: 'bg-accent' }[type];
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${bg}`}>
      {message}
      <button onClick={onClose} className="text-white/70 hover:text-white ml-2">✕</button>
    </div>
  );
}
