// =============================================================================
// src/server.ts — Platform entry point
// Mounts all routes. Start with: npm run api:dev
// =============================================================================

import 'dotenv/config'
import express from 'express'
import helmet  from 'helmet'
import cors    from 'cors'
import crypto  from 'node:crypto'

import { logger }            from './platform/logger'
import { checkDbHealth }     from './platform/db'
import { checkRedisHealth }  from './platform/redis'
import { flushMeterStream }  from './platform/metering.service'
import {
  healthHandler,
  livenessHandler,
  readinessHandler,
  metricsHandler,
  prometheusHandler,
  metricsMiddleware,
} from './api/handlers/observability.handler'

// ── Routers ───────────────────────────────────────────────────────
import { createExternalV2Router } from './api/handlers/external-v2.handler'
import { createFunnelRouter, createExchangeRateHandler } from './api/handlers/funnel.handler'
import { createBillingAdminRouter } from './api/handlers/billing-admin.handler'
import { PlatformPipelineOrchestrator, registerPlatformEventListeners } from './api/pipelines/pipeline-v2.orchestrator'

// ── CFE Dental Routers (Sprint 2A — mounting previously orphaned routers) ──
import { dentalAdminRouter }    from './dental/routers/dental-admin.router'
import { dentalCommerceRouter } from './dental/routers/dental-commerce.router'
import { dentalCoreRouter }     from './dental/routers/dental-core.router'

// ── Dental Tenant Context Middleware ────────────────────────────────--
// Extracts tenantId + userId from request headers, injecting them into the
// request object so dental routers' tr(req) cast populates correctly.
// X-Tenant-ID: required — identifies which tenant's data to scope (for RLS)
// X-User-ID:   optional — identifies the acting user (for audit trail)
// In production: these come from a validated JWT via auth middleware upstream.
function dentalTenantContext(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const tenantId = req.headers['x-tenant-id'] as string | undefined
  const userId   = (req.headers['x-user-id'] as string | undefined) ?? 'system'
  const requestId = (req as any).correlationId ?? req.headers['x-correlation-id'] as string ?? crypto.randomUUID()

  if (!tenantId) {
    res.status(400).json({
      type: 'https://api.vytalix.health/errors/400',
      title: 'Bad Request',
      status: 400,
      detail: 'X-Tenant-ID header is required for dental API endpoints',
      correlationId: requestId,
    })
    return
  }

  ;(req as any).tenantId  = tenantId
  ;(req as any).userId    = userId
  ;(req as any).requestId = requestId
  next()
}


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

// ── Correlation ID on every request ─────────────────────────────
// Generate or forward X-Correlation-ID; always echo it in the response.
app.use((req, res, next) => {
  const cid = (req.headers['x-correlation-id'] as string) || crypto.randomUUID()
  ;(req as any).correlationId = cid
  res.setHeader('X-Correlation-ID', cid)
  next()
})

// ── Operational metrics (must come before routes) ─────────────────
app.use(metricsMiddleware)

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

// ── Observability endpoints (public, no auth) ────────────────────
// /liveness  — lightweight probe, no I/O (k8s livenessProbe)
// /readiness — DB + Redis check (k8s readinessProbe, Disglobal batch guard)
// /health    — alias for /readiness (Docker HEALTHCHECK, legacy)
// /metrics   — operational JSON metrics for dashboards
app.get('/liveness',  livenessHandler)
app.get('/readiness', readinessHandler)
app.get('/health',    healthHandler)
app.get('/metrics',   metricsHandler)
app.get('/metrics/prometheus', prometheusHandler)

// ── Public Funnel API (no auth) ───────────────────────────────────
app.use('/api/funnel',        createFunnelRouter())
app.use('/api/exchange-rate', createExchangeRateHandler())

// ── External API v2 (API Key auth — Disglobal + partners) ────────
app.use('/api/v2', createExternalV2Router())

// ── CFE Dental API — Admin (tenant settings, catalog, analytics) ─
// Injects dental tenant context from X-Tenant-ID + X-User-ID headers.
// In production these values come from the JWT validated upstream.
app.use('/api/v2/dental/admin',    dentalTenantContext, dentalAdminRouter)

// ── CFE Dental API — Commerce (vouchers, bookings, catalog) ──────
app.use('/api/v2/dental/commerce', dentalTenantContext, dentalCommerceRouter)

// ── CFE Dental API — Core (quotes, treatments, inventory check) ──
app.use('/api/v2/dental/core',     dentalTenantContext, dentalCoreRouter)

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
      // Observability (public)
      'GET  /liveness',
      'GET  /readiness',
      'GET  /health    (alias → /readiness)',
      'GET  /metrics',
      // Funnel API (public)
      'POST /api/funnel/leads',
      'POST /api/funnel/vitality-assessment',
      'POST /api/funnel/facial-analysis (stub)',
      'POST /api/funnel/booking',
      'GET  /api/exchange-rate',
      // External API v2 (API Key — Disglobal + partners)
      'POST /api/v2/vitality/assess',
      'GET  /api/v2/vitality/:subjectRef',
      'POST /api/v2/preventive/score',
      'GET  /api/v2/referral/:subjectRef',
      'POST /api/v2/engagement/events',
      'GET  /api/v2/insights/cohort',
      // CFE Dental — Admin
      'POST /api/v2/dental/admin/catalog',
      'GET  /api/v2/dental/admin/catalog',
      'GET  /api/v2/dental/admin/catalog/:code',
      'POST /api/v2/dental/admin/pricing-rules',
      'POST /api/v2/dental/admin/exchange-rates',
      'GET  /api/v2/dental/admin/exchange-rates/latest',
      'PUT  /api/v2/dental/admin/settings',
      'GET  /api/v2/dental/admin/settings',
      'GET  /api/v2/dental/admin/analytics/revenue',
      'GET  /api/v2/dental/admin/analytics/margin',
      'GET  /api/v2/dental/admin/analytics/inventory',
      // CFE Dental — Commerce
      'GET  /api/v2/dental/commerce/catalog',
      'GET  /api/v2/dental/commerce/catalog/:code',
      'POST /api/v2/dental/commerce/vouchers',
      'GET  /api/v2/dental/commerce/vouchers/:token',
      'POST /api/v2/dental/commerce/vouchers/redeem',
      'POST /api/v2/dental/commerce/bookings',
      'GET  /api/v2/dental/commerce/bookings/:id',
      'POST /api/v2/dental/commerce/bookings/:id/confirm',
      'POST /api/v2/dental/commerce/bookings/:id/check-in',
      'POST /api/v2/dental/commerce/bookings/:id/complete',
      'POST /api/v2/dental/commerce/bookings/:id/cancel',
      // Admin API (JWT — internal only)
      'POST /admin/tenants/:id/api-keys',
      'GET  /admin/tenants/:id/usage',
    ]
  }, 'Route manifest')
})

export { app }
