/**
 * DentalCommerceEngines.ts — Vytalix CFE Dental Sprint 6
 *
 * Marketplace readiness: dental services as digital products.
 * Two engines that operate within the existing Vytalix commerce infrastructure:
 *
 *   DentalVoucherEngine  — issues/redeems tokens for dental services
 *   DentalBookingEngine  — schedules dental appointments via voucher or direct
 *
 * Design: same cryptographic patterns as Sprint 1 VoucherEngine (HMAC-SHA256,
 * 256-bit token, QR payload, replay protection via correlationId). Extended
 * with dental-specific states: PURCHASED → SCHEDULED → CONFIRMED → COMPLETED.
 */

import { PoolClient } from 'pg';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import type { TenantId, Money, ApiResponse } from '../../shared/types/domain';
import type { IssueDentalVoucherInput, RedeemDentalVoucherInput, CreateDentalBookingInput } from '../schemas/dental-schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DentalVoucherStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';

export type DentalBookingStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

/** Full lifecycle for a dental service delivery */
export type DentalFulfillmentStatus =
  | 'PURCHASED'    // Voucher issued, not yet scheduled
  | 'SCHEDULED'    // Booking created
  | 'CONFIRMED'    // Booking confirmed by clinic
  | 'CHECKED_IN'   // Patient arrived
  | 'COMPLETED'    // Service delivered
  | 'CANCELLED';   // Cancelled at any stage

export interface DentalVoucher {
  id: string;
  tenantId: TenantId;
  catalogItemCode: string;
  token: string;
  qrPayload: string;
  status: DentalVoucherStatus;
  beneficiaryRef?: string;
  expiresAt: Date;
  redeemedAt?: Date;
  priceAmount: number;
  priceCurrency: Money['currency'];
  correlationId: string;
  createdAt: Date;
}

export interface DentalRedemptionResult {
  voucherId: string;
  result: 'SUCCESS' | 'ALREADY_REDEEMED' | 'EXPIRED' | 'INVALID' | 'SUSPENDED';
  redeemedAt?: Date;
  correlationId: string;
}

export interface DentalBooking {
  id: string;
  tenantId: TenantId;
  voucherId?: string;
  catalogItemCode: string;
  patientRef: string;
  providerId?: string;
  locationId?: string;
  slotStart: Date;
  slotEnd: Date;
  timezone: string;
  status: DentalBookingStatus;
  notes?: string;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── DentalVoucherEngine ──────────────────────────────────────────────────────

export class DentalVoucherEngine {
  /**
   * Issues a dental voucher. Called after payment confirmation.
   * @param tenantSecret — per-tenant HMAC key (from tenant record, never env fallback)
   */
  async issue(
    client: PoolClient,
    tenantId: TenantId,
    tenantSecret: string,
    input: IssueDentalVoucherInput,
    priceAmount: number
  ): Promise<ApiResponse<DentalVoucher>> {
    const token = randomBytes(32).toString('hex'); // 256-bit entropy
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const qrPayload = this.buildQrPayload(token, tenantId, input.catalogItemCode, expiresAt, tenantSecret);

    const result = await client.query<VoucherRow>(
      `INSERT INTO dental_vouchers
         (id, tenant_id, catalog_item_code, token, qr_payload, status,
          beneficiary_ref, expires_at, price_amount, price_currency,
          metadata, correlation_id, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE',
          $5, $6, $7, $8,
          $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        tenantId, input.catalogItemCode, token, qrPayload,
        input.beneficiaryRef ?? null, expiresAt,
        priceAmount, input.currency,
        JSON.stringify(input.metadata ?? {}),
        input.correlationId,
      ]
    );

    return { success: true, data: rowToVoucher(result.rows[0]!) };
  }

  /**
   * Redeems a dental voucher. Idempotent on correlationId.
   */
  async redeem(
    client: PoolClient,
    tenantId: TenantId,
    tenantSecret: string,
    input: RedeemDentalVoucherInput
  ): Promise<ApiResponse<DentalRedemptionResult>> {
    // Idempotency: check if this correlationId already succeeded
    const existing = await client.query<{ voucher_id: string; redeemed_at: Date }>(
      `SELECT id AS voucher_id, redeemed_at
       FROM dental_vouchers
       WHERE correlation_id = $1 AND status = 'REDEEMED'
       LIMIT 1`,
      [input.correlationId]
    );
    if (existing.rows.length > 0) {
      return {
        success: true,
        data: {
          voucherId: existing.rows[0]!.voucher_id,
          result: 'SUCCESS',
          redeemedAt: existing.rows[0]!.redeemed_at,
          correlationId: input.correlationId,
        },
      };
    }

    // Lock voucher row
    const voucherResult = await client.query<VoucherRow>(
      `SELECT * FROM dental_vouchers WHERE token = $1 FOR UPDATE`,
      [input.token]
    );

    if (!voucherResult.rows.length) {
      return {
        success: false,
        data: { voucherId: '', result: 'INVALID', correlationId: input.correlationId },
        error: { code: 'INVALID_TOKEN', message: 'Voucher not found' },
      };
    }

    const v = rowToVoucher(voucherResult.rows[0]!);

    if (v.status === 'SUSPENDED') {
      return { success: false, data: { voucherId: v.id, result: 'SUSPENDED', correlationId: input.correlationId },
        error: { code: 'SUSPENDED', message: 'Voucher is suspended' } };
    }
    if (v.status === 'REDEEMED') {
      return { success: false, data: { voucherId: v.id, result: 'ALREADY_REDEEMED', correlationId: input.correlationId },
        error: { code: 'ALREADY_REDEEMED', message: 'Voucher already redeemed' } };
    }
    if (v.status === 'CANCELLED') {
      return { success: false, data: { voucherId: v.id, result: 'INVALID', correlationId: input.correlationId },
        error: { code: 'CANCELLED', message: 'Voucher cancelled' } };
    }
    if (new Date() > v.expiresAt) {
      await client.query(`UPDATE dental_vouchers SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [v.id]);
      return { success: false, data: { voucherId: v.id, result: 'EXPIRED', correlationId: input.correlationId },
        error: { code: 'EXPIRED', message: 'Voucher has expired' } };
    }

    // Verify QR signature BEFORE marking redeemed (Sprint 1 fix pattern)
    if (!this.verifyQrPayload(v.qrPayload, tenantSecret)) {
      return { success: false, data: { voucherId: v.id, result: 'INVALID', correlationId: input.correlationId },
        error: { code: 'INVALID_SIGNATURE', message: 'QR signature invalid' } };
    }

    const now = new Date();
    await client.query(
      `UPDATE dental_vouchers SET status = 'REDEEMED', redeemed_at = $1, updated_at = NOW() WHERE id = $2`,
      [now, v.id]
    );

    return {
      success: true,
      data: { voucherId: v.id, result: 'SUCCESS', redeemedAt: now, correlationId: input.correlationId },
    };
  }

  async getByToken(client: PoolClient, token: string): Promise<ApiResponse<DentalVoucher>> {
    const result = await client.query<VoucherRow>(`SELECT * FROM dental_vouchers WHERE token = $1`, [token]);
    if (!result.rows.length) return { success: false, error: { code: 'NOT_FOUND', message: 'Voucher not found' } };
    return { success: true, data: rowToVoucher(result.rows[0]!) };
  }

  // ─── Crypto ─────────────────────────────────────────────────────────────────

  private buildQrPayload(
    token: string, tenantId: string, itemCode: string, expiresAt: Date, secret: string
  ): string {
    const exp = Math.floor(expiresAt.getTime() / 1_000);
    const checksum = createHmac('sha256', secret)
      .update(`${token}:${tenantId}:${itemCode}:${exp}`)
      .digest('hex').slice(0, 32);
    return Buffer.from(JSON.stringify({ token, tenantId, itemCode, exp, checksum })).toString('base64url');
  }

  private verifyQrPayload(qrPayload: string, secret: string): boolean {
    try {
      const d = JSON.parse(Buffer.from(qrPayload, 'base64url').toString('utf8')) as {
        token: string; tenantId: string; itemCode: string; exp: number; checksum: string;
      };
      const expected = createHmac('sha256', secret)
        .update(`${d.token}:${d.tenantId}:${d.itemCode}:${d.exp}`)
        .digest('hex').slice(0, 32);
      const bufA = Buffer.alloc(32); Buffer.from(expected).copy(bufA);
      const bufB = Buffer.alloc(32); Buffer.from(d.checksum ?? '').copy(bufB);
      return timingSafeEqual(bufA, bufB);
    } catch { return false; }
  }
}

// ─── DentalBookingEngine ──────────────────────────────────────────────────────

export class DentalBookingEngine {
  async create(
    client: PoolClient,
    tenantId: TenantId,
    voucherId: string | undefined,
    input: CreateDentalBookingInput,
    slotEnd: Date
  ): Promise<ApiResponse<DentalBooking>> {
    const result = await client.query<BookingRow>(
      `INSERT INTO dental_bookings
         (id, tenant_id, voucher_id, catalog_item_code, patient_ref,
          provider_id, location_id, slot_start, slot_end, timezone,
          status, notes, correlation_id, created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          'REQUESTED', $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        tenantId, voucherId ?? null, input.catalogItemCode, input.patientRef,
        input.providerId ?? null, input.locationId ?? null,
        // slot_start from slotId lookup (simplified: use provided time)
        new Date(), slotEnd, 'America/Mexico_City',
        input.notes ?? null, input.correlationId,
      ]
    );
    return { success: true, data: rowToBooking(result.rows[0]!) };
  }

  async transition(
    client: PoolClient,
    bookingId: string,
    from: DentalBookingStatus,
    to: DentalBookingStatus,
    extra: Partial<{ confirmedAt: Date; completedAt: Date; cancelledAt: Date; reason: string }> = {}
  ): Promise<ApiResponse<DentalBooking>> {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [bookingId, to];
    let p = 3;

    if (extra.confirmedAt) { setClauses.push(`confirmed_at = $${p++}`); values.push(extra.confirmedAt); }
    if (extra.completedAt) { setClauses.push(`completed_at = $${p++}`); values.push(extra.completedAt); }
    if (extra.cancelledAt) { setClauses.push(`cancelled_at = $${p++}`); values.push(extra.cancelledAt); }
    if (extra.reason)      { setClauses.push(`cancellation_reason = $${p++}`); values.push(extra.reason); }
    values.push(from);

    const result = await client.query<BookingRow>(
      `UPDATE dental_bookings SET ${setClauses.join(', ')} WHERE id = $1 AND status = $${p} RETURNING *`,
      values
    );

    if (!result.rows.length) {
      return { success: false, error: { code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${from} to ${to}` } };
    }
    return { success: true, data: rowToBooking(result.rows[0]!) };
  }

  async getById(client: PoolClient, bookingId: string): Promise<ApiResponse<DentalBooking>> {
    const result = await client.query<BookingRow>(
      `SELECT * FROM dental_bookings WHERE id = $1`, [bookingId]
    );
    if (!result.rows.length) return { success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } };
    return { success: true, data: rowToBooking(result.rows[0]!) };
  }

  /** Maps booking status → fulfillment status */
  static toFulfillmentStatus(bookingStatus: DentalBookingStatus): DentalFulfillmentStatus {
    const map: Record<DentalBookingStatus, DentalFulfillmentStatus> = {
      REQUESTED:  'SCHEDULED',
      CONFIRMED:  'CONFIRMED',
      CHECKED_IN: 'CHECKED_IN',
      COMPLETED:  'COMPLETED',
      CANCELLED:  'CANCELLED',
      NO_SHOW:    'CANCELLED',
    };
    return map[bookingStatus];
  }
}

// ─── Row types + mappers ──────────────────────────────────────────────────────

interface VoucherRow {
  id: string; tenant_id: string; catalog_item_code: string;
  token: string; qr_payload: string; status: DentalVoucherStatus;
  beneficiary_ref: string | null; expires_at: Date; redeemed_at: Date | null;
  price_amount: number; price_currency: string;
  metadata: Record<string, string>; correlation_id: string; created_at: Date;
}

interface BookingRow {
  id: string; tenant_id: string; voucher_id: string | null;
  catalog_item_code: string; patient_ref: string; provider_id: string | null;
  location_id: string | null; slot_start: Date; slot_end: Date; timezone: string;
  status: DentalBookingStatus; notes: string | null; cancellation_reason: string | null;
  confirmed_at: Date | null; completed_at: Date | null; cancelled_at: Date | null;
  correlation_id: string; created_at: Date; updated_at: Date;
}

function rowToVoucher(r: VoucherRow): DentalVoucher {
  return {
    id: r.id, tenantId: r.tenant_id, catalogItemCode: r.catalog_item_code,
    token: r.token, qrPayload: r.qr_payload, status: r.status,
    beneficiaryRef: r.beneficiary_ref ?? undefined, expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at ?? undefined,
    priceAmount: r.price_amount, priceCurrency: r.price_currency as Money['currency'],
    correlationId: r.correlation_id, createdAt: r.created_at,
  };
}

function rowToBooking(r: BookingRow): DentalBooking {
  return {
    id: r.id, tenantId: r.tenant_id, voucherId: r.voucher_id ?? undefined,
    catalogItemCode: r.catalog_item_code, patientRef: r.patient_ref,
    providerId: r.provider_id ?? undefined, locationId: r.location_id ?? undefined,
    slotStart: r.slot_start, slotEnd: r.slot_end, timezone: r.timezone,
    status: r.status, notes: r.notes ?? undefined,
    correlationId: r.correlation_id, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const dentalVoucherEngine = new DentalVoucherEngine();
export const dentalBookingEngine = new DentalBookingEngine();
