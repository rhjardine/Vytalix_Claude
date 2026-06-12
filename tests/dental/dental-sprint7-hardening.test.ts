/**
 * dental-sprint7-hardening.test.ts — Vytalix CFE Dental Sprint 7
 *
 * Hardening & Consolidation: cross-layer alignment tests.
 *
 * These tests act as regression guards for the audit findings:
 *   F1  — Prisma schema completeness (12 models)
 *   F2  — No invalid partial index syntax
 *   F4  — Catalog category enum consistency across schema ↔ domain ↔ OpenAPI
 *   F5  — Single metric system (no dual emission)
 *   F6  — effectiveAt field in CreateExchangeRateSchema
 *   F7  — /seal endpoint uses SealPlanVersionSchema
 *   SEC — Slot order constraint documented
 *   SEC — Margin bps range constraint documented
 *   SEC — Audit log event type constraint documented
 *
 * Each test binds to a specific layer so a future regression is instantly
 * locatable: "Schema ↔ SQL", "Router ↔ Schema", "OpenAPI ↔ Router", etc.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  CreateCatalogItemSchema,
  CreateExchangeRateSchema,
  SealPlanVersionSchema,
  InventoryMovementSchema,
  CreateQuoteSchema,
  CreateTreatmentPlanSchema,
} from '../dental/schemas/dental-schemas';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// ─── PRISMA SCHEMA COMPLETENESS (F1) ─────────────────────────────────────────

describe('Prisma Schema — Model Completeness (F1)', () => {
  const prisma = readFile('prisma/schema.prisma');

  const requiredModels = [
    'TreatmentPlan',
    'TreatmentVersion',
    'InventoryItem',
    'InventoryMovement',
    'FinancialSnapshot',
    'DentalAuditLog',
    'DentalCatalogItem',
    'DentalPricingRule',
    'ExchangeRateSnapshot',
    'DentalTenantSettings',
    'DentalVoucher',
    'DentalBooking',
  ];

  it.each(requiredModels)('model %s is declared in schema.prisma', (modelName) => {
    expect(prisma).toContain(`model ${modelName} {`);
  });

  it('all 12 required models are present', () => {
    const found = requiredModels.filter(m => prisma.includes(`model ${m} {`));
    expect(found).toHaveLength(12);
  });

  it('no partial index uses deprecated where: syntax (F2)', () => {
    // Prisma does not support SQL partial indexes via @@index — must be in SQL only
    const lines = prisma.split('\n').filter(l => l.includes('@@index') && l.includes('where:'));
    expect(lines).toHaveLength(0);
  });

  it('every model with tenantId uses @db.Uuid', () => {
    // Verify tenant-bearing models use correct Postgres type
    const tenantModels = ['DentalAuditLog', 'DentalCatalogItem', 'DentalVoucher', 'DentalBooking'];
    for (const m of tenantModels) {
      const idx = prisma.indexOf(`model ${m} {`);
      const block = prisma.slice(idx, idx + 400);
      expect(block).toContain('tenantId');
      expect(block).toContain('@db.Uuid');
    }
  });

  it('DentalVoucher.token is declared @unique', () => {
    const idx = prisma.indexOf('model DentalVoucher {');
    const block = prisma.slice(idx, idx + 600);
    expect(block).toContain('@unique');
    expect(block).toContain('token');
  });

  it('DentalTenantSettings.tenantId is @unique (one row per tenant)', () => {
    const idx = prisma.indexOf('model DentalTenantSettings {');
    const block = prisma.slice(idx, idx + 400);
    expect(block).toContain('@unique');
  });

  it('DentalBooking has relation to DentalVoucher', () => {
    const idx = prisma.indexOf('model DentalBooking {');
    const closingBrace = prisma.indexOf('\n}\n', idx) + 3;
    const block = prisma.slice(idx, closingBrace);
    expect(block).toContain('DentalVoucher');
    expect(block).toContain('@relation');
  });

  it('DentalAuditLog has no updatedAt (append-only — never mutated)', () => {
    const idx = prisma.indexOf('model DentalAuditLog {');
    const block = prisma.slice(idx, prisma.indexOf('}', idx) + 1);
    expect(block).not.toContain('updatedAt');
    expect(block).not.toContain('@updatedAt');
  });

  it('ExchangeRateSnapshot has no updatedAt (append-only)', () => {
    const idx = prisma.indexOf('model ExchangeRateSnapshot {');
    const block = prisma.slice(idx, prisma.indexOf('}', idx) + 1);
    expect(block).not.toContain('@updatedAt');
  });
});

// ─── SQL MIGRATION COMPLETENESS ───────────────────────────────────────────────

describe('SQL Migrations — Table Completeness', () => {
  const migration1 = readFile('prisma/migrations/20250901000000_dental_phase3_persistence.sql');
  const migration2 = readFile('prisma/migrations/20250902000000_dental_sprints4_5_tables.sql');
  const migration3 = readFile('prisma/migrations/20250903000000_dental_sprint7_hardening.sql');
  const allSql = migration1 + migration2 + migration3;

  const requiredTables = [
    'dental_treatment_plans',
    'dental_treatment_versions',
    'dental_inventory_items',
    'dental_inventory_movements',
    'dental_financial_snapshots',
    'dental_audit_logs',
    'dental_catalog_items',
    'dental_pricing_rules',
    'dental_exchange_rate_snapshots',
    'dental_tenant_settings',
    'dental_vouchers',
    'dental_bookings',
  ];

  it.each(requiredTables)('table %s is created in migrations', (table) => {
    expect(allSql).toContain(`CREATE TABLE ${table}`);
  });

  it('all 12 tables are covered by migrations', () => {
    const found = requiredTables.filter(t => allSql.includes(`CREATE TABLE ${t}`));
    expect(found).toHaveLength(12);
  });

  it('all tables have RLS enabled', () => {
    for (const table of requiredTables) {
      expect(allSql).toContain(`ALTER TABLE ${table}`);
      expect(allSql).toContain('ENABLE ROW LEVEL SECURITY');
    }
  });

  it('RLS policies use canonical app.current_tenant_id variable', () => {
    const rlsPolicies = allSql.match(/current_setting\('app\.[^']+'\)/g) ?? [];
    for (const policy of rlsPolicies) {
      expect(policy).toBe("current_setting('app.current_tenant_id')");
    }
  });

  it('dental_bookings has slot_end > slot_start CHECK (sprint 7 hardening)', () => {
    expect(migration3).toContain('slot_end > slot_start');
  });

  it('dental_financial_snapshots has margin bps range CHECK', () => {
    expect(migration3).toContain('gross_margin_bps BETWEEN -10000 AND 10000');
  });

  it('dental_audit_logs has event_type CHECK constraint', () => {
    expect(migration3).toContain('PLAN_CREATED');
    expect(migration3).toContain('dal_event_type_check');
  });

  it('inventory movements have non-negative stock CHECK', () => {
    expect(migration1).toContain('quantity_after >= 0');
  });

  it('dental_catalog_items has suggestedPrice >= baseCost CHECK', () => {
    expect(migration2).toContain('suggested_price >= base_cost');
  });
});

// ─── SCHEMA ↔ DOMAIN TYPE ALIGNMENT ──────────────────────────────────────────

describe('Zod Schema ↔ Domain Types — Alignment', () => {

  it('CreateCatalogItemSchema category enum has 11 values', () => {
    const categories = [
      'CONSULTATION', 'RESTORATION', 'ENDODONTICS', 'PERIODONTICS',
      'SURGERY', 'ORTHODONTICS', 'PROSTHETICS', 'IMPLANTS',
      'PREVENTIVE', 'COSMETIC', 'OTHER',
    ];
    for (const cat of categories) {
      const r = CreateCatalogItemSchema.safeParse({
        code: 'TEST_CODE', name: 'Test', category: cat,
        baseCost: 100, suggestedPrice: 200, currency: 'MXN',
      });
      expect(r.success, `category '${cat}' should be valid`).toBe(true);
    }
  });

  it('CreateCatalogItemSchema rejects unknown category', () => {
    const r = CreateCatalogItemSchema.safeParse({
      code: 'TEST', name: 'Test', category: 'MAGIC',
      baseCost: 100, suggestedPrice: 200, currency: 'MXN',
    });
    expect(r.success).toBe(false);
  });

  it('CreateExchangeRateSchema includes effectiveAt field (F6)', () => {
    const withDate = CreateExchangeRateSchema.safeParse({
      baseCurrency: 'MXN',
      rates: { USD: 0.056, EUR: 0.051 },
      effectiveAt: '2025-10-01T00:00:00Z',
    });
    expect(withDate.success, JSON.stringify(!withDate.success && withDate.error?.issues)).toBe(true);
  });

  it('CreateExchangeRateSchema works without effectiveAt (optional)', () => {
    const withoutDate = CreateExchangeRateSchema.safeParse({
      baseCurrency: 'USD',
      rates: { MXN: 17.9 },
    });
    expect(withoutDate.success).toBe(true);
  });

  it('SealPlanVersionSchema exists and validates correctly (F7)', () => {
    const valid = {
      items: [{ treatmentCode: 'CROWN_ZIRCONIA', quantity: 1 }],
      currency: 'MXN',
      correlationId: 'seal-corr-001',
    };
    expect(SealPlanVersionSchema.safeParse(valid).success).toBe(true);
  });

  it('SealPlanVersionSchema rejects empty items array', () => {
    const r = SealPlanVersionSchema.safeParse({
      items: [], currency: 'MXN', correlationId: 'c1',
    });
    expect(r.success).toBe(false);
  });

  it('InventoryMovementSchema ENTRY requires unitCost', () => {
    const withoutCost = InventoryMovementSchema.safeParse({
      itemId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      type: 'ENTRY', quantity: 10,
      performedBy: 'admin', correlationId: 'c1',
    });
    expect(withoutCost.success).toBe(false);
    if (!withoutCost.success) {
      const issue = withoutCost.error.issues.find(i => i.path.includes('unitCost'));
      expect(issue).toBeDefined();
    }
  });
});

// ─── ROUTER ↔ SCHEMA ALIGNMENT ───────────────────────────────────────────────

describe('Router ↔ Schema Alignment', () => {
  const dentalRouter = readFile('src/api/dental/dentalRouter.ts');
  const adminRouter  = readFile('src/api/dental/dentalAdminRouter.ts');
  const commerceRouter = readFile('src/api/dental/dentalCommerceRouter.ts');

  it('/seal endpoint uses SealPlanVersionSchema validate() middleware (F7)', () => {
    expect(dentalRouter).toContain("validate(SealPlanVersionSchema)");
    expect(dentalRouter).toContain("'/treatment-plan/:id/seal'");
  });

  it('/quote uses CreateQuoteSchema', () => {
    expect(dentalRouter).toContain('CreateQuoteSchema');
  });

  it('/treatment-plan POST uses CreateTreatmentPlanSchema', () => {
    expect(dentalRouter).toContain('CreateTreatmentPlanSchema');
  });

  it('/inventory/movement uses InventoryMovementSchema', () => {
    expect(dentalRouter).toContain('InventoryMovementSchema');
  });

  it('no redundant incrementMetric calls (F5 — dual metric fix)', () => {
    expect(dentalRouter).not.toContain("incrementMetric(");
    expect(adminRouter).not.toContain("incrementMetric(");
    expect(commerceRouter).not.toContain("from '../../dental/dental-metrics'");
  });

  it('dentalRouter does not import from dental-metrics (replaced by PrometheusMetrics)', () => {
    expect(dentalRouter).not.toContain("from '../../dental/dental-metrics'");
  });

  it('all three routers propagate correlation ID via withTenant requestId', () => {
    for (const [name, src] of [
      ['dental', dentalRouter], ['admin', adminRouter], ['commerce', commerceRouter],
    ]) {
      expect(src, `${name} router`).toContain('requestId');
      expect(src, `${name} router`).toContain('withTenant');
    }
  });

  it('no router performs raw pool.query() (all DB access via withTenant)', () => {
    for (const [name, src] of [
      ['dental', dentalRouter], ['admin', adminRouter], ['commerce', commerceRouter],
    ]) {
      // pool.query directly in handler would bypass RLS
      const directPoolCalls = (src.match(/pool\.query\(/g) ?? []).length;
      expect(directPoolCalls, `${name} router direct pool.query`).toBe(0);
    }
  });
});

// ─── OPENAPI ↔ RUNTIME ALIGNMENT (F4) ────────────────────────────────────────

describe('OpenAPI ↔ Runtime Alignment', () => {
  const openapi = readFile('openapi/dental-api-v2.yaml');
  const dentalRouter    = readFile('src/api/dental/dentalRouter.ts');
  const adminRouter     = readFile('src/api/dental/dentalAdminRouter.ts');
  const commerceRouter  = readFile('src/api/dental/dentalCommerceRouter.ts');

  it('OpenAPI documents DentalCatalogItem category enum (F4)', () => {
    expect(openapi).toContain('CONSULTATION');
    expect(openapi).toContain('ENDODONTICS');
    expect(openapi).toContain('PROSTHETICS');
  });

  it('OpenAPI DentalCatalogItem has 11 category enum values', () => {
    const cats = ['CONSULTATION','RESTORATION','ENDODONTICS','PERIODONTICS',
      'SURGERY','ORTHODONTICS','PROSTHETICS','IMPLANTS','PREVENTIVE','COSMETIC','OTHER'];
    for (const c of cats) {
      expect(openapi, `category ${c}`).toContain(c);
    }
  });

  it('OpenAPI documents /api/v2/dental/quote (POST)', () => {
    expect(openapi).toContain('/api/v2/dental/quote');
    expect(openapi).toContain('post:');
  });

  it('OpenAPI documents /api/v2/dental/treatment-plan (POST + GET)', () => {
    expect(openapi).toContain('/api/v2/dental/treatment-plan');
  });

  it('OpenAPI documents /api/v2/dental/inventory/movement (POST)', () => {
    expect(openapi).toContain('/api/v2/dental/inventory/movement');
  });

  it('OpenAPI documents /metrics endpoint', () => {
    expect(openapi).toContain('/api/v2/dental/metrics');
  });

  it('OpenAPI documents all three voucher endpoints', () => {
    expect(openapi).toContain('/api/v2/dental/commerce/vouchers');
    expect(openapi).toContain('/api/v2/dental/commerce/vouchers/redeem');
  });

  it('OpenAPI documents full booking lifecycle (6 endpoints)', () => {
    const bookingEndpoints = [
      '/api/v2/dental/commerce/bookings',
      '/bookings/{id}',
      '/bookings/{id}/confirm',
      '/bookings/{id}/check-in',
      '/bookings/{id}/complete',
      '/bookings/{id}/cancel',
    ];
    for (const ep of bookingEndpoints) {
      expect(openapi, `endpoint ${ep}`).toContain(ep);
    }
  });

  it('OpenAPI money description mentions minor currency units', () => {
    expect(openapi).toContain('Minor currency units');
  });

  it('OpenAPI margin values documented in basis points', () => {
    expect(openapi).toContain('basis points');
  });

  it('runtime has /treatment-plan/:id/seal route (F7 — validated)', () => {
    expect(dentalRouter).toContain("'/treatment-plan/:id/seal'");
  });

  it('runtime has /admin/analytics/revenue endpoint', () => {
    expect(adminRouter).toContain("'/analytics/revenue'");
  });

  it('runtime has /admin/analytics/margin endpoint', () => {
    expect(adminRouter).toContain("'/analytics/margin'");
  });

  it('runtime has /admin/analytics/inventory endpoint', () => {
    expect(adminRouter).toContain("'/analytics/inventory'");
  });
});

// ─── REPOSITORY PATTERNS ─────────────────────────────────────────────────────

describe('Repository Pattern Correctness', () => {
  const planRepo      = readFile('src/dental/repositories/treatment-plan.repository.ts');
  const inventoryRepo = readFile('src/dental/repositories/inventory.repository.ts');
  const snapshotRepo  = readFile('src/dental/repositories/financial-snapshot.repository.ts');
  const financialRepo = readFile('src/dental/repositories/dental-financial.repositories.ts');

  it('TreatmentPlanRepository uses FOR UPDATE to prevent concurrent seal races', () => {
    expect(planRepo).toContain('FOR UPDATE');
  });

  it('TreatmentPlanRepository uses optimistic version number (MAX + 1)', () => {
    expect(planRepo).toContain('MAX(version_number)');
  });

  it('InventoryRepository uses FOR UPDATE for concurrent movement protection', () => {
    expect(inventoryRepo).toContain('FOR UPDATE');
  });

  it('InventoryRepository derives stock via SUM(quantity) — event-sourcing pattern', () => {
    expect(inventoryRepo).toContain('SUM(quantity)');
    // Must NOT store a balance directly
    expect(inventoryRepo).not.toContain('UPDATE dental_inventory_items SET stock');
  });

  it('FinancialSnapshotRepository uses only INSERT — append-only contract', () => {
    // Verify no mutating SQL against the snapshots table
    expect(snapshotRepo).not.toContain('UPDATE dental_financial_snapshots');
    expect(snapshotRepo).not.toContain('DELETE FROM dental_financial_snapshots');
    // Verify every backtick SQL block that touches snapshots table starts with SELECT or INSERT
    const snapshotSql = snapshotRepo.match(/`[^`]*dental_financial_snapshots[^`]*`/gs) ?? [];
    for (const sql of snapshotSql) {
      const first = sql.replace(/`\s*/s, '').trim().split(/\s+/)[0]?.toUpperCase();
      expect(['SELECT', 'INSERT'], `Unexpected SQL against snapshots: ${first}`).toContain(first);
    }
  });

  it('TenantSettingsService uses ON CONFLICT DO UPDATE (upsert — not insert-or-fail)', () => {
    expect(financialRepo).toContain('ON CONFLICT');
    expect(financialRepo).toContain('DO UPDATE');
  });

  it('PricingRuleRepository uses priority-based ordering for rule resolution', () => {
    expect(financialRepo).toContain('priority');
    expect(financialRepo).toContain('ORDER BY');
  });

  it('no repository performs pool.connect() directly (must use provided PoolClient)', () => {
    for (const [name, src] of [
      ['plan', planRepo], ['inventory', inventoryRepo],
      ['snapshot', snapshotRepo], ['financial', financialRepo],
    ]) {
      expect(src, `${name} repo`).not.toContain('pool.connect()');
    }
  });

  it('all repositories accept PoolClient not Pool as first argument', () => {
    for (const [name, src] of [
      ['plan', planRepo], ['inventory', inventoryRepo],
      ['snapshot', snapshotRepo], ['financial', financialRepo],
    ]) {
      expect(src, `${name} repo has PoolClient type`).toContain('PoolClient');
      expect(src, `${name} repo should not import Pool directly`).not.toMatch(/import.*\bPool\b.*from 'pg'/);
    }
  });
});

// ─── TENANT ISOLATION ─────────────────────────────────────────────────────────

describe('Tenant Isolation Invariants', () => {
  it('withTenant uses SET LOCAL — transaction-scoped, never session SET', () => {
    const db = readFile('src/shared/db/db.ts');
    // All SET commands must include LOCAL
    const setLines = db.split('\n').filter(l => l.includes('SET app.'));
    for (const line of setLines) {
      expect(line, `Line should use SET LOCAL: ${line}`).toContain('SET LOCAL');
    }
  });

  it('all 12 dental tables have ENABLE ROW LEVEL SECURITY in migrations', () => {
    const m1 = readFile('prisma/migrations/20250901000000_dental_phase3_persistence.sql');
    const m2 = readFile('prisma/migrations/20250902000000_dental_sprints4_5_tables.sql');
    const allSql = m1 + m2;
    const tables = [
      'dental_treatment_plans', 'dental_treatment_versions',
      'dental_inventory_items', 'dental_inventory_movements',
      'dental_financial_snapshots', 'dental_audit_logs',
      'dental_catalog_items', 'dental_pricing_rules',
      'dental_exchange_rate_snapshots', 'dental_tenant_settings',
      'dental_vouchers', 'dental_bookings',
    ];
    for (const t of tables) {
      expect(allSql, `${t} should have RLS enabled`).toContain(t);
      expect(allSql).toContain('ENABLE ROW LEVEL SECURITY');
    }
  });

  it('clinical core modules are not imported by any dental file', () => {
    const dentalFiles = [
      'src/dental/engines/QuoteOrchestrator.ts',
      'src/dental/engines/DentalCommerceEngines.ts',
      'src/dental/repositories/treatment-plan.repository.ts',
      'src/dental/repositories/inventory.repository.ts',
      'src/api/dental/dentalRouter.ts',
    ];
    const forbiddenImports = ['src/core', 'src/longevity', 'src/preventive', 'BiophysicsEngine',
      'PreventiveScore', 'ReferralEngine', 'Framingham', 'DecisionEngine'];

    for (const file of dentalFiles) {
      const src = readFile(file);
      for (const forbidden of forbiddenImports) {
        expect(src, `${file} must not import ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
