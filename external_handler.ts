// @ts-nocheck — Prisma types require `prisma generate` (run `npm run db:generate`)
// =============================================================================
// External Integration Handler
//
// POST /api/external/observations
//   - Accepts simplified FHIR-like payload from external systems
//   - Authenticated via API key (X-API-Key header), not JWT
//   - Rate limited per API key
//   - Emits webhook on decision.created
//
// Webhook: decision.created
//   - Fired after successful decision generation
//   - Delivered to tenant's configured webhook URL
//   - Signed with HMAC-SHA256 for verification
//   - Retried up to 3 times with exponential backoff
// =============================================================================

import { Request, Response } from 'express'
import * as crypto from 'crypto'
import * as https from 'https'
import * as http from 'http'
import { logger } from '../lib/logger'
import { withTenant } from '../lib/db'
import { IngestionService } from '../ingestion/ingestion.service'
import { PipelineOrchestrator } from '../pipeline/orchestrator'
import { DEMO } from '../demo/demo-dataset'

// ─────────────────────────────────────────────────────────────────
// API Key registry (in-memory for MVP — replace with DB in V1)
// Key → { tenantId, orgId, name }
// ─────────────────────────────────────────────────────────────────

const API_KEY_REGISTRY: Record<string, { tenantId: string; orgId: string; name: string }> = {
  // Demo API key for partner integration demonstration
  'vyx_demo_k1_NueveOnce_2024': {
    tenantId: DEMO.TENANT.ID,
    orgId:    DEMO.ORGANIZATION.ID,
    name:     'Grupo NueveOnce External Integration',
  },
}

// ─────────────────────────────────────────────────────────────────
// External observations endpoint
// ─────────────────────────────────────────────────────────────────

const ingestionService = new IngestionService()
const orchestrator = new PipelineOrchestrator()

export async function externalIngestObservations(req: Request, res: Response) {
  const correlationId = (req as any).correlationId
  const apiKey = req.headers['x-api-key'] as string

  // API key authentication
  const keyContext = apiKey ? API_KEY_REGISTRY[apiKey] : null
  if (!keyContext) {
    return res.status(401).json({
      type: 'https://api.vytalix.health/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid or missing X-API-Key header',
      instance: req.path,
      correlationId,
    })
  }

  const { observations, patientMrn } = req.body ?? {}

  if (!patientMrn || !Array.isArray(observations) || observations.length === 0) {
    return res.status(422).json({
      type: 'https://api.vytalix.health/errors/validation-failed',
      title: 'Validation Failed',
      status: 422,
      detail: 'Body must contain patientMrn (string) and observations (array)',
      instance: req.path,
      correlationId,
    })
  }

  logger.info(
    { source: keyContext.name, patientMrn, count: observations.length, correlationId },
    'External observation ingest received'
  )

  // Resolve patient MRN → internal ID
  const patient = await withTenant(keyContext.tenantId, (tc: any) =>
    tc.queryOne(
      'SELECT id, "organizationId" FROM patients WHERE "tenantId"=$1::uuid AND mrn=$2',
      [keyContext.tenantId, patientMrn]
    )
  )

  if (!patient) {
    return res.status(404).json({
      type: 'https://api.vytalix.health/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Patient with MRN "${patientMrn}" not found`,
      instance: req.path,
      correlationId,
    })
  }

  // Map external format to internal observation format
  const inputs = observations.map((obs: any) => ({
    patientId:    patient.id,
    loincCode:    obs.loincCode ?? obs.code,
    displayName:  obs.displayName ?? obs.name,
    valueNumeric: obs.value ?? obs.valueNumeric,
    valueText:    obs.valueText,
    unit:         obs.unit,
    observedAt:   new Date(obs.effectiveDateTime ?? obs.observedAt ?? new Date()),
    sourceSystem: 'EMR_IMPORT' as const,
    fhirResourceId: obs.resourceId ?? obs.id,
  }))

  // Batch ingest
  const result = await ingestionService.ingestBatch(
    keyContext.tenantId,
    'external-api',
    inputs,
    { continueOnError: true },
    correlationId
  )

  // Trigger pipeline for this patient (non-blocking)
  if (result.accepted > 0) {
    orchestrator.runFromObservation(keyContext.tenantId, patient.id, correlationId)
      .then(ctx => {
        // Emit webhook after pipeline completes
        const decisionStage = ctx.stages.find(s => s.stage === 'DECISION_GENERATION')
        if (decisionStage?.status === 'success' && (decisionStage.detail as any)?.generated > 0) {
          emitWebhook(keyContext.tenantId, 'decision.created', {
            patientId: patient.id,
            patientMrn,
            generated: (decisionStage.detail as any).generated,
            correlationId,
            timestamp: new Date().toISOString(),
          })
        }
      })
      .catch(err => logger.error({ err }, 'Pipeline failed after external ingest'))
  }

  res.json({
    accepted:    result.accepted,
    rejected:    result.rejected,
    total:       result.total,
    patientId:   patient.id,
    correlationId,
    pipelineTriggered: result.accepted > 0,
  })
}

// ─────────────────────────────────────────────────────────────────
// Webhook emitter with HMAC signing
// ─────────────────────────────────────────────────────────────────

// Webhook URL registry (in-memory for MVP)
const WEBHOOK_REGISTRY: Record<string, string> = {
  // Demo webhook endpoint for demonstration
  [DEMO.TENANT.ID]: process.env.DEMO_WEBHOOK_URL ?? 'https://webhook.site/vytalix-demo',
}

async function emitWebhook(
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
  attempt = 1
) {
  const webhookUrl = WEBHOOK_REGISTRY[tenantId]
  if (!webhookUrl) return  // No webhook configured for this tenant

  const body = JSON.stringify({ eventType, payload })
  const timestamp = Date.now().toString()
  const webhookSecret = process.env.WEBHOOK_SECRET ?? 'demo_webhook_secret'

  // HMAC-SHA256 signature: tenant can verify authenticity
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  const url = new URL(webhookUrl)
  const isHttps = url.protocol === 'https:'
  const transport = isHttps ? https : http

  logger.info({ eventType, tenantId, attempt, webhookUrl }, 'Emitting webhook')

  return new Promise<void>((resolve) => {
    const reqOpts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Vytalix-Event': eventType,
        'X-Vytalix-Timestamp': timestamp,
        'X-Vytalix-Signature': `sha256=${signature}`,
        'X-Vytalix-Tenant': tenantId,
      },
      timeout: 5000,
    }

    const r = (transport as any).request(reqOpts, (res: any) => {
      logger.info({ statusCode: res.statusCode, eventType, attempt }, 'Webhook delivered')
      resolve()
    })

    r.on('error', (err: Error) => {
      logger.warn({ err: err.message, eventType, attempt }, 'Webhook delivery failed')
      if (attempt < 3) {
        // Exponential backoff: 2s, 4s, 8s
        setTimeout(() => {
          emitWebhook(tenantId, eventType, payload, attempt + 1)
        }, 2000 * Math.pow(2, attempt - 1))
      }
      resolve()
    })

    r.on('timeout', () => { r.destroy(); resolve() })
    r.write(body)
    r.end()
  })
}
