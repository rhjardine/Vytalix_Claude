// =============================================================================
// Vytalix Data Contracts — v1.1 (additive only — no breaking changes vs v1)
//
// New optional fields added:
//   PatientV1_1      → biologicalAgeEstimate, externalIds
//   RiskScoreV1_1    → percentileInCohort (anonymized cohort context)
//   TimelineV1_1     → ldlTrend, systolicTrend on summary
//
// v1 consumers receiving v1.1 payloads: safe — they ignore unknown fields.
// v1.1 consumers receiving v1 payloads: safe — new fields are optional.
// =============================================================================

import type {
  PatientV1,
  RiskScoreV1,
  PatientTimelineV1,
  TimelineSummaryV1,
  TrendDirection,
  ISODateTime,
} from '../shared/contracts-v1'

export * from '../shared/contracts-v1'  // re-export everything from v1

// ─────────────────────────────────────────────────────────────────
// Extended Patient — adds biological age and external system IDs
// ─────────────────────────────────────────────────────────────────

export interface BiologicalAgeEstimateV1_1 {
  readonly chronologicalAge: number
  readonly biologicalAge: number
  readonly delta: number
  readonly algorithm: string
  readonly computedAt: ISODateTime
}

export interface PatientV1_1 extends PatientV1 {
  readonly biologicalAgeEstimate?: BiologicalAgeEstimateV1_1
  readonly externalIds?: Record<string, string>
}

// ─────────────────────────────────────────────────────────────────
// Extended RiskScore — adds cohort percentile for clinical context
// ─────────────────────────────────────────────────────────────────

export interface RiskScoreV1_1 extends RiskScoreV1 {
  /**
   * Percentile of this score within the tenant's cohort of same sex+ageGroup.
   * Anonymized aggregate — no individual patient data exposed.
   * null = cohort too small (<50 patients) to compute safely.
   */
  readonly percentileInCohort?: number | null
}

// ─────────────────────────────────────────────────────────────────
// Extended Timeline — adds per-marker trends
// ─────────────────────────────────────────────────────────────────

export interface TimelineSummaryV1_1 extends TimelineSummaryV1 {
  readonly ldlTrend?: TrendDirection
  readonly systolicTrend?: TrendDirection
  readonly glucoseTrend?: TrendDirection
}

export interface PatientTimelineV1_1 extends Omit<PatientTimelineV1, 'summary'> {
  readonly summary: TimelineSummaryV1_1
}

// ─────────────────────────────────────────────────────────────────
// Version tag
// ─────────────────────────────────────────────────────────────────
export const CONTRACT_VERSION_1_1 = '1.1' as const
