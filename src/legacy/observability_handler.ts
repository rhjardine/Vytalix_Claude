// =============================================================================
// Observability Handlers — GET /health and GET /metrics
//
// /health — used by Docker HEALTHCHECK, load balancers, and demo:check
// /metrics — basic operational metrics for demo observability
// Uses pg direct (getDb()) — no Prisma binary required.
// =============================================================================

import { Request, Response } from 'express'
import { logger } from '../platform/logger'
import { getDb } from '../platform/db'

// In-memory metrics (resets on restart — acceptable for MVP)
export const metrics = {
  requestCount:   0,
  errorCount:     0,
  latencyBuckets: [] as number[],
  startTime:      Date.now(),

  record(latencyMs: number, isError: boolean) {
    this.requestCount++
    if (isError) this.errorCount++
    this.latencyBuckets.push(latencyMs)
    if (this.latencyBuckets.length > 100) this.latencyBuckets.shift()
  },

  p50(): number {
    if (this.latencyBuckets.length === 0) return 0
    const sorted = [...this.latencyBuckets].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.5)]
  },

  p95(): number {
    if (this.latencyBuckets.length === 0) return 0
    const sorted = [...this.latencyBuckets].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.95)]
  },
}

// ─────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────

export async function healthHandler(_req: Request, res: Response) {
  const checks: Record<string, { status: string; latencyMs?: number }> = {}

  // DB check
  try {
    const dbStart = Date.now()
    await getDb().rawQuery('SELECT 1')
    checks.db = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch {
    checks.db = { status: 'error' }
  }

  // Redis check (optional — graceful degradation if not available)
  try {
    const Redis = require('ioredis')
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      const client = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 })
      const redisStart = Date.now()
      await client.connect()
      await client.ping()
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart }
      await client.quit()
    } else {
      checks.redis = { status: 'not_configured' }
    }
  } catch {
    checks.redis = { status: 'degraded' }
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'not_configured')
  const status = allOk ? 200 : 503

  const body = {
    status:    allOk ? 'ok' : 'degraded',
    version:   process.env.npm_package_version ?? '0.9.0-demo',
    env:       process.env.NODE_ENV ?? 'development',
    uptime:    Math.floor((Date.now() - metrics.startTime) / 1000),
    checks,
    timestamp: new Date().toISOString(),
  }

  if (status !== 200) {
    logger.warn({ checks }, 'Health check degraded')
  }

  res.status(status).json(body)
}

// ─────────────────────────────────────────────────────────────────
// GET /metrics
// ─────────────────────────────────────────────────────────────────

export async function metricsHandler(_req: Request, res: Response) {
  let dbCounts = { patients: 0, observations: 0, decisions: 0 }
  try {
    const db = getDb()
    const [r1, r2, r3] = await Promise.all([
      db.rawQuery('SELECT COUNT(*)::int AS n FROM patients'),
      db.rawQuery('SELECT COUNT(*)::int AS n FROM clinical_observations'),
      db.rawQuery('SELECT COUNT(*)::int AS n FROM recommendations'),
    ])
    dbCounts = {
      patients:     Number(r1.rows[0]?.n ?? 0),
      observations: Number(r2.rows[0]?.n ?? 0),
      decisions:    Number(r3.rows[0]?.n ?? 0),
    }
  } catch {
    // Return partial metrics if DB is unavailable
  }

  res.json({
    uptime_seconds: Math.floor((Date.now() - metrics.startTime) / 1000),
    requests_total: metrics.requestCount,
    errors_total:   metrics.errorCount,
    error_rate:     metrics.requestCount > 0
      ? (metrics.errorCount / metrics.requestCount * 100).toFixed(2) + '%'
      : '0%',
    latency_p50_ms: metrics.p50(),
    latency_p95_ms: metrics.p95(),
    db:             dbCounts,
    timestamp:      new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────
// Metrics middleware (attach to app.use)
// ─────────────────────────────────────────────────────────────────

export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now()
  res.on('finish', () => {
    metrics.record(Date.now() - start, res.statusCode >= 500)
  })
  next()
}
