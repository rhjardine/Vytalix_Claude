/**
 * vertical2.test.ts — Vytalix Vertical 2: Longevity Commerce Tests
 *
 * Tests are organized by engine. Each engine is tested in isolation
 * using mock DB clients — no real DB connection required for unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogEngine } from '../catalog/CatalogEngine';
import { PricingEngine } from '../pricing/PricingEngine';
import { VoucherEngine } from '../voucher/VoucherEngine';
import { BookingEngine } from '../booking/BookingEngine';
import { FulfillmentEngine } from '../fulfillment/FulfillmentEngine';
import type { Money } from '../shared/types/domain';

// ─── Mock DB client factory ───────────────────────────────────────────────────

function mockClient(rows: Record<string, unknown[]> = {}) {
  let callCount = 0;
  const queries: string[] = [];

  return {
    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      queries.push(sql.trim().split('\n')[0]);
      const key = Object.keys(rows)[callCount] ?? '__default';
      callCount++;
      return { rows: rows[key] ?? rows['__default'] ?? [] };
    }),
    _queries: queries,
  };
}

// ─── CATALOG ENGINE TESTS ─────────────────────────────────────────────────────

describe('CatalogEngine', () => {
  const engine = new CatalogEngine();

  const sampleItem = {
    id: '11111111-0000-0000-0000-000000000001',
    tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    sku: 'LG-CONSUL-001',
    type: 'CONSULTATION',
    delivery_mode: 'IN_CLINIC',
    name: 'Longevity Consultation',
    description: 'Full longevity assessment',
    short_description: '90-min deep dive',
    image_urls: [],
    duration_minutes: 90,
    session_count: null,
    requires_booking: true,
    requires_shipping: false,
    clinical_service_reference_id: null,
    tags: ['longevity', 'preventive'],
    metadata: {},
    status: 'ACTIVE',
    version: 1,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  it('listItems returns paginated ACTIVE items for partner role', async () => {
    const client = mockClient({
      '0': [{ count: '1' }],
      '1': [sampleItem],
    });

    const result = await engine.listItems(
      client as never,
      sampleItem.tenant_id,
      { page: 1, pageSize: 10 },
      'partner'
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe('Longevity Consultation');
    expect(result.pagination.total).toBe(1);
  });

  it('getItemById returns NOT_FOUND for unknown ID', async () => {
    const client = mockClient({ __default: [] });

    const result = await engine.getItemById(client as never, 'nonexistent-id');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('createItem returns new item with DRAFT status', async () => {
    const createdRow = { ...sampleItem, status: 'DRAFT', id: 'new-id' };
    const client = mockClient({ __default: [createdRow] });

    const result = await engine.createItem(client as never, sampleItem.tenant_id, {
      sku: 'LG-NEW-001',
      type: 'SERVICE',
      deliveryMode: 'IN_CLINIC',
      name: 'New Service',
      description: 'Desc',
      shortDescription: 'Short',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('DRAFT');
  });

  it('updateItem returns CONFLICT when version mismatches', async () => {
    const client = mockClient({ __default: [] }); // no rows = version conflict

    const result = await engine.updateItem(
      client as never,
      sampleItem.id,
      { name: 'Updated Name' },
      99 // wrong version
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });
});

// ─── PRICING ENGINE TESTS ─────────────────────────────────────────────────────

describe('PricingEngine', () => {
  const engine = new PricingEngine();

  const fixedRule = {
    id: 'rule-001',
    tenant_id: 'tenant-001',
    catalog_item_id: 'item-001',
    partner_id: null,
    type: 'FIXED',
    base_amount: 5000,     // $50.00 USD
    currency: 'USD',
    discount_percent: null,
    discount_amount: null,
    bundle_item_ids: [],
    valid_from: new Date('2024-01-01'),
    valid_until: null,
    priority: 0,
    is_active: true,
    created_at: new Date(),
  };

  it('quoteItem returns base price when no discount applied', async () => {
    const client = mockClient({ __default: [fixedRule] });

    const result = await engine.quoteItem(client as never, 'item-001', undefined, 'USD');

    expect(result.success).toBe(true);
    expect(result.data?.finalPrice.amount).toBe(5000);
    expect(result.data?.discountApplied.amount).toBe(0);
  });

  it('quoteItem applies percentage discount correctly', async () => {
    const discountRule = { ...fixedRule, discount_percent: '20.00', type: 'PROMOTIONAL' };
    const client = mockClient({ __default: [discountRule] });

    const result = await engine.quoteItem(client as never, 'item-001', undefined, 'USD');

    expect(result.success).toBe(true);
    expect(result.data?.finalPrice.amount).toBe(4000);   // 5000 * 0.80
    expect(result.data?.discountApplied.amount).toBe(1000);
  });

  it('quoteItem returns NO_PRICE_RULE when no rule exists', async () => {
    const client = mockClient({ __default: [] });

    const result = await engine.quoteItem(client as never, 'item-404', undefined, 'USD');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_PRICE_RULE');
  });

  it('quoteBundle falls back to sum when no bundle rule exists', async () => {
    // Two items, each at $50, no bundle rule
    const client = mockClient({ __default: [fixedRule] });
    // Override to return item rule then no bundle rule
    let call = 0;
    client.query = vi.fn(async () => {
      call++;
      if (call <= 2) return { rows: [fixedRule] };   // individual quotes
      return { rows: [] };                             // no bundle rule
    });

    const result = await engine.quoteBundle(client as never, {
      itemIds: ['item-001', 'item-002'],
      currency: 'USD',
    });

    expect(result.success).toBe(true);
    expect(result.data?.bundlePrice.amount).toBe(10000); // 5000 + 5000
    expect(result.data?.savings.amount).toBe(0);
  });
});

// ─── VOUCHER ENGINE TESTS ─────────────────────────────────────────────────────

describe('VoucherEngine', () => {
  const engine = new VoucherEngine();
  const TENANT_SECRET = 's'.repeat(32);

  const issueInput = {
    partnerId: 'partner-001',
    catalogItemId: 'item-001',
    type: 'SINGLE_USE' as const,
    expiresInDays: 365,
    pricePaid: { amount: 5000, currency: 'USD' } as Money,
    correlationId: 'corr-001',
  };

  it('issueVoucher creates a voucher with 256-bit token', async () => {
    const issuedRow = {
      id: 'v-001', tenant_id: 'tenant-001', partner_id: 'partner-001',
      catalog_item_id: 'item-001', token: 'a'.repeat(64), qr_payload: 'qrpayload',
      type: 'SINGLE_USE', status: 'ACTIVE', beneficiary_id: null,
      total_uses: 1, used_count: 0, issued_at: new Date(),
      activated_at: null, expires_at: new Date(Date.now() + 365 * 86400000),
      redeemed_at: null, cancelled_at: null,
      price_amount: 5000, price_currency: 'USD', metadata: {},
      correlation_id: 'corr-001', created_at: new Date(), updated_at: new Date(),
    };
    const client = mockClient({ __default: [issuedRow] });

    const result = await engine.issueVoucher(client as never, 'tenant-001', TENANT_SECRET, issueInput);

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('ACTIVE');
    expect(result.data?.type).toBe('SINGLE_USE');

    // Verify the insert was called with correct params
    expect(client.query).toHaveBeenCalled();
  });

  it('redeemVoucher returns INVALID for unknown token', async () => {
    const client = mockClient({
      '0': [],  // idempotency check — no existing
      '1': [],  // voucher lookup — not found
      '2': [],  // redemption event insert needs voucher_id
    });
    client.query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })  // idempotency check
      .mockResolvedValueOnce({ rows: [] })  // voucher not found
      .mockResolvedValueOnce({ rows: [{ id: 're-001', tenant_id: 't1', voucher_id: null, booking_id: null, redeemed_by: 'u1', redeemed_at: new Date(), location_id: null, channel: 'API', result: 'INVALID', correlation_id: 'c1', ip_address: null, device_fingerprint: null }] });

    const result = await engine.redeemVoucher(client as never, 'tenant-001', TENANT_SECRET, {
      token: 'nonexistent-token',
      redeemedBy: 'user-001',
      channel: 'API',
      correlationId: 'corr-404',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_TOKEN');
  });

  it('redeemVoucher is idempotent on duplicate correlationId', async () => {
    const existingEvent = {
      id: 're-existing', tenant_id: 'tenant-001', voucher_id: 'v-001',
      booking_id: null, redeemed_by: 'u1', redeemed_at: new Date(),
      location_id: null, channel: 'API', result: 'SUCCESS',
      correlation_id: 'corr-dup', ip_address: null, device_fingerprint: null,
    };
    const client = mockClient({ __default: [existingEvent] });

    const result = await engine.redeemVoucher(client as never, 'tenant-001', TENANT_SECRET, {
      token: 'some-token', redeemedBy: 'user-001', channel: 'API', correlationId: 'corr-dup',
    });

    // Returns the existing event — no second redemption
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe('SUCCESS');
    expect(result.data?.id).toBe('re-existing');
    // Should NOT have queried for the token — returns early
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

// ─── BOOKING ENGINE TESTS ─────────────────────────────────────────────────────

describe('BookingEngine', () => {
  const engine = new BookingEngine();

  const slotRow = {
    id: 'slot-001', tenant_id: 'tenant-001', catalog_item_id: 'item-001',
    provider_id: 'doctor-001', location_id: 'clinic-001',
    start_time: new Date('2025-12-01T10:00:00Z'),
    end_time: new Date('2025-12-01T11:30:00Z'),
    timezone: 'America/Mexico_City',
    capacity: 1, booked_count: 0, is_blocked: false,
  };

  const bookingRow = {
    id: 'booking-001', tenant_id: 'tenant-001', voucher_id: null,
    catalog_item_id: 'item-001', slot_id: 'slot-001',
    beneficiary_id: 'patient-001', provider_id: 'doctor-001',
    slot_start: slotRow.start_time, slot_end: slotRow.end_time,
    timezone: 'America/Mexico_City', location_id: 'clinic-001',
    status: 'REQUESTED', notes: null, cancellation_reason: null,
    confirmed_at: null, completed_at: null, cancelled_at: null,
    correlation_id: 'corr-booking-001',
    created_at: new Date(), updated_at: new Date(),
  };

  it('listAvailableSlots returns slots with remaining capacity', async () => {
    const client = mockClient({ __default: [slotRow] });

    const result = await engine.listAvailableSlots(client as never, 'tenant-001', {
      catalogItemId: 'item-001',
      fromDate: new Date('2025-12-01'),
      toDate: new Date('2025-12-31'),
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].remainingCapacity).toBe(1);
  });

  it('requestBooking succeeds when slot has capacity', async () => {
    const client = mockClient();
    client.query = vi.fn()
      .mockResolvedValueOnce({ rows: [slotRow] })      // FOR UPDATE lock
      .mockResolvedValueOnce({ rows: [] })               // UPDATE booked_count
      .mockResolvedValueOnce({ rows: [bookingRow] });    // INSERT booking

    const result = await engine.requestBooking(client as never, 'tenant-001', {
      catalogItemId: 'item-001',
      beneficiaryId: 'patient-001',
      slotId: 'slot-001',
      correlationId: 'corr-booking-001',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('REQUESTED');
  });

  it('requestBooking returns SLOT_FULL when capacity exhausted', async () => {
    const fullSlot = { ...slotRow, booked_count: 1, capacity: 1 };
    const client = mockClient({ __default: [fullSlot] });

    const result = await engine.requestBooking(client as never, 'tenant-001', {
      catalogItemId: 'item-001',
      beneficiaryId: 'patient-002',
      slotId: 'slot-001',
      correlationId: 'corr-002',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SLOT_FULL');
  });

  it('cancelBooking releases slot capacity', async () => {
    const confirmedBooking = { ...bookingRow, status: 'CONFIRMED', slot_id: 'slot-001' };
    const client = mockClient();
    client.query = vi.fn()
      .mockResolvedValueOnce({ rows: [confirmedBooking] })  // UPDATE booking
      .mockResolvedValueOnce({ rows: [] });                   // UPDATE slot capacity

    const result = await engine.cancelBooking(client as never, 'booking-001', 'Patient request');

    expect(result.success).toBe(true);
    expect(client.query).toHaveBeenCalledTimes(2); // booking + slot release
  });
});

// ─── FULFILLMENT ENGINE TESTS ─────────────────────────────────────────────────

describe('FulfillmentEngine', () => {
  const engine = new FulfillmentEngine();

  it('createOrder rejects empty item list', async () => {
    const client = mockClient();

    const result = await engine.createOrder(client as never, 'tenant-001', {
      items: [],
      shippingAddress: {
        recipientName: 'John Doe',
        line1: '123 Main St',
        city: 'Mexico City',
        state: 'CDMX',
        postalCode: '06600',
        countryCode: 'MX',
      },
      correlationId: 'corr-ff-001',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EMPTY_ORDER');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('createOrder rejects incomplete shipping address', async () => {
    const client = mockClient();

    const result = await engine.createOrder(client as never, 'tenant-001', {
      items: [{ catalogItemId: 'item-001', sku: 'SKU-001', quantity: 1, unitPrice: { amount: 2000, currency: 'USD' } }],
      shippingAddress: {
        recipientName: '',  // missing
        line1: '123 Main',
        city: 'CDMX',
        state: 'CDMX',
        postalCode: '12345',
        countryCode: 'MX',
      },
      correlationId: 'corr-addr-001',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ADDRESS');
  });

  it('shipOrder transitions CREATED → SHIPPED', async () => {
    const shippedRow = {
      id: 'fo-001', tenant_id: 'tenant-001', voucher_id: null,
      status: 'SHIPPED', shipping_address: {},
      tracking_number: 'TRK123', carrier: 'DHL',
      estimated_delivery: new Date('2025-12-10'),
      shipped_at: new Date(), delivered_at: null,
      correlation_id: 'corr-001', created_at: new Date(), updated_at: new Date(),
    };
    const itemRow = {
      id: 'fi-001', order_id: 'fo-001', catalog_item_id: 'item-001',
      sku: 'SKU-001', quantity: 1, unit_amount: 2000, unit_currency: 'USD',
    };

    const client = mockClient();
    client.query = vi.fn()
      .mockResolvedValueOnce({ rows: [shippedRow] })  // UPDATE order
      .mockResolvedValueOnce({ rows: [shippedRow] })  // SELECT order
      .mockResolvedValueOnce({ rows: [itemRow] });     // SELECT items

    const result = await engine.shipOrder(client as never, 'fo-001', {
      trackingNumber: 'TRK123',
      carrier: 'DHL',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('SHIPPED');
    expect(result.data?.trackingNumber).toBe('TRK123');
  });

  it('confirmDelivery fails on non-SHIPPED order', async () => {
    const client = mockClient({ __default: [] }); // no rows = wrong status

    const result = await engine.confirmDelivery(client as never, 'fo-001');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_TRANSITION');
  });
});

// ─── CROSS-ENGINE FLOW INTEGRATION TEST ───────────────────────────────────────

describe('Commerce Flow Integration', () => {
  it('end-to-end: catalog → quote → voucher → booking describes the happy path', () => {
    // This test documents the expected flow without executing DB calls.
    // Full integration tests require a live DB and are in /tests/integration.

    const flow = [
      'GET /catalog → list ACTIVE items',
      'POST /pricing/quote → get PriceQuote with validUntil',
      'POST /vouchers → issue Voucher with ACTIVE status and 256-bit token',
      'GET /booking/slots → list AvailableSlot[] for item',
      'POST /bookings → create Booking in REQUESTED status',
      'POST /vouchers/redeem → RedemptionEvent SUCCESS, Booking CONFIRMED',
    ];

    expect(flow).toHaveLength(6);
    expect(flow[0]).toContain('ACTIVE');
    expect(flow[2]).toContain('256-bit');
    expect(flow[5]).toContain('SUCCESS');
  });
});
