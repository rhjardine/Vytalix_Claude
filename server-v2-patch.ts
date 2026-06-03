// =============================================================================
// server-v2-patch.ts
// Instructions: apply these additions to the existing src/server.ts
//
// DO NOT replace server.ts — only add the sections marked below.
// All existing routes (/v1/*, /api/external/*, /health, /metrics) are preserved.
// =============================================================================

// ── SECTION A: Add these imports to the TOP of server.ts ─────────────────────

import { createExternalV2Router } from './api/external-v2.handler'
import { PlatformPipelineOrchestrator, registerPlatformEventListeners } from './pipeline/pipeline-v2.orchestrator'
import { InsightsService } from './insights/insights.service'

// ── SECTION B: Add after existing app setup (after helmet, cors, etc.) ───────

// Mount the v2 external API router
// Route: /api/v2/*
const platformOrchestrator = new PlatformPipelineOrchestrator()
const externalV2Router = createExternalV2Router()

app.use('/api/v2', externalV2Router)

// Register platform event listeners (vitality.assessed, referral.triggered, etc.)
registerPlatformEventListeners(platformOrchestrator)

// ── SECTION C: Replace the existing pipeline trigger in the external handler ──
// Find in src/api/external.handler.ts the line that calls:
//   pipeline.runFromObservation(tenantId, patient.id, correlationId)
// Replace with:
//   platformOrchestrator.runFromObservation(tenantId, patient.id, correlationId)

// ── SECTION D: Add to the /health endpoint ────────────────────────────────────
// Extend the existing health check to include Redis and new services:

import { checkRedisHealth } from './lib/redis'

// In the health handler, add:
const redisOk = await checkRedisHealth()
// Include in the response:
//   redis: { status: redisOk ? 'ok' : 'degraded' }
//   platformPipeline: { stages: 5 }

// =============================================================================
// FULL server-v2.ts — standalone version for greenfield setup
// Use this if starting fresh (not modifying existing server.ts)
// =============================================================================

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { logger } from './lib/logger'

// ── Existing handlers (unchanged) ─────────────────────────────────
import { createV1Router }        from './api/handlers'
import { createExternalHandler } from './api/external.handler'
import { observabilityRouter }   from './api/observability.handler'
import { errorMiddleware }        from './middleware/error.middleware'
import { tenantMiddleware }       from './middleware/tenant.middleware'
import { authMiddleware }         from './auth/auth.middleware'

// ── New v2 handlers ────────────────────────────────────────────────
// (imported above in SECTION A)

const appV2 = express()

// ── Security ───────────────────────────────────────────────────────
appV2.use(helmet({
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"] }
  }
}))
appV2.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key',
                   'X-Idempotency-Key', 'X-Correlation-ID'],
}))
appV2.use(express.json({ limit: '2mb' }))

// ── Observability (public, no auth) ────────────────────────────────
appV2.use(observabilityRouter)

// ── V1 clinical API (JWT + tenant) ────────────────────────────────
appV2.use('/v1', authMiddleware, tenantMiddleware, createV1Router())

// ── External API v1 (API Key — existing Disglobal LOINC ingest) ────
appV2.use('/api/external', createExternalHandler())

// ── External API v2 (API Key — new platform APIs) ─────────────────
const v2Orchestrator = new PlatformPipelineOrchestrator()
registerPlatformEventListeners(v2Orchestrator)
appV2.use('/api/v2', createExternalV2Router())

// ── Error handler (last middleware) ───────────────────────────────
appV2.use(errorMiddleware)

const PORT = Number(process.env.PORT ?? 3001)
appV2.listen(PORT, () => {
  logger.info({ port: PORT }, 'Vytalix Platform v2 server started')
  logger.info({
    routes: [
      'GET    /health',
      'GET    /metrics',
      'POST   /auth/login',
      // V1 (existing)
      'GET    /v1/patients',
      'POST   /v1/observations',
      'GET    /v1/patients/:id/decisions',
      // External v1 (existing)
      'POST   /api/external/observations',
      // External v2 (new platform)
      'POST   /api/v2/vitality/assess',
      'GET    /api/v2/vitality/:subjectRef',
      'POST   /api/v2/preventive/score',
      'GET    /api/v2/referral/:subjectRef',
      'POST   /api/v2/engagement/events',
      'GET    /api/v2/insights/cohort',
    ]
  }, 'Route manifest')
})

export { appV2 }
