// =============================================================================
// src/contracts/v2/index.ts — CANONICAL wire contracts for all v2 APIs
// These types are the single source of truth for:
//   - ExternalV2Handler request validation
//   - SDK type definitions
//   - OpenAPI spec generation
//   - Frontend type safety
// =============================================================================

// ─────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────

export type BiologicalSex  = 'MALE' | 'FEMALE' | 'INTERSEX'
export type AgeStatus      = 'REJUVENECIDO' | 'NORMAL' | 'ENVEJECIDO'
export type RiskCategory   = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
export type ScoreTier      = 'OPTIMAL' | 'GOOD' | 'MODERATE_RISK' | 'HIGH_RISK' | 'CRITICAL'
export type EngagementTier = 'CHAMPION' | 'ENGAGED' | 'PASSIVE' | 'AT_RISK' | 'DORMANT'
export type ReferralType   = 'PREMIUM_CONSULT' | 'SPECIALIST_REFERRAL' | 'LAB_PANEL' | 'WELLNESS_PROGRAM' | 'FOLLOW_UP'
export type Urgency        = 'URGENT' | 'SOON' | 'ROUTINE'

export interface DimensionalMeasurement {
  high:  number
  long:  number
  width: number
}

export interface ProblemDetail {
  type:          string
  title:         string
  status:        number
  detail:        string
  correlationId: string
  errors?:       Array<{ field: string; message: string }>
}

// ─────────────────────────────────────────────────────────────────
// API 1: VYTALIX BIOAGE — Biological Age Assessment
// ─────────────────────────────────────────────────────────────────

export interface BiophysicsMeasurements {
  fatPercentage:       number
  bmi:                 number
  digitalReflexes:     DimensionalMeasurement
  visualAccommodation: number
  staticBalance:       DimensionalMeasurement
  skinHydration:       number
  systolicPressure:    number
  diastolicPressure:   number
}

export interface AssessBioAgeRequest {
  /** Disglobal pseudonymous ref OR Vytalix patientId — one required */
  subjectRef?:       string
  patientId?:        string
  chronologicalAge:  number
  biologicalSex:     BiologicalSex
  isAthlete?:        boolean
  measurements:      BiophysicsMeasurements
  conductedBy?:      string    // physician UUID (clinical context)
}

export interface BiophysicsPartialAges {
  fatAge:       number
  bmiAge:       number
  reflexesAge:  number
  visualAge:    number
  balanceAge:   number
  hydrationAge: number
  systolicAge:  number
  diastolicAge: number
}

export interface ReferralCTAPayload {
  headline:         string
  subheadline:      string
  ctaLabel:         string
  ctaUrl:           string
  urgencyLabel:     string
  valueProposition: string
}

export interface AssessBioAgeResponse {
  assessmentId:     string
  biologicalAge:    number
  differentialAge:  number
  ageStatus:        AgeStatus
  /** Human-readable interpretation for consumer-facing apps */
  interpretation:   string
  partialAges:      BiophysicsPartialAges
  riskSignals:      string[]
  referralCTA:      { eligible: boolean; type?: ReferralType; urgency?: Urgency; payload?: ReferralCTAPayload } | null
  algorithmVersion: string
  assessedAt:       string  // ISO 8601
  correlationId:    string
}

// ─────────────────────────────────────────────────────────────────
// API 2: VYTALIX PREVENTIVE SCORE
// ─────────────────────────────────────────────────────────────────

export interface ComputePreventiveScoreRequest {
  subjectRef?: string
  patientId?:  string
  includeComponents?: Array<'cardiovascular' | 'metabolic' | 'biological_age' | 'lifestyle'>
}

export interface ScoreComponent {
  score:   number   // 0–100
  weight:  number   // contribution to composite
  signals: string[] // clinical signals detected
  label:   string   // business-readable label
}

export interface ComputePreventiveScoreResponse {
  scoreId:         string
  compositeScore:  number        // 0–100
  scoreTier:       ScoreTier
  /** Human-readable tier description */
  tierLabel:       string
  components:      Partial<Record<'cardiovascular' | 'metabolic' | 'biologicalAge' | 'lifestyle', ScoreComponent>>
  insufficientData: string[]
  recommendation:  string        // actionable next step for consumer
  computedAt:      string
  algorithmVersion: string
}

// ─────────────────────────────────────────────────────────────────
// API 3: VYTALIX WELLNESS ENGAGEMENT
// ─────────────────────────────────────────────────────────────────

export type EngagementEventType =
  | 'TEST_COMPLETED' | 'TEST_STARTED'
  | 'RECOMMENDATION_VIEWED' | 'RECOMMENDATION_ACKNOWLEDGED'
  | 'GOAL_SET' | 'GOAL_ACHIEVED'
  | 'REPORT_DOWNLOADED'
  | 'REFERRAL_CTA_VIEWED' | 'REFERRAL_CTA_CLICKED'
  | 'SESSION_STARTED' | 'EDUCATION_CONTENT_VIEWED'

export interface EngagementEventPayload {
  type:        EngagementEventType
  payload?:    Record<string, unknown>
  occurredAt?: string  // ISO 8601 — defaults to NOW() if omitted
}

export interface RecordEngagementRequest {
  subjectRef?: string
  patientId?:  string
  events:      EngagementEventPayload[]
  source:      string  // "disglobal_app" | "landing_page" | "partner_x"
}

export interface RecordEngagementResponse {
  accepted:     number
  patientId:    string
  currentTier?: EngagementTier
  streak?:      number
  message:      string
}

// ─────────────────────────────────────────────────────────────────
// API 4: VYTALIX SMART REFERRAL
// ─────────────────────────────────────────────────────────────────

export interface EvaluateReferralResponse {
  eligible:      boolean
  referralType?: ReferralType
  urgency?:      Urgency
  triggerReason?: string
  /** Business-readable urgency label */
  urgencyLabel?: string
  ctaPayload?:   ReferralCTAPayload
  /** Revenue share tracking token */
  referralToken?: string
  evaluatedAt:   string
}

// ─────────────────────────────────────────────────────────────────
// API 5: VYTALIX POPULATION INSIGHTS
// ─────────────────────────────────────────────────────────────────

export interface CohortInsightsRequest {
  ageGroup?:      string    // "30-40" | "40-50" | "50-60" | "60-70"
  biologicalSex?: BiologicalSex
  period?:        'last_30d' | 'last_90d' | 'last_6m' | 'last_12m' | 'ytd'
  assessmentType?: 'BIOPHYSICS' | 'BIOCHEMISTRY' | 'ORTHOMOLECULAR'
}

export interface AgeDistributionBucket {
  bucket:     string
  count:      number
  percentage: number
}

export interface CohortInsightsResponse {
  cohortSize:               number
  avgBiologicalAge:         number
  avgChronologicalAge:      number
  avgDifferential:          number
  medianBiologicalAge:      number
  pctRejuvenecido:          number
  pctNormal:                number
  pctEnvejecido:            number
  biologicalAgeDistribution: AgeDistributionBucket[]
  topRiskSignals:           Array<{ signal: string; count: number; percentage: number }>
  engagementBreakdown:      Record<string, number>
  /** Business-readable cohort health summary */
  summary:                  string
  period:                   string
  generatedAt:              string
  privacyNote:              string
}

// ─────────────────────────────────────────────────────────────────
// BUSINESS MESSAGE BUILDERS
// ─────────────────────────────────────────────────────────────────

export function buildBioAgeInterpretation(biologicalAge: number, chronoAge: number, ageStatus: AgeStatus): string {
  const delta = Math.abs(biologicalAge - chronoAge)
  const rounded = Math.round(delta)
  switch (ageStatus) {
    case 'REJUVENECIDO':
      return `Tu organismo funciona ${rounded} año${rounded !== 1 ? 's' : ''} mejor que tu edad cronológica. ¡Sigue así!`
    case 'NORMAL':
      return 'Tu edad biológica está en línea con tu edad cronológica. Hay espacio para mejorar con intervención preventiva.'
    case 'ENVEJECIDO':
      return `Tu organismo muestra un envejecimiento acelerado de ${rounded} año${rounded !== 1 ? 's' : ''}. Una consulta especializada puede revertir este resultado.`
  }
}

export function buildScoreTierLabel(tier: ScoreTier): string {
  const labels: Record<ScoreTier, string> = {
    OPTIMAL:       'Excelente — perfil de salud preventiva óptimo',
    GOOD:          'Bueno — salud preventiva por encima del promedio',
    MODERATE_RISK: 'Riesgo moderado — se recomienda intervención preventiva',
    HIGH_RISK:     'Riesgo alto — evaluación médica prioritaria',
    CRITICAL:      'Riesgo crítico — consulta médica urgente',
  }
  return labels[tier]
}

export function buildScoreRecommendation(tier: ScoreTier, insufficientData: string[]): string {
  if (insufficientData.length > 0 && tier === 'OPTIMAL') {
    return 'Completa tu perfil de salud con análisis de laboratorio para obtener un score más preciso.'
  }
  const recs: Record<ScoreTier, string> = {
    OPTIMAL:       'Mantén tus hábitos actuales y realiza seguimiento semestral.',
    GOOD:          'Considera un protocolo de optimización preventiva personalizado.',
    MODERATE_RISK: 'Agenda una consulta preventiva en los próximos 30 días.',
    HIGH_RISK:     'Busca evaluación médica esta semana. Los marcadores requieren atención.',
    CRITICAL:      'Consulta médica urgente recomendada. No postergues más de 48 horas.',
  }
  return recs[tier]
}

export function buildEngagementMessage(tier: EngagementTier, streak: number): string {
  if (streak >= 7) return `¡${streak} días de racha activa! Estás en el ${tier === 'CHAMPION' ? 'top 10%' : 'top 25%'} de usuarios.`
  if (tier === 'CHAMPION' || tier === 'ENGAGED') return 'Tu compromiso con la salud preventiva es excelente. Sigue adelante.'
  if (tier === 'PASSIVE') return 'Un pequeño esfuerzo diario marca la diferencia. Completa un test hoy.'
  if (tier === 'AT_RISK') return 'Llevas un tiempo sin actividad. Tu salud te necesita de vuelta.'
  return 'Te esperamos. Cada día es una oportunidad para mejorar tu bienestar.'
}

export function buildCohortSummary(
  avgDiff: number,
  pctRejuvenecido: number,
  pctEnvejecido: number
): string {
  const trend = avgDiff < 0 ? 'más joven' : avgDiff > 1 ? 'más envejecida' : 'acorde a la cronológica'
  return `La cohorte muestra una edad biológica promedio ${trend} a la cronológica. ` +
    `${pctRejuvenecido}% de los sujetos están rejuvenecidos y ${pctEnvejecido}% muestran envejecimiento acelerado.`
}

// ─────────────────────────────────────────────────────────────────
// VERSION MANIFEST
// ─────────────────────────────────────────────────────────────────

export const CONTRACT_VERSION = '2.0.0' as const

export const ALGORITHM_MANIFEST = {
  biophysics:       { id: 'daaa-biophysics',      version: '2.1.0', provider: 'Doctor Antivejez' },
  framingham:       { id: 'framingham-2008',       version: '1.0.0', provider: 'D\'Agostino et al.' },
  preventiveScore:  { id: 'preventive-composite', version: '1.0.0', provider: 'Vytalix' },
  referralEngine:   { id: 'referral-v2',           version: '2.0.0', provider: 'Vytalix' },
} as const
