// =============================================================================
// src/server.ts — Platform entry point
// Mounts all routes. Start with: npm run api:dev
// =============================================================================

import 'dotenv/config'
import express from 'express'
import helmet  from 'helmet'
import cors    from 'cors'
import crypto  from 'node:crypto'

import { logger }          from './lib/logger'
import { checkDbHealth }   from './lib/db'
import { checkRedisHealth } from './lib/redis'
import { flushMeterStream }  from './billing/metering.service'

// ── Routers ───────────────────────────────────────────────────────
import { createExternalV2Router }        from './api/external-v2.handler'
import { createFunnelRouter, createExchangeRateHandler } from './funnel/funnel.handler'
import { createBillingAdminRouter }      from './billing/billing-admin.handler'
import { PlatformPipelineOrchestrator, registerPlatformEventListeners } from './pipeline/pipeline-v2.orchestrator'

// ── App ───────────────────────────────────────────────────────────

const app = express()

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"] }
  }
}))

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key',
    'X-Idempotency-Key', 'X-Correlation-ID',
  ],
  credentials: true,
}))

// ── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

// ── Correlation ID on every request ──────────────────────────────
app.use((req, _res, next) => {
  ;(req as any).correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID()
  next()
})

// ── Request logger ────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () =>
    logger.info({
      method: req.method, path: req.path,
      status: res.statusCode, ms: Date.now() - start,
      correlationId: (req as any).correlationId,
    }, 'HTTP')
  )
  next()
})

// ── Health & Observability (public) ──────────────────────────────
app.get('/health', async (_req, res) => {
  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()])
  const status = db && redis ? 'ok' : 'degraded'
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    version:   process.env.npm_package_version ?? '0.9.0',
    timestamp: new Date().toISOString(),
    checks:    { database: db ? 'ok' : 'error', redis: redis ? 'ok' : 'degraded' },
  })
})

app.get('/metrics', (_req, res) => {
  // In Fase 4: export Prometheus metrics
  res.json({ note: 'Prometheus endpoint — Phase 4', uptime: process.uptime() })
})

// ── Public Funnel API (no auth) ───────────────────────────────────
app.use('/api/funnel',        createFunnelRouter())
app.use('/api/exchange-rate', createExchangeRateHandler())

// ── External API v2 (API Key auth — Disglobal + partners) ────────
app.use('/api/v2', createExternalV2Router())

// ── Admin API (JWT auth — internal only) ─────────────────────────
app.use('/admin', createBillingAdminRouter())

// ── RFC 7807 Error handler (last middleware) ──────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status  = err.statusCode ?? err.status ?? 500
  const message = status < 500 ? err.message : 'Internal server error'
  logger.error({ err, status }, 'Unhandled error')
  res.status(status).json({
    type:   `https://api.vytalix.health/errors/${status}`,
    title:  status < 500 ? 'Request Error' : 'Internal Server Error',
    status,
    detail: message,
  })
})

// ── Platform event wiring ─────────────────────────────────────────
const platformOrchestrator = new PlatformPipelineOrchestrator()
registerPlatformEventListeners(platformOrchestrator)

// ── Metering flush (every 60s) ────────────────────────────────────
setInterval(async () => {
  const flushed = await flushMeterStream()
  if (flushed > 0) logger.debug({ flushed }, 'Meter events flushed')
}, 60_000)

// ── Start ─────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV ?? 'development' }, '🚀 Vytalix Platform started')
  logger.info({
    routes: [
      'GET  /health', 'GET  /metrics',
      'POST /api/funnel/leads',
      'POST /api/funnel/vitality-assessment',
      'POST /api/funnel/facial-analysis (stub)',
      'POST /api/funnel/booking',
      'GET  /api/exchange-rate',
      'POST /api/v2/vitality/assess',
      'GET  /api/v2/vitality/:subjectRef',
      'POST /api/v2/preventive/score',
      'GET  /api/v2/referral/:subjectRef',
      'POST /api/v2/engagement/events',
      'GET  /api/v2/insights/cohort',
      'POST /admin/tenants/:id/api-keys',
      'GET  /admin/tenants/:id/usage',
    ]
  }, 'Route manifest')
})

export { app }
