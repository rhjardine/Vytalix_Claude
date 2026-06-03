// =============================================================================
// ReferralEngine
// Evaluates clinical + engagement signals → generates premium referral CTAs.
// Revenue-share tracking: every referral_event links to convertedValue.
//
// Trigger hierarchy (evaluated in order, first match wins):
//   1. CRITICAL bio age delta (>7 years older) → urgent consultation
//   2. HIGH cardiovascular risk + no recent appointment → specialist referral
//   3. Moderate bio age delta (5–7 years) + high engagement → consultation
//   4. Lab gaps overdue (>180 days) → lab panel referral
//   5. Low engagement + >30 days inactivity → re-engagement program
// =============================================================================

import { withTenant } from '../lib/db'
import { logger } from '../lib/logger'
import { eventBus } from '../events/event-bus'

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

export interface ReferralCTA {
  referralType: string
  urgency: string
  triggerReason: string
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

export class ReferralEngine {

  async evaluate(ctx: ReferralTriggerContext): Promise<ReferralCTA | null> {
    const log = logger.child({ fn: 'ReferralEngine', patientId: ctx.patientId })

    const cta = this.selectTrigger(ctx)
    if (!cta) {
      log.debug('No referral trigger matched')
      return null
    }

    // Persist referral event
    await this.persistReferral(ctx, cta)

    // Emit for webhook delivery to Disglobal
    eventBus.emit('referral.triggered', {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      referralType: cta.referralType,
      urgency: cta.urgency,
      correlationId: ctx.correlationId,
    })

    log.info({ referralType: cta.referralType, urgency: cta.urgency }, 'Referral triggered')
    return cta
  }

  // ── Trigger evaluation ────────────────────────────────────────────

  private selectTrigger(ctx: ReferralTriggerContext): ReferralCTA | null {
    const delta = ctx.differentialAge ?? 0
    const cvRisk = ctx.cvRiskCategory ?? 'LOW'
    const daysSinceLab = ctx.daysSinceLastLab ?? 0

    // T-1: Critical bio age gap (>7 years older)
    if (delta >= 7) {
      return {
        referralType: 'PREMIUM_CONSULT',
        urgency: 'URGENT',
        triggerReason: 'differential_age_critical',
        ctaPayload: {
          headline: `Tu edad biológica supera en ${Math.round(delta)} años a la cronológica`,
          subheadline: 'Este nivel de envejecimiento acelerado requiere atención especializada',
          ctaLabel: 'Agenda tu consulta prioritaria',
          ctaUrl: this.buildCtaUrl(ctx.patientId, 'premium_consult_urgent'),
          urgencyLabel: '⚡ Cupos urgentes disponibles',
          valueProposition: 'Una intervención a tiempo puede revertir hasta 7 años de envejecimiento acelerado',
        },
      }
    }

    // T-2: High/Very High CV risk
    if (cvRisk === 'HIGH' || cvRisk === 'VERY_HIGH') {
      return {
        referralType: 'SPECIALIST_REFERRAL',
        urgency: 'SOON',
        triggerReason: `cv_risk_${cvRisk.toLowerCase()}`,
        ctaPayload: {
          headline: 'Tu riesgo cardiovascular requiere evaluación especializada',
          subheadline: 'El análisis de riesgo detectó indicadores que requieren atención médica',
          ctaLabel: 'Hablar con un cardiólogo preventivo',
          ctaUrl: this.buildCtaUrl(ctx.patientId, 'cardio_specialist'),
          urgencyLabel: 'Próxima disponibilidad esta semana',
          valueProposition: 'La prevención cardiovascular reduce el riesgo de infarto hasta un 50%',
        },
      }
    }

    // T-3: Moderate bio age delta (5–7 yrs) — high engagement
    if (delta >= 5 && (ctx.engagementTier === 'CHAMPION' || ctx.engagementTier === 'ENGAGED')) {
      return {
        referralType: 'PREMIUM_CONSULT',
        urgency: 'SOON',
        triggerReason: 'differential_age_moderate_high_engagement',
        ctaPayload: {
          headline: 'Estás listo para el siguiente nivel de longevidad',
          subheadline: `Tu edad biológica muestra un diferencial de ${Math.round(delta)} años — hay margen de mejora`,
          ctaLabel: 'Consulta con Doctor Antivejez',
          ctaUrl: this.buildCtaUrl(ctx.patientId, 'premium_consult'),
          urgencyLabel: 'Disponibilidad limitada este mes',
          valueProposition: 'Protocolo personalizado de longevidad con seguimiento mensual',
        },
      }
    }

    // T-4: Labs overdue (>180 days)
    if (daysSinceLab >= 180) {
      return {
        referralType: 'LAB_PANEL',
        urgency: 'ROUTINE',
        triggerReason: 'labs_overdue_180d',
        ctaPayload: {
          headline: 'Tus marcadores de salud necesitan actualización',
          subheadline: `Han pasado ${Math.round(daysSinceLab / 30)} meses desde tus últimos análisis`,
          ctaLabel: 'Solicitar panel de longevidad',
          ctaUrl: this.buildCtaUrl(ctx.patientId, 'lab_panel'),
          urgencyLabel: 'Resultados en 48 horas',
          valueProposition: 'Panel completo: lipídico + metabólico + marcadores de envejecimiento',
        },
      }
    }

    return null
  }

  private buildCtaUrl(patientId: string, campaign: string): string {
    // In production: generate signed trackable URL with referral token
    const token = Buffer.from(`${patientId}:${campaign}:${Date.now()}`).toString('base64url')
    return `https://doctorantivejez.com/ref/${campaign}?t=${token}`
  }

  private async persistReferral(ctx: ReferralTriggerContext, cta: ReferralCTA) {
    await withTenant(ctx.tenantId, (tc) =>
      tc.execute(
        `INSERT INTO referral_events (
           id, "tenantId", "patientId",
           "referralType", urgency, "triggerReason",
           "triggerPayload", "ctaPayload",
           status, "generatedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid,
           $3, $4, $5, $6::jsonb, $7::jsonb,
           'GENERATED', NOW()
         )`,
        [
          ctx.tenantId, ctx.patientId,
          cta.referralType, cta.urgency, cta.triggerReason,
          JSON.stringify(ctx),
          JSON.stringify(cta.ctaPayload),
        ]
      )
    )
  }
}
