// =============================================================================
// src/dental/dental.handler.ts
// CFE Dental API — HTTP handler
//
// Routes:
//   GET  /api/v2/dental/treatments              → treatment catalog
//   GET  /api/v2/dental/treatments/:code        → single treatment detail
//   POST /api/v2/dental/cost-estimate           → internal cost calculation
//   POST /api/v2/dental/price-quote             → patient-facing price + financing
//   POST /api/v2/dental/treatment-snapshot      → immutable treatment plan record
//   GET  /api/v2/dental/snapshots/:snapshotId   → retrieve treatment snapshot
// =============================================================================

import { Router, Request, Response } from 'express'
import { z }                         from 'zod'
import { DentalCostEngine, CostEstimateInput, TREATMENT_CATALOG, TreatmentCode } from '../../dental/dental-cost.engine'
import { DentalPricingService, PriceQuoteSchema } from '../../dental/dental-pricing.service'
import { requireApiKey }             from '../middlewares/api-key.middleware'
import { logger }                    from '../../platform/logger'
import { getDb }                     from '../../platform/db'

const costEngine     = new DentalCostEngine()
const pricingService = new DentalPricingService()

// ── Input schemas ─────────────────────────────────────────────────

const CostEstimateSchema = z.object({
  treatmentCode:    z.string(),
  quantity:         z.number().int().min(1).max(32).default(1),
  locationCode:     z.string().max(20).optional(),
  chairRatePerHour: z.number().min(1).max(1000).default(80),
  overheadPct:      z.number().min(0).max(1).default(0.35),
})

const SnapshotSchema = z.object({
  patientRef:     z.string().max(100),
  treatments:     z.array(z.object({
    code:     z.string(),
    quantity: z.number().int().min(1).default(1),
    notes:    z.string().max(500).optional(),
  })).min(1),
  priceQuoteId:   z.string(),
  totalUsd:       z.number().positive(),
  currency:       z.string().length(3).default('USD'),
  approvedBy:     z.string().uuid().optional(),
  consentGiven:   z.boolean(),
  locationCode:   z.string().optional(),
})

function validate<T>(schema: z.ZodSchema<T>, data: unknown, res: Response, cid: string): T | null {
  const r = schema.safeParse(data)
  if (!r.success) {
    res.status(422).json({
      type: 'https://api.vytalix.health/errors/validation-failed',
      title: 'Validation Failed', status: 422, detail: 'Request body failed validation',
      errors: r.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      correlationId: cid,
    })
    return null
  }
  return r.data
}

// ── Router ────────────────────────────────────────────────────────

export function createDentalRouter(): Router {
  const router = Router()

  // ── GET /dental/treatments ──────────────────────────────────────
  router.get('/treatments', requireApiKey('dental:read'), (req: Request, res: Response) => {
    const category = req.query.category as string | undefined
    const catalog  = costEngine.getCatalog(category as any)
    return res.json({
      treatments: catalog.map(t => ({
        code:         t.code,
        name:         t.nameEs,
        category:     t.category,
        sessions:     t.requiresSessions,
        durationMins: t.avgDurationMinutes,
        complexity:   t.complexityFactor,
      })),
      total: catalog.length,
    })
  })

  // ── GET /dental/treatments/:code ─────────────────────────────────
  router.get('/treatments/:code', requireApiKey('dental:read'), (req: Request, res: Response) => {
    const treatment = TREATMENT_CATALOG[req.params.code as TreatmentCode]
    if (!treatment) return res.status(404).json({ error: `Treatment '${req.params.code}' not found` })
    return res.json(treatment)
  })

  // ── POST /dental/cost-estimate ───────────────────────────────────
  router.post('/cost-estimate', requireApiKey('dental:write'), (req: Request, res: Response) => {
    const cid  = req.correlationId
    const body = validate(CostEstimateSchema, req.body, res, cid)
    if (!body) return

    try {
      const result = costEngine.compute(body as CostEstimateInput)
      return res.json({ ...result, correlationId: cid })
    } catch (err: any) {
      return res.status(err.statusCode ?? 422).json({
        type: 'https://api.vytalix.health/errors/cost-engine-error',
        title: 'Cost Engine Error', status: err.statusCode ?? 422,
        detail: err.message, correlationId: cid,
      })
    }
  })

  // ── POST /dental/price-quote ─────────────────────────────────────
  router.post('/price-quote', requireApiKey('dental:write'), async (req: Request, res: Response) => {
    const cid      = req.correlationId
    const tenantId = (req as any).apiKeyCtx!.tenantId
    const body     = validate(PriceQuoteSchema, { ...req.body, tenantId }, res, cid)
    if (!body) return

    try {
      const quote = await pricingService.generateQuote(body)
      return res.json({ ...quote, correlationId: cid })
    } catch (err: any) {
      logger.error({ err, cid }, 'Price quote failed')
      return res.status(500).json({ type: 'https://api.vytalix.health/errors/pricing-error', title: 'Pricing Error', status: 500, detail: err.message, correlationId: cid })
    }
  })

  // ── POST /dental/treatment-snapshot ─────────────────────────────
  // NOTE: This legacy handler is unmounted in server.ts. createTreatmentSnapshot
  // was never exported from dental-pricing.service. Stubbed as 501 to unblock
  // TypeScript compilation. Route is superseded by /api/v2/dental/core/quotes.
  router.post('/treatment-snapshot', requireApiKey('dental:write'), (req: Request, res: Response) => {
    const cid = req.correlationId
    return res.status(501).json({
      type: 'https://api.vytalix.health/errors/501',
      title: 'Not Implemented',
      status: 501,
      detail: 'Use POST /api/v2/dental/core/quotes instead',
      correlationId: cid,
    })
  })

  // ── GET /dental/snapshots/:id ────────────────────────────────────
  router.get('/snapshots/:snapshotId', requireApiKey('dental:read'), async (req: Request, res: Response) => {
    const cid      = req.correlationId
    const tenantId = (req as any).apiKeyCtx!.tenantId
    const db       = getDb()

    const row = await db.rawQueryOne(
      `SELECT * FROM dental_treatment_snapshots WHERE id=$1::uuid AND "tenantId"=$2::uuid`,
      [req.params.snapshotId, tenantId]
    )
    if (!row) return res.status(404).json({ type: 'https://api.vytalix.health/errors/not-found', title: 'Not Found', status: 404, detail: 'Snapshot not found', correlationId: cid })
    return res.json({ ...row, correlationId: cid })
  })

  return router
}

// =============================================================================
// Dental schema extensions — append to prisma/schema.prisma
// =============================================================================
//
// model DentalTreatmentSnapshot {
//   id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
//   tenantId         String   @db.Uuid
//   patientRef       String   @db.VarChar(100)
//   status           DentalSnapshotStatus @default(PENDING)
//   treatments       Json     @db.JsonB
//   priceQuoteId     String   @db.VarChar(50)
//   totalUsd         Decimal  @db.Decimal(10, 2)
//   currency         String   @db.VarChar(3)
//   approvedBy       String?  @db.Uuid
//   consentGiven     Boolean
//   algorithmVersion String   @db.VarChar(50)
//   completedAt      DateTime? @db.Timestamptz
//   cancelledAt      DateTime? @db.Timestamptz
//   createdAt        DateTime @default(now()) @db.Timestamptz
//
//   @@index([tenantId, patientRef])
//   @@index([tenantId, status])
//   @@map("dental_treatment_snapshots")
// }
//
// enum DentalSnapshotStatus {
//   PENDING
//   APPROVED
//   IN_PROGRESS
//   COMPLETED
//   CANCELLED
// }
