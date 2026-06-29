// =============================================================================
// BiologicalAgeService
// Orchestrates: boards loading → engine compute → persist → cache
// All assessment types: BIOPHYSICS | BIOCHEMISTRY | ORTHOMOLECULAR | GENETIC
//
// Design contracts:
//   - assessments are immutable (INSERT only, never UPDATE)
//   - boards loaded from DB with Redis fallback
//   - result cached in Redis (TTL 6h, keyed by patientId)
//   - pipeline event emitted after persist for async score recompute
// =============================================================================

import { BiophysicsEngine, BiophysicsMeasurements, BiologicalSex, BoardData } from './biophysics-engine'
import { withTenant } from '../platform/db'
import { logger, clinicalLog } from '../platform/logger'
import { getRedisClient } from '../platform/redis'
import { eventBus } from '../platform/event-bus'
import { z } from 'zod'

// ─── Input schemas ────────────────────────────────────────────────

const DimensionalSchema = z.object({
  high:  z.number().positive(),
  long:  z.number().positive(),
  width: z.number().positive(),
})

export const BiophysicsAssessRequestSchema = z.object({
  patientId:        z.string().uuid(),
  chronologicalAge: z.number().min(18).max(120),
  biologicalSex:    z.enum(['MALE', 'FEMALE', 'INTERSEX']),
  isAthlete:        z.boolean().default(false),
  measurements: z.object({
    fatPercentage:        z.number().min(2).max(70),
    bmi:                  z.number().min(10).max(80),
    digitalReflexes:      DimensionalSchema,
    visualAccommodation:  z.number().min(0).max(20),
    staticBalance:        DimensionalSchema,
    skinHydration:        z.number().min(0).max(100),
    systolicPressure:     z.number().min(60).max(250),
    diastolicPressure:    z.number().min(40).max(150),
  }),
  conductedBy: z.string().uuid().optional(),
  notes:       z.string().max(1000).optional(),
})

export type BiophysicsAssessRequest = z.infer<typeof BiophysicsAssessRequestSchema>

export interface BiophysicsAssessResult {
  assessmentId:    string
  biologicalAge:   number
  differentialAge: number
  ageStatus:       string
  partialAges:     Record<string, number>
  algorithmVersion: string
  assessedAt:      Date
}

// ─── Cache helpers ────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 6 * 60 * 60 // 6h
const BOARDS_CACHE_TTL  = 24 * 60 * 60 // 24h

function vitalityCacheKey(tenantId: string, patientId: string): string {
  return `vitality:${tenantId}:${patientId}:latest`
}

function boardsCacheKey(tenantId: string, sex: string, isAthlete: boolean): string {
  return `baremos:${tenantId}:biophysics:${sex}:${isAthlete ? 'athlete' : 'standard'}`
}

// ─────────────────────────────────────────────────────────────────

export class BiologicalAgeService {
  private engine = new BiophysicsEngine()

  // ── Public: assess biophysical age ───────────────────────────────

  async assessBiophysics(
    tenantId: string,
    req: BiophysicsAssessRequest,
    correlationId: string
  ): Promise<BiophysicsAssessResult> {
    const log = logger.child({ correlationId, tenantId, patientId: req.patientId, fn: 'BioAgeSvc' })

    // 1. Validate patient exists in this tenant
    const patient = await this.requirePatient(tenantId, req.patientId)

    // 2. Load baremos (boards)
    const boards = await this.loadBoards(tenantId, req.biologicalSex, req.isAthlete, log)

    // 3. Run engine
    const engineResult = this.engine.compute(
      req.measurements as BiophysicsMeasurements,
      req.chronologicalAge,
      req.biologicalSex as BiologicalSex,
      req.isAthlete,
      boards
    )

    // 4. Persist (immutable)
    const assessmentId = await this.persistAssessment(tenantId, req, engineResult, correlationId)

    // 5. Update patient snapshot (best-effort, not blocking)
    this.updateSnapshotAsync(tenantId, req.patientId, {
      latestBiophysicsAge: engineResult.biologicalAge,
      latestBiophysicsDelta: engineResult.differentialAge,
      lastBiophysicsAt: engineResult.computedAt,
    }).catch(err => log.error({ err }, 'Snapshot update failed (non-fatal)'))

    // 6. Cache result
    const result: BiophysicsAssessResult = {
      assessmentId,
      biologicalAge:    engineResult.biologicalAge,
      differentialAge:  engineResult.differentialAge,
      ageStatus:        engineResult.ageStatus,
      partialAges:      engineResult.partialAges as unknown as Record<string, number>,
      algorithmVersion: engineResult.algorithmVersion,
      assessedAt:       engineResult.computedAt,
    }
    await this.cacheResult(tenantId, req.patientId, result)

    // 7. Emit event → pipeline (async: referral trigger, preventive re-score)
    eventBus.emit('vitality.assessed', {
      tenantId,
      patientId: req.patientId,
      biologicalAge: engineResult.biologicalAge,
      differentialAge: engineResult.differentialAge,
      ageStatus: engineResult.ageStatus,
      correlationId,
    })

    clinicalLog.assessmentCompleted?.({
      correlationId, tenantId,
      patientId: req.patientId,
      biologicalAge: engineResult.biologicalAge,
      differentialAge: engineResult.differentialAge,
    })

    return result
  }

  // ── Public: get latest assessment for patient ─────────────────────

  async getLatest(
    tenantId: string,
    patientId: string
  ): Promise<BiophysicsAssessResult | null> {
    // Try cache first
    try {
      const redis = getRedisClient()
      const cached = await redis.get(vitalityCacheKey(tenantId, patientId))
      if (cached) return JSON.parse(cached)
    } catch (_) { /* cache miss — fall through */ }

    // DB fallback
    return withTenant(tenantId, async (tc) => {
      const row = await tc.queryOne<{ id: string; biologicalAge: number; differentialAge: number; ageStatus: string; partialAgesSnapshot: Record<string, number>; algorithmVersion: string; assessedAt: Date }>(
        `SELECT id, "biologicalAge"::float, "differentialAge"::float,
                "ageStatus", "partialAgesSnapshot", "algorithmVersion", "assessedAt"
         FROM biological_age_assessments
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
           AND "assessmentType"='BIOPHYSICS'
         ORDER BY "assessedAt" DESC LIMIT 1`,
        [tenantId, patientId]
      )
      if (!row) return null

      return {
        assessmentId:    row.id,
        biologicalAge:   row.biologicalAge,
        differentialAge: row.differentialAge,
        ageStatus:       row.ageStatus,
        partialAges:     row.partialAgesSnapshot,
        algorithmVersion: row.algorithmVersion,
        assessedAt:      row.assessedAt,
      }
    })
  }

  // ── Public: history for patient ───────────────────────────────────

  async getHistory(
    tenantId: string,
    patientId: string,
    limit = 10
  ): Promise<Array<{ assessedAt: Date; biologicalAge: number; differentialAge: number; ageStatus: string }>> {
    return withTenant(tenantId, (tc) =>
      tc.queryMany(
        `SELECT "assessedAt", "biologicalAge"::float, "differentialAge"::float, "ageStatus"
         FROM biological_age_assessments
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "assessmentType"='BIOPHYSICS'
         ORDER BY "assessedAt" DESC LIMIT $3`,
        [tenantId, patientId, limit]
      )
    )
  }

  // ── Private: DB helpers ───────────────────────────────────────────

  private async requirePatient(tenantId: string, patientId: string) {
    const p = await withTenant(tenantId, (tc) =>
      tc.queryOne('SELECT id FROM patients WHERE id=$1::uuid AND "tenantId"=$2::uuid', [patientId, tenantId])
    )
    if (!p) throw Object.assign(new Error(`Patient ${patientId} not found`), { statusCode: 404 })
    return p
  }

  private async persistAssessment(
    tenantId: string,
    req: BiophysicsAssessRequest,
    engine: Awaited<ReturnType<BiophysicsEngine['compute']>>,
    correlationId: string
  ): Promise<string> {
    const row = await withTenant(tenantId, (tc) =>
      tc.queryOne<{ id: string }>(
        `INSERT INTO biological_age_assessments (
           id, "tenantId", "patientId",
           "assessmentType", "chronologicalAge",
           "biologicalAge", "differentialAge", "ageStatus",
           "partialAgesSnapshot", "inputSnapshot",
           "algorithmId", "algorithmVersion",
           "conductedBy", notes, "assessedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid,
           'BIOPHYSICS', $3,
           $4, $5, $6,
           $7::jsonb, $8::jsonb,
           'daaa-biophysics', $9,
           $10, $11, NOW()
         ) RETURNING id`,
        [
          tenantId, req.patientId,
          req.chronologicalAge,
          engine.biologicalAge, engine.differentialAge, engine.ageStatus,
          JSON.stringify(engine.partialAges),
          JSON.stringify({ ...req.measurements, biologicalSex: req.biologicalSex, isAthlete: req.isAthlete }),
          engine.algorithmVersion,
          req.conductedBy ?? null, req.notes ?? null,
        ]
      )
    )
    return row.id
  }

  private async loadBoards(
    tenantId: string,
    sex: string,
    isAthlete: boolean,
    log: ReturnType<typeof logger.child>
  ): Promise<BoardData[]> {
    const cacheKey = boardsCacheKey(tenantId, sex, isAthlete)

    try {
      const redis = getRedisClient()
      const cached = await redis.get(cacheKey)
      if (cached) {
        log.debug({ cacheKey }, 'Boards cache hit')
        return JSON.parse(cached)
      }
    } catch (_) { /* continue to DB */ }

    try {
      const rows = await withTenant(tenantId, (tc) =>
        tc.queryMany(
          `SELECT "measurementKey", ranges FROM biophysics_boards
           WHERE "tenantId"=$1::uuid AND "biologicalSex"=$2 AND "isAthlete"=$3 AND "isActive"=true`,
          [tenantId, sex, isAthlete]
        )
      )

      if (rows.length > 0) {
        const boards: BoardData[] = rows.map((r: any) => ({
          measurementKey: r.measurementKey,
          ranges: r.ranges,
        }))

        // Cache boards for 24h
        try {
          const redis = getRedisClient()
          await redis.setex(cacheKey, BOARDS_CACHE_TTL, JSON.stringify(boards))
        } catch (_) { /* non-fatal */ }

        return boards
      }
    } catch (err) {
      log.warn({ err }, 'Board load from DB failed — using defaults')
    }

    // Fall back to engine defaults (no boards passed)
    return []
  }

  private async cacheResult(tenantId: string, patientId: string, result: BiophysicsAssessResult) {
    try {
      const redis = getRedisClient()
      await redis.setex(
        vitalityCacheKey(tenantId, patientId),
        CACHE_TTL_SECONDS,
        JSON.stringify(result)
      )
    } catch (_) { /* cache write failure is non-fatal */ }
  }

  private async updateSnapshotAsync(
    tenantId: string,
    patientId: string,
    fields: Record<string, unknown>
  ) {
    // Extend patient_health_snapshots with biophysics fields
    // (columns added via migration after schema-extensions.prisma applied)
    await withTenant(tenantId, (tc) =>
      tc.execute(
        `UPDATE patient_health_snapshots
         SET "latestBiophysicsAge"=$3,
             "latestBiophysicsDelta"=$4,
             "lastBiophysicsAt"=$5,
             "snapshotVersion"="snapshotVersion"+1,
             "updatedAt"=NOW()
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
        [
          tenantId, patientId,
          fields.latestBiophysicsAge, fields.latestBiophysicsDelta, fields.lastBiophysicsAt,
        ]
      )
    )
  }
}
