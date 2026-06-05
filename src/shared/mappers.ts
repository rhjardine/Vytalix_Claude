// =============================================================================
// Contract Mappers — DB model → wire contract transformation
//
// Every API response goes through a mapper. This isolates the DB schema
// from the public API contract, letting each evolve independently.
//
// Mapping is one-directional: DB → contract (never contract → DB directly).
// Writes always use explicit input validation before DB persistence.
// =============================================================================

import type {
  PatientV1, PatientHealthSnapshotV1, DataCompletenessV1,
  ClinicalObservationV1, RiskScoreV1, RecommendationV1,
  DecisionTraceV1, PatientTimelineV1, TimelineSummaryV1,
  TimelineEventV1, RiskScoreInputSnapshotV1, RiskScoreDataQualityV1,
  TrendDirection, ApiResponseV1, PaginatedResponseV1, ApiMetaV1,
} from './contracts-v1'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────────
// API envelope wrapper — adds correlation ID and version header
// ─────────────────────────────────────────────────────────────────

export function wrapResponse<T>(
  data: T,
  correlationId?: string,
  version: '1.0' | '1.1' = '1.0'
): ApiResponseV1<T> {
  return {
    data,
    meta: buildMeta(correlationId, version),
  }
}

export function wrapPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  correlationId?: string
): PaginatedResponseV1<T> {
  return {
    data,
    pagination: {
      total,
      page,
      pageSize,
      hasNext: page * pageSize < total,
    },
    meta: buildMeta(correlationId),
  }
}

function buildMeta(correlationId?: string, version: '1.0' | '1.1' = '1.0'): ApiMetaV1 {
  return {
    correlationId: correlationId ?? randomUUID(),
    contractVersion: version,
    timestamp: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────
// Patient mapper
// ─────────────────────────────────────────────────────────────────

export function mapPatient(raw: any, snapshot: any | null): PatientV1 {
  return {
    id: raw.id,
    tenantId: raw.tenantId,
    organizationId: raw.organizationId,
    mrn: raw.mrn,
    status: raw.status,
    firstName: raw.firstName,
    lastName: raw.lastName,
    dateOfBirth: raw.dateOfBirth instanceof Date
      ? raw.dateOfBirth.toISOString().split('T')[0]
      : raw.dateOfBirth,
    biologicalSex: raw.biologicalSex,
    enrolledAt: toISO(raw.enrolledAt),
    healthSnapshot: snapshot ? mapSnapshot(snapshot) : null,
  }
}

export function mapSnapshot(raw: any): PatientHealthSnapshotV1 {
  const fields = {
    latestLdlMgDl: toNum(raw.latestLdlMgDl),
    latestHdlMgDl: toNum(raw.latestHdlMgDl),
    latestTotalCholesterol: toNum(raw.latestTotalCholesterol),
    latestSystolicBp: toNum(raw.latestSystolicBp),
    latestDiastolicBp: toNum(raw.latestDiastolicBp),
    latestFastingGlucose: toNum(raw.latestFastingGlucose),
  }

  const criticalFields = ['latestLdlMgDl', 'latestHdlMgDl', 'latestSystolicBp', 'latestFastingGlucose'] as const
  const missing = criticalFields.filter(f => fields[f] === null)
  const cardiovascular = ['latestLdlMgDl', 'latestHdlMgDl', 'latestTotalCholesterol', 'latestSystolicBp'] as const
  const cvMissing = cardiovascular.filter(f => fields[f] === null)

  const dataCompleteness: DataCompletenessV1 = {
    overall: Math.round(((Object.keys(fields).length - missing.length) / Object.keys(fields).length) * 100),
    cardiovascular: Math.round(((cardiovascular.length - cvMissing.length) / cardiovascular.length) * 100),
    missingCritical: missing,
  }

  return {
    ...fields,
    isSmoker: raw.isSmoker ?? null,
    hasDiabetes: raw.hasDiabetes ?? null,
    isOnAntihypertensives: raw.isOnAntihypertensives ?? null,
    ageAtSnapshot: raw.ageAtSnapshot ?? null,
    lastObservationAt: raw.lastObservationAt ? toISO(raw.lastObservationAt) : null,
    snapshotVersion: raw.snapshotVersion ?? 1,
    dataCompleteness,
  }
}

// ─────────────────────────────────────────────────────────────────
// Observation mapper
// ─────────────────────────────────────────────────────────────────

export function mapObservation(raw: any): ClinicalObservationV1 {
  return {
    id: raw.id,
    tenantId: raw.tenantId,
    patientId: raw.patientId,
    loincCode: raw.loincCode,
    displayName: raw.displayName,
    valueNumeric: toNum(raw.valueNumeric),
    valueText: raw.valueText ?? null,
    unit: raw.unit ?? null,
    normalizedValue: toNum(raw.normalizedValue ?? raw.valueNumeric),
    normalizedUnit: raw.normalizedUnit ?? raw.unit ?? null,
    refRangeLow: toNum(raw.refRangeLow),
    refRangeHigh: toNum(raw.refRangeHigh),
    sourceSystem: raw.sourceSystem,
    isCorrection: raw.isCorrection ?? false,
    observedAt: toISO(raw.observedAt),
    ingestedAt: toISO(raw.ingestedAt ?? raw.createdAt),
    validationWarnings: raw.validationWarnings ?? [],
  }
}

// ─────────────────────────────────────────────────────────────────
// RiskScore mapper
// ─────────────────────────────────────────────────────────────────

export function mapRiskScore(raw: any): RiskScoreV1 {
  const inputSnapshot = (raw.inputSnapshot as RiskScoreInputSnapshotV1) ?? {}
  const missingInputs: string[] = []
  const requiredInputs = ['age', 'totalCholesterol', 'hdlCholesterol', 'systolicBp']
  for (const field of requiredInputs) {
    if ((inputSnapshot as any)[field] == null) missingInputs.push(field)
  }

  const dataQuality: RiskScoreDataQualityV1 = {
    completeness: Math.round(((requiredInputs.length - missingInputs.length) / requiredInputs.length) * 100),
    missingInputs,
    stalestDataPointDate: null,
  }

  return {
    id: raw.id,
    tenantId: raw.tenantId,
    patientId: raw.patientId,
    scoreType: raw.scoreType,
    value: toNum(raw.value) ?? 0,
    valuePercent: toNum(raw.valuePercent) ?? 0,
    riskCategory: raw.riskCategory,
    algorithmId: raw.algorithmId,
    algorithmVersion: raw.algorithmVersion,
    inputSnapshot: inputSnapshot as RiskScoreInputSnapshotV1,
    computedAt: toISO(raw.computedAt),
    dataQuality,
  }
}

// ─────────────────────────────────────────────────────────────────
// Recommendation mapper
// ─────────────────────────────────────────────────────────────────

export function mapRecommendation(raw: any): RecommendationV1 {
  return {
    id: raw.id,
    tenantId: raw.tenantId,
    patientId: raw.patientId,
    category: raw.category,
    urgency: raw.urgency,
    title: raw.title,
    body: raw.body,
    status: raw.status,
    assignedTo: raw.assignedTo ?? null,
    reviewedBy: raw.reviewedBy ?? null,
    reviewedAt: raw.reviewedAt ? toISO(raw.reviewedAt) : null,
    reviewNote: raw.reviewNote ?? null,
    riskScoreRef: raw.riskScore ? {
      scoreType: raw.riskScore.scoreType,
      valuePercent: toNum(raw.riskScore.valuePercent) ?? 0,
      riskCategory: raw.riskScore.riskCategory,
      computedAt: toISO(raw.riskScore.computedAt),
    } : null,
    createdAt: toISO(raw.createdAt),
    expiresAt: raw.expiresAt ? toISO(raw.expiresAt) : null,
  }
}

// ─────────────────────────────────────────────────────────────────
// DecisionTrace mapper
// ─────────────────────────────────────────────────────────────────

export function mapDecisionTrace(raw: any, snapshot: any | null): DecisionTraceV1 {
  return {
    id: raw.id,
    tenantId: raw.tenantId,
    recommendationId: raw.recommendationId,
    engineVersion: raw.engineVersion,
    rulesFired: (raw.rulesFired as any[]).map(r => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      passed: r.passed,
      conditionField: r.conditionField,
      patientValue: r.patientValue ?? null,
      threshold: r.threshold ?? null,
      operator: r.operator,
      clinicalWeight: r.clinicalWeight ?? 1.0,
    })),
    riskScoreSnapshot: raw.riskScoreSnapshot ?? null,
    patientSnapshotAtDecision: snapshot
      ? mapSnapshot(snapshot)
      : raw.patientSnapshotAtDecision as any,
    explanation: raw.explanation,
    tracedAt: toISO(raw.tracedAt),
  }
}

// ─────────────────────────────────────────────────────────────────
// Timeline builder — assembles from heterogeneous query results
// ─────────────────────────────────────────────────────────────────

export function buildTimeline(
  patientId: string,
  from: Date,
  to: Date,
  observations: any[],
  riskScores: any[],
  recommendations: any[],
  trend: TrendDirection
): PatientTimelineV1 {
  const events: TimelineEventV1[] = []

  for (const obs of observations) {
    events.push({
      eventType: 'OBSERVATION',
      occurredAt: toISO(obs.observedAt),
      data: mapObservation(obs),
    })
  }

  for (const score of riskScores) {
    events.push({
      eventType: 'RISK_SCORE',
      occurredAt: toISO(score.computedAt),
      data: mapRiskScore(score),
    })
  }

  for (const rec of recommendations) {
    events.push({
      eventType: rec.reviewedAt ? 'RECOMMENDATION_REVIEWED' : 'RECOMMENDATION',
      occurredAt: toISO(rec.reviewedAt ?? rec.createdAt),
      data: mapRecommendation(rec),
    })
  }

  // Sort by time descending (newest first for clinical UI)
  events.sort((a, b) =>
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  )

  const pending = recommendations.filter(r => r.status === 'PENDING').length
  const latestScore = riskScores[0] ?? null

  const summary: TimelineSummaryV1 = {
    observationCount: observations.length,
    riskScoreCount: riskScores.length,
    recommendationCount: recommendations.length,
    pendingRecommendations: pending,
    latestRiskCategory: latestScore?.riskCategory ?? null,
    riskTrend: trend,
  }

  return {
    patientId,
    from: from.toISOString(),
    to: to.toISOString(),
    events,
    summary,
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function toISO(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  return value
}

function toNum(value: any): number | null {
  if (value == null) return null
  const n = typeof value === 'object' && typeof value.toNumber === 'function'
    ? value.toNumber()
    : Number(value)
  return isNaN(n) ? null : n
}
