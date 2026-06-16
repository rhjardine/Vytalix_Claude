/**
 * dental-core.router.ts — Vytalix CFE Dental Sprint 2A
 *
 * HTTP adapter for orphaned engines not covered by admin or commerce routers:
 *   - QuoteOrchestrator  → POST /api/v2/dental/core/quotes
 *   - DentalPricingService → (used by quote endpoint)
 *   - SnapshotEngine     → POST /api/v2/dental/core/plans (create in-memory plan)
 *   - GET /api/v2/dental/core/treatments (catalog from cost engine)
 *   - GET /api/v2/dental/core/inventory/check (in-memory stock check)
 *
 * ADAPTER ONLY — zero business logic here.
 * All computation delegated to certified engines.
 *
 * Mounted at /api/v2/dental/core in server.ts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { QuoteOrchestrator }    from '../quote.orchestrator';
import { DentalCostEngine, TREATMENT_CATALOG } from '../dental-cost.engine';
import { SnapshotEngine }       from '../snapshot.engine';
import {
  InventoryEngine,
  createEmptyInventoryState,
} from '../inventory.engine';

// ── Singleton engines (no persistence — certified pure engines) ───────────────
const quoteOrchestrator = new QuoteOrchestrator();
const costEngine        = new DentalCostEngine();
const snapshotEngine    = new SnapshotEngine();
const inventoryEngine   = new InventoryEngine();

// In-memory inventory state (stateless per instance — demo mode)
// Production: replace with database-backed inventory via dentalAdminRouter.
const _inventoryState  = createEmptyInventoryState();

// ── RFC 7807 helper ──────────────────────────────────────────────────────────

function problem(res: Response, status: number, detail: string, correlationId: string) {
  return res.status(status).json({
    type:   `https://api.vytalix.health/errors/${status}`,
    title:  status < 500 ? 'Request Error' : 'Internal Server Error',
    status,
    detail,
    correlationId,
  });
}

// ── Zod validation helper ────────────────────────────────────────────────────

function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  res: Response,
  correlationId: string
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(422).json({
      type:   'https://api.vytalix.health/errors/422',
      title:  'Validation Failed',
      status: 422,
      detail: 'Request body failed schema validation',
      correlationId,
      errors: result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
    return null;
  }
  return result.data;
}

// ── Input schemas ────────────────────────────────────────────────────────────

/**
 * Simplified quote input — separates client-provided data from system config.
 * Does NOT expose targetProfitMargin / pricingRules (mass-assignment remediation).
 */
const CoreQuoteInputSchema = z.object({
  patientRef:       z.string().min(1).max(100),
  doctorRef:        z.string().min(1),
  procedures: z.array(z.object({
    code:     z.string(),
    quantity: z.number().int().min(1).max(32).default(1),
    toothRef: z.string().optional(),
    notes:    z.string().optional(),
  })).min(1).max(30),
  currency:         z.string().length(3).default('USD'),
  financingMonths:  z.number().int().optional(),
  locationCode:     z.string().max(20).optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const dentalCoreRouter = Router();

/**
 * GET /api/v2/dental/core/treatments
 * Returns the static treatment catalog (from DentalCostEngine).
 * Query: category (optional filter)
 */
dentalCoreRouter.get('/treatments', (req: Request, res: Response): void => {
  const category = req.query['category'] as string | undefined;
  const catalog = costEngine.getCatalog(category as any);
  res.json({
    success: true,
    data: catalog.map(t => ({
      code:         t.code,
      name:         t.nameEs,
      category:     t.category,
      sessions:     t.requiresSessions,
      durationMins: t.avgDurationMinutes,
      complexity:   t.complexityFactor,
    })),
    total: catalog.length,
  });
});

/**
 * POST /api/v2/dental/core/quotes
 * Generates a complete treatment quote via QuoteOrchestrator.
 * tenantId is injected from X-Tenant-ID header by dentalTenantContext.
 */
dentalCoreRouter.post('/quotes', async (req: Request, res: Response): Promise<void> => {
  const correlationId = (req as any).correlationId ?? 'unknown';
  const tenantId      = (req as any).tenantId;
  const doctorRef     = (req as any).userId ?? 'system';

  const body = parseBody(CoreQuoteInputSchema, req.body, res, correlationId);
  if (!body) return;

  try {
    const result = quoteOrchestrator.generate({
      tenantId,
      patientRef:      body.patientRef,
      doctorRef:       body.doctorRef ?? doctorRef,
      procedures:      body.procedures,
      currency:        body.currency,
      financingMonths: body.financingMonths,
      locationCode:    body.locationCode,
      // System defaults — NOT client-injectable (mass-assignment protection)
      chairRatePerHour:   80,
      overheadPct:        0.35,
      financialRiskFactor: 1.0,
    });

    res.status(201).json({
      success: true,
      data: {
        planId:           result.plan.planId,
        tenantId:         result.plan.tenantId,
        patientRef:       result.plan.patientRef,
        status:           result.plan.status,
        financialSummary: result.financialSummary,
        inventoryWarnings: result.inventoryWarnings,
        validUntil:       result.validUntil,
        algorithmVersion: result.algorithmVersion,
      },
      correlationId,
    });
  } catch (err: any) {
    problem(res, err.statusCode ?? 500, err.message, correlationId);
  }
});

/**
 * GET /api/v2/dental/core/inventory/check
 * Returns in-memory stock check for the current tenant.
 * Demo mode: returns empty state until inventory items are loaded.
 */
dentalCoreRouter.get('/inventory/check', (req: Request, res: Response): void => {
  const correlationId = (req as any).correlationId ?? 'unknown';
  const tenantId      = (req as any).tenantId;

  try {
    const stockReport = inventoryEngine.checkStock(_inventoryState, tenantId);
    res.json({
      success: true,
      data: {
        items: stockReport,
        lowStockCount:     stockReport.filter(i => i.isLowStock).length,
        outOfStockCount:   stockReport.filter(i => i.isOutOfStock).length,
        totalItems:        stockReport.length,
      },
      correlationId,
    });
  } catch (err: any) {
    problem(res, err.statusCode ?? 500, err.message, correlationId);
  }
});

export default dentalCoreRouter;
