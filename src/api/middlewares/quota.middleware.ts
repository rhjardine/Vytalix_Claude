// =============================================================================
// src/billing/quota.middleware.ts
// Quota enforcement — blocks requests when monthly hard limit exceeded.
// Soft limit (80%): warning header only.
// Hard limit (100%): 429 + Retry-After: next month.
//
// Metering is fire-and-forget; quota check is synchronous and blocking.
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import { getMonthlyUsage, checkQuota }     from '../../platform/metering.service'
import { logger }                          from '../../platform/logger'
import { getRedisClient }                  from '../../platform/redis'

const QUOTA_CACHE_TTL = 60  // re-check quota at most every 60s per tenant

// ── Quota enforcement middleware ──────────────────────────────────

export function enforceQuota() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = (req as any).apiKeyCtx
    if (!ctx) { next(); return }   // no key context → quota check skipped

    // Cache quota status (avoid DB hit on every request)
    const cacheKey = `quota:${ctx.tenantId}:${new Date().toISOString().slice(0, 7)}`
    try {
      const redis  = getRedisClient()
      const cached = await redis.get(cacheKey)
      if (cached) {
        const { allowed, warning, currentUsage, limit } = JSON.parse(cached)
        if (!allowed) {
          res.status(429).json(quotaExceededError(currentUsage, limit, req.correlationId))
          return
        }
        if (warning) res.setHeader('X-Quota-Warning', `Usage at ${Math.round((currentUsage / limit) * 100)}% of monthly limit`)
        next()
        return
      }
    } catch (_) { /* Redis unavailable — fail open */ }

    try {
      const { allowed, currentUsage, limit, warning } = await checkQuota(ctx.tenantId, 'VITALITY_ASSESS')

      // Cache result for 60s
      try {
        const redis = getRedisClient()
        await redis.setex(cacheKey, QUOTA_CACHE_TTL, JSON.stringify({ allowed, warning, currentUsage, limit }))
      } catch (_) {}

      if (!allowed) {
        logger.warn({ tenantId: ctx.tenantId, currentUsage, limit }, 'Quota exceeded')
        res.status(429).json(quotaExceededError(currentUsage, limit, req.correlationId))
        return
      }

      if (warning) {
        const pct = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0
        res.setHeader('X-Quota-Warning', `${pct}% of monthly limit used (${currentUsage}/${limit})`)
        logger.info({ tenantId: ctx.tenantId, pct }, 'Quota soft limit warning')
      }
    } catch (err) {
      logger.warn({ err }, 'Quota check failed — failing open')
    }

    next()
  }
}

function quotaExceededError(currentUsage: number, limit: number, correlationId: string) {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const secondsUntilReset = Math.floor((nextMonth.getTime() - now.getTime()) / 1000)

  return {
    type:          'https://api.vytalix.health/errors/quota-exceeded',
    title:         'Monthly Quota Exceeded',
    status:        429,
    detail:        `Monthly API quota of ${limit} requests exceeded (${currentUsage} used). Quota resets on ${nextMonth.toISOString().slice(0, 10)}.`,
    correlationId,
    quota: { current: currentUsage, limit, resetsAt: nextMonth.toISOString(), retryAfterSeconds: secondsUntilReset },
  }
}

// ── Revenue share hooks ───────────────────────────────────────────
// Called after successful referral conversion to trigger revenue calculation.

export interface ConversionEvent {
  tenantId:      string
  patientId:     string
  referralType:  string
  convertedValue: number  // USD
  correlationId: string
}

export async function onReferralConverted(event: ConversionEvent): Promise<void> {
  const db = (await import('../../platform/db')).getDb()

  // 1. Update referral_events status to CONVERTED
  await db.rawQuery(
    `UPDATE referral_events
     SET status = 'CONVERTED', "convertedAt" = NOW(), "convertedValue" = $3
     WHERE "tenantId" = $1::uuid AND "patientId" = $2::uuid
       AND status IN ('GENERATED','DELIVERED','CLICKED')
     ORDER BY "generatedAt" DESC LIMIT 1`,
    [event.tenantId, event.patientId, event.convertedValue]
  )

  // 2. Emit conversion event for revenue share calculation
  const { eventBus } = await import('../../platform/event-bus')
  eventBus.emit('referral.converted', {
    tenantId:       event.tenantId,
    patientId:      event.patientId,
    correlationId:  event.correlationId,
    convertedValue: event.convertedValue,
  })

  logger.info({ ...event, event: 'REFERRAL_CONVERTED' }, 'Referral conversion recorded')
}

// ── Usage dashboard data (for admin portal) ───────────────────────

export async function getTenantUsageDashboard(tenantId: string): Promise<{
  currentMonth:  Record<string, number>
  previousMonth: Record<string, number>
  trend:         'UP' | 'DOWN' | 'STABLE'
  topOperation:  string | null
}> {
  const now = new Date()
  const currentMonth  = now.toISOString().slice(0, 7)
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)

  const [current, previous] = await Promise.all([
    getMonthlyUsage(tenantId, currentMonth),
    getMonthlyUsage(tenantId, previousMonth),
  ])

  const currentTotal  = current['TOTAL']  ?? 0
  const previousTotal = previous['TOTAL'] ?? 0
  const trend = currentTotal > previousTotal * 1.1 ? 'UP'
              : currentTotal < previousTotal * 0.9 ? 'DOWN' : 'STABLE'

  // Find top operation
  const ops = Object.entries(current).filter(([k]) => k !== 'TOTAL')
  const topEntry = ops.sort((a, b) => b[1] - a[1])[0]

  return { currentMonth: current, previousMonth: previous, trend, topOperation: topEntry?.[0] ?? null }
}
