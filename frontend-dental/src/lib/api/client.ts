/**
 * lib/api/client.ts
 *
 * Cliente HTTP tipado para la vertical CFE Dental.
 *
 * Inyecta automáticamente en cada request:
 *   - Authorization: Bearer <token>
 *   - X-Tenant-ID: <tenantId>
 *   - X-Correlation-ID: crypto.randomUUID()
 *   - Content-Type: application/json
 *
 * NO contiene lógica de negocio.
 * TODO cálculo financiero delega al backend Express.
 */

import type { TreatmentPlanStatus } from '@/types/dental';

// ── Configuración base ────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

/** Leído del TenantContext en tiempo de llamada vía getter inyectable. */
let _getSession: (() => { token: string; tenantId: string } | null) | null = null;

/**
 * Registra el getter de sesión. Llamar una vez desde el TenantProvider.
 * Permite que el cliente sea un módulo singleton sin acoplarse al Context.
 */
export function registerSessionGetter(
  getter: () => { token: string; tenantId: string } | null
) {
  _getSession = getter;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const session = _getSession?.();
  const correlationId = crypto.randomUUID();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': correlationId,
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (session?.token)    headers['Authorization']  = `Bearer ${session.token}`;
  if (session?.tenantId) headers['X-Tenant-ID']    = session.tenantId;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`[${res.status}] ${path} — ${text} (correlationId: ${correlationId})`);
  }

  return res.json() as Promise<T>;
}

// ── Response envelope types ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SingleResponse<T> {
  data: T;
  success: boolean;
}

export interface MutationResponse<T = void> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

// ── Domain types (mirrors src/dental/types.ts — no logic, types only) ─────────

export type { TreatmentPlanStatus };

export interface TreatmentPlan {
  id: string;
  tenantId: string;
  patientRef: string;
  title: string;
  description?: string;        // ← added: used in planes/page.tsx
  status: TreatmentPlanStatus;
  currentVersion: number;
  currentVersionId?: string;   // ← added: used in planes/page.tsx
  totalAmountCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

// TreatmentVersion — returned in getPlan() detail response
export interface TreatmentVersion {
  id: string;
  versionNumber: number;
  status: string;
  totalAmount: number;
  currency: string;
  sealedAt?: string;
  items: Array<{ description: string; quantity: number; unitPrice?: number }>;
  createdAt: string;
}

export interface CatalogItem {
  code: string;
  name: string;
  category: string;
  description?: string;
  durationMinutes?: number;  // ← added: used in catalogo/page.tsx
  price: number;             // centavos
  currency: string;
  marginBps?: number;
  isActive?: boolean;        // ← added: used in catalogo/page.tsx
}

export interface MoneyAmount {
  amount: number;      // centavos
  currency: string;
}

export interface MarginSnapshot {
  grossMarginBps: number;
  netMarginBps: number;
  materialCostBps: number;
}

export interface QuoteResult {
  correlationId: string;
  patientRef: string;
  subtotal: MoneyAmount;
  discount: MoneyAmount;
  tax: MoneyAmount;
  total: MoneyAmount;
  marginSnapshot: MarginSnapshot;
  validUntil: string;  // ISO 8601
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  currentStock: number;
  reorderLevel: number;
  unitCostCents: number;
  currency: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  type: string;
  quantity: number;
  quantityAfter: number;
  unitCost?: number;
  reference?: string;
  performedBy: string;
  createdAt: string;
}

export interface FinancialAggregate {
  period: string;
  currency: string;
  totalNetRevenue: number;     // centavos
  avgGrossMarginBps: number;
  totalPlans: number;
  activePlans: number;
}

// ── Analytics / period helpers ────────────────────────────────────────────────

/** Returns YYYY-MM string for the current month */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Converts basis points (bps) to a human-readable percentage string */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

// ── Treatment Plans ───────────────────────────────────────────────────────────

export interface ListPlansParams {
  page?: number;
  pageSize?: number;
  status?: TreatmentPlanStatus;
  patientRef?: string;
}

export async function listPlans(
  params: ListPlansParams = {}
): Promise<PaginatedResponse<TreatmentPlan>> {
  const qs = new URLSearchParams();
  if (params.page)      qs.set('page',      String(params.page));
  if (params.pageSize)  qs.set('pageSize',  String(params.pageSize));
  if (params.status)    qs.set('status',    params.status);
  if (params.patientRef) qs.set('patientRef', params.patientRef);
  return apiFetch(`/v2/dental/plans?${qs}`);
}

export interface PlanDetailResponse {
  plan: TreatmentPlan;
  versions: TreatmentVersion[];
}

export async function getPlan(planId: string): Promise<SingleResponse<PlanDetailResponse>> {
  return apiFetch(`/v2/dental/plans/${planId}`);
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface ListCatalogParams {
  category?: string;
  page?: number;
  pageSize?: number;
}

export async function listCatalog(
  params: ListCatalogParams = {}
): Promise<PaginatedResponse<CatalogItem>> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.page)     qs.set('page',     String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  return apiFetch(`/v2/dental/catalog?${qs}`);
}

// ── Quote generation ──────────────────────────────────────────────────────────

export interface GenerateQuoteInput {
  patientRef: string;
  currency: string;
  correlationId: string;
  items: Array<{ treatmentCode: string; quantity: number }>;
}

export async function generateQuote(
  input: GenerateQuoteInput
): Promise<SingleResponse<QuoteResult>> {
  return apiFetch('/v2/dental/quotes', { method: 'POST', body: input });
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface ListInventoryParams {
  category?: string;
  belowReorderLevel?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listInventory(
  params: ListInventoryParams = {}
): Promise<PaginatedResponse<InventoryItem>> {
  const qs = new URLSearchParams();
  if (params.category)           qs.set('category',          params.category);
  if (params.belowReorderLevel)  qs.set('belowReorderLevel', 'true');
  if (params.page)               qs.set('page',              String(params.page));
  if (params.pageSize)           qs.set('pageSize',          String(params.pageSize));
  return apiFetch(`/v2/dental/inventory?${qs}`);
}

export async function getItemMovements(
  itemId: string
): Promise<PaginatedResponse<InventoryMovement>> {
  return apiFetch(`/v2/dental/inventory/${itemId}/movements`);
}

export interface RecordMovementInput {
  itemId: string;
  type: string;
  quantity: number;
  unitCost?: number;
  reference?: string;
  performedBy: string;
  correlationId: string;
}

export async function recordMovement(
  input: RecordMovementInput
): Promise<MutationResponse<{ quantityAfter: number }>> {
  return apiFetch(`/v2/dental/inventory/${input.itemId}/movements`, {
    method: 'POST',
    body: input,
  });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface InventoryAnalyticsResult {
  lowStockItems: Array<{
    name: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
    deficit: number;
  }>;
}

export async function getRevenueAnalytics(
  period: string
): Promise<SingleResponse<{ aggregate: FinancialAggregate }>> {
  return apiFetch(`/v2/dental/analytics/revenue?period=${period}`);
}

export async function getInventoryAnalytics(): Promise<
  SingleResponse<InventoryAnalyticsResult>
> {
  return apiFetch('/v2/dental/analytics/inventory');
}

// ── Tenant settings ───────────────────────────────────────────────────────────

export interface TenantSettings {
  tenantId?: string;
  clinicName?: string;
  locale?: string;
  defaultCurrency: string;
  taxRate: number;                  // e.g. 16 (percent)
  defaultMarginPercent: number;     // ← added: used in config/page.tsx
  financingEnabled: boolean;        // ← added: used in config/page.tsx
  timezone: string;                 // ← added: used in config/page.tsx
  exchangeRates?: Record<string, number>;
  updatedAt?: string;
}

export async function getTenantSettings(): Promise<SingleResponse<TenantSettings>> {
  return apiFetch('/v2/dental/settings');
}

export async function updateTenantSettings(
  partial: Partial<Pick<TenantSettings, 'clinicName' | 'locale' | 'defaultCurrency' | 'taxRate'>>
): Promise<MutationResponse<TenantSettings>> {
  return apiFetch('/v2/dental/settings', { method: 'PATCH', body: partial });
}

// ── Vouchers ──────────────────────────────────────────────────────────────────

// DentalVoucher — aligned with dental-commerce.router.ts response shape
export interface DentalVoucher {
  id: string;
  token: string;
  patientRef?: string;
  beneficiaryRef?: string;     // ← used in vouchers/page.tsx
  catalogItemCode: string;     // ← used in vouchers/page.tsx
  status: string;
  planId?: string;
  priceAmount: number;         // ← used in vouchers/page.tsx (centavos)
  priceCurrency: string;       // ← used in vouchers/page.tsx
  totalCents?: number;
  currency?: string;
  issuedAt?: string;
  expiresAt: string;
  redeemedAt?: string;
  createdAt: string;           // ← used in vouchers/page.tsx
}

/** @deprecated Use DentalVoucher. Alias kept for backward compatibility. */
export type Voucher = DentalVoucher;

export async function getVoucher(token: string): Promise<SingleResponse<DentalVoucher>> {
  return apiFetch(`/v2/dental/commerce/vouchers/${token}`);
}

export interface RedeemVoucherInput {
  token: string;
  redeemedBy: string;
  channel: string;
  locationId?: string;
  correlationId: string;
}

export async function redeemVoucher(
  input: RedeemVoucherInput
): Promise<MutationResponse<{ result: string; voucherId?: string }>> {
  return apiFetch(`/v2/dental/commerce/vouchers/redeem`, {
    method: 'POST',
    body: input,
  });
}

// ── Bookings (Reservas) ───────────────────────────────────────────────────────
// Aligned with /api/v2/dental/commerce/bookings/:id response

export interface DentalBooking {
  id: string;
  tenantId?: string;
  patientRef: string;
  catalogItemCode: string;   // ← used in reservas/page.tsx
  status: string;
  fulfillmentStatus?: string;// ← used in reservas/page.tsx
  slotStart: string;         // ← used in reservas/page.tsx
  slotEnd: string;           // ← used in reservas/page.tsx
  voucherId?: string;        // ← used in reservas/page.tsx
  createdAt: string;
  updatedAt?: string;
}

export async function getBooking(
  bookingId: string
): Promise<SingleResponse<DentalBooking>> {
  return apiFetch(`/v2/dental/commerce/bookings/${bookingId}`);
}

// Legacy alias kept for backward compatibility
export type Reservation = DentalBooking;
export const getReservation = getBooking;

export async function updateReservationStatus(
  reservationId: string,
  status: string,
  operatorId: string
): Promise<MutationResponse<DentalBooking>> {
  return apiFetch(`/v2/dental/reservations/${reservationId}/status`, {
    method: 'PATCH',
    body: { status, operatorId, correlationId: crypto.randomUUID() },
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

export interface ListAuditParams {
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditEvents(
  params: ListAuditParams = {}
): Promise<PaginatedResponse<AuditEvent>> {
  const qs = new URLSearchParams();
  if (params.action)     qs.set('action',     params.action);
  if (params.entityType) qs.set('entityType', params.entityType);
  if (params.page)       qs.set('page',       String(params.page));
  if (params.pageSize)   qs.set('pageSize',   String(params.pageSize));
  return apiFetch(`/v2/dental/audit?${qs}`);
}
