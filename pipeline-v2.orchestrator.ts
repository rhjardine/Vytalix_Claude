// =============================================================================
// pipeline-v2.orchestrator.ts
// Extends the existing PipelineOrchestrator with Stage 4: BIOLOGICAL_AGE_SYNC
// and wires EventBus subscriptions for the new platform services.
//
// Strategy: composition, not inheritance.
//   - PlatformPipelineOrchestrator wraps PipelineOrchestrator
//   - Adds Stage 4 after the existing 3 stages
//   - Registers event listeners for cross-service coordination
//
// Usage: import PlatformPipelineOrchestrator instead of PipelineOrchestrator
// in server.ts event bus wiring.
// =============================================================================

import { PipelineOrchestrator, PipelineContext } from './orchestrator'
import { PreventiveScoreService } from '../preventive/preventive-score.service'
import { ReferralEngine } from '../referral/referral.engine'
import { InsightsService } from '../insights/insights.service'
import { withTenant } from '../lib/db'
import { logger } from '../lib/logger'
import { eventBus } from '../events/event-bus'
import { getRedisClient } from '../lib/redis'

export type ExtendedPipelineStage =
  | 'SNAPSHOT_UPDATE'
  | 'RISK_SCORING'
  | 'DECISION_GENERATION'
  | 'BIOLOGICAL_AGE_SYNC'      // New: re-compute preventive score if new bio age exists
  | 'REFERRAL_EVALUATION'      // New: check referral triggers after each pipeline run

// ─────────────────────────────────────────────────────────────────

export class PlatformPipelineOrchestrator {
  private base            = new PipelineOrchestrator()
  private preventiveSvc   = new PreventiveScoreService()
  private referralEngine  = new ReferralEngine()

  // ── Main pipeline entry (replaces base.runFromObservation) ────────

  async runFromObservation(
    tenantId: string,
    patientId: string,
    correlationId: string
  ): Promise<PipelineContext> {
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'PlatformPipeline' })

    // Stages 1–3: delegate to existing engine (immutable, no changes)
    const ctx = await this.base.runFromObservation(tenantId, patientId, correlationId)

    // Stage 4: BIOLOGICAL_AGE_SYNC
    // Re-compute preventive score if there's a recent bio age assessment.
    // This handles the case where new observations (labs) should update the composite score.
    await this.runStage4(ctx, tenantId, patientId, correlationId, log)

    // Stage 5: REFERRAL_EVALUATION
    await this.runStage5(ctx, tenantId, patientId, correlationId, log)

    return ctx
  }

  // ── Triggered by vitality.assessed event (from BiologicalAgeService) ──

  async runFromBiologicalAge(
    tenantId: string,
    patientId: string,
    differentialAge: number,
    correlationId: string
  ): Promise<void> {
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'PlatformPipeline.bioAge' })

    // Recompute preventive composite score with new bio age data
    try {
      const start = Date.now()
      const result = await this.preventiveSvc.computeForPatient(tenantId, patientId, correlationId)
      log.info({ ms: Date.now() - start, scoreTier: result?.scoreTier }, 'Stage 4 complete')
    } catch (err) {
      log.error({ err }, 'Stage 4 failed (non-fatal)')
    }

    // Evaluate referral triggers
    try {
      const cvRisk = await withTenant(tenantId, tc =>
        tc.queryOne(
          `SELECT "riskCategory" FROM risk_scores
           WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
           ORDER BY "computedAt" DESC LIMIT 1`,
          [tenantId, patientId]
        )
      )

      const engagementTier = await withTenant(tenantId, tc =>
        tc.queryOne(
          `SELECT tier FROM engagement_scores
           WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
          [tenantId, patientId]
        )
      )

      await this.referralEngine.evaluate({
        tenantId, patientId, correlationId,
        differentialAge,
        cvRiskCategory: cvRisk?.riskCategory,
        engagementTier: engagementTier?.tier,
      })
    } catch (err) {
      log.error({ err }, 'Stage 5 (referral) failed (non-fatal)')
    }
  }

  // ── Private stage runners ─────────────────────────────────────────

  private async runStage4(
    ctx: PipelineContext,
    tenantId: string,
    patientId: string,
    correlationId: string,
    log: ReturnType<typeof logger.child>
  ): Promise<void> {
    const start = Date.now()
    try {
      // Check if bio age assessment exists (don't require one — it's optional)
      const bioAgeExists = await withTenant(tenantId, tc =>
        tc.queryOne(
          `SELECT 1 FROM biological_age_assessments
           WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
           LIMIT 1`,
          [tenantId, patientId]
        )
      )

      if (!bioAgeExists) {
        ctx.stages.push({
          stage: 'BIOLOGICAL_AGE_SYNC' as any,
          status: 'skipped',
          durationMs: Date.now() - start,
          detail: { reason: 'No bio age assessment available' },
        })
        return
      }

      const result = await this.preventiveSvc.computeForPatient(tenantId, patientId, correlationId)
      ctx.stages.push({
        stage: 'BIOLOGICAL_AGE_SYNC' as any,
        status: 'success',
        durationMs: Date.now() - start,
        detail: result
          ? { compositeScore: result.compositeScore, tier: result.scoreTier }
          : { reason: 'Insufficient data for composite score' },
      })
    } catch (err) {
      ctx.stages.push({
        stage: 'BIOLOGICAL_AGE_SYNC' as any,
        status: 'failed',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      })
      log.error({ err }, 'Stage 4 failed')
    }
  }

  private async runStage5(
    ctx: PipelineContext,
    tenantId: string,
    patientId: string,
    correlationId: string,
    log: ReturnType<typeof logger.child>
  ): Promise<void> {
    const start = Date.now()
    try {
      const [bioAge, riskScore] = await Promise.all([
        withTenant(tenantId, tc =>
          tc.queryOne(
            `SELECT "differentialAge"::float FROM biological_age_assessments
             WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
             ORDER BY "assessedAt" DESC LIMIT 1`,
            [tenantId, patientId]
          )
        ),
        withTenant(tenantId, tc =>
          tc.queryOne(
            `SELECT "riskCategory" FROM risk_scores
             WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
             ORDER BY "computedAt" DESC LIMIT 1`,
            [tenantId, patientId]
          )
        ),
      ])

      const cta = await this.referralEngine.evaluate({
        tenantId, patientId, correlationId,
        differentialAge: bioAge?.differentialAge,
        cvRiskCategory: riskScore?.riskCategory,
      })

      ctx.stages.push({
        stage: 'REFERRAL_EVALUATION' as any,
        status: 'success',
        durationMs: Date.now() - start,
        detail: { referralTriggered: !!cta, type: cta?.referralType },
      })
    } catch (err) {
      ctx.stages.push({
        stage: 'REFERRAL_EVALUATION' as any,
        status: 'failed',
        durationMs: Date.now() - start,
        error: (err as Error).message,
      })
      log.error({ err }, 'Stage 5 failed')
    }
  }
}

// =============================================================================
// EventBus subscriptions — call this once at server startup
// Wires all cross-service event handling.
// =============================================================================

export function registerPlatformEventListeners(
  orchestrator: PlatformPipelineOrchestrator
): void {
  const log = logger.child({ fn: 'EventBus.platform' })

  // vitality.assessed → recompute preventive score + referral evaluation
  eventBus.on('vitality.assessed', async (payload: {
    tenantId: string
    patientId: string
    biologicalAge: number
    differentialAge: number
    ageStatus: string
    correlationId: string
  }) => {
    log.info({ patientId: payload.patientId }, 'vitality.assessed received')
    await orchestrator.runFromBiologicalAge(
      payload.tenantId,
      payload.patientId,
      payload.differentialAge,
      payload.correlationId
    ).catch(err => log.error({ err }, 'vitality.assessed handler failed'))
  })

  // referral.triggered → send outbound webhook to tenant's configured URL
  eventBus.on('referral.triggered', async (payload: {
    tenantId: string
    patientId: string
    referralType: string
    urgency: string
    correlationId: string
  }) => {
    log.info({ patientId: payload.patientId, type: payload.referralType }, 'referral.triggered')
    await deliverReferralWebhook(payload).catch(err =>
      log.error({ err }, 'Referral webhook delivery failed')
    )
  })

  // Invalidate insights cache when new assessments arrive
  eventBus.on('vitality.assessed', async (payload: { tenantId: string }) => {
    try {
      const redis = getRedisClient()
      const keys = await redis.keys(`cohort:${payload.tenantId}:*`)
      if (keys.length > 0) {
        await redis.del(...keys)
        log.debug({ count: keys.length }, 'Insights cache invalidated')
      }
    } catch (_) {}
  })

  log.info('Platform event listeners registered')
}

// ─────────────────────────────────────────────────────────────────
// Outbound webhook delivery (mirrors existing decision.created webhook)
// ─────────────────────────────────────────────────────────────────

async function deliverReferralWebhook(payload: {
  tenantId: string
  patientId: string
  referralType: string
  urgency: string
  correlationId: string
}): Promise<void> {
  // Load tenant webhook config
  const config = await withTenant(payload.tenantId, tc =>
    tc.queryOne(
      `SELECT "webhookUrl", "webhookSecret"
       FROM tenants WHERE id=$1::uuid AND "webhookUrl" IS NOT NULL`,
      [payload.tenantId]
    )
  )
  if (!config?.webhookUrl) return

  const timestamp = String(Date.now())
  const body = JSON.stringify({
    eventType: 'referral.triggered',
    payload: {
      ...payload,
      timestamp: new Date().toISOString(),
    },
  })

  const { createHmac } = await import('node:crypto')
  const signature = `sha256=${createHmac('sha256', config.webhookSecret).update(`${timestamp}.${body}`).digest('hex')}`

  const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch })) as any

  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vytalix-Event':     'referral.triggered',
      'X-Vytalix-Timestamp': timestamp,
      'X-Vytalix-Signature': signature,
      'X-Vytalix-Tenant':    payload.tenantId,
    },
    body,
    signal: AbortSignal.timeout(5000),
  })
}
