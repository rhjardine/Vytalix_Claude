// =============================================================================
// src/integrations/disglobal/sdk/index.ts
// Vytalix SDK for Disglobal — public API surface
//
// Installation (once published to npm):
//   npm install @vytalix/disglobal-sdk
//
// Or copy this file directly into your Node.js backend.
//
// Quickstart:
//   const client = new VytalixClient({ apiKey: process.env.VYTALIX_API_KEY })
//   const result = await client.assessBioAge({ userId: '123', age: 45, sex: 'MASCULINO', measurements: {...} })
// =============================================================================

import crypto from 'node:crypto'

// ── Re-export all public types ────────────────────────────────────

export type {
  AssessBioAgeResponse,
  ComputePreventiveScoreResponse,
  EvaluateReferralResponse,
  RecordEngagementResponse,
  CohortInsightsResponse,
  BiophysicsMeasurements,
  DimensionalMeasurement,
  AgeStatus,
  ScoreTier,
  EngagementTier,
  ReferralType,
  Urgency,
  ProblemDetail,
} from './shared/contracts-v1'

// ── SDK-specific Spanish-first types (consumer-facing) ───────────

export interface VytalixClientConfig {
  apiKey:    string
  baseUrl?:  string   // default: https://api.vytalix.health
  timeout?:  number   // ms, default: 10_000
  /** Enables verbose logging for development */
  debug?:    boolean
}

export interface BioAgeInput {
  userId:       string
  age:          number
  sex:          'MASCULINO' | 'FEMENINO'
  esDeportivo?: boolean
  mediciones: {
    porcentajeGrasa:    number
    imc:                number
    reflejoDigital:     { alto: number; largo: number; ancho: number }
    acomodacionVisual:  number
    equilibrioEstatico: { alto: number; largo: number; ancho: number }
    hidratacionPiel:    number
    presionSistolica:   number
    presionDiastolica:  number
  }
}

export interface BioAgeResult {
  evaluacionId:    string
  edadBiologica:   number
  edadCronologica: number
  diferencial:     number
  estado:          'REJUVENECIDO' | 'NORMAL' | 'ENVEJECIDO'
  interpretacion:  string
  edadesParciales: {
    grasa: number; imc: number; reflejos: number; vision: number
    equilibrio: number; hidratacion: number; sistolica: number; diastolica: number
  }
  derivacion?:     {
    elegible:    boolean
    titular:     string
    urlCta:      string
    urgencia:    string
  }
  evaluadoEn: string
}

export interface EngagementEventInput {
  userId:    string
  tipo:      'TEST_COMPLETADO' | 'RECOMENDACION_VISTA' | 'META_ESTABLECIDA' |
             'DESCARGA_REPORTE' | 'CTA_CLIC' | 'SESION_INICIADA'
  datos?:    Record<string, unknown>
}

export interface ScorePreventivo {
  scoreId:         string
  puntaje:         number         // 0–100
  nivel:           string         // "Óptimo" | "Bueno" | "Riesgo moderado" | ...
  recomendacion:   string
  componentes?:    Record<string, { puntaje: number; senales: string[] }>
}

// ── Main client class ─────────────────────────────────────────────

export class VytalixClient {
  private readonly apiKey:   string
  private readonly baseUrl:  string
  private readonly timeout:  number
  private readonly debug:    boolean

  constructor(config: VytalixClientConfig) {
    if (!config.apiKey) throw new Error('VytalixClient: apiKey is required')
    this.apiKey  = config.apiKey
    this.baseUrl = (config.baseUrl ?? 'https://api.vytalix.health').replace(/\/$/, '')
    this.timeout = config.timeout ?? 10_000
    this.debug   = config.debug   ?? false
  }

  // ── BioAge assessment ─────────────────────────────────────────

  async assessBioAge(input: BioAgeInput): Promise<BioAgeResult> {
    const subjectRef  = this.pseudonymize(input.userId)
    const idempotency = `bioage-${subjectRef}-${Math.floor(Date.now() / 60_000)}` // 1-min window

    const payload = {
      subjectRef,
      chronologicalAge: input.age,
      biologicalSex:    input.sex === 'MASCULINO' ? 'MALE' : 'FEMALE',
      isAthlete:        input.esDeportivo ?? false,
      measurements: {
        fatPercentage:       input.mediciones.porcentajeGrasa,
        bmi:                 input.mediciones.imc,
        digitalReflexes:     { high: input.mediciones.reflejoDigital.alto, long: input.mediciones.reflejoDigital.largo, width: input.mediciones.reflejoDigital.ancho },
        visualAccommodation: input.mediciones.acomodacionVisual,
        staticBalance:       { high: input.mediciones.equilibrioEstatico.alto, long: input.mediciones.equilibrioEstatico.largo, width: input.mediciones.equilibrioEstatico.ancho },
        skinHydration:       input.mediciones.hidratacionPiel,
        systolicPressure:    input.mediciones.presionSistolica,
        diastolicPressure:   input.mediciones.presionDiastolica,
      },
    }

    const data = await this.post('/api/v2/vitality/assess', payload, idempotency)

    return {
      evaluacionId:    data.assessmentId,
      edadBiologica:   data.biologicalAge,
      edadCronologica: input.age,
      diferencial:     data.differentialAge,
      estado:          data.ageStatus,
      interpretacion:  data.interpretation,
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
      derivacion: data.referralCTA?.eligible ? {
        elegible:  true,
        titular:   data.referralCTA.payload?.headline ?? '',
        urlCta:    data.referralCTA.payload?.ctaUrl   ?? '',
        urgencia:  data.referralCTA.payload?.urgencyLabel ?? '',
      } : undefined,
      evaluadoEn: data.assessedAt,
    }
  }

  // ── Preventive score ──────────────────────────────────────────

  async getScorePreventivo(userId: string): Promise<ScorePreventivo | null> {
    const subjectRef = this.pseudonymize(userId)
    try {
      const data = await this.post('/api/v2/preventive/score', { subjectRef })
      if (!data.compositeScore) return null
      return {
        scoreId:       data.scoreId,
        puntaje:       data.compositeScore,
        nivel:         data.tierLabel,
        recomendacion: data.recommendation,
        componentes:   data.components
          ? Object.fromEntries(
              Object.entries(data.components).map(([k, v]: [string, any]) => [
                k, { puntaje: v.score, senales: v.signals }
              ])
            )
          : undefined,
      }
    } catch (err: any) {
      if (err.status === 202) return null  // Insufficient data
      throw err
    }
  }

  // ── Engagement tracking ───────────────────────────────────────

  async registrarEvento(evento: EngagementEventInput): Promise<void> {
    const subjectRef = this.pseudonymize(evento.userId)
    const typeMap: Record<string, string> = {
      TEST_COMPLETADO:      'TEST_COMPLETED',
      RECOMENDACION_VISTA:  'RECOMMENDATION_VIEWED',
      META_ESTABLECIDA:     'GOAL_SET',
      DESCARGA_REPORTE:     'REPORT_DOWNLOADED',
      CTA_CLIC:             'REFERRAL_CTA_CLICKED',
      SESION_INICIADA:      'SESSION_STARTED',
    }
    await this.post('/api/v2/engagement/events', {
      subjectRef,
      events:  [{ type: typeMap[evento.tipo] ?? evento.tipo, payload: evento.datos ?? {} }],
      source:  'disglobal_marketplace',
    })
  }

  // ── Referral CTA ──────────────────────────────────────────────

  async evaluarDerivacion(userId: string): Promise<{ elegible: boolean; cta?: { titular: string; urlCta: string; urgencia: string } }> {
    const subjectRef = this.pseudonymize(userId)
    const data = await this.get(`/api/v2/referral/${subjectRef}`)
    if (!data.eligible) return { elegible: false }
    return {
      elegible: true,
      cta: {
        titular:  data.ctaPayload?.headline     ?? '',
        urlCta:   data.ctaPayload?.ctaUrl       ?? '',
        urgencia: data.ctaPayload?.urgencyLabel ?? '',
      },
    }
  }

  // ── Conversion tracking ───────────────────────────────────────

  async registrarConversion(userId: string, valorUsd: number): Promise<void> {
    await this.registrarEvento({ userId, tipo: 'CTA_CLIC', datos: { converted: true, value: valorUsd } })
  }

  // ── Cohort insights (B2B / aseguradoras) ─────────────────────

  async getInsightsDePoblacion(filtros?: {
    grupoEdad?: string
    sexo?: 'MASCULINO' | 'FEMENINO'
    periodo?: string
  }): Promise<unknown> {
    const params = new URLSearchParams()
    if (filtros?.grupoEdad) params.set('ageGroup',      filtros.grupoEdad)
    if (filtros?.sexo)      params.set('biologicalSex', filtros.sexo === 'MASCULINO' ? 'MALE' : 'FEMALE')
    if (filtros?.periodo)   params.set('period',        filtros.periodo)
    return this.get(`/api/v2/insights/cohort?${params}`)
  }

  // ── Batch (for onboarding campaigns) ─────────────────────────

  async batchGetLatestBioAge(userIds: string[]): Promise<Map<string, BioAgeResult | null>> {
    const results = new Map<string, BioAgeResult | null>()
    const batches = chunk(userIds, 10)

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(async userId => {
          try {
            const subjectRef = this.pseudonymize(userId)
            const data = await this.get(`/api/v2/vitality/${subjectRef}`)
            results.set(userId, {
              evaluacionId: data.assessmentId, edadBiologica: data.biologicalAge,
              edadCronologica: 0, diferencial: data.differentialAge,
              estado: data.ageStatus, interpretacion: data.interpretation ?? '',
              edadesParciales: data.partialAges, evaluadoEn: data.assessedAt,
            })
          } catch {
            results.set(userId, null)
          }
        })
      )
    }
    return results
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Pseudonymizes a Disglobal userId into a Vytalix subjectRef.
   * Deterministic (same userId → same subjectRef) via HMAC-SHA256.
   * Cannot be reversed without the API key.
   */
  pseudonymize(userId: string): string {
    const hash = crypto.createHmac('sha256', this.apiKey)
      .update(`DISG:${userId}`)
      .digest('base64url')
      .slice(0, 20)
    return `DISG-${hash}`
  }

  private async post(path: string, body: unknown, idempotencyKey?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key':    this.apiKey,
    }
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

    if (this.debug) console.debug(`[VytalixSDK] POST ${path}`, body)

    const res = await fetch(`${this.baseUrl}${path}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(this.timeout),
    })

    const data = await res.json()
    if (!res.ok) {
      throw Object.assign(new Error(data.detail ?? `Vytalix API error ${res.status}`), {
        status: res.status, code: data.type, body: data,
      })
    }
    return data
  }

  private async get(path: string): Promise<any> {
    if (this.debug) console.debug(`[VytalixSDK] GET ${path}`)
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'X-API-Key': this.apiKey },
      signal:  AbortSignal.timeout(this.timeout),
    })
    const data = await res.json()
    if (!res.ok) throw Object.assign(new Error(data.detail ?? `Vytalix API error ${res.status}`), { status: res.status })
    return data
  }
}

// ── Utility ───────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
}

// ── Convenience factory ───────────────────────────────────────────

export function createVytalixClient(apiKey: string, options?: Partial<VytalixClientConfig>): VytalixClient {
  return new VytalixClient({ apiKey, ...options })
}
