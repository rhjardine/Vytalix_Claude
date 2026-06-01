// =============================================================================
// Vytalix API Server — Entry Point
// Auth chain: CORS → helmet → correlation ID → metrics → auth → tenant → RBAC → handler
// =============================================================================

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { randomUUID } from 'crypto'
import { logger } from './lib/logger'
import {
  authMiddleware, loginHandler, meHandler,
  requireRole, requireMinRole,
} from './auth/auth.middleware'
import { tenantMiddleware } from './middleware/tenant.middleware'
import { errorHandler } from './middleware/error.middleware'
import { demoLoggingMiddleware, getDemoStatus } from './demo/demo-status'
import { registerCoreSubscriptions } from './events/event-bus'
import {
  createPatient, listPatients, getPatient,
  ingestObservation, getPatientObservations,
  calculateRisk, getRiskHistory,
  generateDecisions, getPatientDecisions,
  getDecisionTrace, reviewDecision,
  getPatientTimeline,
} from './api/handlers'
import { externalIngestObservations } from './api/external.handler'
import { healthHandler, metricsHandler, metricsMiddleware } from './api/observability.handler'
import { closeDb } from './lib/db'

const app = express()
const PORT = parseInt(process.env.API_PORT ?? '3001', 10)

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  credentials: true,
  exposedHeaders: ['X-Correlation-ID'],
}))
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Correlation ID (every request gets one) ────────────────────────
app.use((req, res, next) => {
  const id = (req.headers['x-correlation-id'] as string) ?? randomUUID()
  res.setHeader('X-Correlation-ID', id)
  ;(req as any).correlationId = id
  next()
})

// ── Observability ──────────────────────────────────────────────────
app.use(metricsMiddleware)
app.use(demoLoggingMiddleware)

// ── Public routes (no auth) ────────────────────────────────────────
app.get('/health',       healthHandler)
app.get('/metrics',      metricsHandler)
app.get('/demo/status',  getDemoStatus)

// ── Auth routes (public — no JWT required) ─────────────────────────
app.post('/auth/login',  loginHandler)
app.get('/auth/me',      authMiddleware, meHandler)

// ── External integration (API key — NOT JWT) ───────────────────────
app.post('/api/external/observations', externalIngestObservations)

// ── Protected clinical API ─────────────────────────────────────────
const api = express.Router()
api.use(authMiddleware)
api.use(tenantMiddleware)

// --- Patients ---
// PHYSICIAN, ORG_ADMIN can create patients. VIEWER and PARTNER cannot.
api.post('/patients',           requireMinRole('PHYSICIAN'), createPatient)
api.get('/patients',            requireMinRole('VIEWER'),    listPatients)
api.get('/patients/:id',        requireMinRole('VIEWER'),    getPatient)
api.get('/patients/:id/observations', requireMinRole('VIEWER'),    getPatientObservations)
api.get('/patients/:id/risk',   requireMinRole('VIEWER'),    getRiskHistory)
api.get('/patients/:id/decisions', requireMinRole('VIEWER'), getPatientDecisions)
api.get('/patients/:id/timeline',  requireMinRole('VIEWER'), getPatientTimeline)

// --- Observations ---
// Only PHYSICIAN+ can ingest data
api.post('/observations',       requireMinRole('PHYSICIAN'), ingestObservation)

// --- Risk Scoring ---
// CARE_COORDINATOR+ can trigger risk calculation
api.post('/risk/calculate',     requireMinRole('CARE_COORDINATOR'), calculateRisk)

// --- Decisions ---
// Generating decisions requires PHYSICIAN level
api.post('/decisions/generate', requireMinRole('PHYSICIAN'),        generateDecisions)
api.get('/decisions/:id/trace', requireMinRole('VIEWER'),           getDecisionTrace)
// Only PHYSICIAN+ can review (accept/reject) recommendations
api.patch('/decisions/:id/review', requireMinRole('PHYSICIAN'),     reviewDecision)

app.use('/v1', api)

// ── Error handler (must be last) ──────────────────────────────────
app.use(errorHandler)

// ── Startup ───────────────────────────────────────────────────────
registerCoreSubscriptions()

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Vytalix API server started')
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`  Health:  http://localhost:${PORT}/health`)
    logger.info(`  Demo:    http://localhost:${PORT}/demo/status`)
    logger.info(`  API:     http://localhost:${PORT}/v1/patients`)
    logger.info(`  Docs:    http://localhost:${PORT}/auth/login  POST`)
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully')
  server.close(async () => {
    await closeDb()
    process.exit(0)
  })
})

export default app
