/**
 * dentalAdminRouter.ts — Vytalix CFE Dental: Admin + Analytics API (Sprint 5)
 *
 * Multi-tenant financial management. Each tenant configures independently:
 *   - Persistent dental catalog (codes, costs, suggested prices)
 *   - Pricing rules (margin by item/category, discounts, promos)
 *   - Exchange rate snapshots
 *   - Tenant settings (currency, tax, default margin)
 *   - Financial analytics dashboard
 *
 * All routes require admin scope. Mounted at /api/v2/dental/admin/*
 */

import { Router, Request, Response } from 'express';
import { withTenant } from '../../shared/db/db';
import type { TenantRequest } from '../../shared/middleware/tenantMiddleware';
import { validate } from '../../shared/middleware/validate';
import {
  CreateCatalogItemSchema,
  CreatePricingRuleSchema,
  CreateExchangeRateSchema,
  UpsertTenantSettingsSchema,
} from '../schemas/dental-schemas';
import {
  dentalCatalogRepository,
  pricingRuleRepository,
  exchangeRateRepository,
  tenantSettingsService,
} from '../repositories/dental-financial.repositories';
import { financialSnapshotRepository } from '../repositories/financial-snapshot.repository';

export const dentalAdminRouter = Router();
const tr = (req: Request): TenantRequest => req as unknown as TenantRequest;

// ─── CATALOG ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v2/dental/admin/catalog
 * Creates a catalog item for this tenant.
 */
dentalAdminRouter.post('/catalog',
  validate(CreateCatalogItemSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof CreateCatalogItemSchema._type }).validatedBody;

    const result = await withTenant({ tenantId, userId, requestId }, (client) =>
      dentalCatalogRepository.create(client, tenantId, input)
    );

    res.status(result.success ? 201 : 400).json(result);
  }
);

/**
 * GET /api/v2/dental/admin/catalog
 * Lists tenant catalog items. Query: category, isActive, page, pageSize
 */
dentalAdminRouter.get('/catalog', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const q = req.query as Record<string, string>;

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalCatalogRepository.list(client, {
      category:  q['category'],
      isActive:  q['isActive'] !== undefined ? q['isActive'] === 'true' : undefined,
      page:      q['page']     ? parseInt(q['page'],     10) : 1,
      pageSize:  q['pageSize'] ? parseInt(q['pageSize'], 10) : 20,
    })
  );
  res.json(result);
});

/**
 * GET /api/v2/dental/admin/catalog/:code
 */
dentalAdminRouter.get('/catalog/:code', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, (client) =>
    dentalCatalogRepository.findByCode(client, req.params.code!)
  );

  res.status(result.success ? 200 : 404).json(result);
});

// ─── PRICING RULES ────────────────────────────────────────────────────────────

/**
 * POST /api/v2/dental/admin/pricing-rules
 * Creates a pricing rule. Either catalogItemCode or category must be set.
 */
dentalAdminRouter.post('/pricing-rules',
  validate(CreatePricingRuleSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof CreatePricingRuleSchema._type }).validatedBody;

    const result = await withTenant({ tenantId, userId, requestId }, (client) =>
      pricingRuleRepository.create(client, tenantId, input)
    );

    res.status(result.success ? 201 : 400).json(result);
  }
);

// ─── EXCHANGE RATES ───────────────────────────────────────────────────────────

/**
 * POST /api/v2/dental/admin/exchange-rates
 * Saves a new exchange rate snapshot.
 */
dentalAdminRouter.post('/exchange-rates',
  validate(CreateExchangeRateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof CreateExchangeRateSchema._type }).validatedBody;

    const result = await withTenant({ tenantId, userId, requestId }, (client) =>
      exchangeRateRepository.save(client, tenantId, input)
    );

    res.status(result.success ? 201 : 400).json(result);
  }
);

/**
 * GET /api/v2/dental/admin/exchange-rates/latest
 * Returns latest rates for a base currency. Query: baseCurrency (default MXN)
 */
dentalAdminRouter.get('/exchange-rates/latest', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const base = (req.query['baseCurrency'] as string | undefined) ?? 'MXN';

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const snapshot = await exchangeRateRepository.getLatest(client, base);
    if (!snapshot) {
      return { success: false, error: { code: 'NOT_FOUND', message: `No exchange rates saved for base currency ${base}` } };
    }
    return { success: true, data: snapshot };
  });

  res.status(result.success ? 200 : 404).json(result);
});

// ─── TENANT SETTINGS ─────────────────────────────────────────────────────────

/**
 * PUT /api/v2/dental/admin/settings
 * Upserts tenant-level dental configuration (currency, tax, margin, etc.)
 */
dentalAdminRouter.put('/settings',
  validate(UpsertTenantSettingsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId, requestId } = tr(req);
    const input = (req as unknown as { validatedBody: typeof UpsertTenantSettingsSchema._type }).validatedBody;

    const result = await withTenant({ tenantId, userId, requestId }, (client) =>
      tenantSettingsService.upsert(client, tenantId, input)
    );

    res.status(result.success ? 200 : 400).json(result);
  }
);

/**
 * GET /api/v2/dental/admin/settings
 */
dentalAdminRouter.get('/settings', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const settings = await tenantSettingsService.getOrDefault(client);
    return { success: true, data: settings };
  });

  res.json(result);
});

// ─── ANALYTICS DASHBOARD ─────────────────────────────────────────────────────

/**
 * GET /api/v2/dental/admin/analytics/revenue
 * Revenue summary for a period. Query: period (e.g. "2025-10"), snapshotType
 */
dentalAdminRouter.get('/analytics/revenue', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const { period, snapshotType } = req.query as Record<string, string>;

  if (!period) {
    res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'period is required (e.g. 2025-10)' } });
    return;
  }

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const [aggregate, snapshots] = await Promise.all([
      financialSnapshotRepository.aggregateByPeriod(client, period),
      financialSnapshotRepository.query(client, {
        period,
        snapshotType: (snapshotType as never) ?? undefined,
        page: 1,
        pageSize: 50,
      }),
    ]);

    return {
      success: true,
      data: {
        period,
        aggregate: aggregate.success ? aggregate.data : null,
        snapshots: snapshots.data ?? [],
        pagination: snapshots.pagination,
      },
    };
  });

  res.json(result);
});

/**
 * GET /api/v2/dental/admin/analytics/margin
 * Margin analysis. Returns avg gross/net margin bps for a period.
 */
dentalAdminRouter.get('/analytics/margin', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);
  const { period } = req.query as Record<string, string>;

  if (!period) {
    res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'period is required' } });
    return;
  }

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const agg = await financialSnapshotRepository.aggregateByPeriod(client, period);
    if (!agg.success) return agg;

    return {
      success: true,
      data: {
        period,
        avgGrossMarginBps: agg.data!.avgGrossMarginBps,
        avgGrossMarginPct: (agg.data!.avgGrossMarginBps / 100).toFixed(2),
        avgNetMarginBps:   agg.data!.avgNetMarginBps,
        avgNetMarginPct:   (agg.data!.avgNetMarginBps / 100).toFixed(2),
        totalNetRevenue:   agg.data!.totalNetRevenue,
        currency:          agg.data!.currency,
        snapshotCount:     agg.data!.snapshotCount,
      },
    };
  });

  res.status(result.success ? 200 : 404).json(result);
});

/**
 * GET /api/v2/dental/admin/analytics/inventory
 * Inventory analytics: items below reorder level, movement summary.
 */
dentalAdminRouter.get('/analytics/inventory', async (req: Request, res: Response): Promise<void> => {
  const { tenantId, userId, requestId } = tr(req);

  const result = await withTenant({ tenantId, userId, requestId }, async (client) => {
    const [belowReorder, movementSummary] = await Promise.all([
      client.query<{ id: string; name: string; sku: string; current_stock: number; reorder_level: number }>(
        `SELECT i.id, i.name, i.sku,
                COALESCE(SUM(m.quantity), 0)::int AS current_stock,
                i.reorder_level
         FROM dental_inventory_items i
         LEFT JOIN dental_inventory_movements m ON m.item_id = i.id
         WHERE i.deleted_at IS NULL AND i.is_active = TRUE
         GROUP BY i.id
         HAVING COALESCE(SUM(m.quantity), 0) <= i.reorder_level
         ORDER BY (COALESCE(SUM(m.quantity), 0) - i.reorder_level) ASC
         LIMIT 20`
      ),
      client.query<{ type: string; total_movements: string; total_quantity: string }>(
        `SELECT type,
                COUNT(*)::text          AS total_movements,
                ABS(SUM(quantity))::text AS total_quantity
         FROM dental_inventory_movements
         WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY type
         ORDER BY total_movements DESC`
      ),
    ]);

    return {
      success: true,
      data: {
        lowStockItems: belowReorder.rows.map(r => ({
          id: r.id, name: r.name, sku: r.sku,
          currentStock: r.current_stock, reorderLevel: r.reorder_level,
          deficit: r.reorder_level - r.current_stock,
        })),
        movementSummary30d: movementSummary.rows.map(r => ({
          type: r.type,
          totalMovements: parseInt(r.total_movements, 10),
          totalQuantity: parseInt(r.total_quantity, 10),
        })),
      },
    };
  });

  res.json(result);
});

export default dentalAdminRouter;
