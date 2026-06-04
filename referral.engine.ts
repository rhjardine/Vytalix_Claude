// =============================================================================
// ReferralEngine
// Evaluates clinical + engagement signals → generates premium referral CTAs.
// Revenue-share tracking: every referral_event links to convertedValue.
//
// Pure trigger-selection logic is exported as `selectReferralTrigger` for
// direct testing without DB/eventBus dependencies.
//
// Trigger hierarchy (evaluated in order, first match wins):
//   T1. CRITICAL bio age delta (≥7 years older) → urgent consultation
//   T2. HIGH cardiovascular risk + no recent appointment → specialist referral
//   T3. Moderate bio age delta (5–7 years) + high engagement → consultation
//   T4. Lab gaps overdue (>180 days) → lab panel referral
//   (no match) → null — no CTA generated
// =============================================================================

import { withTenant } from './db'
import { logger } from './logger'
import { eventBus } from './event-bus'

export const REFERRAL_ALGORITHM_VERSION = 'referral-engine-v1.1.0'

export interface ReferralTriggerContext {
  tenantId: string
  patientId: string
  correlationId: string
  differentialAge?: number
  cvRiskCategory?: string
  engagementTier?: string
  daysSinceLastLab?: number
  compositeScore?: number
}

/** The pure inputs that were evaluated — stored verbatim for audit/replay. */
export interface ReferralInputSnapshot {
  differentialAge: number
  cvRiskCategory: string
  engagementTier: string | undefined
  daysSinceLastLab: number
  compositeScore: number | undefined
}

export interface ReferralCTA {
  referralType: string
  urgency: 'URGENT' | 'SOON' | 'ROUTINE'
  triggerReason: string
  triggerCode: 'T1' | 'T2' | 'T3' | 'T4'   // Explicit trigger identifier for traceability
  algorithmVersion: string
  inputSnapshot: ReferralInputSnapshot
  ctaPayload: {
    headline: string
    subheadline: string
    ctaLabel: string
    ctaUrl: string
    urgencyLabel: string
    valueProposition: string
  }
}

// ─────────────────────────────────────────────────────────────────
// Pure helper — URL builder
// ─────────────────────────────────────────────────────────────────

/**
 * Builds a signed trackable CTA URL.
 * @param patientId - Patient identifier
 * @param campaign  - Campaign slug
 * @param nowMs     - Injectable timestamp (use Date.now() in production, fixed value in tests)
 */
export function buildCtaUrl(patientId: string, campaign: string, nowMs: number): string {
  const token = Buffer.from(`${patientId}:${campaign}:${nowMs}`).toString('base64url')
  return `https://doctorantivejez.com/ref/${campaign}?t=${token}`
}

// ─────────────────────────────────────────────────────────────────
// Pure function — trigger evaluation
// ─────────────────────────────────────────────────────────────────

/**
 * Evaluates clinical + engagement signals and returns the highest-priority
 * ReferralCTA, or `null` if no trigger matches.
 *
 * This is a **pure function**: no I/O, no logging, no side effects.
 * Given the same inputs it always returns the same output.
 *
 * Trigger priority (first match wins):
 *   T1 → T2 → T3 → T4 → null
 *
 * @param ctx   - Evaluated context (all clinical signals)
 * @param nowMs - Injectable clock (ms since epoch) for deterministic URL tokens
 */
export function selectReferralTrigger(
  ctx: ReferralTriggerContext,
  nowMs: number
): ReferralCTA | null {
  const delta        = ctx.differentialAge ?? 0
  const cvRisk       = ctx.cvRiskCategory ?? 'LOW'
  const daysSinceLab = ctx.daysSinceLastLab ?? 0

  const inputSnapshot: ReferralInputSnapshot = {
    differentialAge:  delta,
    cvRiskCategory:   cvRisk,
    engagementTier:   ctx.engagementTier,
    daysSinceLastLab: daysSinceLab,
    compositeScore:   ctx.compositeScore,
  }

  // T1: Critical bio age gap (≥7 years older)
  if (delta >= 7) {
    return {
      referralType: 'PREMIUM_CONSULT',
      urgency: 'URGENT',
      triggerReason: 'differential_age_critical',
      triggerCode: 'T1',
      algorithmVersion: REFERRAL_ALGORITHM_VERSION,
      inputSnapshot,
      ctaPayload: {
        headline:         `Tu edad biológica supera en ${Math.round(delta)} años a la cronológica`,
        subheadline:      'Este nivel de envejecimiento acelerado requiere atención especializada',
        ctaLabel:         'Agenda tu consulta prioritaria',
        ctaUrl:           buildCtaUrl(ctx.patientId, 'premium_consult_urgent', nowMs),
        urgencyLabel:     '⚡ Cupos urgentes disponibles',
        valueProposition: 'Una intervención a tiempo puede revertir hasta 7 años de envejecimiento acelerado',
      },
    }
  }

  // T2: High/Very High CV risk
  if (cvRisk === 'HIGH' || cvRisk === 'VERY_HIGH') {
    return {
      referralType: 'SPECIALIST_REFERRAL',
      urgency: 'SOON',
      triggerReason: `cv_risk_${cvRisk.toLowerCase()}`,
      triggerCode: 'T2',
      algorithmVersion: REFERRAL_ALGORITHM_VERSION,
      inputSnapshot,
      ctaPayload: {
        headline:         'Tu riesgo cardiovascular requiere evaluación especializada',
        subheadline:      'El análisis de riesgo detectó indicadores que requieren atención médica',
        ctaLabel:         'Hablar con un cardiólogo preventivo',
        ctaUrl:           buildCtaUrl(ctx.patientId, 'cardio_specialist', nowMs),
        urgencyLabel:     'Próxima disponibilidad esta semana',
        valueProposition: 'La prevención cardiovascular reduce el riesgo de infarto hasta un 50%',
      },
    }
  }

  // T3: Moderate bio age delta (5–6 yrs) AND high engagement required
  if (delta >= 5 && (ctx.engagementTier === 'CHAMPION' || ctx.engagementTier === 'ENGAGED')) {
    return {
      referralType: 'PREMIUM_CONSULT',
      urgency: 'SOON',
      triggerReason: 'differential_age_moderate_high_engagement',
      triggerCode: 'T3',
      algorithmVersion: REFERRAL_ALGORITHM_VERSION,
      inputSnapshot,
      ctaPayload: {
        headline:         'Estás listo para el siguiente nivel de longevidad',
        subheadline:      `Tu edad biológica muestra un diferencial de ${Math.round(delta)} años — hay margen de mejora`,
        ctaLabel:         'Consulta con Doctor Antivejez',
        ctaUrl:           buildCtaUrl(ctx.patientId, 'premium_consult', nowMs),
        urgencyLabel:     'Disponibilidad limitada este mes',
        valueProposition: 'Protocolo personalizado de longevidad con seguimiento mensual',
      },
    }
  }

  // T4: Labs overdue (>180 days)
  if (daysSinceLab >= 180) {
    return {
      referralType: 'LAB_PANEL',
      urgency: 'ROUTINE',
      triggerReason: 'labs_overdue_180d',
      triggerCode: 'T4',
      algorithmVersion: REFERRAL_ALGORITHM_VERSION,
      inputSnapshot,
      ctaPayload: {
        headline:         'Tus marcadores de salud necesitan actualización',
        subheadline:      `Han pasado ${Math.round(daysSinceLab / 30)} meses desde tus últimos análisis`,
        ctaLabel:         'Solicitar panel de longevidad',
        ctaUrl:           buildCtaUrl(ctx.patientId, 'lab_panel', nowMs),
        urgencyLabel:     'Resultados en 48 horas',
        valueProposition: 'Panel completo: lipídico + metabólico + marcadores de envejecimiento',
      },
    }
  }

  // No trigger matched
  return null
}

// ─────────────────────────────────────────────────────────────────
// ReferralEngine — Orchestrator (with I/O: DB persistence + events)
// ─────────────────────────────────────────────────────────────────

export class ReferralEngine {

  async evaluate(ctx: ReferralTriggerContext): Promise<ReferralCTA | null> {
    const log = logger.child({ fn: 'ReferralEngine', patientId: ctx.patientId, correlationId: ctx.correlationId })

    const cta = selectReferralTrigger(ctx, Date.now())

    if (!cta) {
      log.debug({ differentialAge: ctx.differentialAge, cvRiskCategory: ctx.cvRiskCategory }, 'No referral trigger matched')
      return null
    }

    // Persist referral event (including algorithmVersion and inputSnapshot)
    await this.persistReferral(ctx, cta)

    // Emit for webhook delivery to Disglobal
    eventBus.emit('referral.triggered', {
      tenantId:     ctx.tenantId,
      patientId:    ctx.patientId,
      referralType: cta.referralType,
      urgency:      cta.urgency,
      triggerCode:  cta.triggerCode,
      correlationId: ctx.correlationId,
    })

    log.info(
      { referralType: cta.referralType, urgency: cta.urgency, triggerCode: cta.triggerCode, triggerReason: cta.triggerReason },
      'Referral triggered'
    )

    return cta
  }

  // ── Persistence ────────────────────────────────────────────────────

  private async persistReferral(ctx: ReferralTriggerContext, cta: ReferralCTA) {
    await withTenant(ctx.tenantId, (tc) =>
      tc.execute(
        `INSERT INTO referral_events (
           id, "tenantId", "patientId",
           "referralType", urgency, "triggerReason", "triggerCode",
           "triggerPayload", "ctaPayload",
           "algorithmVersion",
           status, "generatedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid,
           $3, $4, $5, $6, $7::jsonb, $8::jsonb,
           $9,
           'GENERATED', NOW()
         )`,
        [
          ctx.tenantId, ctx.patientId,
          cta.referralType, cta.urgency, cta.triggerReason, cta.triggerCode,
          JSON.stringify(cta.inputSnapshot),
          JSON.stringify(cta.ctaPayload),
          cta.algorithmVersion,
        ]
      )
    )
  }
}
