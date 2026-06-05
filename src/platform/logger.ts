// =============================================================================
// Structured Logger — pino with correlation ID and clinical context
// Every log entry carries: timestamp, level, correlationId, tenantId, fn
// In development: human-readable via pino-pretty
// In production: JSON for CloudWatch / Datadog / Grafana
// =============================================================================

import pino from 'pino'

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  } : {
    formatters: { level: (label: string) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'vytalix-clinical-engine',
      version: process.env.npm_package_version ?? '0.9.0',
      env: process.env.NODE_ENV,
    },
  }),
})

// ─────────────────────────────────────────────────────────────────
// Clinical event logging — structured entries for audit visibility
// These appear in the terminal during demo and in log aggregators in prod
// ─────────────────────────────────────────────────────────────────

export const clinicalLog = {
  observationIngested(ctx: { correlationId: string; tenantId: string; patientId: string; loincCode: string; value: number | null; unit: string | null }) {
    logger.info({ ...ctx, event: 'observation.ingested' }, `Observation ingested: ${ctx.loincCode} = ${ctx.value} ${ctx.unit ?? ''}`)
  },
  riskCalculated(ctx: { correlationId: string; tenantId: string; patientId: string; category: string; percent: number }) {
    logger.info({ ...ctx, event: 'risk.calculated' }, `Risk calculated: ${ctx.percent.toFixed(1)}% (${ctx.category})`)
  },
  decisionGenerated(ctx: { correlationId: string; tenantId: string; patientId: string; ruleId: string; urgency: string; title: string }) {
    logger.info({ ...ctx, event: 'decision.generated' }, `Decision generated: [${ctx.urgency}] ${ctx.title}`)
  },
  decisionReviewed(ctx: { correlationId: string; tenantId: string; patientId: string; decisionId: string; action: string; physicianId: string }) {
    logger.info({ ...ctx, event: 'decision.reviewed' }, `Decision reviewed: ${ctx.action} by ${ctx.physicianId}`)
  },
  pipelineComplete(ctx: { correlationId: string; tenantId: string; patientId: string; stages: string[]; totalMs: number }) {
    logger.info({ ...ctx, event: 'pipeline.complete' }, `Pipeline complete: ${ctx.stages.join(' → ')} in ${ctx.totalMs}ms`)
  },
  accessDenied(ctx: { correlationId: string; userId: string; role: string; path: string; method: string }) {
    logger.warn({ ...ctx, event: 'rbac.denied' }, `Access denied: ${ctx.role} → ${ctx.method} ${ctx.path}`)
  },
}

// ─────────────────────────────────────────────────────────────────
// API call logging — structured entries for external integrations
// Use in external-v2.handler.ts for Disglobal request traceability
// ─────────────────────────────────────────────────────────────────

export const apiCallLog = {
  request(ctx: {
    correlationId: string
    tenantId:      string
    keyId:         string
    method:        string
    path:          string
    operation:     string
  }) {
    logger.info({ ...ctx, event: 'api.request' }, `API ${ctx.operation}: ${ctx.method} ${ctx.path}`)
  },

  response(ctx: {
    correlationId: string
    tenantId:      string
    keyId:         string
    operation:     string
    statusCode:    number
    durationMs:    number
    cached?:       boolean
  }) {
    const level = ctx.statusCode >= 500 ? 'error' : ctx.statusCode >= 400 ? 'warn' : 'info'
    logger[level](
      { ...ctx, event: 'api.response' },
      `API ${ctx.operation} → ${ctx.statusCode} (${ctx.durationMs}ms)${ctx.cached ? ' [CACHED]' : ''}`
    )
  },

  quotaWarning(ctx: { correlationId: string; tenantId: string; usedPct: number }) {
    logger.warn({ ...ctx, event: 'quota.warning' },
      `Quota warning: tenant has used ${ctx.usedPct.toFixed(1)}% of monthly limit`)
  },

  quotaExceeded(ctx: { correlationId: string; tenantId: string; operation: string }) {
    logger.error({ ...ctx, event: 'quota.exceeded' },
      `Quota exceeded: tenant blocked on operation ${ctx.operation}`)
  },
}
