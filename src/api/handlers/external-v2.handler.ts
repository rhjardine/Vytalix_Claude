// =============================================================================
// ExternalV2Handler — /api/v2/* endpoints
// Designed for Disglobal + other external integrations (API Key auth).
//
// Routes:
//   POST /api/v2/vitality/assess         → BioAge assessment
//   GET  /api/v2/vitality/:subjectRef    → Latest result
//   POST /api/v2/preventive/score        → Composite preventive score
//   GET  /api/v2/referral/:subjectRef    → Referral CTA evaluation
//   POST /api/v2/engagement/events       → Record engagement events
//   GET  /api/v2/insights/cohort         → Anonymized population metrics
//
// Auth: X-API-Key header → resolved to tenantId + permissions
// Idempotency: X-Idempotency-Key (24h Redis TTL)
// Rate limiting: per API key, tier-based (enforced upstream in gateway)
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { BiologicalAgeService, BiophysicsAssessRequestSchema } from '../../longevity/biological-age.service'
import { PreventiveScoreService } from '../../longevity/preventive-score.service'
import { ReferralEngine } from '../../core/referral.engine'
import { EngagementService } from '../../shared/engagement.service'
import { withTenant, getDb } from '../../platform/db'
import { logger } from '../../platform/logger'
import { getRedisClient } from '../../platform/redis'
import { requireApiKey } from '../middlewares/api-key.middleware'

// ─────────────────────────────────────────────────────────────────
// Auth middleware — API Key resolution
// ─────────────────────────────────────────────────────────────────

interface ApiKeyContext {
  tenantId: string
  keyId: string
  permissions: Record<string, string[]>
  rateLimitTier: string
}

declare global {
  namespace Express {
    interface Request {
      apiKeyCtx?: ApiKeyContext
      correlationId: string
    }
  }
}

// NOTE: apiKeyAuth is now the canonical requireApiKey from api-key.middleware
// It provides: brute-force protection, Redis cache, full audit trail, scope enforcement
const apiKeyAuth = (scope: string) => requireApiKey(scope)

// ─────────────────────────────────────────────────────────────────
// Idempotency middleware
// ─────────────────────────────────────────────────────────────────

function idempotencyCheck(req: Request, res: Response, next: NextFunction) {
  const idempKey = req.headers['x-idempotency-key'] as string | undefined
  if (!idempKey || !req.apiKeyCtx) return next()

  const cacheKey = `idempotency:${req.apiKeyCtx.tenantId}:${idempKey}`

  const redis = getRedisClient()
  redis.get(cacheKey).then(cached => {
    if (cached) {
      const parsed = JSON.parse(cached)
      res.setHeader('X-Idempotent-Replayed', 'true')
      return res.status(parsed._status ?? 200).json(parsed._body)
    }

    // Intercept response to cache it
    const originalJson = res.json.bind(res)
    res.json = function (body: unknown) {
      if (res.statusCode < 400) {
        redis.setex(cacheKey, 86400, JSON.stringify({ _status: res.statusCode, _body: body }))
          .catch(() => {})
      }
      return originalJson(body)
    }
    next()
  }).catch(() => next())
}

// ─────────────────────────────────────────────────────────────────
// Correlation ID injection
// ─────────────────────────────────────────────────────────────────

function correlationIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID()
  next()
}

// ─────────────────────────────────────────────────────────────────
// Zod validation helper
// ─────────────────────────────────────────────────────────────────

function validate<T>(schema: z.ZodSchema<T>, data: unknown, res: Response, correlationId: string): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    res.status(422).json({
      ...problemDetail(422, 'Validation failed', correlationId),
      errors: result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message, code: e.code })),
    })
    return null
  }
  return result.data
}

// ─────────────────────────────────────────────────────────────────
// RFC 7807 problem detail helper
// ─────────────────────────────────────────────────────────────────

function problemDetail(status: number, detail: string, correlationId: string) {
  return {
    type: `https://api.vytalix.health/errors/${status}`,
    title: HTTP_TITLES[status] ?? 'Error',
    status,
    detail,
    correlationId,
  }
}

const HTTP_TITLES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 422: 'Validation Failed', 429: 'Too Many Requests', 500: 'Internal Server Error',
}

// ─────────────────────────────────────────────────────────────────
// Request schemas
// ─────────────────────────────────────────────────────────────────

// External request uses subjectRef (pseudonymous) — maps to patientId internally
const ExternalVitalitySchema = BiophysicsAssessRequestSchema.extend({
  patientId: z.string().uuid().optional(),
  subjectRef: z.string().min(1).max(64).optional(),
}).refine(d => d.patientId || d.subjectRef, {
  message: 'Either patientId or subjectRef is required',
})

const EngagementEventsSchema = z.object({
  subjectRef: z.string().min(1).max(64).optional(),
  patientId: z.string().uuid().optional(),
  events: z.array(z.object({
    type: z.string(),
    payload: z.record(z.unknown()).default({}),
    occurredAt: z.string().datetime().optional(),
  })).min(1).max(50),
  source: z.string().default('api'),
})

// ─────────────────────────────────────────────────────────────────
// Services (lazy-instantiated singletons)
// ─────────────────────────────────────────────────────────────────

const bioAgeSvc     = new BiologicalAgeService()
const preventiveSvc = new PreventiveScoreService()
const referralEng   = new ReferralEngine()
const engagementSvc = new EngagementService()

// ─────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────

export function createExternalV2Router(): Router {
  const router = Router()
  router.use(correlationIdMiddleware)

  // ── POST /api/v2/vitality/assess ─────────────────────────────────

  router.post(
    '/vitality/assess',
    apiKeyAuth('vitality:write'),
    idempotencyCheck,
    async (req: Request, res: Response) => {
      const log = logger.child({ fn: 'POST /v2/vitality/assess', correlationId: req.correlationId })
      const { tenantId } = req.apiKeyCtx!

      const body = validate(ExternalVitalitySchema, req.body, res, req.correlationId)
      if (!body) return

      try {
        // Resolve subjectRef → patientId if needed
        const patientId = body.patientId ?? await resolveSubjectRef(tenantId, body.subjectRef!)

        const result = await bioAgeSvc.assessBiophysics(tenantId, { ...body, patientId }, req.correlationId)

        // Async: compute preventive score + check referral
        computePreventiveAndReferralAsync(tenantId, patientId, result.differentialAge, req.correlationId)
          .catch(err => log.warn({ err }, 'Async post-assessment pipeline failed'))

        res.setHeader('X-Correlation-ID', req.correlationId)
        return res.status(200).json(result)
      } catch (err: any) {
        log.error({ err }, 'Vitality assessment failed')
        const status = err.statusCode ?? 500
        return res.status(status).json(problemDetail(status, err.message, req.correlationId))
      }
    }
  )

  // ── GET /api/v2/vitality/:subjectRef ─────────────────────────────

  router.get(
    '/vitality/:subjectRef',
    apiKeyAuth('vitality:read'),
    async (req: Request, res: Response) => {
      const { tenantId } = req.apiKeyCtx!
      try {
        const patientId = await resolveSubjectRef(tenantId, req.params.subjectRef)
        const result = await bioAgeSvc.getLatest(tenantId, patientId)
        if (!result) return res.status(404).json(problemDetail(404, 'No assessment found', req.correlationId))
        return res.json(result)
      } catch (err: any) {
        return res.status(err.statusCode ?? 500).json(problemDetail(err.statusCode ?? 500, err.message, req.correlationId))
      }
    }
  )

  // ── POST /api/v2/preventive/score ────────────────────────────────

  router.post(
    '/preventive/score',
    apiKeyAuth('preventive:write'),
    idempotencyCheck,
    async (req: Request, res: Response) => {
      const { tenantId } = req.apiKeyCtx!
      const { subjectRef, patientId: pid } = req.body as { subjectRef?: string; patientId?: string }

      try {
        const patientId = pid ?? await resolveSubjectRef(tenantId, subjectRef!)
        const result = await preventiveSvc.computeForPatient(tenantId, patientId, req.correlationId)
        if (!result) {
          return res.status(202).json({ message: 'Insufficient data for score', patientId })
        }
        return res.json(result)
      } catch (err: any) {
        return res.status(err.statusCode ?? 500).json(problemDetail(err.statusCode ?? 500, err.message, req.correlationId))
      }
    }
  )

  // ── GET /api/v2/referral/:subjectRef ─────────────────────────────

  router.get(
    '/referral/:subjectRef',
    apiKeyAuth('referral:read'),
    async (req: Request, res: Response) => {
      const { tenantId } = req.apiKeyCtx!
      try {
        const patientId = await resolveSubjectRef(tenantId, req.params.subjectRef)

        // Load context for referral evaluation
        const [bioAge, riskScore, engagement] = await Promise.all([
          withTenant(tenantId, tc => tc.queryOne(
            `SELECT "differentialAge"::float FROM biological_age_assessments
             WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "assessmentType"='BIOPHYSICS'
             ORDER BY "assessedAt" DESC LIMIT 1`, [tenantId, patientId]
          )),
          withTenant(tenantId, tc => tc.queryOne(
            `SELECT "riskCategory" FROM risk_scores
             WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
             ORDER BY "computedAt" DESC LIMIT 1`, [tenantId, patientId]
          )),
          withTenant(tenantId, tc => tc.queryOne(
            `SELECT tier FROM engagement_scores WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
            [tenantId, patientId]
          )),
        ])

        const cta = await referralEng.evaluate({
          tenantId,
          patientId,
          correlationId: req.correlationId,
          differentialAge: bioAge?.differentialAge,
          cvRiskCategory: riskScore?.riskCategory,
          engagementTier: engagement?.tier,
        })

        return res.json({ eligible: !!cta, ...(cta ?? {}) })
      } catch (err: any) {
        return res.status(err.statusCode ?? 500).json(problemDetail(err.statusCode ?? 500, err.message, req.correlationId))
      }
    }
  )

  // ── POST /api/v2/engagement/events ───────────────────────────────

  router.post(
    '/engagement/events',
    apiKeyAuth('engagement:write'),
    async (req: Request, res: Response) => {
      const { tenantId } = req.apiKeyCtx!
      const body = validate(EngagementEventsSchema, req.body, res, req.correlationId)
      if (!body) return

      try {
        const patientId = body.patientId ?? await resolveSubjectRef(tenantId, body.subjectRef!)
        await engagementSvc.recordEvents(tenantId, patientId, body.events, body.source)
        return res.status(202).json({ accepted: body.events.length, patientId })
      } catch (err: any) {
        return res.status(err.statusCode ?? 500).json(problemDetail(err.statusCode ?? 500, err.message, req.correlationId))
      }
    }
  )

  // ── GET /api/v2/insights/cohort ───────────────────────────────────

  router.get(
    '/insights/cohort',
    apiKeyAuth('insights:read'),
    async (req: Request, res: Response) => {
      const { tenantId } = req.apiKeyCtx!
      const { ageGroup, biologicalSex, period } = req.query as Record<string, string>

      try {
        const insights = await getCohortInsights(tenantId, { ageGroup, biologicalSex, period })
        return res.json(insights)
      } catch (err: any) {
        return res.status(500).json(problemDetail(500, err.message, req.correlationId))
      }
    }
  )

  return router
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function resolveSubjectRef(tenantId: string, subjectRef: string): Promise<string> {
  // subjectRef maps to patient's external ID (stored in externalIds JSONB or as mrn)
  const patient = await withTenant(tenantId, tc =>
    tc.queryOne(
      `SELECT id FROM patients
       WHERE "tenantId"=$1::uuid AND (mrn=$2 OR "externalIds"->>'disglobal_ref'=$2)
       LIMIT 1`,
      [tenantId, subjectRef]
    )
  )
  if (!patient) {
    throw Object.assign(new Error(`Subject '${subjectRef}' not found`), { statusCode: 404 })
  }
  return patient.id
}

async function computePreventiveAndReferralAsync(
  tenantId: string,
  patientId: string,
  differentialAge: number,
  correlationId: string
) {
  const [preventiveResult] = await Promise.allSettled([
    preventiveSvc.computeForPatient(tenantId, patientId, correlationId),
  ])

  const cvRiskCategory = await withTenant(tenantId, tc =>
    tc.queryOne(
      `SELECT "riskCategory" FROM risk_scores WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
       ORDER BY "computedAt" DESC LIMIT 1`, [tenantId, patientId]
    )
  ).then(r => r?.riskCategory).catch(() => undefined)

  await referralEng.evaluate({
    tenantId, patientId, correlationId,
    differentialAge,
    cvRiskCategory,
    compositeScore: preventiveResult.status === 'fulfilled'
      ? preventiveResult.value?.compositeScore
      : undefined,
  })
}

async function getCohortInsights(tenantId: string, filters: { ageGroup?: string; biologicalSex?: string; period?: string }) {
  const [ageMin, ageMax] = (filters.ageGroup ?? '').split('-').map(Number)
  const validAgeRange = !isNaN(ageMin) && !isNaN(ageMax)

  const rows = await withTenant(tenantId, tc =>
    tc.queryMany(
      `SELECT
         COUNT(*) AS "cohortSize",
         ROUND(AVG("biologicalAge")::numeric, 1)::float AS "avgBiologicalAge",
         ROUND(AVG("differentialAge")::numeric, 1)::float AS "avgDifferential",
         ROUND(100.0 * SUM(CASE WHEN "ageStatus"='REJUVENECIDO' THEN 1 ELSE 0 END) / COUNT(*), 0)::int AS "pctRejuvenecido",
         ROUND(100.0 * SUM(CASE WHEN "ageStatus"='ENVEJECIDO' THEN 1 ELSE 0 END) / COUNT(*), 0)::int AS "pctEnvejecido"
       FROM biological_age_assessments baa
       JOIN patients p ON p.id = baa."patientId"
       WHERE baa."tenantId"=$1::uuid
         AND baa."assessmentType"='BIOPHYSICS'
         AND ($2::boolean OR p."biologicalSex"=$3)
         AND ($4::boolean OR (baa."chronologicalAge" BETWEEN $5 AND $6))`,
      [
        tenantId,
        !filters.biologicalSex, filters.biologicalSex ?? 'MALE',
        !validAgeRange, ageMin ?? 0, ageMax ?? 999,
      ]
    )
  )

  const cohort = rows[0]
  if (!cohort || Number(cohort.cohortSize) < 50) {
    return { cohortTooSmall: true, minimumRequired: 50, note: 'Privacy threshold not met' }
  }

  return {
    cohortSize: Number(cohort.cohortSize),
    metrics: {
      avgBiologicalAge: cohort.avgBiologicalAge,
      avgDifferential: cohort.avgDifferential,
      pctRejuvenecido: cohort.pctRejuvenecido,
      pctEnvejecido: cohort.pctEnvejecido,
    },
    filters,
    note: 'Anonymized cohort data. Minimum cohort size: 50.',
    generatedAt: new Date().toISOString(),
  }
}
