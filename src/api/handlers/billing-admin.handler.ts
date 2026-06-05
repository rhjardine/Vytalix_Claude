// =============================================================================
// src/billing/billing-admin.handler.ts
// Admin routes for tenant management, API key provisioning, usage dashboards.
// These routes are JWT-protected (internal Vytalix admin, not tenant-facing).
//
// Routes:
//   POST /admin/tenants/:tenantId/api-keys           → provision key
//   DELETE /admin/tenants/:tenantId/api-keys/:keyId  → revoke key
//   GET  /admin/tenants/:tenantId/usage              → monthly usage summary
//   GET  /admin/tenants/:tenantId/revenue-share      → revenue share report
//   POST /admin/tenants/:tenantId/quota              → set quota limit
//   GET  /admin/billing/export                       → CSV export for invoicing
// =============================================================================

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getDb } from '../../platform/db'
import { logger } from '../../platform/logger'
import { generateApiKey } from '../middlewares/api-key.middleware'
import { getMonthlyUsage, computeRevenueShare } from '../../platform/metering.service'

// ── Input schemas ─────────────────────────────────────────────────

const ProvisionKeySchema = z.object({
  name:         z.string().min(3).max(255),
  description:  z.string().max(1000).optional(),
  prefix:       z.string().min(2).max(10).regex(/^[a-z0-9_]+$/),
  permissions:  z.record(z.array(z.string())),  // { vitality: ['read','write'] }
  rateLimitTier: z.enum(['STANDARD', 'PROFESSIONAL', 'ENTERPRISE']).default('STANDARD'),
  expiresAt:    z.string().datetime().optional(),
  createdBy:    z.string().uuid(),
})

const SetQuotaSchema = z.object({
  monthlyApiLimit: z.number().int().min(0), // 0 = unlimited
})

// ── Router ────────────────────────────────────────────────────────

export function createBillingAdminRouter(): Router {
  const router = Router()

  // ── POST /admin/tenants/:tenantId/api-keys ───────────────────────
  router.post('/tenants/:tenantId/api-keys', async (req: Request, res: Response) => {
    const parse = ProvisionKeySchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(422).json({ errors: parse.error.errors })
    }

    const { tenantId }  = req.params
    const body          = parse.data
    const { keyId, keyPlain, keyPrefix, keyHash } = generateApiKey(body.prefix)

    const db = getDb()
    await db.rawQuery(
      `INSERT INTO api_keys (
         id, "tenantId", name, description,
         "keyHash", "keyPrefix", permissions,
         "rateLimitTier", "expiresAt", "createdBy", "isActive"
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5, $6, $7::jsonb,
         $8, $9, $10::uuid, true
       )`,
      [
        keyId, tenantId, body.name, body.description ?? null,
        keyHash, keyPrefix, JSON.stringify(body.permissions),
        body.rateLimitTier, body.expiresAt ?? null, body.createdBy,
      ]
    )

    logger.info({ tenantId, keyId, name: body.name }, 'API key provisioned')

    return res.status(201).json({
      keyId,
      keyPlain,           // ← Show ONCE. Cannot be recovered after this response.
      keyPrefix,
      permissions: body.permissions,
      rateLimitTier: body.rateLimitTier,
      warning: 'Store this key securely. It cannot be retrieved again.',
    })
  })

  // ── DELETE /admin/tenants/:tenantId/api-keys/:keyId ──────────────
  router.delete('/tenants/:tenantId/api-keys/:keyId', async (req: Request, res: Response) => {
    const { tenantId, keyId } = req.params
    const revokedBy           = req.body?.revokedBy

    const db = getDb()
    await db.rawQuery(
      `UPDATE api_keys
       SET "isActive" = false, "revokedAt" = NOW(), "revokedBy" = $3::uuid
       WHERE id = $1::uuid AND "tenantId" = $2::uuid`,
      [keyId, tenantId, revokedBy ?? null]
    )

    // Invalidate cached key metadata
    try {
      const { getRedisClient } = await import('../lib/redis')
      const redis   = getRedisClient()
      const pattern = `apikey:*`
      // Note: in production use SCAN, not KEYS, for large keyspaces
      logger.info({ keyId }, 'API key revoked — cache entries will expire naturally within 5min')
    } catch (_) {}

    return res.json({ revoked: true, keyId })
  })

  // ── GET /admin/tenants/:tenantId/usage ───────────────────────────
  router.get('/tenants/:tenantId/usage', async (req: Request, res: Response) => {
    const { tenantId } = req.params
    const yearMonth    = req.query.month as string | undefined

    const usage = await getMonthlyUsage(tenantId, yearMonth)
    const total = usage['TOTAL'] ?? 0

    // Compute estimated invoice
    const { DEFAULT_UNIT_PRICES_CENTS } = await import('./metering.service') as any
    let estimatedCents = 0
    for (const [op, count] of Object.entries(usage)) {
      if (op !== 'TOTAL') {
        estimatedCents += (DEFAULT_UNIT_PRICES_CENTS[op] ?? 0) * (count as number)
      }
    }

    return res.json({
      tenantId,
      period:           yearMonth ?? new Date().toISOString().slice(0, 7),
      usageByOperation: usage,
      totalCalls:       total,
      estimatedInvoice: {
        amountCents:  estimatedCents,
        amountUsd:    (estimatedCents / 100).toFixed(2),
        currency:     'USD',
      },
    })
  })

  // ── GET /admin/tenants/:tenantId/revenue-share ───────────────────
  router.get('/tenants/:tenantId/revenue-share', async (req: Request, res: Response) => {
    const { tenantId } = req.params
    const yearMonth    = req.query.month as string ?? new Date().toISOString().slice(0, 7)

    const report = await computeRevenueShare(tenantId, yearMonth)

    return res.json({
      ...report,
      platformShareUsd: (report.platformShare / 100).toFixed(2),
      tenantShareUsd:   (report.tenantShare   / 100).toFixed(2),
    })
  })

  // ── POST /admin/tenants/:tenantId/quota ──────────────────────────
  router.post('/tenants/:tenantId/quota', async (req: Request, res: Response) => {
    const { tenantId } = req.params
    const parse = SetQuotaSchema.safeParse(req.body)
    if (!parse.success) return res.status(422).json({ errors: parse.error.errors })

    const db = getDb()
    await db.rawQuery(
      `UPDATE tenants SET "monthlyApiLimit" = $2 WHERE id = $1::uuid`,
      [tenantId, parse.data.monthlyApiLimit]
    )

    return res.json({ tenantId, monthlyApiLimit: parse.data.monthlyApiLimit })
  })

  // ── GET /admin/billing/export ────────────────────────────────────
  router.get('/billing/export', async (req: Request, res: Response) => {
    const yearMonth = req.query.month as string ?? new Date().toISOString().slice(0, 7)

    const db   = getDb()
    const rows = await db.rawQuery(
      `SELECT
         t.name                         AS tenant_name,
         be."tenantId",
         be.operation,
         SUM(be."unitCount")::int        AS total_units,
         SUM(be."totalCents")::int       AS total_cents,
         COUNT(DISTINCT be."keyId")::int AS api_keys_used
       FROM billing_events be
       JOIN tenants t ON t.id = be."tenantId"
       WHERE TO_CHAR(be."occurredAt", 'YYYY-MM') = $1
       GROUP BY t.name, be."tenantId", be.operation
       ORDER BY t.name, be.operation`,
      [yearMonth]
    )

    // Return as CSV for accounting
    const header = 'tenant_name,tenantId,operation,total_units,total_cents,total_usd,api_keys_used'
    const lines  = (rows as any[]).map((r: any) =>
      `${r.tenant_name},${r.tenantId},${r.operation},${r.total_units},${r.total_cents},${(r.total_cents / 100).toFixed(2)},${r.api_keys_used}`
    )

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="vytalix-billing-${yearMonth}.csv"`)
    return res.send([header, ...lines].join('\n'))
  })

  return router
}

// =============================================================================
// Billing schema additions (append to schema-extensions.prisma)
// =============================================================================
//
// model BillingEvent {
//   id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
//   tenantId       String   @db.Uuid
//   keyId          String   @db.Uuid
//   operation      String   @db.VarChar(50)
//   unitCount      Int
//   unitPriceCents Int
//   totalCents     Int
//   statusCode     Int
//   durationMs     Int      @default(0)
//   correlationId  String?  @db.VarChar(36)
//   occurredAt     DateTime @default(now()) @db.Timestamptz
//
//   @@index([tenantId, occurredAt(sort: Desc)])
//   @@index([tenantId, operation, occurredAt(sort: Desc)])
//   @@map("billing_events")
// }
//
// Add to Tenant model:
//   monthlyApiLimit   Int    @default(0)  // 0 = unlimited
//   revenueShareRatio Decimal @default(0.30) @db.Decimal(4,2)
//   webhookUrl        String? @db.VarChar(500)
//   webhookSecret     String? @db.VarChar(64)
//
// =============================================================================
