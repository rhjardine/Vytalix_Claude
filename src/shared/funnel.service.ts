// =============================================================================
// src/funnel/funnel.service.ts
// Public funnel service — NO patient PHI at this stage.
// Leads are anonymous until they book. No clinical decisions — only orientation.
//
// Funnel steps:
//   1. CAPTURED    → lead created with source/UTM
//   2. ASSESSED    → vitality test completed (BioAge engine, no persist to clinical)
//   3. BOOKED      → appointment requested
//   4. CONVERTED   → becomes Patient record (physician handles)
// =============================================================================

import { z } from 'zod'
import { BiophysicsEngine } from '../longevity/biophysics-engine'
import { getDb, withTenant } from '../platform/db'
import { logger, clinicalLog } from '../platform/logger'
import { eventBus } from '../platform/event-bus'
import crypto from 'node:crypto'

// ── Input schemas (public-facing, no PHI required) ────────────────

export const CreateLeadSchema = z.object({
  tenantId:    z.string().uuid().optional(),            // resolved from API key
  email:       z.string().email().optional(),
  phone:       z.string().max(30).optional(),
  firstName:   z.string().max(100).optional(),
  source:      z.string().max(100).default('landing_page'),
  utmSource:   z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmMedium:   z.string().max(100).optional(),
})

export const VitalityAssessmentSchema = z.object({
  leadId:          z.string().uuid(),
  age:             z.number().int().min(18).max(100),
  sex:             z.enum(['MALE', 'FEMALE', 'INTERSEX']),
  isAthlete:       z.boolean().default(false),
  fatPercentage:   z.number().min(2).max(70),
  bmi:             z.number().min(10).max(80),
  digitalReflexes: z.object({ high: z.number().positive(), long: z.number().positive(), width: z.number().positive() }),
  visualAccommodation: z.number().min(0).max(20),
  staticBalance:   z.object({ high: z.number().positive(), long: z.number().positive(), width: z.number().positive() }),
  skinHydration:   z.number().min(0).max(100),
  systolicPressure: z.number().min(60).max(250),
  diastolicPressure: z.number().min(40).max(150),
})

export const CreateBookingSchema = z.object({
  leadId:       z.string().uuid(),
  bookingType:  z.enum(['ONLINE_CONSULT', 'IN_PERSON', 'LAB_PANEL']).default('ONLINE_CONSULT'),
  preferredDate: z.string().optional(),
  timezone:     z.string().max(50).optional(),
  notes:        z.string().max(500).optional(),
})

export type CreateLeadInput        = z.infer<typeof CreateLeadSchema>
export type VitalityAssessmentInput = z.infer<typeof VitalityAssessmentSchema>
export type CreateBookingInput     = z.infer<typeof CreateBookingSchema>

// ── Result types ──────────────────────────────────────────────────

export interface FunnelLeadResult {
  leadId:   string
  status:   string
  step:     string
  token:    string          // short-lived session token for stateless funnel
}

export interface FunnelAssessmentResult {
  assessmentId:    string
  biologicalAge:   number
  differentialAge: number
  ageStatus:       string
  partialAges:     Record<string, number>
  message:         string             // Motivational message for consumer UI
  showCta:         boolean
  cta?: {
    headline:     string
    subheadline:  string
    ctaLabel:     string
    ctaUrl:       string
    urgencyLabel: string
  }
}

export interface FunnelBookingResult {
  bookingId: string
  status:    string
  message:   string
  nextSteps: string[]
}

// ── Engine singleton ──────────────────────────────────────────────

const biophysicsEngine = new BiophysicsEngine()

// ── Service ───────────────────────────────────────────────────────

export class FunnelService {

  // ── Step 1: Create or identify lead ──────────────────────────────

  async createLead(input: CreateLeadInput, tenantId: string, correlationId: string): Promise<FunnelLeadResult> {
    const log = logger.child({ fn: 'FunnelSvc.createLead', correlationId, source: input.source })

    const db = getDb()

    // Upsert by email within tenant (if email provided)
    let leadId: string | null = null

    if (input.email) {
      const existing = await db.rawQueryOne(
        `SELECT id FROM funnel_leads WHERE "tenantId" = $1::uuid AND email = $2 AND status != 'LOST' LIMIT 1`,
        [tenantId, input.email]
      )
      leadId = (existing?.id as string) ?? null
    }

    if (!leadId) {
      const row = await db.rawQueryOne(
        `INSERT INTO funnel_leads (
           id, "tenantId", email, phone, "firstName",
           source, "utmSource", "utmCampaign", "utmMedium",
           status, "currentStep", "lastActivityAt", "createdAt", "updatedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2, $3, $4,
           $5, $6, $7, $8,
           'CAPTURED', 'landing', NOW(), NOW(), NOW()
         ) RETURNING id`,
        [
          tenantId, input.email ?? null, input.phone ?? null, input.firstName ?? null,
          input.source, input.utmSource ?? null, input.utmCampaign ?? null, input.utmMedium ?? null,
        ]
      )
      leadId = row!.id as string
    }

    clinicalLog.funnelLead({ correlationId, email: input.email, source: input.source, step: 'lead_created' })
    eventBus.emit('funnel.lead.created', { correlationId, leadId: leadId!, source: input.source, email: input.email })

    const token = this.generateFunnelToken(leadId!, tenantId)

    return { leadId: leadId!, status: 'CAPTURED', step: 'vitality_test', token }
  }

  // ── Step 2: Vitality assessment (BioAge in funnel context) ────────

  async assessVitality(input: VitalityAssessmentInput, tenantId: string, correlationId: string): Promise<FunnelAssessmentResult> {
    const log = logger.child({ fn: 'FunnelSvc.assessVitality', correlationId, leadId: input.leadId })

    // Verify lead belongs to tenant
    const db = getDb()
    const lead = await db.rawQueryOne(
      `SELECT id, status FROM funnel_leads WHERE id = $1::uuid AND "tenantId" = $2::uuid`,
      [input.leadId, tenantId]
    )
    if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 })

    // Run biophysics engine (same algorithm as clinical, no DB persistence of clinical records)
    const engineResult = biophysicsEngine.compute(
      {
        fatPercentage:       input.fatPercentage,
        bmi:                 input.bmi,
        digitalReflexes:     input.digitalReflexes,
        visualAccommodation: input.visualAccommodation,
        staticBalance:       input.staticBalance,
        skinHydration:       input.skinHydration,
        systolicPressure:    input.systolicPressure,
        diastolicPressure:   input.diastolicPressure,
      },
      input.age,
      input.sex,
      input.isAthlete,
    )

    // Persist funnel assessment (not clinical — no patient record yet)
    const row = await db.rawQueryOne(
      `INSERT INTO funnel_assessments (
         id, "tenantId", "leadId",
         "chronologicalAge", "biologicalAge", "differentialAge", "ageStatus",
         "measurementsSnapshot", "partialAges",
         "ctaShown", "assessedAt"
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid,
         $3, $4, $5, $6,
         $7::jsonb, $8::jsonb,
         $9, NOW()
       ) RETURNING id`,
      [
        tenantId, input.leadId,
        input.age, engineResult.biologicalAge, engineResult.differentialAge, engineResult.ageStatus,
        JSON.stringify({ fatPercentage: input.fatPercentage, bmi: input.bmi, systolicPressure: input.systolicPressure }),
        JSON.stringify(engineResult.partialAges),
        engineResult.differentialAge >= 2,
      ]
    )

    // Update lead step
    await db.rawQuery(
      `UPDATE funnel_leads SET status='ASSESSED', "currentStep"='results', "lastActivityAt"=NOW(), "updatedAt"=NOW() WHERE id=$1::uuid`,
      [input.leadId]
    )

    // CTA logic
    const showCta = engineResult.differentialAge >= 2 || engineResult.ageStatus === 'ENVEJECIDO'
    const cta = showCta ? this.buildFunnelCta(engineResult.differentialAge, engineResult.ageStatus, input.leadId) : undefined

    eventBus.emit('funnel.assessment.completed', {
      correlationId, leadId: input.leadId,
      bioAge: engineResult.biologicalAge,
      delta: engineResult.differentialAge,
    })

    log.info({ bioAge: engineResult.biologicalAge, delta: engineResult.differentialAge, showCta }, 'Funnel assessment done')

    return {
      assessmentId:    row!.id as string,
      biologicalAge:   engineResult.biologicalAge,
      differentialAge: engineResult.differentialAge,
      ageStatus:       engineResult.ageStatus,
      partialAges:     engineResult.partialAges as unknown as Record<string, number>,
      message:         this.buildResultMessage(engineResult.differentialAge, engineResult.ageStatus),
      showCta,
      cta,
    }
  }

  // ── Step 3: Booking request ───────────────────────────────────────

  async createBooking(input: CreateBookingInput, tenantId: string, correlationId: string): Promise<FunnelBookingResult> {
    const db = getDb()

    const lead = await db.rawQueryOne(
      `SELECT id, status FROM funnel_leads WHERE id=$1::uuid AND "tenantId"=$2::uuid`,
      [input.leadId, tenantId]
    )
    if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 })

    const row = await db.rawQueryOne(
      `INSERT INTO funnel_bookings (
         id, "tenantId", "leadId", "bookingType",
         "scheduledAt", timezone, notes, status, "createdAt"
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid, $3,
         $4, $5, $6, 'PENDING', NOW()
       ) RETURNING id`,
      [
        tenantId, input.leadId, input.bookingType,
        input.preferredDate ? new Date(input.preferredDate) : null,
        input.timezone ?? null, input.notes ?? null,
      ]
    )

    await db.rawQuery(
      `UPDATE funnel_leads SET status='BOOKED', "currentStep"='booked', "lastActivityAt"=NOW(), "updatedAt"=NOW() WHERE id=$1::uuid`,
      [input.leadId]
    )

    eventBus.emit('funnel.booking.created', { correlationId, leadId: input.leadId, bookingId: row!.id as string })

    return {
      bookingId: row!.id as string,
      status: 'PENDING',
      message: '¡Solicitud recibida! Nos pondremos en contacto en menos de 24 horas para confirmar tu cita.',
      nextSteps: [
        'Revisa tu correo para confirmación',
        'Prepara tus estudios médicos previos si tienes',
        'La consulta dura aproximadamente 60 minutos',
      ],
    }
  }

  // ── Step 4: Exchange rate (for international pricing) ─────────────

  async getExchangeRate(from: string, to: string): Promise<{ rate: number; from: string; to: string; updatedAt: string }> {
    // In production: fetch from fixer.io or similar. Fallback to static for demo.
    const STATIC_RATES: Record<string, number> = {
      'USD_MXN': 17.15, 'USD_COP': 4000, 'USD_ARS': 870,
      'USD_EUR': 0.92,  'USD_BRL': 4.97, 'MXN_USD': 0.058,
    }
    const key  = `${from.toUpperCase()}_${to.toUpperCase()}`
    const rate = STATIC_RATES[key] ?? 1.0

    return { rate, from: from.toUpperCase(), to: to.toUpperCase(), updatedAt: new Date().toISOString() }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private generateFunnelToken(leadId: string, tenantId: string): string {
    const payload = Buffer.from(JSON.stringify({ leadId, tenantId, exp: Date.now() + 3600_000 })).toString('base64url')
    return payload
  }

  private buildResultMessage(delta: number, status: string): string {
    if (status === 'REJUVENECIDO') return `🎉 ¡Excelente! Tu edad biológica es ${Math.abs(delta)} años menor que tu edad cronológica. Mantén este ritmo.`
    if (delta <= 2) return '✅ Tu edad biológica está dentro del rango normal. Hay oportunidades de mejora.'
    if (delta <= 5) return `⚠️ Tu edad biológica supera en ${Math.round(delta)} años a tu edad cronológica. Una intervención preventiva puede revertir este resultado.`
    return `🔴 Tu edad biológica supera en ${Math.round(delta)} años a tu edad cronológica. Te recomendamos una consulta especializada.`
  }

  private buildFunnelCta(delta: number, _status: string, leadId: string) {
    const isUrgent = delta >= 5
    return {
      headline:     isUrgent ? `Tu edad biológica supera en ${Math.round(delta)} años a la cronológica` : 'Hay oportunidad de mejora en tu edad biológica',
      subheadline:  isUrgent ? 'Una consulta especializada puede revertir este resultado' : 'Un protocolo personalizado puede optimizar tu longevidad',
      ctaLabel:     'Agendar consulta con Doctor Antivejez',
      ctaUrl:       `https://doctorantivejez.com/consulta?ref=funnel-${leadId.slice(0, 8)}`,
      urgencyLabel: isUrgent ? '⚡ Cupos limitados esta semana' : 'Disponibilidad esta semana',
    }
  }
}
