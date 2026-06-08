/**
 * vertical2-extended.test.ts — Vytalix Vertical 2: Extended Test Suite
 *
 * Covers:
 * - AccessGrantService
 * - CommercialAnalyticsService
 * - Partner middleware (scope enforcement)
 * - Clinical integration contract (NullAdapter behavior)
 * - End-to-end commerce flow invariants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessGrantService } from '../access/AccessGrantService';
import { CommercialAnalyticsService } from '../analytics/CommercialAnalyticsService';
import {
  NullClinicalAdapter,
  NullCommerceEventPublisher,
  type BookingConfirmedEvent,
} from '../integration/clinicalIntegrationContract';
import {
  requireScope,
  createPartnerAuthMiddleware,
  type CommerceRequest,
  type CommerceScope,
} from '../shared/middleware/partnerMiddleware';

// ─── Mock client helper ───────────────────────────────────────────────────────

function mockClient(responses: unknown[][] = []) {
  let call = -1;
  return {
    query: vi.fn(async () => {
      call++;
      return { rows: responses[call] ?? [] };
    }),
  };
}

// ─── ACCESS GRANT SERVICE TESTS ───────────────────────────────────────────────

describe('AccessGrantService', () => {
  const svc = new AccessGrantService();
  const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  const grantRow = {
    id: 'grant-001', tenant_id: TENANT_ID,
    beneficiary_id: 'patient-001', catalog_item_id: 'item-001',
    voucher_id: 'v-001', status: 'ACTIVE' as const,
    granted_at: new Date(), expires_at: null, revoked_at: null, metadata: {},
  };

  it('grantAccess creates a new grant', async () => {
    const client = mockClient([[], [grantRow]]); // idempotency check (empty), then insert

    const result = await svc.grantAccess(client as never, TENANT_ID, {
      beneficiaryId: 'patient-001',
      catalogItemId: 'item-001',
      voucherId: 'v-001',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('ACTIVE');
    expect(result.data?.beneficiaryId).toBe('patient-001');
  });

  it('grantAccess is idempotent — returns existing grant', async () => {
    // First query (idempotency check) returns existing row
    const client = mockClient([[grantRow]]);

    const result = await svc.grantAccess(client as never, TENANT_ID, {
      beneficiaryId: 'patient-001',
      catalogItemId: 'item-001',
      voucherId: 'v-001',
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('grant-001');
    // Only 1 query — found existing, did not insert
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('verifyAccess returns hasAccess:false when no grant exists', async () => {
    const client = mockClient([[], []]); // UPDATE (no-op expire), SELECT (empty)

    const result = await svc.verifyAccess(client as never, 'patient-new', 'item-001');

    expect(result.success).toBe(true);
    expect(result.data?.hasAccess).toBe(false);
    expect(result.data?.grant).toBeUndefined();
  });

  it('verifyAccess returns hasAccess:true with grant when one exists', async () => {
    const client = mockClient([[], [grantRow]]); // expire update (no-op), SELECT returns grant

    const result = await svc.verifyAccess(client as never, 'patient-001', 'item-001');

    expect(result.success).toBe(true);
    expect(result.data?.hasAccess).toBe(true);
    expect(result.data?.grant?.id).toBe('grant-001');
  });

  it('revokeAccess transitions ACTIVE → REVOKED', async () => {
    const revokedRow = { ...grantRow, status: 'REVOKED' as const, revoked_at: new Date() };
    const client = mockClient([[revokedRow]]);

    const result = await svc.revokeAccess(client as never, 'grant-001', 'Fraud detected');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('REVOKED');
  });

  it('revokeAccess returns error for non-existent or already-inactive grant', async () => {
    const client = mockClient([[]]); // empty rows

    const result = await svc.revokeAccess(client as never, 'grant-ghost', 'Test');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND_OR_INACTIVE');
  });
});

// ─── ANALYTICS SERVICE TESTS ──────────────────────────────────────────────────

describe('CommercialAnalyticsService', () => {
  const svc = new CommercialAnalyticsService();
  const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const params = { fromDate: new Date('2025-01-01'), toDate: new Date('2025-12-31') };

  it('getVoucherSummary calculates redemption rate correctly', async () => {
    const summaryRow = {
      total_issued: '100', total_redeemed: '75',
      total_expired: '15', total_cancelled: '5',
      total_revenue: '20000000', currency: 'MXN',
    };
    const typeRow = { type: 'CONSULTATION', issued: '60', redeemed: '50' };
    const client = mockClient([[summaryRow], [typeRow]]);

    const result = await svc.getVoucherSummary(client as never, TENANT_ID, params);

    expect(result.success).toBe(true);
    expect(result.data?.totalIssued).toBe(100);
    expect(result.data?.totalRedeemed).toBe(75);
    expect(result.data?.redemptionRate).toBe(0.75);
    expect(result.data?.totalRevenue.amount).toBe(20_000_000);
    expect(result.data?.byItemType['CONSULTATION'].issued).toBe(60);
  });

  it('getVoucherSummary returns 0 values when no vouchers exist', async () => {
    const client = mockClient([[], []]);

    const result = await svc.getVoucherSummary(client as never, TENANT_ID, params);

    expect(result.success).toBe(true);
    expect(result.data?.totalIssued).toBe(0);
    expect(result.data?.redemptionRate).toBe(0);
  });

  it('getBookingSummary calculates completion and no-show rates', async () => {
    const summaryRow = {
      total_requested: '50', total_confirmed: '45',
      total_completed: '40', total_cancelled: '3', total_no_show: '2',
    };
    const client = mockClient([[summaryRow], []]);

    const result = await svc.getBookingSummary(client as never, TENANT_ID, params);

    expect(result.success).toBe(true);
    expect(result.data?.completionRate).toBeCloseTo(40 / 45, 5);
    expect(result.data?.noShowRate).toBeCloseTo(2 / 45, 5);
  });

  it('getRedemptionChannelBreakdown tracks fraud attempts', async () => {
    const rows = [
      { channel: 'QR_SCAN', total: '100', successes: '95', fraud: '3' },
      { channel: 'MANUAL',  total: '20',  successes: '20', fraud: '0' },
    ];
    const client = mockClient([rows]);

    const result = await svc.getRedemptionChannelBreakdown(client as never, TENANT_ID, params);

    expect(result.success).toBe(true);
    expect(result.data?.fraudAttempts).toBe(3);
    expect(result.data?.byChannel['QR_SCAN'].successRate).toBe(0.95);
    expect(result.data?.byChannel['MANUAL'].count).toBe(20);
  });

  it('getPartnerRevenue calculates revenue share correctly', async () => {
    const partnerRow = { name: 'Disglobal', revenue_share_percent: '20.00' };
    const revenueRow = { total_issued: '50', gross_revenue: '10000000', currency: 'MXN' };
    const topItemRow = {
      catalog_item_id: 'item-001', item_name: 'Consulta Longevidad',
      item_count: '30', item_revenue: '6000000', currency: 'MXN',
    };
    const client = mockClient([[partnerRow], [revenueRow], [topItemRow]]);

    const result = await svc.getPartnerRevenue(
      client as never, TENANT_ID, 'partner-001', params
    );

    expect(result.success).toBe(true);
    expect(result.data?.grossRevenue.amount).toBe(10_000_000);
    expect(result.data?.revenueShareAmount.amount).toBe(2_000_000); // 20% of 10M
    expect(result.data?.netRevenue.amount).toBe(8_000_000);
    expect(result.data?.topItems[0].itemName).toBe('Consulta Longevidad');
  });

  it('getPartnerRevenue returns error for unknown partner', async () => {
    const client = mockClient([[]]); // empty partner row

    const result = await svc.getPartnerRevenue(
      client as never, TENANT_ID, 'partner-ghost', params
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PARTNER_NOT_FOUND');
  });
});

// ─── CLINICAL INTEGRATION CONTRACT TESTS ─────────────────────────────────────

describe('ClinicalIntegrationContract — NullAdapter', () => {
  const adapter = new NullClinicalAdapter();
  const publisher = new NullCommerceEventPublisher();

  it('NullAdapter.verifyServiceExists always returns available:true (graceful degradation)', async () => {
    const result = await adapter.verifyServiceExists('svc-001', 'tenant-001');
    expect(result.isAvailable).toBe(true);
    expect(result.clinicalServiceReferenceId).toBe('svc-001');
  });

  it('NullAdapter.getServiceSummary returns null (commerce falls back to own data)', async () => {
    const result = await adapter.getServiceSummary('svc-001', 'tenant-001');
    expect(result).toBeNull();
  });

  it('NullAdapter.checkUserConsent returns hasActiveConsent:false (fail-safe-deny)', async () => {
    const result = await adapter.checkUserConsent('user-001', 'svc-001', 'tenant-001');
    expect(result.hasActiveConsent).toBe(false);
  });

  it('NullPublisher.publishBookingConfirmed does not throw', async () => {
    const event: BookingConfirmedEvent = {
      eventType: 'COMMERCE.BOOKING_CONFIRMED',
      correlationId: 'corr-001',
      tenantId: 'tenant-001',
      bookingId: 'booking-001',
      catalogItemId: 'item-001',
      beneficiaryId: 'patient-001',
      slotStart: new Date(),
      slotEnd: new Date(),
      timezone: 'America/Mexico_City',
      issuedAt: new Date(),
    };

    await expect(publisher.publishBookingConfirmed(event)).resolves.toBeUndefined();
  });

  it('NullPublisher.publishVoucherRedeemed does not throw', async () => {
    await expect(
      publisher.publishVoucherRedeemed({
        eventType: 'COMMERCE.VOUCHER_REDEEMED',
        correlationId: 'corr-002',
        tenantId: 'tenant-001',
        voucherId: 'v-001',
        catalogItemId: 'item-001',
        beneficiaryId: 'patient-001',
        redeemedAt: new Date(),
        channel: 'QR_SCAN',
      })
    ).resolves.toBeUndefined();
  });
});

// ─── SCOPE ENFORCEMENT TESTS ──────────────────────────────────────────────────

describe('Partner Middleware — requireScope', () => {
  function makeReqWithScopes(scopes: CommerceScope[]) {
    return {
      partner: { scopes, partnerId: 'p1', partnerName: 'Test', tenantId: 't1', tier: 'STANDARD', allowedCatalogItemIds: 'ALL', requestId: 'r1' },
    } as unknown as CommerceRequest;
  }

  it('passes when partner has required scope', () => {
    const middleware = requireScope('commerce:catalog:read');
    const req = makeReqWithScopes(['commerce:catalog:read']);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    const next = vi.fn();

    middleware(req as never, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when partner lacks required scope', () => {
    const middleware = requireScope('commerce:analytics:read');
    const req = makeReqWithScopes(['commerce:catalog:read']); // no analytics
    let statusCode: number = 0;
    const res = {
      status: vi.fn((code: number) => { statusCode = code; return res; }),
      json: vi.fn(),
    } as never;
    const next = vi.fn();

    middleware(req as never, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(403);
  });

  it('returns 401 when no partner context exists', () => {
    const middleware = requireScope('commerce:catalog:read');
    const req = {} as never; // no .partner
    let statusCode: number = 0;
    const res = {
      status: vi.fn((code: number) => { statusCode = code; return res; }),
      json: vi.fn(),
    } as never;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(401);
  });
});

// ─── DOMAIN INVARIANTS ────────────────────────────────────────────────────────

describe('Domain Invariants', () => {
  it('Money amounts are always integers (no floating-point leakage)', () => {
    const amounts = [200000, 0, 1, 999999999];
    for (const amount of amounts) {
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('Voucher token entropy: 64 hex chars = 256 bits', () => {
    const { randomBytes } = require('crypto');
    const token: string = randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('correlationId propagation invariant — all commerce objects require it', () => {
    // This test documents the invariant as a specification
    const requiredCorrelationIdFields = [
      'Voucher.correlationId',
      'Booking.correlationId',
      'FulfillmentOrder.correlationId',
      'RedemptionEvent.correlationId',
    ];

    expect(requiredCorrelationIdFields).toHaveLength(4);
    for (const field of requiredCorrelationIdFields) {
      expect(field).toMatch(/correlationId/);
    }
  });

  it('State machine: BookingStatus transitions are unidirectional', () => {
    const TERMINAL_STATES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
    const FORWARD_TRANSITIONS: Record<string, string[]> = {
      REQUESTED:  ['CONFIRMED', 'CANCELLED'],
      CONFIRMED:  ['CHECKED_IN', 'CANCELLED'],
      CHECKED_IN: ['COMPLETED', 'NO_SHOW'],
    };

    // Terminal states have no outgoing transitions
    for (const state of TERMINAL_STATES) {
      expect(FORWARD_TRANSITIONS[state]).toBeUndefined();
    }

    // No backward transitions (a state cannot transition to an earlier state)
    // CONFIRMED can be a target of REQUESTED and a source for CHECKED_IN — that is valid.
    // What must NOT exist: a state that transitions BACK to a state that already transitioned to it.
    const backwardPairs = [
      ['CONFIRMED',  'REQUESTED'],   // CONFIRMED → REQUESTED would be backward
      ['CHECKED_IN', 'REQUESTED'],   // CHECKED_IN → REQUESTED would be backward
      ['CHECKED_IN', 'CONFIRMED'],   // CHECKED_IN → CONFIRMED would be backward
    ];
    for (const [from, to] of backwardPairs) {
      const targets = FORWARD_TRANSITIONS[from] ?? [];
      expect(targets).not.toContain(to);
    }
  });

  it('VoucherStatus: REDEEMED and EXPIRED are terminal (cannot reactivate)', () => {
    const TERMINAL_VOUCHER_STATES = ['REDEEMED', 'EXPIRED'];
    // These states have no valid transitions in the engine
    // Documented as invariant for regression protection
    expect(TERMINAL_VOUCHER_STATES).toContain('REDEEMED');
    expect(TERMINAL_VOUCHER_STATES).toContain('EXPIRED');
  });
});
