// =============================================================================
// observability.handler.ts
// Health, liveness, readiness and metrics endpoints.
//
// Endpoint contracts:
//   GET /health    → Full health check (DB + Redis). Backward-compatible alias.
//   GET /liveness  → Lightweight probe: process alive? (no I/O — always fast)
//   GET /readiness → Full readiness probe: DB + Redis reachable? Used by k8s/LBs
//   GET /metrics   → Operational metrics for dashboards and partner monitoring
//
// Disglobal integration note:
//   - Poll /readiness before sending batches — 200 = ready, 503 = hold traffic
//   - /liveness is safe to call at high frequency (no DB hit)
//   - All responses include X-Correlation-ID for trace linking
// =============================================================================

import { Request, Response } from 'express'
import { logger } from './lib/logger'
import { getDb } from './lib/db'
import { getRedisClient } from './lib/redis'
import * as promClient from 'prom-client'

// ── Prometheus setup ──────────────────────────────────────────────
promClient.collectDefaultMetrics({ prefix: 'vytalix_' })

export const httpRequestsTotal = new promClient.Counter({
  name: 'vytalix_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
})

export const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'vytalix_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
})

const SERVICE_START_MS = Date.now()

// ─────────────────────────────────────────────────────────────────
// In-memory metrics (resets on restart — acceptable for MVP)
// In Phase 4: replace with Prometheus client_nodejs
// ─────────────────────────────────────────────────────────────────

export const metrics = {
  requestCount:   0,
  errorCount:     0,
  latencyBuckets: [] as number[],   // rolling window: last 1000 request latencies in ms
  startTime:      Date.now(),

  record(latencyMs: number, isError: boolean) {
    this.requestCount++
    if (isError) this.errorCount++
    this.latencyBuckets.push(latencyMs)
    if (this.latencyBuckets.length > 1000) this.latencyBuckets.shift()
  },

  p50(): number {
    if (this.latencyBuckets.length === 0) return 0
    const sorted = [...this.latencyBuckets].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.50)]
  },

  p95(): number {
    if (this.latencyBuckets.length === 0) return 0
    const sorted = [...this.latencyBuckets].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.95)]
  },

  p99(): number {
    if (this.latencyBuckets.length === 0) return 0
    const sorted = [...this.latencyBuckets].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.99)]
  },
}

// ─────────────────────────────────────────────────────────────────
// GET /liveness
// Lightweight probe — checks only that the process is alive and
// the event loop is responsive. No I/O. Should always return 200
// unless the process itself is broken.
// ─────────────────────────────────────────────────────────────────

export function livenessHandler(req: Request, res: Response): void {
  res.setHeader('X-Correlation-ID', (req as any).correlationId ?? 'unknown')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    status:    'alive',
    pid:       process.pid,
    uptimeSec: Math.floor((Date.now() - SERVICE_START_MS) / 1000),
    timestamp: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────
// GET /readiness
// Full readiness probe — checks DB and Redis connectivity.
// Returns 200 only when ALL required dependencies are reachable.
// Used by k8s readiness probes, load balancers, and Disglobal
// batch orchestrators to know when to start sending traffic.
// ─────────────────────────────────────────────────────────────────

export async function readinessHandler(req: Request, res: Response): Promise<void> {
  const correlationId = (req as any).correlationId ?? 'readiness'
  const checks: Record<string, { status: 'ok' | 'error' | 'degraded' | 'not_configured'; latencyMs?: number; detail?: string }> = {}

  // ── DB check ──────────────────────────────────────────────────
  try {
    const t0 = Date.now()
    await getDb().rawQuery('SELECT 1')
    checks.database = { status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err: any) {
    checks.database = { status: 'error', detail: 'Database unreachable' }
    logger.error({ err, correlationId }, 'Readiness: database check failed')
  }

  // ── Redis check ───────────────────────────────────────────────
  if (process.env.REDIS_URL) {
    try {
      const t0    = Date.now()
      const redis = getRedisClient()
      await redis.ping()
      checks.redis = { status: 'ok', latencyMs: Date.now() - t0 }
    } catch (err: any) {
      // Redis is non-fatal (graceful degradation) but surfaces as 'degraded'
      checks.redis = { status: 'degraded', detail: 'Redis unreachable — metering and cache disabled' }
      logger.warn({ err, correlationId }, 'Readiness: Redis check failed (degraded)')
    }
  } else {
    checks.redis = { status: 'not_configured' }
  }

  const isReady = checks.database.status === 'ok'  // DB is hard requirement
  const httpStatus = isReady ? 200 : 503

  if (!isReady) {
    logger.warn({ checks, correlationId }, 'Readiness probe failed')
  }

  res.setHeader('X-Correlation-ID', correlationId)
  res.setHeader('Cache-Control', 'no-store')
  res.status(httpStatus).json({
    status:    isReady ? 'ready' : 'not_ready',
    version:   process.env.npm_package_version ?? '0.9.0-demo',
    env:       process.env.NODE_ENV ?? 'development',
    uptimeSec: Math.floor((Date.now() - SERVICE_START_MS) / 1000),
    checks,
    timestamp: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────
// GET /health
// Backward-compatible alias for /readiness.
// Kept for Docker HEALTHCHECK, legacy integrations, and demo:check.
// ─────────────────────────────────────────────────────────────────

export async function healthHandler(req: Request, res: Response): Promise<void> {
  return readinessHandler(req, res)
}

// ─────────────────────────────────────────────────────────────────
// GET /metrics
// Operational metrics for dashboards and partner monitoring.
// Not a Prometheus endpoint — returns JSON for simplicity.
// Phase 4 will expose /metrics/prometheus in Prometheus text format.
// ─────────────────────────────────────────────────────────────────

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const correlationId = (req as any).correlationId ?? 'metrics'
  let dbCounts = { patients: 0, observations: 0, decisions: 0, billingEvents: 0 }

  try {
    const db = getDb()
    const [r1, r2, r3, r4] = await Promise.all([
      db.rawQuery('SELECT COUNT(*)::int AS n FROM patients'),
      db.rawQuery('SELECT COUNT(*)::int AS n FROM clinical_observations'),
      db.rawQuery('SELECT COUNT(*)::int AS n FROM recommendations'),
      db.rawQuery('SELECT COUNT(*)::int AS n FROM billing_events'),
    ])
    dbCounts = {
      patients:     Number((r1 as any).rows?.[0]?.n ?? 0),
      observations: Number((r2 as any).rows?.[0]?.n ?? 0),
      decisions:    Number((r3 as any).rows?.[0]?.n ?? 0),
      billingEvents: Number((r4 as any).rows?.[0]?.n ?? 0),
    }
  } catch {
    // Return partial metrics if DB is temporarily unavailable
  }

  const errorRate = metrics.requestCount > 0
    ? parseFloat((metrics.errorCount / metrics.requestCount * 100).toFixed(2))
    : 0

  res.setHeader('X-Correlation-ID', correlationId)
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    service:          'vytalix-clinical-engine',
    version:          process.env.npm_package_version ?? '0.9.0-demo',
    uptimeSec:        Math.floor((Date.now() - metrics.startTime) / 1000),
    requests: {
      total:          metrics.requestCount,
      errors:         metrics.errorCount,
      errorRatePct:   errorRate,
    },
    latency: {
      p50Ms:          metrics.p50(),
      p95Ms:          metrics.p95(),
      p99Ms:          metrics.p99(),
    },
    db:               dbCounts,
    note:             'Phase 4: /metrics/prometheus will expose Prometheus text format',
    timestamp:        new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────
// GET /metrics/prometheus
// Prometheus metrics export endpoint
// ─────────────────────────────────────────────────────────────────

export async function prometheusHandler(req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', promClient.register.contentType)
    res.end(await promClient.register.metrics())
  } catch (ex) {
    res.status(500).end(String(ex))
  }
}

// ─────────────────────────────────────────────────────────────────
// Metrics middleware — attach to app.use() before routes
// Records latency + error status for every request.
// ─────────────────────────────────────────────────────────────────

export function metricsMiddleware(req: any, res: any, next: any): void {
  const start = Date.now()
  const endTimer = httpRequestDurationMicroseconds.startTimer()
  res.on('finish', () => {
    const duration = Date.now() - start
    metrics.record(duration, res.statusCode >= 500)
    
    const route = req.route ? req.route.path : req.path
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode })
    endTimer({ method: req.method, route, status_code: res.statusCode })
  })
  next()
}
