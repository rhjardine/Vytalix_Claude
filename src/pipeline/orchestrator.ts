// @ts-nocheck
// =============================================================================
// Clinical Pipeline Orchestrator
// Stages: SNAPSHOT_UPDATE → RISK_SCORING → DECISION_GENERATION
// Every stage is resilient — failure logs but does NOT rollback prior stages.
// =============================================================================

import { logger } from '../lib/logger'
import { RiskScoringService } from './risk-scoring.service'
import { DecisionEngine } from '../decision/decision.engine'
import { withTenant } from '../lib/db'

export type PipelineStage = 'SNAPSHOT_UPDATE' | 'RISK_SCORING' | 'DECISION_GENERATION'

export interface PipelineStageResult {
  stage: PipelineStage
  status: 'success' | 'skipped' | 'failed'
  durationMs: number
  detail?: Record<string, unknown>
  error?: string
}

export interface PipelineContext {
  tenantId: string
  patientId: string
  correlationId: string
  triggeredAt: Date
  stages: PipelineStageResult[]
}

export class PipelineOrchestrator {
  private riskService = new RiskScoringService()
  private decisionEngine = new DecisionEngine()

  async runFromObservation(tenantId: string, patientId: string, correlationId: string): Promise<PipelineContext> {
    const ctx: PipelineContext = { tenantId, patientId, correlationId, triggeredAt: new Date(), stages: [] }
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'Pipeline' })
    log.info('Pipeline started')

    // Stage 1: Verify snapshot is current (updated by DB trigger on insert)
    await this.runStage(ctx, 'SNAPSHOT_UPDATE', async () => {
      const snapshot = await withTenant(tenantId, (tc) =>
        tc.queryOne(
          'SELECT "updatedAt", "snapshotVersion" FROM patient_health_snapshots WHERE "patientId"=$1::uuid',
          [patientId]
        )
      )
      if (!snapshot) return { status: 'skipped', detail: { reason: 'No snapshot yet' } }
      return { status: 'success', detail: { version: snapshot.snapshotVersion } }
    })

    // Stage 2: Risk scoring
    await this.runStage(ctx, 'RISK_SCORING', async () => {
      const score = await this.riskService.computeCardiovascularRisk(tenantId, patientId, correlationId)
      if (!score) return { status: 'skipped', detail: { reason: 'Insufficient data' } }
      return { status: 'success', detail: { riskCategory: score.riskCategory, valuePercent: Number(score.valuePercent) } }
    })

    // Stage 3: Decision generation
    await this.runStage(ctx, 'DECISION_GENERATION', async () => {
      const result = await this.decisionEngine.generateForPatient(tenantId, patientId, correlationId)
      return { status: 'success', detail: { generated: result.generated, skipped: result.skipped } }
    })

    const totalMs = Date.now() - ctx.triggeredAt.getTime()
    log.info({ stages: ctx.stages.map(s => ({ stage: s.stage, status: s.status })), totalMs }, 'Pipeline complete')
    return ctx
  }

  private async runStage(
    ctx: PipelineContext,
    stage: PipelineStage,
    fn: () => Promise<{ status: 'success' | 'skipped'; detail?: Record<string, unknown> }>
  ): Promise<void> {
    const start = Date.now()
    try {
      const result = await fn()
      ctx.stages.push({ stage, status: result.status, durationMs: Date.now() - start, detail: result.detail })
    } catch (err) {
      ctx.stages.push({ stage, status: 'failed', durationMs: Date.now() - start, error: (err as Error).message })
      logger.error({ correlationId: ctx.correlationId, stage, err }, `Stage ${stage} failed`)
    }
  }
}
