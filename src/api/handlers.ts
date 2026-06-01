// @ts-nocheck
// =============================================================================
// API Route Handlers — uses raw SQL via withTenant() / db.ts
// No Prisma ORM calls — runtime-safe without prisma generate
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { withTenant, writeAuditLog, getDb } from '../lib/db'
import { logger, clinicalLog } from '../lib/logger'
import { IngestionService } from '../ingestion/ingestion.service'
import { RiskScoringService } from '../pipeline/risk-scoring.service'
import { DecisionEngine } from '../decision/decision.engine'
import { TimelineService } from './timeline.service'
import { ExplainabilityService } from '../explainability/explainability.service'
import { publish } from '../events/event-bus'
import {
  wrapResponse, wrapPaginatedResponse,
  mapPatient, mapObservation, mapRiskScore, mapRecommendation, mapDecisionTrace,
} from '../contracts/compat/mappers'

const ingestionService  = new IngestionService()
const riskService       = new RiskScoringService()
const decisionEngine    = new DecisionEngine()
const timelineService   = new TimelineService()
const explainability    = new ExplainabilityService()

// ── Helpers ───────────────────────────────────────────────────────

function getCtx(req: Request) {
  return {
    tenantId:      req.user?.tenant_id ?? req.headers['x-tenant-id'] as string,
    userId:        req.user?.sub ?? 'anonymous',
    correlationId: req.correlationId ?? randomUUID(),
  }
}

function problem(res: Response, status: number, title: string, detail: string, correlationId: string) {
  return res.status(status).json({
    type:  `https://api.vytalix.health/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title, status, detail,
    instance: res.req?.path,
    correlationId,
  })
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next)
}

// ── PATIENTS ──────────────────────────────────────────────────────

export const createPatient = asyncHandler(async (req, res) => {
  const { tenantId, userId, correlationId } = getCtx(req)
  const b = req.body
  if (!b.mrn || !b.firstName || !b.lastName || !b.dateOfBirth || !b.organizationId) {
    return problem(res, 422, 'Validation Failed', 'Required: mrn, firstName, lastName, dateOfBirth, organizationId', correlationId)
  }
  const patient = await withTenant(tenantId, async (tc) => {
    const existing = await tc.queryOne(
      `SELECT id FROM patients WHERE "tenantId" = $1::uuid AND mrn = $2`,
      [tenantId, b.mrn]
    )
    if (existing) { const e: any = new Error('MRN already exists'); e.statusCode = 409; throw e }
    const p = await tc.queryOne(
      `INSERT INTO patients (id,"tenantId","organizationId",mrn,"firstName","lastName","dateOfBirth","biologicalSex",status,"enrolledAt","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,$6::date,$7,'ACTIVE',NOW(),NOW(),NOW())
       RETURNING *`,
      [tenantId, b.organizationId, b.mrn, b.firstName, b.lastName, b.dateOfBirth, b.biologicalSex ?? 'MALE']
    )
    await writeAuditLog(tc, { actorId: userId, actorRole: req.user?.role, resourceType: 'Patient', resourceId: p.id, action: 'CREATE', diff: { after: { mrn: p.mrn } } })
    return p
  })
  publish.patientCreated({ tenantId, correlationId }, { patientId: patient.id, organizationId: patient.organizationId, mrn: patient.mrn })
  res.status(201).json(wrapResponse(mapPatient(patient, null), correlationId))
})

export const listPatients = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 25, 100)
  const offset = (page - 1) * pageSize
  const rows = await withTenant(tenantId, async (tc) => {
    const patients = await tc.queryMany(
      `SELECT p.*, s."latestLdlMgDl"::float, s."latestSystolicBp"::float,
              s."latestHdlMgDl"::float, s."latestFastingGlucose"::float,
              s."ageAtSnapshot", s."isSmoker", s."hasDiabetes", s."isOnAntihypertensives",
              s."lastObservationAt", s."snapshotVersion",
              s."latestTotalCholesterol"::float, s."latestDiastolicBp"::float
       FROM patients p
       LEFT JOIN patient_health_snapshots s ON s."patientId" = p.id
       WHERE p."tenantId" = $1::uuid
       ORDER BY p."enrolledAt" DESC LIMIT $2 OFFSET $3`,
      [tenantId, pageSize, offset]
    )
    const cnt = await tc.queryOne(`SELECT COUNT(*)::int AS n FROM patients WHERE "tenantId" = $1::uuid`, [tenantId])
    return { patients, total: Number(cnt?.n ?? 0) }
  })
  const mapped = rows.patients.map((p: any) => mapPatient(p, p))
  res.json(wrapPaginatedResponse(mapped, rows.total, page, pageSize, correlationId))
})

export const getPatient = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const row = await withTenant(tenantId, async (tc) => tc.queryOne(
    `SELECT p.*, s."latestLdlMgDl"::float, s."latestSystolicBp"::float,
            s."latestHdlMgDl"::float, s."latestFastingGlucose"::float,
            s."ageAtSnapshot", s."isSmoker", s."hasDiabetes", s."isOnAntihypertensives",
            s."lastObservationAt", s."snapshotVersion",
            s."latestTotalCholesterol"::float, s."latestDiastolicBp"::float
     FROM patients p
     LEFT JOIN patient_health_snapshots s ON s."patientId" = p.id
     WHERE p.id = $1::uuid`,
    [req.params.id]
  ))
  if (!row) return problem(res, 404, 'Not Found', `Patient ${req.params.id} not found`, correlationId)
  res.json(wrapResponse(mapPatient(row, row), correlationId))
})

// ── OBSERVATIONS ──────────────────────────────────────────────────

export const ingestObservation = asyncHandler(async (req, res) => {
  const { tenantId, userId, correlationId } = getCtx(req)
  const b = req.body
  if (!b.patientId || !b.loincCode || !b.observedAt || !b.sourceSystem) {
    return problem(res, 422, 'Validation Failed', 'Required: patientId, loincCode, observedAt, sourceSystem', correlationId)
  }
  const result = await ingestionService.ingestSingle(tenantId, userId, { ...b, observedAt: new Date(b.observedAt) }, correlationId)
  publish.observationAdded({ tenantId, correlationId }, {
    observationId: result.observationId, patientId: b.patientId,
    loincCode: b.loincCode, valueNumeric: result.normalizedValue,
    unit: result.normalizedUnit, observedAt: b.observedAt, sourceSystem: b.sourceSystem,
  })
  clinicalLog.observationIngested({ correlationId, tenantId, patientId: b.patientId, loincCode: b.loincCode, value: result.normalizedValue, unit: result.normalizedUnit })
  const obs = await withTenant(tenantId, (tc) => tc.queryOne(`SELECT * FROM clinical_observations WHERE id = $1::uuid`, [result.observationId]))
  res.status(201).json(wrapResponse(mapObservation(obs), correlationId))
})

export const getPatientObservations = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200)
  const offset = (page - 1) * pageSize
  const rows = await withTenant(tenantId, async (tc) => {
    const conditions: string[] = ['"patientId" = $1::uuid', '"isCorrection" = false']
    const params: any[] = [req.params.id]
    if (req.query.loincCode) { params.push(req.query.loincCode); conditions.push(`"loincCode" = $${params.length}`) }
    if (req.query.from)      { params.push(req.query.from);       conditions.push(`"observedAt" >= $${params.length}::timestamptz`) }
    if (req.query.to)        { params.push(req.query.to);         conditions.push(`"observedAt" <= $${params.length}::timestamptz`) }
    const where = conditions.join(' AND ')
    const obs = await tc.queryMany(`SELECT * FROM clinical_observations WHERE ${where} ORDER BY "observedAt" DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, offset])
    const cnt = await tc.queryOne(`SELECT COUNT(*)::int AS n FROM clinical_observations WHERE ${where}`, params)
    return { obs, total: Number(cnt?.n ?? 0) }
  })
  res.json(wrapPaginatedResponse(rows.obs.map(mapObservation), rows.total, page, pageSize, correlationId))
})

// ── RISK ──────────────────────────────────────────────────────────

export const calculateRisk = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const { patientId, forceRecalculate } = req.body
  if (!patientId) return problem(res, 422, 'Validation Failed', 'patientId required', correlationId)

  if (!forceRecalculate) {
    const cached = await withTenant(tenantId, (tc) => tc.queryOne(
      `SELECT * FROM risk_scores WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "scoreType"='CARDIOVASCULAR_10Y' ORDER BY "computedAt" DESC LIMIT 1`,
      [tenantId, patientId]
    ))
    if (cached && (Date.now() - new Date(cached.computedAt).getTime()) < 86400000) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(wrapResponse(mapRiskScore(cached), correlationId))
    }
  }

  res.setHeader('X-Cache', 'MISS')
  const score = await riskService.computeCardiovascularRisk(tenantId, patientId, correlationId)
  if (!score) return problem(res, 422, 'Insufficient Data', 'Insufficient clinical data for risk calculation', correlationId)
  publish.riskScoreComputed({ tenantId, correlationId }, { riskScoreId: score.id, patientId, scoreType: 'CARDIOVASCULAR_10Y', riskCategory: score.riskCategory, valuePercent: Number(score.valuePercent) })
  res.json(wrapResponse(mapRiskScore(score), correlationId))
})

export const getRiskHistory = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
  const scores = await withTenant(tenantId, (tc) => tc.queryMany(
    `SELECT * FROM risk_scores WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid ORDER BY "computedAt" DESC LIMIT $3`,
    [tenantId, req.params.id, limit]
  ))
  const vals = [...scores].reverse().map((s: any) => Number(s.valuePercent))
  const trend = vals.length < 2 ? 'INSUFFICIENT_DATA' : ((vals[vals.length-1]-vals[0])/vals[0]*100) > 5 ? 'DETERIORATING' : ((vals[vals.length-1]-vals[0])/vals[0]*100) < -5 ? 'IMPROVING' : 'STABLE'
  res.json({ ...wrapResponse(scores.map(mapRiskScore), correlationId), trend })
})

// ── DECISIONS ─────────────────────────────────────────────────────

export const generateDecisions = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const { patientId } = req.body
  if (!patientId) return problem(res, 422, 'Validation Failed', 'patientId required', correlationId)
  const result = await decisionEngine.generateForPatient(tenantId, patientId, correlationId)
  for (const rec of result.recommendations) {
    publish.decisionGenerated({ tenantId, correlationId }, { recommendationId: rec.id, patientId, ruleId: rec.ruleId, urgency: rec.urgency, category: 'CARDIOVASCULAR', decisionTraceId: '' })
  }
  res.json(wrapResponse({ generated: result.generated, skipped: result.skipped, recommendations: result.recommendations }, correlationId))
})

export const getPatientDecisions = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 50)
  const offset = (page - 1) * pageSize
  const rows = await withTenant(tenantId, async (tc) => {
    const conditions: string[] = ['"patientId" = $1::uuid']
    const params: any[] = [req.params.id]
    if (req.query.status)  { params.push(req.query.status);  conditions.push(`status = $${params.length}`) }
    if (req.query.urgency) { params.push(req.query.urgency); conditions.push(`urgency = $${params.length}`) }
    const where = conditions.join(' AND ')
    const recs = await tc.queryMany(
      `SELECT r.*, rs."scoreType", rs."valuePercent"::float AS rs_pct, rs."riskCategory" AS rs_cat, rs."computedAt" AS rs_at
       FROM recommendations r
       LEFT JOIN risk_scores rs ON rs.id = r."riskScoreId"
       WHERE ${where} ORDER BY urgency ASC, r."createdAt" DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, pageSize, offset]
    )
    const cnt = await tc.queryOne(`SELECT COUNT(*)::int AS n FROM recommendations WHERE ${where}`, params)
    return { recs, total: Number(cnt?.n ?? 0) }
  })
  res.json(wrapPaginatedResponse(rows.recs.map(mapRecommendation), rows.total, page, pageSize, correlationId))
})

export const getDecisionTrace = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const trace = await withTenant(tenantId, (tc) => tc.queryOne(
    `SELECT * FROM decision_traces WHERE "recommendationId" = $1::uuid`,
    [req.params.id]
  ))
  if (!trace) return problem(res, 404, 'Not Found', `Decision trace for ${req.params.id} not found`, correlationId)
  const enriched = explainability.renderExplanation({ rulesFired: trace.rulesFired, riskScoreSnapshot: trace.riskScoreSnapshot, patientSnapshotAtDecision: trace.patientSnapshotAtDecision, existingExplanation: trace.explanation })
  res.json(wrapResponse({ ...mapDecisionTrace(trace, null), explanation: enriched }, correlationId))
})

export const reviewDecision = asyncHandler(async (req, res) => {
  const { tenantId, userId, correlationId } = getCtx(req)
  const { action, rationaleCode, note } = req.body
  if (!action) return problem(res, 422, 'Validation Failed', 'action required', correlationId)
  const updated = await withTenant(tenantId, async (tc) => {
    const existing = await tc.queryOne(`SELECT status, "patientId" FROM recommendations WHERE id = $1::uuid`, [req.params.id])
    if (!existing) { const e: any = new Error('Not found'); e.statusCode = 404; throw e }
    if (['ACCEPTED','REJECTED'].includes(existing.status)) { const e: any = new Error('Already reviewed'); e.statusCode = 409; throw e }
    const rec = await tc.queryOne(
      `UPDATE recommendations SET status=$1,"reviewedBy"=$2::uuid,"reviewedAt"=NOW(),"reviewNote"=$3 WHERE id=$4::uuid RETURNING *`,
      [action, userId, note ?? null, req.params.id]
    )
    await writeAuditLog(tc, { actorId: userId, actorRole: req.user?.role, resourceType: 'Recommendation', resourceId: req.params.id, action: `REVIEW_${action}`, diff: { before: { status: existing.status }, after: { status: action, rationaleCode } } })
    clinicalLog.decisionReviewed({ correlationId, tenantId, patientId: existing.patientId, decisionId: req.params.id, action, physicianId: userId })
    return rec
  })
  publish.recommendationReviewed({ tenantId, correlationId }, { recommendationId: req.params.id, patientId: updated.patientId, physicianId: userId, action, rationaleCode: rationaleCode ?? null })
  res.json(wrapResponse(mapRecommendation(updated), correlationId))
})

// ── TIMELINE ──────────────────────────────────────────────────────

export const getPatientTimeline = asyncHandler(async (req, res) => {
  const { tenantId, correlationId } = getCtx(req)
  const from  = req.query.from ? new Date(req.query.from as string) : undefined
  const to    = req.query.to   ? new Date(req.query.to as string)   : undefined
  const limit = parseInt(req.query.limit as string) || 500
  const timeline = await timelineService.getPatientTimeline(tenantId, { patientId: req.params.id, from, to, limit }, correlationId)
  res.json(wrapResponse(timeline, correlationId, '1.1'))
})
