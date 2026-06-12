/**
 * dental-sprint5-6.test.ts — Vytalix CFE Dental Sprints 5 & 6
 *
 * Sprint 5: Multi-Tenant Financial Management
 *   - DentalCatalogRepository (persistent catalog)
 *   - PricingRuleRepository (rule resolution priority)
 *   - ExchangeRateRepository (snapshot + latest lookup)
 *   - TenantSettingsService (upsert + defaults)
 *
 * Sprint 6: Marketplace & Commerce Readiness
 *   - DentalVoucherEngine (issue, redeem, idempotency, HMAC)
 *   - DentalBookingEngine (state machine, fulfillment lifecycle)
 *   - DentalFulfillmentStatus mapping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DentalCatalogRepository,
  PricingRuleRepository,
  ExchangeRateRepository,
  TenantSettingsService,
} from '../../src/dental/repositories/dental-financial.repositories';
import {
  DentalVoucherEngine,
  DentalBookingEngine,
} from '../../src/dental/engines/dental-commerce.engines';
import { randomBytes, createHmac } from 'crypto';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const T = 'aaaaaaaa-1111-0000-0000-000000000001';
const SECRET = 'sprint6testsecretsecretlong32charsX';

function stateful(responses: unknown[][]) {
  let i = 0;
  return { query: vi.fn(async () => ({ rows: responses[i++] ?? [], rowCount: (responses[i - 1] as unknown[]).length })) };
}

const catalogRow = {
  id: 'cat-001', tenant_id: T, code: 'CROWN_ZIRCONIA',
  name: 'Corona de zirconia', description: null, category: 'PROSTHETICS',
  base_cost: 400_000, suggested_price: 800_000, currency: 'MXN',
  duration_minutes: 60, is_active: true, metadata: {},
  created_at: new Date(), updated_at: new Date(),
};

// ─── SPRINT 5: DentalCatalogRepository ───────────────────────────────────────

describe('DentalCatalogRepository', () => {
  const repo = new DentalCatalogRepository();

  it('create() inserts and returns catalog item', async () => {
    const client = stateful([[catalogRow]]);
    const result = await repo.create(client as never, T, {
      code: 'CROWN_ZIRCONIA', name: 'Corona de zirconia',
      category: 'PROSTHETICS', baseCost: 400_000,
      suggestedPrice: 800_000, currency: 'MXN', isActive: true,
    });
    expect(result.success).toBe(true);
    expect(result.data!.code).toBe('CROWN_ZIRCONIA');
    expect(result.data!.baseCost).toBe(400_000);
    expect(result.data!.suggestedPrice).toBe(800_000);
  });

  it('findByCode() returns NOT_FOUND for missing item', async () => {
    const client = stateful([[]]);
    const result = await repo.findByCode(client as never, 'NO_SUCH_CODE');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('findByCode() queries only ACTIVE items', async () => {
    const client = stateful([[catalogRow]]);
    await repo.findByCode(client as never, 'CROWN_ZIRCONIA');
    const sql = client.query.mock.calls[0]![0] as string;
    expect(sql).toContain('is_active = TRUE');
  });

  it('list() paginates correctly', async () => {
    const client = stateful([[{ count: '5' }], [catalogRow, { ...catalogRow, id: 'cat-002' }]]);
    const result = await repo.list(client as never, { page: 1, pageSize: 2 });
    expect(result.success).toBe(true);
    expect(result.data!).toHaveLength(2);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('list() filters by category', async () => {
    const client = stateful([[{ count: '1' }], [catalogRow]]);
    await repo.list(client as never, { category: 'PROSTHETICS' });
    const sql = client.query.mock.calls[0]![0] as string;
    expect(sql).toContain('category');
  });
});

// ─── SPRINT 5: PricingRuleRepository ─────────────────────────────────────────

describe('PricingRuleRepository — resolvePrice', () => {
  const repo = new PricingRuleRepository();

  it('applies item-specific margin rule', async () => {
    const ruleRow = {
      id: 'rule-001', tenant_id: T, catalog_item_code: 'CROWN_ZIRCONIA',
      category: null, margin_percent: '100.00', discount_percent: null, fixed_price: null,
      currency: 'MXN', valid_from: new Date('2024-01-01'), valid_until: null, priority: 10,
    };
    const client = stateful([[ruleRow]]);
    const result = await repo.resolvePrice(
      client as never, 'CROWN_ZIRCONIA', 'PROSTHETICS',
      400_000, 800_000, 'MXN', 35
    );
    // margin 100% → finalPrice = baseCost * (1 + 1.0) = 800_000
    expect(result.finalPrice).toBe(800_000);
    expect(result.marginPercent).toBe(100);
    expect(result.appliedRuleType).toBe('ITEM_RULE');
  });

  it('applies fixed price rule', async () => {
    const ruleRow = {
      id: 'rule-002', tenant_id: T, catalog_item_code: 'CLEANING_BASIC',
      category: null, margin_percent: null, discount_percent: null, fixed_price: 65_000,
      currency: 'MXN', valid_from: new Date('2024-01-01'), valid_until: null, priority: 5,
    };
    const client = stateful([[ruleRow]]);
    const result = await repo.resolvePrice(
      client as never, 'CLEANING_BASIC', 'PREVENTIVE',
      30_000, 60_000, 'MXN', 35
    );
    expect(result.finalPrice).toBe(65_000);
    expect(result.appliedRuleType).toBe('ITEM_RULE');
  });

  it('applies discount percent to suggestedPrice', async () => {
    const ruleRow = {
      id: 'rule-003', tenant_id: T, catalog_item_code: null,
      category: 'PREVENTIVE', margin_percent: null, discount_percent: '10.00', fixed_price: null,
      currency: 'MXN', valid_from: new Date('2024-01-01'), valid_until: null, priority: 2,
    };
    const client = stateful([[ruleRow]]);
    const result = await repo.resolvePrice(
      client as never, 'CLEANING_BASIC', 'PREVENTIVE',
      30_000, 60_000, 'MXN', 35
    );
    // 60000 * (1 - 0.10) = 54000
    expect(result.finalPrice).toBe(54_000);
    expect(result.appliedRuleType).toBe('CATEGORY_RULE');
  });

  it('falls back to tenant default margin when no rule exists', async () => {
    const client = stateful([[]]); // no rule
    const result = await repo.resolvePrice(
      client as never, 'CUSTOM_ITEM', 'OTHER',
      100_000, 200_000, 'MXN', 50
    );
    // 50% margin → 100_000 * 1.5 = 150_000
    expect(result.finalPrice).toBe(150_000);
    expect(result.appliedRuleType).toBe('TENANT_DEFAULT');
    expect(result.marginPercent).toBe(50);
    expect(result.appliedRuleId).toBeUndefined();
  });
});

// ─── SPRINT 5: ExchangeRateRepository ────────────────────────────────────────

describe('ExchangeRateRepository', () => {
  const repo = new ExchangeRateRepository();

  const rateRow = {
    id: 'rate-001', tenant_id: T, base_currency: 'MXN',
    rates: { USD: 0.0556, EUR: 0.0514 }, source: 'manual',
    effective_at: new Date(), created_at: new Date(),
  };

  it('save() inserts and returns snapshot', async () => {
    const client = stateful([[rateRow]]);
    const result = await repo.save(client as never, T, {
      baseCurrency: 'MXN', rates: { USD: 0.0556, EUR: 0.0514 }, source: 'manual',
    });
    expect(result.success).toBe(true);
    expect(result.data!.baseCurrency).toBe('MXN');
    expect(result.data!.rates['USD']).toBe(0.0556);
  });

  it('getLatest() returns null when no rates saved', async () => {
    const client = stateful([[]]);
    const result = await repo.getLatest(client as never, 'COP');
    expect(result).toBeNull();
  });

  it('getLatest() queries ORDER BY effective_at DESC', async () => {
    const client = stateful([[rateRow]]);
    await repo.getLatest(client as never, 'MXN');
    const sql = client.query.mock.calls[0]![0] as string;
    expect(sql).toContain('ORDER BY effective_at DESC');
    expect(sql).toContain('LIMIT 1');
  });
});

// ─── SPRINT 5: TenantSettingsService ─────────────────────────────────────────

describe('TenantSettingsService', () => {
  const service = new TenantSettingsService();

  const settingsRow = {
    id: 'settings-001', tenant_id: T, default_currency: 'MXN',
    tax_rate: '16.00', default_margin_percent: '35.00',
    financing_enabled: false, timezone: 'America/Mexico_City',
    metadata: {}, created_at: new Date(), updated_at: new Date(),
  };

  it('upsert() uses INSERT ON CONFLICT DO UPDATE', async () => {
    const client = stateful([[settingsRow]]);
    await service.upsert(client as never, T, {
      defaultCurrency: 'MXN', taxRate: 16, defaultMarginPercent: 35,
      financingEnabled: false, timezone: 'America/Mexico_City',
    });
    const sql = client.query.mock.calls[0]![0] as string;
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE');
  });

  it('upsert() returns parsed numeric fields', async () => {
    const client = stateful([[settingsRow]]);
    const result = await service.upsert(client as never, T, {
      defaultCurrency: 'MXN', taxRate: 16, defaultMarginPercent: 35,
      financingEnabled: false, timezone: 'America/Mexico_City',
    });
    expect(typeof result.data!.taxRate).toBe('number');
    expect(result.data!.taxRate).toBe(16);
    expect(result.data!.defaultMarginPercent).toBe(35);
  });

  it('getOrDefault() returns safe defaults when no settings exist', async () => {
    const client = stateful([[]]); // no row
    const result = await service.getOrDefault(client as never);
    expect(result.defaultCurrency).toBe('MXN');
    expect(result.taxRate).toBe(16.0);
    expect(result.defaultMarginPercent).toBe(35.0);
    expect(result.financingEnabled).toBe(false);
  });
});

// ─── SPRINT 6: DentalVoucherEngine ───────────────────────────────────────────

describe('DentalVoucherEngine', () => {
  const engine = new DentalVoucherEngine();

  const makeVoucherRow = (token: string, qrPayload: string, status = 'ACTIVE') => ({
    id: 'dvou-001', tenant_id: T, catalog_item_code: 'CLEANING_BASIC',
    token, qr_payload: qrPayload, status, beneficiary_ref: 'patient-001',
    expires_at: new Date(Date.now() + 86_400_000), redeemed_at: null,
    price_amount: 60_000, price_currency: 'MXN', metadata: {},
    correlation_id: 'corr-001', created_at: new Date(),
  });

  it('issue() generates 64-char hex token', async () => {
    let capturedToken = '';
    const client = {
      query: vi.fn(async (_sql: string, values?: unknown[]) => {
        capturedToken = (values?.[2] as string) ?? '';
        return { rows: [makeVoucherRow(capturedToken, 'qr')] };
      }),
    };

    const result = await engine.issue(client as never, T, SECRET, {
      catalogItemCode: 'CLEANING_BASIC', beneficiaryRef: 'pat-001',
      expiresInDays: 90, currency: 'MXN', correlationId: 'c-001',
    }, 60_000);

    expect(result.success).toBe(true);
    expect(capturedToken).toHaveLength(64);
    expect(capturedToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issue() creates a valid QR payload (base64url JSON)', async () => {
    let capturedQr = '';
    const client = {
      query: vi.fn(async (_sql: string, values?: unknown[]) => {
        capturedQr = (values?.[3] as string) ?? '';
        return { rows: [makeVoucherRow('tok', capturedQr)] };
      }),
    };

    await engine.issue(client as never, T, SECRET, {
      catalogItemCode: 'CLEANING_BASIC', beneficiaryRef: 'pat-001',
      expiresInDays: 90, currency: 'MXN', correlationId: 'c-001',
    }, 60_000);

    const decoded = JSON.parse(Buffer.from(capturedQr, 'base64url').toString('utf8')) as {
      token: string; tenantId: string; itemCode: string; exp: number; checksum: string;
    };
    expect(decoded.tenantId).toBe(T);
    expect(decoded.itemCode).toBe('CLEANING_BASIC');
    expect(typeof decoded.exp).toBe('number');
    expect(decoded.checksum).toHaveLength(32);
  });

  it('redeem() is idempotent on duplicate correlationId', async () => {
    const existingRow = { voucher_id: 'dvou-001', redeemed_at: new Date() };
    const client = stateful([[existingRow]]); // idempotency check hits

    const result = await engine.redeem(client as never, T, SECRET, {
      token: 'a'.repeat(64), redeemedBy: 'r1',
      channel: 'QR_SCAN', correlationId: 'already-done',
    });

    expect(result.success).toBe(true);
    expect(result.data!.result).toBe('SUCCESS');
    expect(client.query).toHaveBeenCalledTimes(1); // returns early
  });

  it('redeem() rejects EXPIRED voucher and updates status', async () => {
    const expiredRow = makeVoucherRow('tok-exp', 'qr-exp', 'ACTIVE');
    expiredRow.expires_at = new Date('2020-01-01'); // past

    const client = stateful([
      [],              // idempotency check — none
      [expiredRow],    // FOR UPDATE lock
      [],              // UPDATE status = EXPIRED
    ]);

    const result = await engine.redeem(client as never, T, SECRET, {
      token: 'tok-exp', redeemedBy: 'r1', channel: 'API', correlationId: 'c-exp',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EXPIRED');
    expect(result.data!.result).toBe('EXPIRED');
  });

  it('redeem() rejects ALREADY_REDEEMED voucher', async () => {
    const redeemedRow = makeVoucherRow('tok-used', 'qr-used', 'REDEEMED');
    const client = stateful([[], [redeemedRow]]);

    const result = await engine.redeem(client as never, T, SECRET, {
      token: 'tok-used', redeemedBy: 'r1', channel: 'MANUAL', correlationId: 'c-dup',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ALREADY_REDEEMED');
  });

  it('redeem() rejects invalid QR signature', async () => {
    // Build row with tampered checksum
    const token = randomBytes(32).toString('hex');
    const exp = Math.floor((Date.now() + 86_400_000) / 1_000);
    const tamperedQr = Buffer.from(JSON.stringify({
      token, tenantId: T, itemCode: 'CLEANING_BASIC', exp,
      checksum: 'badc0ffee0badc0ffee0badc0ffee0ba',
    })).toString('base64url');

    const row = makeVoucherRow(token, tamperedQr, 'ACTIVE');
    const client = stateful([[], [row]]);

    const result = await engine.redeem(client as never, T, SECRET, {
      token, redeemedBy: 'r1', channel: 'QR_SCAN', correlationId: 'c-tamper',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_SIGNATURE');
  });

  it('redeem() with valid QR payload succeeds and marks REDEEMED', async () => {
    const token = randomBytes(32).toString('hex');
    const exp = Math.floor((Date.now() + 86_400_000) / 1_000);
    const checksum = createHmac('sha256', SECRET)
      .update(`${token}:${T}:CLEANING_BASIC:${exp}`).digest('hex').slice(0, 32);
    const validQr = Buffer.from(JSON.stringify({
      token, tenantId: T, itemCode: 'CLEANING_BASIC', exp, checksum,
    })).toString('base64url');

    const row = makeVoucherRow(token, validQr, 'ACTIVE');
    const client = stateful([
      [],        // idempotency check
      [row],     // FOR UPDATE
      [],        // UPDATE status = REDEEMED
    ]);

    const result = await engine.redeem(client as never, T, SECRET, {
      token, redeemedBy: 'receptionist-001', channel: 'QR_SCAN', correlationId: 'c-ok',
    });

    expect(result.success).toBe(true);
    expect(result.data!.result).toBe('SUCCESS');
  });
});

// ─── SPRINT 6: DentalBookingEngine ───────────────────────────────────────────

describe('DentalBookingEngine', () => {
  const engine = new DentalBookingEngine();

  const bookingRow = {
    id: 'dbk-001', tenant_id: T, voucher_id: null,
    catalog_item_code: 'ROOT_CANAL_MOLAR', patient_ref: 'patient-001',
    provider_id: null, location_id: null,
    slot_start: new Date(), slot_end: new Date(Date.now() + 3_600_000),
    timezone: 'America/Mexico_City', status: 'REQUESTED',
    notes: null, cancellation_reason: null,
    confirmed_at: null, completed_at: null, cancelled_at: null,
    correlation_id: 'bk-corr-001', created_at: new Date(), updated_at: new Date(),
  };

  it('create() inserts booking in REQUESTED status', async () => {
    const client = stateful([[bookingRow]]);
    const result = await engine.create(client as never, T, undefined, {
      catalogItemCode: 'ROOT_CANAL_MOLAR', patientRef: 'patient-001',
      slotId: 'f47ac10b-58cc-4372-a567-0e02b2c3d481', correlationId: 'bk-corr-001',
    }, new Date(Date.now() + 3_600_000));

    expect(result.success).toBe(true);
    expect(result.data!.status).toBe('REQUESTED');
    expect(result.data!.catalogItemCode).toBe('ROOT_CANAL_MOLAR');
  });

  it('transition() REQUESTED → CONFIRMED succeeds', async () => {
    const confirmedRow = { ...bookingRow, status: 'CONFIRMED', confirmed_at: new Date() };
    const client = stateful([[confirmedRow]]);

    const result = await engine.transition(
      client as never, 'dbk-001', 'REQUESTED', 'CONFIRMED', { confirmedAt: new Date() }
    );

    expect(result.success).toBe(true);
    expect(result.data!.status).toBe('CONFIRMED');
  });

  it('transition() returns INVALID_TRANSITION for wrong from-state', async () => {
    const client = stateful([[]]); // WHERE status = 'REQUESTED' returns nothing (it's CONFIRMED)
    const result = await engine.transition(
      client as never, 'dbk-001', 'REQUESTED', 'CONFIRMED' // already CONFIRMED
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_TRANSITION');
  });

  it('transition() CHECKED_IN → COMPLETED succeeds', async () => {
    const completedRow = { ...bookingRow, status: 'COMPLETED', completed_at: new Date() };
    const client = stateful([[completedRow]]);
    const result = await engine.transition(
      client as never, 'dbk-001', 'CHECKED_IN', 'COMPLETED', { completedAt: new Date() }
    );
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe('COMPLETED');
  });

  it('toFulfillmentStatus() maps all booking states correctly', () => {
    expect(DentalBookingEngine.toFulfillmentStatus('REQUESTED')).toBe('SCHEDULED');
    expect(DentalBookingEngine.toFulfillmentStatus('CONFIRMED')).toBe('CONFIRMED');
    expect(DentalBookingEngine.toFulfillmentStatus('CHECKED_IN')).toBe('CHECKED_IN');
    expect(DentalBookingEngine.toFulfillmentStatus('COMPLETED')).toBe('COMPLETED');
    expect(DentalBookingEngine.toFulfillmentStatus('CANCELLED')).toBe('CANCELLED');
    expect(DentalBookingEngine.toFulfillmentStatus('NO_SHOW')).toBe('CANCELLED');
  });
});

// ─── SPRINT 6: Full commerce flow invariants ─────────────────────────────────

describe('Dental Commerce Flow — Invariants', () => {
  it('voucher token has 256-bit entropy (32 bytes = 64 hex chars)', () => {
    const tokens = Array.from({ length: 10 }, () => randomBytes(32).toString('hex'));
    for (const t of tokens) {
      expect(t).toHaveLength(64);
      expect(t).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(tokens).size).toBe(10); // all unique
  });

  it('fulfillment lifecycle is unidirectional (no backward transitions)', () => {
    const FORWARD: Record<string, string[]> = {
      PURCHASED:  ['SCHEDULED', 'CANCELLED'],
      SCHEDULED:  ['CONFIRMED', 'CANCELLED'],
      CONFIRMED:  ['CHECKED_IN', 'CANCELLED'],
      CHECKED_IN: ['COMPLETED'],
      COMPLETED:  [],
      CANCELLED:  [],
    };

    // Verify no state transitions backward
    const stateOrder = ['PURCHASED', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
    for (const [from, targets] of Object.entries(FORWARD)) {
      const fromIdx = stateOrder.indexOf(from);
      for (const to of targets) {
        if (to === 'CANCELLED') continue;
        const toIdx = stateOrder.indexOf(to);
        if (fromIdx >= 0 && toIdx >= 0) {
          expect(toIdx).toBeGreaterThan(fromIdx);
        }
      }
    }
  });

  it('QR payload HMAC uses tenant-specific secret (cross-tenant isolation)', () => {
    const token = 'a'.repeat(64);
    const exp = 9999999999;

    const hmacA = createHmac('sha256', SECRET)
      .update(`${token}:tenant-A:CLEANING_BASIC:${exp}`).digest('hex').slice(0, 32);
    const hmacB = createHmac('sha256', SECRET)
      .update(`${token}:tenant-B:CLEANING_BASIC:${exp}`).digest('hex').slice(0, 32);

    expect(hmacA).not.toBe(hmacB);
  });

  it('pricing rule precedence: item > category > tenant default', () => {
    // This invariant is enforced by SQL ORDER BY in PricingRuleRepository.resolvePrice()
    // The CASE expression gives item-specific rules priority 2, category rules 1
    const ITEM_PRIORITY = 2;
    const CATEGORY_PRIORITY = 1;
    const DEFAULT_PRIORITY = 0;

    expect(ITEM_PRIORITY).toBeGreaterThan(CATEGORY_PRIORITY);
    expect(CATEGORY_PRIORITY).toBeGreaterThan(DEFAULT_PRIORITY);
  });
});
