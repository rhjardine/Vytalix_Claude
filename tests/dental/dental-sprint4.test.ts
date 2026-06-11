/**
 * dental-sprint4.test.ts — Vytalix CFE Dental Sprint 4
 * Runtime Integration: Zod validation, AuditService, PrometheusMetrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CreateQuoteSchema,
  CreateTreatmentPlanSchema,
  InventoryMovementSchema,
  CreateInventoryItemSchema,
  CreateCatalogItemSchema,
  CreatePricingRuleSchema,
  CreateExchangeRateSchema,
  UpsertTenantSettingsSchema,
  IssueDentalVoucherSchema,
  RedeemDentalVoucherSchema,
  CreateDentalBookingSchema,
} from '../dental/schemas/dental-schemas';
import { AuditService } from '../dental/audit/AuditService';
import {
  dentalMetrics,
  renderPrometheusText,
  resetAllMetrics,
  incCounter,
} from '../dental/metrics/PrometheusMetrics';

// ─── ZOD SCHEMA VALIDATION ────────────────────────────────────────────────────

describe('CreateQuoteSchema', () => {
  const valid = {
    patientRef: 'patient-001',
    items: [{ treatmentCode: 'CROWN_ZIRCONIA', quantity: 1 }],
    currency: 'MXN',
    correlationId: 'corr-001',
  };

  it('accepts valid input', () => {
    expect(CreateQuoteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing patientRef', () => {
    const { patientRef: _, ...rest } = valid;
    const r = CreateQuoteSchema.safeParse(rest);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path).toContain('patientRef');
  });

  it('rejects empty items array', () => {
    const r = CreateQuoteSchema.safeParse({ ...valid, items: [] });
    expect(r.success).toBe(false);
  });

  it('rejects invalid currency', () => {
    const r = CreateQuoteSchema.safeParse({ ...valid, currency: 'GBP' });
    expect(r.success).toBe(false);
  });

  it('rejects treatment code with lowercase', () => {
    const r = CreateQuoteSchema.safeParse({
      ...valid,
      items: [{ treatmentCode: 'crown_zirconia', quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero quantity', () => {
    const r = CreateQuoteSchema.safeParse({
      ...valid,
      items: [{ treatmentCode: 'CROWN_ZIRCONIA', quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown extra fields (.strict())', () => {
    const r = CreateQuoteSchema.safeParse({ ...valid, hackerField: 'injection' });
    expect(r.success).toBe(false);
  });

  it('accepts optional metadata', () => {
    const r = CreateQuoteSchema.safeParse({ ...valid, metadata: { source: 'web' } });
    expect(r.success).toBe(true);
  });
});

describe('CreateTreatmentPlanSchema', () => {
  const valid = {
    patientRef: 'pat-001',
    title: 'Rehabilitación oral completa',
    items: [{ treatmentCode: 'IMPLANT_SINGLE', quantity: 1, toothNumbers: [36] }],
    currency: 'MXN',
    correlationId: 'corr-plan-001',
  };

  it('accepts valid plan input', () => {
    expect(CreateTreatmentPlanSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects title shorter than 3 chars', () => {
    const r = CreateTreatmentPlanSchema.safeParse({ ...valid, title: 'AB' });
    expect(r.success).toBe(false);
  });

  it('accepts optional description', () => {
    const r = CreateTreatmentPlanSchema.safeParse({ ...valid, description: 'Long description here' });
    expect(r.success).toBe(true);
  });

  it('rejects toothNumber outside FDI range (11-85)', () => {
    const r = CreateTreatmentPlanSchema.safeParse({
      ...valid,
      items: [{ treatmentCode: 'CROWN_ZIRCONIA', quantity: 1, toothNumbers: [99] }],
    });
    expect(r.success).toBe(false);
  });
});

describe('InventoryMovementSchema', () => {
  const valid = {
    itemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    type: 'CONSUMPTION',
    quantity: 3,
    performedBy: 'dr-garcia',
    correlationId: 'inv-001',
  };

  it('accepts CONSUMPTION without unitCost', () => {
    expect(InventoryMovementSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects ENTRY without unitCost (required for entries)', () => {
    const r = InventoryMovementSchema.safeParse({ ...valid, type: 'ENTRY' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const unitCostIssue = r.error.issues.find(i => i.path.includes('unitCost'));
      expect(unitCostIssue).toBeDefined();
    }
  });

  it('accepts ENTRY with unitCost', () => {
    const r = InventoryMovementSchema.safeParse({ ...valid, type: 'ENTRY', unitCost: 800 });
    expect(r.success).toBe(true);
  });

  it('rejects quantity = 0', () => {
    const r = InventoryMovementSchema.safeParse({ ...valid, quantity: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects invalid UUID for itemId', () => {
    const r = InventoryMovementSchema.safeParse({ ...valid, itemId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown movement type', () => {
    const r = InventoryMovementSchema.safeParse({ ...valid, type: 'STOLEN' });
    expect(r.success).toBe(false);
  });
});

// ─── SPRINT 5 SCHEMAS ─────────────────────────────────────────────────────────

describe('CreateCatalogItemSchema', () => {
  const valid = {
    code: 'CROWN_ZIRCONIA',
    name: 'Corona de zirconia',
    category: 'PROSTHETICS',
    baseCost: 400_000,
    suggestedPrice: 800_000,
    currency: 'MXN',
  };

  it('accepts valid catalog item', () => {
    expect(CreateCatalogItemSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects suggestedPrice < baseCost', () => {
    const r = CreateCatalogItemSchema.safeParse({ ...valid, suggestedPrice: 300_000 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toContain('suggestedPrice must be >= baseCost');
    }
  });

  it('rejects invalid category', () => {
    const r = CreateCatalogItemSchema.safeParse({ ...valid, category: 'MAGIC' });
    expect(r.success).toBe(false);
  });
});

describe('CreatePricingRuleSchema', () => {
  it('accepts item-specific margin rule', () => {
    const r = CreatePricingRuleSchema.safeParse({
      catalogItemCode: 'CROWN_ZIRCONIA',
      marginPercent: 100,
      priority: 10,
      isActive: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects rule with neither catalogItemCode nor category', () => {
    const r = CreatePricingRuleSchema.safeParse({
      marginPercent: 100,
      priority: 0,
      isActive: true,
    });
    expect(r.success).toBe(false);
  });

  it('accepts category-level discount rule', () => {
    const r = CreatePricingRuleSchema.safeParse({
      category: 'PROSTHETICS',
      discountPercent: 10,
      priority: 5,
      isActive: true,
    });
    expect(r.success).toBe(true);
  });
});

describe('UpsertTenantSettingsSchema', () => {
  const valid = {
    defaultCurrency: 'MXN',
    taxRate: 16.0,
    defaultMarginPercent: 35.0,
    financingEnabled: false,
    timezone: 'America/Mexico_City',
  };

  it('accepts valid settings', () => {
    expect(UpsertTenantSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects taxRate > 100', () => {
    const r = UpsertTenantSettingsSchema.safeParse({ ...valid, taxRate: 150 });
    expect(r.success).toBe(false);
  });

  it('rejects negative defaultMarginPercent', () => {
    const r = UpsertTenantSettingsSchema.safeParse({ ...valid, defaultMarginPercent: -5 });
    expect(r.success).toBe(false);
  });
});

// ─── SPRINT 6 SCHEMAS ─────────────────────────────────────────────────────────

describe('IssueDentalVoucherSchema', () => {
  const valid = {
    catalogItemCode: 'CLEANING_BASIC',
    beneficiaryRef: 'patient-voucher-001',
    expiresInDays: 90,
    currency: 'MXN',
    correlationId: 'voucher-corr-001',
  };

  it('accepts valid voucher issue request', () => {
    expect(IssueDentalVoucherSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects expiresInDays = 0', () => {
    const r = IssueDentalVoucherSchema.safeParse({ ...valid, expiresInDays: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects expiresInDays > 730 (2 years)', () => {
    const r = IssueDentalVoucherSchema.safeParse({ ...valid, expiresInDays: 800 });
    expect(r.success).toBe(false);
  });
});

describe('RedeemDentalVoucherSchema', () => {
  const valid = {
    token: 'a'.repeat(64),
    redeemedBy: 'receptionist-001',
    channel: 'QR_SCAN',
    correlationId: 'redeem-001',
  };

  it('accepts valid redemption request', () => {
    expect(RedeemDentalVoucherSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects token shorter than 64 chars', () => {
    const r = RedeemDentalVoucherSchema.safeParse({ ...valid, token: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown channel', () => {
    const r = RedeemDentalVoucherSchema.safeParse({ ...valid, channel: 'TELEGRAM' });
    expect(r.success).toBe(false);
  });
});

describe('CreateDentalBookingSchema', () => {
  const valid = {
    catalogItemCode: 'ROOT_CANAL_MOLAR',
    patientRef: 'patient-booking-001',
    slotId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    correlationId: 'booking-001',
  };

  it('accepts minimal valid booking', () => {
    expect(CreateDentalBookingSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional voucherToken', () => {
    const r = CreateDentalBookingSchema.safeParse({ ...valid, voucherToken: 'b'.repeat(64) });
    expect(r.success).toBe(true);
  });

  it('rejects invalid slotId UUID', () => {
    const r = CreateDentalBookingSchema.safeParse({ ...valid, slotId: 'not-uuid' });
    expect(r.success).toBe(false);
  });
});

// ─── AUDIT SERVICE ────────────────────────────────────────────────────────────

describe('AuditService', () => {
  const service = new AuditService();

  const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  function makeClient() {
    return { query: vi.fn(async () => ({ rows: [] })) };
  }

  it('record() calls INSERT INTO dental_audit_logs', async () => {
    const client = makeClient();
    await service.record(client as never, {
      tenantId: TENANT_ID,
      eventType: 'PLAN_CREATED',
      entityId: 'plan-001',
      entityType: 'TreatmentPlan',
      actorId: 'user-001',
      correlationId: 'corr-001',
      after: { planId: 'plan-001' },
    });

    expect(client.query).toHaveBeenCalledOnce();
    const sql = client.query.mock.calls[0]![0] as string;
    expect(sql).toContain('INSERT INTO dental_audit_logs');
    expect(sql).toContain('event_type');
    expect(sql).toContain('before_state');
    expect(sql).toContain('after_state');
  });

  it('planCreated() writes PLAN_CREATED event with after state', async () => {
    const client = makeClient();
    await service.planCreated(
      client as never, TENANT_ID,
      'plan-001', 'ver-001', 'user-001', 'corr-001',
      { title: 'Test Plan', totalAmount: 928_000 }
    );

    expect(client.query).toHaveBeenCalledOnce();
    const values = client.query.mock.calls[0]![1] as unknown[];
    expect(values[1]).toBe('PLAN_CREATED');
    expect(values[2]).toBe('plan-001');
  });

  it('planStatusChanged() captures before and after status', async () => {
    const client = makeClient();
    await service.planStatusChanged(
      client as never, TENANT_ID,
      'plan-001', 'user-001', 'corr-001', 'DRAFT', 'ACTIVE'
    );

    const values = client.query.mock.calls[0]![1] as unknown[];
    expect(values[1]).toBe('PLAN_STATUS_CHANGED');
    // before_state JSON contains old status
    const beforeJson = JSON.parse(values[6] as string) as { status: string };
    expect(beforeJson.status).toBe('DRAFT');
    const afterJson  = JSON.parse(values[7] as string) as { status: string };
    expect(afterJson.status).toBe('ACTIVE');
  });

  it('versionSealed() writes VERSION_SEALED event with financial snapshot', async () => {
    const client = makeClient();
    await service.versionSealed(
      client as never, TENANT_ID,
      'plan-001', 'ver-001', 2, 'user-001', 'corr-001',
      928_000, 'MXN'
    );

    const values = client.query.mock.calls[0]![1] as unknown[];
    expect(values[1]).toBe('VERSION_SEALED');
    const afterJson = JSON.parse(values[7] as string) as { totalAmount: number; currency: string };
    expect(afterJson.totalAmount).toBe(928_000);
    expect(afterJson.currency).toBe('MXN');
  });

  it('inventoryMovement() captures stock before/after', async () => {
    const client = makeClient();
    await service.inventoryMovement(
      client as never, TENANT_ID,
      'mov-001', 'item-001', 'user-001', 'corr-001',
      'CONSUMPTION', -3, 50, 47
    );

    const values = client.query.mock.calls[0]![1] as unknown[];
    expect(values[1]).toBe('INVENTORY_MOVEMENT');
    const afterJson = JSON.parse(values[7] as string) as { stock: number; quantity: number };
    expect(afterJson.stock).toBe(47);
    expect(afterJson.quantity).toBe(-3);
  });

  it('record() writes inside same transaction (uses provided client)', async () => {
    // Verifies no pool.connect() is called — uses the existing client
    const client = makeClient();
    await service.record(client as never, {
      tenantId: TENANT_ID, eventType: 'QUOTE_GENERATED',
      entityId: 'q-001', entityType: 'Quote',
      actorId: 'u1', correlationId: 'c1',
    });
    // Exactly one query — no extra connection calls
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

// ─── PROMETHEUS METRICS ───────────────────────────────────────────────────────

describe('PrometheusMetrics', () => {
  beforeEach(() => resetAllMetrics());

  it('quoteCreated() increments dental_quotes_created_total', () => {
    dentalMetrics.quoteCreated('tenant-A', 'MXN');
    dentalMetrics.quoteCreated('tenant-A', 'MXN');
    dentalMetrics.quoteCreated('tenant-B', 'USD');

    const text = renderPrometheusText();
    expect(text).toContain('dental_quotes_created_total');
    expect(text).toContain('tenant_id="tenant-A"');
    expect(text).toContain('tenant_id="tenant-B"');
  });

  it('renderPrometheusText() includes HELP and TYPE lines', () => {
    dentalMetrics.planCreated('t1');
    const text = renderPrometheusText();
    expect(text).toContain('# HELP dental_plans_created_total');
    expect(text).toContain('# TYPE dental_plans_created_total counter');
  });

  it('revenueEstimated() accumulates minor unit amounts', () => {
    dentalMetrics.revenueEstimated('tenant-A', 'MXN', 800_000);
    dentalMetrics.revenueEstimated('tenant-A', 'MXN', 1_500_000);

    const text = renderPrometheusText();
    expect(text).toContain('2300000');
  });

  it('setActivePlans() renders as gauge type', () => {
    dentalMetrics.setActivePlans('tenant-A', 12);
    const text = renderPrometheusText();
    expect(text).toContain('# TYPE dental_active_plans_gauge gauge');
    expect(text).toContain('12');
  });

  it('voucherRedeemed() tracks SUCCESS and FAILED separately', () => {
    dentalMetrics.voucherRedeemed('tenant-A', 'SUCCESS');
    dentalMetrics.voucherRedeemed('tenant-A', 'SUCCESS');
    dentalMetrics.voucherRedeemed('tenant-A', 'FAILED');

    const text = renderPrometheusText();
    const lines = text.split('\n').filter(l => l.includes('dental_vouchers_redeemed_total'));
    const successLine = lines.find(l => l.includes('SUCCESS'));
    const failedLine  = lines.find(l => l.includes('FAILED'));
    expect(successLine).toContain('2');
    expect(failedLine).toContain('1');
  });

  it('resetAllMetrics() clears all counters and gauges', () => {
    dentalMetrics.quoteCreated('t1', 'MXN');
    dentalMetrics.planCreated('t1');
    resetAllMetrics();
    expect(renderPrometheusText().trim()).toBe('');
  });

  it('label values with special chars are escaped', () => {
    incCounter('test_metric', 'test', { label: 'value"with"quotes' });
    const text = renderPrometheusText();
    expect(text).toContain('\\"with\\"');
  });
});
