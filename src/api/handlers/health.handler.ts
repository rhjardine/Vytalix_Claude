// =============================================================================
// src/observability/health.handler.ts
// Deep health check — verifies every critical dependency.
// GET /health        → liveness probe (fast, no DB)
// GET /health/ready  → readiness probe (all deps)
// GET /health/deep   → full diagnostic (for ops dashboards)
// =============================================================================

import { Router, Request, Response } from 'express'
import { checkDbHealth }    from '../../platform/db'
import { checkRedisHealth } from '../../platform/redis'
import { logger }           from '../../platform/logger'

const VERSION = process.env.npm_package_version ?? '2.0.0'
const START_TIME = Date.now()

interface HealthCheck {
  name:    string
  status:  'ok' | 'error' | 'degraded'
  latency: number
  detail?: string
}

async function checkDependency(name: string, fn: () => Promise<boolean>): Promise<HealthCheck> {
  const start = Date.now()
  try {
    const ok = await Promise.race([fn(), new Promise<boolean>(r => setTimeout(() => r(false), 3000))])
    return { name, status: ok ? 'ok' : 'error', latency: Date.now() - start }
  } catch (err: any) {
    return { name, status: 'error', latency: Date.now() - start, detail: err.message }
  }
}

export function createHealthRouter(): Router {
  const router = Router()

  // ── Liveness probe (always fast — just proves process is alive) ──
  router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      status:    'ok',
      version:   VERSION,
      uptime:    Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    })
  })

  // ── Readiness probe (used by k8s / load balancer) ────────────────
  router.get('/ready', async (_req: Request, res: Response) => {
    const [db, redis] = await Promise.all([
      checkDependency('database', checkDbHealth),
      checkDependency('redis',    checkRedisHealth),
    ])

    const allOk = [db, redis].every(c => c.status === 'ok')
    const status = allOk ? 'ok' : 'degraded'

    res.status(allOk ? 200 : 503).json({
      status,
      checks: { database: db.status, redis: redis.status },
      version: VERSION,
      timestamp: new Date().toISOString(),
    })
  })

  // ── Deep diagnostic (ops dashboard, not public) ──────────────────
  router.get('/deep', async (_req: Request, res: Response) => {
    const checks = await Promise.all([
      checkDependency('database', checkDbHealth),
      checkDependency('redis',    checkRedisHealth),
      checkDependency('event_bus', async () => {
        const { eventBus } = await import('../events/event-bus')
        return eventBus.listenerCount('vitality.assessed') >= 0
      }),
    ])

    const overall = checks.every(c => c.status === 'ok') ? 'ok'
      : checks.some(c => c.status === 'error') ? 'degraded' : 'ok'

    const totalLatency = checks.reduce((s, c) => s + c.latency, 0)

    logger.debug({ checks, overall }, 'Deep health check')

    res.status(overall === 'ok' ? 200 : 503).json({
      status:   overall,
      version:  VERSION,
      uptime:   Math.floor((Date.now() - START_TIME) / 1000),
      memory:   {
        heapUsedMb:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMb:       Math.round(process.memoryUsage().rss       / 1024 / 1024),
      },
      checks: Object.fromEntries(checks.map(c => [c.name, { status: c.status, latencyMs: c.latency, detail: c.detail }])),
      totalCheckLatencyMs: totalLatency,
      timestamp: new Date().toISOString(),
    })
  })

  return router
}
