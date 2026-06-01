// =============================================================================
// Vytalix Data Contracts — v1.0
// Canonical TypeScript interfaces for all cross-boundary entities.
//
// VERSIONING STRATEGY:
//   - v1   → stable, production. Changes here are BREAKING.
//   - v1_1 → additive extensions only (new optional fields).
//             Consumers that ignore unknown fields are forward-compatible.
//   - v2   → breaking changes, new major version (future).
//
// RULE: Never remove or rename a field in the same version.
//       New required fields → bump major version.
//       New optional fields → bump minor version (v1 → v1_1).
//
// BACKWARD COMPATIBILITY:
//   All v1 types are structurally compatible with v1_1 consumers.
//   v1 consumers receiving v1_1 payloads ignore unknown fields safely
//   (standard TypeScript structural typing + JSON deserialization).
// =============================================================================

// ─────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────

/** ISO-8601 datetime string. Always UTC. */
export type ISODateTime = string

/** UUID v4 string */
export type UUID = string

/** LOINC code string e.g. "2089-1" */
export type LoincCode = string

/** UCUM unit string e.g. "mg/dL", "mmHg" */
export type UcumUnit = string

export type PlanTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
export type OrgType = 'HOSPITAL' | 'CLINIC' | 'PRIVATE_PRACTICE' | 'RESEARCH_CENTER'
export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'PHYSICIAN' | 'CARE_COORDINATOR' | 'VIEWER'
export type BiologicalSex = 'MALE' | 'FEMALE' | 'INTERSEX'
export type PatientStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED'
export type ObservationSource = 'EMR_IMPORT' | 'LAB_IMPORT' | 'MANUAL_ENTRY' | 'PATIENT_REPORTED' | 'DEVICE_SYNC' | 'FHIR_IMPORT'
export type RiskScoreType = 'CARDIOVASCULAR_10Y'
export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
export type ClinicalDomain = 'CARDIOVASCULAR' | 'METABOLIC' | 'PREVENTIVE' | 'LONGEVITY' | 'ONCOLOGY'
export type Urgency = 'ROUTINE' | 'SOON' | 'URGENT' | 'CRITICAL'
export type RecommendationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'DEFERRED' | 'EXPIRED' | 'SUPERSEDED'
export type ConfidenceTier = 'high' | 'medium' | 'low'
export type TrendDirection = 'RISING' | 'FALLING' | 'STABLE' | 'INSUFFICIENT_DATA'

// ─────────────────────────────────────────────────────────────────
// CONTRACT: Patient
// ─────────────────────────────────────────────────────────────────

/** Stable identifier fields shared across all Patient representations */
export interface PatientCore {
  readonly id: UUID
  readonly tenantId: UUID
  readonly organizationId: UUID
  readonly mrn: string
  readonly status: PatientStatus
}

/** Demographic data — PII, always tenant-scoped */
export interface PatientDemographics {
  readonly firstName: string
  readonly lastName: string
  readonly dateOfBirth: string   // ISO date "YYYY-MM-DD"
  readonly biologicalSex: BiologicalSex
}

/** Full patient contract as returned by API */
export interface PatientV1 extends PatientCore, PatientDemographics {
  readonly enrolledAt: ISODateTime
  readonly healthSnapshot: PatientHealthSnapshotV1 | null
}

/** Aggregated latest clinical values — computed, never directly input */
export interface PatientHealthSnapshotV1 {
  readonly latestSystolicBp: number | null
  readonly latestDiastolicBp: number | null
  readonly latestLdlMgDl: number | null
  readonly latestHdlMgDl: number | null
  readonly latestTotalCholesterol: number | null
  readonly latestFastingGlucose: number | null
  readonly isSmoker: boolean | null
  readonly hasDiabetes: boolean | null
  readonly isOnAntihypertensives: boolean | null
  readonly ageAtSnapshot: number | null
  readonly lastObservationAt: ISODateTime | null
  readonly snapshotVersion: number
  readonly dataCompleteness: DataCompletenessV1
}

export interface DataCompletenessV1 {
  readonly overall: number           // 0–100
  readonly cardiovascular: number    // 0–100
  readonly missingCritical: string[] // field names
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: ClinicalObservation
// ─────────────────────────────────────────────────────────────────

export interface ClinicalObservationV1 {
  readonly id: UUID
  readonly tenantId: UUID
  readonly patientId: UUID
  readonly loincCode: LoincCode
  readonly displayName: string
  readonly valueNumeric: number | null
  readonly valueText: string | null
  readonly unit: UcumUnit | null
  readonly normalizedValue: number | null  // after unit conversion to canonical
  readonly normalizedUnit: UcumUnit | null
  readonly refRangeLow: number | null
  readonly refRangeHigh: number | null
  readonly sourceSystem: ObservationSource
  readonly isCorrection: boolean
  readonly observedAt: ISODateTime
  readonly ingestedAt: ISODateTime
  readonly validationWarnings: string[]
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: RiskScore
// ─────────────────────────────────────────────────────────────────

export interface RiskScoreV1 {
  readonly id: UUID
  readonly tenantId: UUID
  readonly patientId: UUID
  readonly scoreType: RiskScoreType
  readonly value: number           // 0.0–1.0 probability
  readonly valuePercent: number    // 0.0–100.0 for display
  readonly riskCategory: RiskCategory
  readonly algorithmId: string
  readonly algorithmVersion: string
  readonly inputSnapshot: RiskScoreInputSnapshotV1
  readonly computedAt: ISODateTime
  readonly dataQuality: RiskScoreDataQualityV1
}

export interface RiskScoreInputSnapshotV1 {
  readonly age: number
  readonly totalCholesterol: number
  readonly hdlCholesterol: number
  readonly systolicBp: number
  readonly isOnAntihypertensives: boolean
  readonly isSmoker: boolean
  readonly hasDiabetes: boolean
  readonly biologicalSex: BiologicalSex
}

export interface RiskScoreDataQualityV1 {
  readonly completeness: number         // 0–100
  readonly missingInputs: string[]
  readonly stalestDataPointDate: ISODateTime | null
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: DecisionTrace (Explainability)
// ─────────────────────────────────────────────────────────────────

export interface DecisionTraceV1 {
  readonly id: UUID
  readonly tenantId: UUID
  readonly recommendationId: UUID
  readonly engineVersion: string
  readonly rulesFired: RuleFiredEntryV1[]
  readonly riskScoreSnapshot: RiskScoreSnapshotRefV1 | null
  readonly patientSnapshotAtDecision: PatientHealthSnapshotV1
  readonly explanation: ClinicalExplanationV1
  readonly tracedAt: ISODateTime
}

export interface RuleFiredEntryV1 {
  readonly ruleId: string
  readonly ruleName: string
  readonly passed: boolean
  readonly conditionField: string
  readonly patientValue: number | boolean | string | null
  readonly threshold: number | boolean | string | [number, number] | null
  readonly operator: string
  readonly clinicalWeight: number
}

export interface ClinicalExplanationV1 {
  readonly summary: string
  readonly primaryFactors: string[]
  readonly cautionFactors: string[]
  readonly missingData: string[]
  readonly confidence: ConfidenceTier
  readonly evidenceGrade?: string
  readonly guidelineReference?: string
}

export interface RiskScoreSnapshotRefV1 {
  readonly scoreType: RiskScoreType
  readonly valuePercent: number
  readonly riskCategory: RiskCategory
  readonly computedAt: ISODateTime
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: Recommendation
// ─────────────────────────────────────────────────────────────────

export interface RecommendationV1 {
  readonly id: UUID
  readonly tenantId: UUID
  readonly patientId: UUID
  readonly category: ClinicalDomain
  readonly urgency: Urgency
  readonly title: string
  readonly body: string
  readonly status: RecommendationStatus
  readonly assignedTo: UUID | null
  readonly reviewedBy: UUID | null
  readonly reviewedAt: ISODateTime | null
  readonly reviewNote: string | null
  readonly riskScoreRef: RiskScoreSnapshotRefV1 | null
  readonly createdAt: ISODateTime
  readonly expiresAt: ISODateTime | null
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: Timeline event (aggregate read model)
// ─────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'OBSERVATION'
  | 'RISK_SCORE'
  | 'RECOMMENDATION'
  | 'RECOMMENDATION_REVIEWED'

export interface TimelineEventV1 {
  readonly eventType: TimelineEventType
  readonly occurredAt: ISODateTime
  readonly data: ClinicalObservationV1 | RiskScoreV1 | RecommendationV1
}

export interface PatientTimelineV1 {
  readonly patientId: UUID
  readonly from: ISODateTime
  readonly to: ISODateTime
  readonly events: TimelineEventV1[]
  readonly summary: TimelineSummaryV1
}

export interface TimelineSummaryV1 {
  readonly observationCount: number
  readonly riskScoreCount: number
  readonly recommendationCount: number
  readonly pendingRecommendations: number
  readonly latestRiskCategory: RiskCategory | null
  readonly riskTrend: TrendDirection
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: API envelope (standard wrapper for all responses)
// ─────────────────────────────────────────────────────────────────

export interface ApiResponseV1<T> {
  readonly data: T
  readonly meta: ApiMetaV1
}

export interface ApiMetaV1 {
  readonly correlationId: UUID
  readonly contractVersion: '1.0' | '1.1'
  readonly timestamp: ISODateTime
}

export interface PaginatedResponseV1<T> extends ApiResponseV1<T[]> {
  readonly pagination: PaginationV1
}

export interface PaginationV1 {
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly hasNext: boolean
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT: Error (RFC 7807 Problem Details)
// ─────────────────────────────────────────────────────────────────

export interface ProblemDetailV1 {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly instance: string
  readonly correlationId: UUID
  readonly errors?: Array<{ field: string; code: string; message: string }>
}

// ─────────────────────────────────────────────────────────────────
// CONTRACT VERSION DISCRIMINATOR
// Used for runtime contract negotiation via Accept header
// ─────────────────────────────────────────────────────────────────

export const CONTRACT_VERSION = '1.0' as const
export type ContractVersion = '1.0' | '1.1'
