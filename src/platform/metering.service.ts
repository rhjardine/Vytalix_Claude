// =============================================================================
// src/billing/metering.service.ts
// Per-call usage tracking for usage-based billing.
//
// Architecture:
//   - Every API call writes a metering event to Redis stream (non-blocking)
//   - Background job flushes stream → billing_events table every 60s
//   - Soft quota: warning at 80% → email alert to tenant
//   - Hard quota: block at 100% of monthly limit (if plan has hard limits)
//   - Revenue share: converted referrals tracked with monetaryValue
//
// Metering is ALWAYS non-blocking — a metering failure NEVER blocks a request.
// =============================================================================

import { getDb } from './db'
import { logger } from './logger'
import { getRedisClient } from './redis'

// ── Types ─────────────────────────────────────────────────────────

export type MeterableOperation =
  | 'VITALITY_ASSESS'       // POST /api/v2/vitality/assess
  | 'PREVENTIVE_SCORE'      // POST /api/v2/preventive/score
  | 'REFERRAL_EVALUATE'     // GET  /api/v2/referral/:subjectRef
  | 'ENGAGEMENT_EVENTS'     // POST /api/v2/engagement/events
  | 'INSIGHTS_COHORT'       // GET  /api/v2/insights/cohort
  | 'VITALITY_READ'         // GET  /api/v2/vitality/:subjectRef
  | 'EXTERNAL_OBSERVATION'  // POST /api/external/observations (v1)

// Per-operation unit prices (USD cents) — configurable per tenant override
const DEFAULT_UNIT_PRICES_CENTS: Record<MeterableOperation, number> = {
  VITALITY_ASSESS:       15,    // $0.15 — highest value, full computation
  PREVENTIVE_SCORE:      10,    // $0.10 — composite score
  REFERRAL_EVALUATE:      5,    // $0.05 — lightweight evaluation
  ENGAGEMENT_EVENTS:      1,    // $0.01 — high-volume, low cost
  INSIGHTS_COHORT:        8,    // $0.08 — aggregate query
  VITALITY_READ:          2,    // $0.02 — cache read
  EXTERNAL_OBSERVATION:   3,    // $0.03 — ingest call
}

export interface MeterEvent {
  tenantId:    string
  keyId:       string
  operation:   MeterableOperation
  unitCount:   number           // Usually 1, but ENGAGEMENT_EVENTS = number of events
  statusCode:  number           // Only successful calls (2xx) are billable
  durationMs?: number
  correlationId?: string
}

// ── Redis stream key ──────────────────────────────────────────────

const METER_STREAM_KEY = 'meter:events:stream'
const USAGE_KEY_PREFIX = 'meter:usage'

// ── Core: record a metering event (fire-and-forget) ───────────────

/**
 * Records a metering event. Always non-blocking — caller never awaits this.
 * Only billable if statusCode is 2xx.
 *
 * Usage (in handler, after response):
 *   meterEvent({ tenantId, keyId, operation: 'VITALITY_ASSESS', unitCount: 1, statusCode: 200 })
 */
export function meterEvent(event: MeterEvent): void {
  // Only bill successful calls
  if (event.statusCode < 200 || event.statusCode >= 300) return

  _doMeter(event).catch(err =>
    logger.warn({ err, operation: event.operation }, 'Metering write failed (non-fatal)')
  )
}

async function _doMeter(event: MeterEvent): Promise<void> {
  const redis      = getRedisClient()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const monthKey   = `${USAGE_KEY_PREFIX}:${event.tenantId}:${new Date().toISOString().slice(0, 7)}`

  // 1. Increment monthly usage counter (TTL 35 days)
  await redis.multi()
    .hincrby(monthKey, event.operation, event.unitCount)
    .hincrby(monthKey, 'TOTAL', event.unitCount)
    .expire(monthKey, 35 * 24 * 3600)
    .exec()

  // 2. Push to stream for async DB flush
  await redis.xadd(METER_STREAM_KEY, '*',
    'tenantId',      event.tenantId,
    'keyId',         event.keyId,
    'operation',     event.operation,
    'unitCount',     String(event.unitCount),
    'statusCode',    String(event.statusCode),
    'durationMs',    String(event.durationMs ?? 0),
    'correlationId', event.correlationId ?? '',
    'ts',            String(nowSeconds)
  )
}

// ── Monthly usage summary ─────────────────────────────────────────

export async function getMonthlyUsage(
  tenantId: string,
  yearMonth?: string  // "2024-11" — defaults to current month
): Promise<Record<string, number>> {
  const month    = yearMonth ?? new Date().toISOString().slice(0, 7)
  const monthKey = `${USAGE_KEY_PREFIX}:${tenantId}:${month}`

  try {
    const redis  = getRedisClient()
    const counts = await redis.hgetall(monthKey)
    if (counts) {
      return Object.fromEntries(
        Object.entries(counts).map(([k, v]) => [k, parseInt(v, 10)])
      )
    }
  } catch (_) {}

  // Fall back to DB if Redis unavailable
  return getMonthlyUsageFromDb(tenantId, month)
}

async function getMonthlyUsageFromDb(
  tenantId: string,
  yearMonth: string
): Promise<Record<string, number>> {
  const db  = getDb()
  const rows = await db.rawQuery(
    `SELECT operation, SUM("unitCount")::int AS total
     FROM billing_events
     WHERE "tenantId" = $1::uuid
       AND TO_CHAR("occurredAt", 'YYYY-MM') = $2
     GROUP BY operation`,
    [tenantId, yearMonth]
  )
  return Object.fromEntries((rows as any[]).map((r: any) => [r.operation, r.total]))
}

// ── Quota enforcement ─────────────────────────────────────────────

export interface QuotaConfig {
  monthlyLimit: number      // Hard limit (0 = unlimited)
  softLimitPct: number      // 0.8 = warn at 80%
}

export async function checkQuota(
  tenantId: string,
  operation: MeterableOperation
): Promise<{ allowed: boolean; currentUsage: number; limit: number; warning: boolean }> {
  const config = await getTenantQuotaConfig(tenantId)

  if (config.monthlyLimit === 0) {
    return { allowed: true, currentUsage: 0, limit: 0, warning: false }
  }

  const usage    = await getMonthlyUsage(tenantId)
  const current  = usage['TOTAL'] ?? 0
  const warning  = current >= config.monthlyLimit * config.softLimitPct
  const allowed  = current < config.monthlyLimit

  return { allowed, currentUsage: current, limit: config.monthlyLimit, warning }
}

async function getTenantQuotaConfig(tenantId: string): Promise<QuotaConfig> {
  try {
    const db  = getDb()
    const row = await db.rawQueryOne<{ monthlyApiLimit: number }>(
      `SELECT "monthlyApiLimit" FROM tenants WHERE id = $1::uuid`,
      [tenantId]
    )
    return {
      monthlyLimit: row?.monthlyApiLimit ?? 0,  // 0 = unlimited (Enterprise)
      softLimitPct: 0.8,
    }
  } catch (_) {
    return { monthlyLimit: 0, softLimitPct: 0.8 }
  }
}

// ── Revenue share calculation ─────────────────────────────────────

export interface RevenueShareSummary {
  tenantId:            string
  period:              string
  totalConversions:    number
  totalConvertedValue: number    // USD cents
  platformShare:       number    // Vytalix share (cents)
  tenantShare:         number    // Tenant/partner share (cents)
  shareRatio:          number    // e.g. 0.3 = Vytalix gets 30%
}

/**
 * Computes revenue share for a tenant for a given month.
 * Default ratio: Vytalix 30% / Tenant 70% (configurable per tenant).
 */
export async function computeRevenueShare(
  tenantId: string,
  yearMonth: string
): Promise<RevenueShareSummary> {
  const db = getDb()

  const [conversions, tenantConfig] = await Promise.all([
    db.rawQuery(
      `SELECT COUNT(*)::int AS conversions,
              COALESCE(SUM("convertedValue")::float, 0) AS total_value
       FROM referral_events
       WHERE "tenantId" = $1::uuid
         AND "status" = 'CONVERTED'
         AND TO_CHAR("convertedAt", 'YYYY-MM') = $2`,
      [tenantId, yearMonth]
    ),
    db.rawQueryOne<{ revenueShareRatio: number }>(
      `SELECT "revenueShareRatio" FROM tenants WHERE id = $1::uuid`,
      [tenantId]
    ),
  ])

  const conv          = (conversions as any[])[0]
  const shareRatio    = tenantConfig?.revenueShareRatio ?? 0.30  // Vytalix gets 30%
  const totalValueCents = Math.round((conv?.total_value ?? 0) * 100)
  const platformShare   = Math.round(totalValueCents * shareRatio)
  const tenantShare     = totalValueCents - platformShare

  return {
    tenantId,
    period:              yearMonth,
    totalConversions:    conv?.conversions ?? 0,
    totalConvertedValue: totalValueCents,
    platformShare,
    tenantShare,
    shareRatio,
  }
}

// ── Background stream flusher (run as cron every 60s) ────────────

/**
 * Reads from the Redis stream and writes billing_events to DB.
 * Call this from a setInterval in server startup.
 */
export async function flushMeterStream(): Promise<number> {
  let flushed = 0
  try {
    const redis   = getRedisClient()
    const entries = await redis.xread('COUNT', 100, 'STREAMS', METER_STREAM_KEY, '0-0')
    if (!entries || entries.length === 0) return 0

    const db  = getDb()
    for (const [, messages] of entries as any[]) {
      for (const [id, fields] of messages) {
        const map = Object.fromEntries(
          (fields as string[]).reduce((acc: string[][], curr, i) =>
            i % 2 === 0 ? [...acc, [curr]] : [...acc.slice(0, -1), [...acc[acc.length - 1], curr]],
            []
          )
        )

        const unitPriceCents = DEFAULT_UNIT_PRICES_CENTS[map.operation as MeterableOperation] ?? 0
        const totalCents     = parseInt(map.unitCount, 10) * unitPriceCents

        await db.rawQuery(
          `INSERT INTO billing_events (
             id, "tenantId", "keyId", operation,
             "unitCount", "unitPriceCents", "totalCents",
             "statusCode", "durationMs", "correlationId", "occurredAt"
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::uuid, $3,
             $4, $5, $6, $7, $8, $9,
             TO_TIMESTAMP($10::bigint)
           ) ON CONFLICT DO NOTHING`,
          [
            map.tenantId, map.keyId, map.operation,
            parseInt(map.unitCount, 10), unitPriceCents, totalCents,
            parseInt(map.statusCode, 10), parseInt(map.durationMs, 10),
            map.correlationId || null, map.ts,
          ]
        )

        await redis.xdel(METER_STREAM_KEY, id)
        flushed++
      }
    }
  } catch (err) {
    logger.error({ err }, 'Meter stream flush failed')
  }
  return flushed
}

// ── Metering Express middleware (post-response) ───────────────────

import type { Response as ExpressResponse } from 'express'

/**
 * Attaches a finish listener to automatically meter every response.
 * Must come AFTER requireApiKey middleware (needs apiKeyCtx).
 */
export function autoMeter(operation: MeterableOperation, getUnitCount?: (req: Request) => number) {
  return (req: Request, res: ExpressResponse, next: NextFunction): void => {
    res.on('finish', () => {
      if (!req.apiKeyCtx) return
      meterEvent({
        tenantId:      req.apiKeyCtx.tenantId,
        keyId:         req.apiKeyCtx.keyId,
        operation,
        unitCount:     getUnitCount ? getUnitCount(req) : 1,
        statusCode:    res.statusCode,
        correlationId: req.correlationId,
      })
    })
    next()
  }
}

import type { Request, NextFunction } from 'express'
