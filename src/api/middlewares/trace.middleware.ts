// =============================================================================
// src/observability/trace.middleware.ts
// Distributed trace context: correlation ID, tenant context, clinical trace.
// Every request gets a correlationId. Clinical operations get a clinical trace.
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { logger } from '../../platform/logger'
import { getRedisClient } from '../../platform/redis'

// ── Trace context ─────────────────────────────────────────────────

export interface TraceContext {
  correlationId: string
  requestId:     string
  tenantId?:     string
  patientId?:    string
  keyId?:        string
  startedAt:     number
}

declare global {
  namespace Express {
    interface Request {
      traceCtx:      TraceContext
      correlationId: string   // shorthand alias
    }
  }
}

// ── Trace injection middleware (MUST be first in chain) ───────────

export function injectTraceContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID()
    const requestId     = crypto.randomUUID()

    const traceCtx: TraceContext = {
      correlationId,
      requestId,
      startedAt: Date.now(),
    }

    req.traceCtx      = traceCtx
    req.correlationId = correlationId

    // Propagate correlation ID in response
    res.setHeader('X-Correlation-ID', correlationId)
    res.setHeader('X-Request-ID',     requestId)

    next()
  }
}

// ── Clinical trace — records a trace event to Redis (TTL 7d) ─────
// Used to reconstruct the full computation path for any assessment.

export interface ClinicalTraceEvent {
  stage:         string
  status:        'started' | 'completed' | 'failed'
  durationMs?:   number
  detail?:       Record<string, unknown>
  error?:        string
}

const CLINICAL_TRACE_TTL = 7 * 24 * 3600  // 7 days

export async function appendClinicalTrace(
  correlationId: string,
  event: ClinicalTraceEvent
): Promise<void> {
  try {
    const redis  = getRedisClient()
    const key    = `trace:clinical:${correlationId}`
    const entry  = JSON.stringify({ ...event, ts: new Date().toISOString() })
    await redis.multi().rpush(key, entry).expire(key, CLINICAL_TRACE_TTL).exec()
  } catch (_) { /* non-fatal */ }
}

export async function getClinicalTrace(correlationId: string): Promise<ClinicalTraceEvent[]> {
  try {
    const redis   = getRedisClient()
    const entries = await redis.lrange(`trace:clinical:${correlationId}`, 0, -1)
    return entries.map(e => JSON.parse(e))
  } catch (_) {
    return []
  }
}

// ── Request completion logger ─────────────────────────────────────

export function traceLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { traceCtx } = req

    res.on('finish', () => {
      const duration = Date.now() - traceCtx.startedAt
      const level    = res.statusCode >= 500 ? 'error'
                     : res.statusCode >= 400 ? 'warn'
                     : 'info'

      logger[level]({
        correlationId: traceCtx.correlationId,
        requestId:     traceCtx.requestId,
        method:        req.method,
        path:          req.path,
        status:        res.statusCode,
        durationMs:    duration,
        tenantId:      (req as any).apiKeyCtx?.tenantId,
        keyId:         (req as any).apiKeyCtx?.keyId,
        ip:            req.ip,
        ua:            req.headers['user-agent']?.slice(0, 100),
      }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
    })

    next()
  }
}

// ── Error to RFC 7807 mapper ──────────────────────────────────────

export interface MappedError {
  type:          string
  title:         string
  status:        number
  detail:        string
  correlationId: string
  retryable:     boolean
}

const ERROR_MAP: Record<string, { status: number; title: string; retryable: boolean }> = {
  PATIENT_NOT_FOUND:    { status: 404, title: 'Patient Not Found',    retryable: false },
  LEAD_NOT_FOUND:       { status: 404, title: 'Lead Not Found',        retryable: false },
  INVALID_API_KEY:      { status: 401, title: 'Unauthorized',          retryable: false },
  INSUFFICIENT_SCOPE:   { status: 403, title: 'Forbidden',             retryable: false },
  CONSENT_REQUIRED:     { status: 403, title: 'Consent Required',      retryable: false },
  RATE_LIMIT_EXCEEDED:  { status: 429, title: 'Too Many Requests',     retryable: true  },
  VALIDATION_FAILED:    { status: 422, title: 'Validation Failed',     retryable: false },
  INSUFFICIENT_DATA:    { status: 202, title: 'Insufficient Data',     retryable: false },
  COHORT_TOO_SMALL:     { status: 200, title: 'Cohort Too Small',      retryable: false },
  ENGINE_ERROR:         { status: 500, title: 'Clinical Engine Error', retryable: true  },
  DB_ERROR:             { status: 503, title: 'Service Unavailable',   retryable: true  },
}

export function mapError(code: string, detail: string, correlationId: string): MappedError {
  const mapped = ERROR_MAP[code] ?? { status: 500, title: 'Internal Server Error', retryable: true }
  return {
    type:          `https://api.vytalix.health/errors/${code.toLowerCase().replace(/_/g, '-')}`,
    title:         mapped.title,
    status:        mapped.status,
    detail,
    correlationId,
    retryable:     mapped.retryable,
  }
}
