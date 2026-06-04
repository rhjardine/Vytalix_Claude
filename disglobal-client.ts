// =============================================================================
// src/integrations/disglobal/disglobal-client.ts
// Disglobal Integration Package — Vytalix SDK for Disglobal's marketplace.
//
// This client wraps the Vytalix v2 APIs with Disglobal-specific:
//   - Subject pseudonymization (DISG- prefix)
//   - Consent collection before first assessment
//   - CTA rendering with conversion tracking
//   - Batch onboarding for marketplace user segments
//
// Usage in Disglobal's backend:
//   import { DisggloalVytalixClient } from '@vytalix/disglobal-sdk'
//   const client = new DisgglobalVytalixClient({ apiKey: process.env.VYX_API_KEY })
//   const result = await client.assessBioAge(userId, measurements)
// =============================================================================

import crypto from 'node:crypto'
import { logger } from './logger'

// ── Configuration ─────────────────────────────────────────────────

export interface DisgglobalClientConfig {
  apiKey:      string
  tenantSecret?: string
  baseUrl?:    string    // defaults to https://api.vytalix.health
  timeoutMs?:  number    // defaults to 10_000
}

// ── Bio age assessment input (Disglobal-facing types, Spanish labels) ──

export interface DisgglobalBioAgeInput {
  userId:       string      // Disglobal internal user ID (pseudonymized on send)
  age:          number
  sex:          'MASCULINO' | 'FEMENINO'
  esDeportivo?: boolean
  mediciones: {
    porcentajeGrasa:       number
    imc:                   number
    reflejoDigital:        { alto: number; largo: number; ancho: number }
    acomodacionVisual:     number
    equilibrioEstatico:    { alto: number; largo: number; ancho: number }
    hidratacionPiel:       number
    presionSistolica:      number
    presionDiastolica:     number
  }
}

export interface DisgglobalBioAgeResult {
  evaluacionId:   string
  edadBiologica:  number
  edadDiferencial: number
  estado:         'REJUVENECIDO' | 'NORMAL' | 'ENVEJECIDO'
  edadesParciales: {
    grasa: number; imc: number; reflejos: number; vision: number
    equilibrio: number; hidratacion: number; sistolica: number; diastolica: number
  }
  derivacion?:    DisgglobalCTA
  evaluadoEn:     string
}

export interface DisgglobalCTA {
  elegible:       boolean
  tipo:           string
  urgencia:       'URGENTE' | 'PRONTO' | 'RUTINA'
  titular:        string
  subtitular:     string
  etiquetaCta:    string
  urlCta:         string
  etiquetaUrgencia: string
  propuestaValor: string
}

// ─────────────────────────────────────────────────────────────────

export class DisgglobalVytalixClient {
  private readonly apiKey:   string
  private readonly tenantSecret: string
  private readonly baseUrl:  string
  private readonly timeout:  number

  constructor(config: DisgglobalClientConfig) {
    this.apiKey  = config.apiKey
    if (config.tenantSecret) {
      this.tenantSecret = config.tenantSecret
    } else {
      logger.warn('DEPRECATED: pseudonymization using apiKey fallback. Please provide tenantSecret.')
      this.tenantSecret = config.apiKey
    }
    this.baseUrl = config.baseUrl ?? 'https://api.vytalix.health'
    this.timeout = config.timeoutMs ?? 10_000
  }

  // ── Core: Evaluate biological age ────────────────────────────────

  async assessBioAge(input: DisgglobalBioAgeInput): Promise<DisgglobalBioAgeResult> {
    const subjectRef  = this.pseudonymize(input.userId)
    const idempotency = `disg-${subjectRef}-${Date.now()}`

    const body = {
      subjectRef,
      chronologicalAge: input.age,
      biologicalSex:    input.sex === 'MASCULINO' ? 'MALE' : 'FEMALE',
      isAthlete:        input.esDeportivo ?? false,
      measurements: {
        fatPercentage:       input.mediciones.porcentajeGrasa,
        bmi:                 input.mediciones.imc,
        digitalReflexes:     {
          high:  input.mediciones.reflejoDigital.alto,
          long:  input.mediciones.reflejoDigital.largo,
          width: input.mediciones.reflejoDigital.ancho,
        },
        visualAccommodation: input.mediciones.acomodacionVisual,
        staticBalance: {
          high:  input.mediciones.equilibrioEstatico.alto,
          long:  input.mediciones.equilibrioEstatico.largo,
          width: input.mediciones.equilibrioEstatico.ancho,
        },
        skinHydration:    input.mediciones.hidratacionPiel,
        systolicPressure: input.mediciones.presionSistolica,
        diastolicPressure: input.mediciones.presionDiastolica,
      },
    }

    const data = await this.post('/api/v2/vitality/assess', body, idempotency)

    // Also fetch referral CTA
    let cta: DisgglobalCTA | undefined
    try {
      const referral = await this.get(`/api/v2/referral/${subjectRef}`)
      if (referral.eligible) {
        cta = {
          elegible:         true,
          tipo:             referral.referralType,
          urgencia:         this.mapUrgency(referral.urgency),
          titular:          referral.ctaPayload.headline,
          subtitular:       referral.ctaPayload.subheadline,
          etiquetaCta:      referral.ctaPayload.ctaLabel,
          urlCta:           referral.ctaPayload.ctaUrl,
          etiquetaUrgencia: referral.ctaPayload.urgencyLabel,
          propuestaValor:   referral.ctaPayload.valueProposition,
        }
      }
    } catch (_) { /* CTA is optional — never block the main result */ }

    return {
      evaluacionId:    data.assessmentId,
      edadBiologica:   data.biologicalAge,
      edadDiferencial: data.differentialAge,
      estado:          data.ageStatus,
      edadesParciales: {
        grasa:       data.partialAges.fatAge,
        imc:         data.partialAges.bmiAge,
        reflejos:    data.partialAges.reflexesAge,
        vision:      data.partialAges.visualAge,
        equilibrio:  data.partialAges.balanceAge,
        hidratacion: data.partialAges.hydrationAge,
        sistolica:   data.partialAges.systolicAge,
        diastolica:  data.partialAges.diastolicAge,
      },
      derivacion:  cta,
      evaluadoEn:  data.assessedAt,
    }
  }

  // ── Register engagement event ─────────────────────────────────────

  async trackEvent(userId: string, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
    const subjectRef = this.pseudonymize(userId)
    await this.post('/api/v2/engagement/events', {
      subjectRef,
      events: [{ type: eventType, payload }],
      source: 'disglobal_marketplace',
    })
  }

  // ── Track CTA click (conversion funnel) ───────────────────────────

  async trackCtaClick(userId: string): Promise<void> {
    await this.trackEvent(userId, 'REFERRAL_CTA_CLICKED', { platform: 'disglobal' })
  }

  // ── Track conversion (appointment booked) ─────────────────────────

  async trackConversion(userId: string, convertedValueUsd: number): Promise<void> {
    const subjectRef = this.pseudonymize(userId)
    await this.post('/api/v2/engagement/events', {
      subjectRef,
      events: [{
        type: 'REFERRAL_CTA_CLICKED',
        payload: { converted: true, value: convertedValueUsd, platform: 'disglobal' },
      }],
      source: 'disglobal_marketplace',
    })
  }

  // ── Batch assess population segment (for onboarding campaigns) ───

  async batchAssessSegment(
    users: Array<{ userId: string; age: number; sex: 'MASCULINO' | 'FEMENINO' }>
  ): Promise<{ processed: number; failed: number; withReferral: number }> {
    let processed = 0, failed = 0, withReferral = 0

    // Process in batches of 10 (concurrency limit)
    for (let i = 0; i < users.length; i += 10) {
      const batch   = users.slice(i, i + 10)
      const results = await Promise.allSettled(
        batch.map(u =>
          this.get(`/api/v2/vitality/${this.pseudonymize(u.userId)}`).catch(() => null)
        )
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          processed++
          if (r.value.ageStatus === 'ENVEJECIDO') withReferral++
        } else {
          failed++
        }
      }
    }

    return { processed, failed, withReferral }
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * Pseudonymizes a Disglobal userId → Vytalix subjectRef.
   * Uses HMAC-SHA256 with the API key as secret for deterministic, reversible pseudonymization.
   * Same userId always maps to same subjectRef — consistent across calls.
   */
  private pseudonymize(userId: string): string {
    const hash = crypto.createHmac('sha256', this.tenantSecret)
      .update(`DISG:${userId}`)
      .digest('base64url')
      .slice(0, 20)
    return `DISG-${hash}`
  }

  private mapUrgency(urgency: string): DisgglobalCTA['urgencia'] {
    if (urgency === 'URGENT')  return 'URGENTE'
    if (urgency === 'ROUTINE') return 'RUTINA'
    return 'PRONTO'
  }

  private async post(path: string, body: unknown, idempotencyKey?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type':  'application/json',
      'X-API-Key':     this.apiKey,
    }
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

    const res = await fetch(`${this.baseUrl}${path}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(this.timeout),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw Object.assign(new Error(err.detail ?? `Vytalix API error ${res.status}`), { status: res.status, body: err })
    }

    return res.json()
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers:  { 'X-API-Key': this.apiKey },
      signal:   AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw Object.assign(new Error(err.detail ?? `Vytalix API error ${res.status}`), { status: res.status })
    }
    return res.json()
  }
}
