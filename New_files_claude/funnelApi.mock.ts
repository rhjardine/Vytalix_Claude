// =============================================================================
// src/services/__mocks__/funnelApi.mock.ts
// Mock layer AISLADA y DETERMINÍSTICA del funnel.
//
// REGLAS:
//   1. NUNCA usar Math.random() — mismo input = mismo output siempre
//   2. Activar con VITE_USE_MOCKS=true en .env.development
//   3. Mismas firmas exactas que funnelApi.ts — intercambiables
//   4. Delays realistas para simular latencia de red
//
// REEMPLAZA:
//   - processImage() con Math.random() en FaceAgeModal (tests.tsx)
//   - handleSubmit con setTimeout falso en cta.tsx
// =============================================================================

import type {
  FunnelLead,
  VitalityAssessmentResult,
  FacialAnalysisResult,
  BookingRequest,
  BookingResponse,
  ExchangeRateData,
} from '@/types/funnel'

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Deterministic hash (NO Math.random) ─────────────────────────
// Mismo imageBase64 → siempre misma edad estimada
function deterministicFromString(input: string): number {
  let hash = 0
  const sample = input.slice(0, 120) // primeros 120 chars son suficientes
  for (let i = 0; i < sample.length; i++) {
    hash = (hash * 31 + sample.charCodeAt(i)) & 0x7fffffff
  }
  return hash
}

// ─── ID generator (deterministic por contenido) ───────────────────
function mockId(prefix: string, seed: string): string {
  const n = deterministicFromString(seed) % 900000 + 100000
  return `${prefix}-${n}`
}

// ─── Types (mismas firmas que funnelApi.ts) ───────────────────────
type LeadInput      = Omit<FunnelLead, 'id' | 'tenantId' | 'createdAt' | 'status'>
type AssessmentInput = Omit<VitalityAssessmentResult, 'id' | 'tenantId'>

// ─── Mock implementations ─────────────────────────────────────────

export const funnelApiMock = {
  submitLead: async (lead: LeadInput) => {
    await delay(700)
    return {
      id:                    mockId('lead', lead.email),
      status:                'NEW' as const,
      confirmationEmailSent: false,
    }
  },

  submitAssessment: async (assessment: AssessmentInput) => {
    await delay(450)
    return {
      id: mockId('assessment', String(assessment.score) + assessment.completedAt),
    }
  },

  analyzeFacial: async (
    imageBase64: string,
    _sessionId?: string,
    _leadId?: string,
  ): Promise<FacialAnalysisResult> => {
    await delay(2400) // simular latencia realista de análisis de visión

    const hash        = deterministicFromString(imageBase64)
    const estimatedAge = 35 + (hash % 30)          // 35–64 años, siempre igual
    const confidence   = 0.72 + (hash % 20) / 100  // 0.72–0.91, siempre igual

    return {
      estimatedAge,
      confidence:     Math.round(confidence * 100) / 100,
      analysisPoints: 22 + (hash % 6),              // 22–27 landmarks
      status:         'COMPLETED',
      provider:       'MOCK',
      analyzedAt:     new Date().toISOString(),
    }
  },

  requestBooking: async (booking: BookingRequest): Promise<BookingResponse> => {
    await delay(900)

    // Código determinístico basado en email (reproducible para el mismo usuario)
    const hash = deterministicFromString(booking.email)
    const suffix = hash.toString(36).toUpperCase().slice(0, 6).padStart(6, '0')
    const code = `VYT${suffix}`

    const waNumber = import.meta.env.VITE_WHATSAPP_NUMBER ?? '58412XXXXXXX'
    const waText = encodeURIComponent(
      `Hola! Soy ${booking.name}. Mi código de consulta es ${code}. ` +
      `Tipo: ${booking.consultationType}. Email: ${booking.email}`
    )

    return {
      id:                  mockId('booking', booking.email + booking.consultationType),
      status:              'WHATSAPP_ONLY',
      confirmationCode:    code,
      confirmationChannel: 'WHATSAPP',
      whatsappFallbackUrl: `https://wa.me/${waNumber}?text=${waText}`,
      nextSteps: [
        `Tu código de consulta es: ${code}`,
        'Toca el botón de WhatsApp para confirmar tu cita con nuestro equipo',
        'Un especialista te contactará en menos de 24 horas hábiles',
      ],
    }
  },

  getExchangeRate: async (): Promise<ExchangeRateData> => {
    await delay(300)
    const now = new Date().toISOString()
    return {
      bcv: {
        usdToVes:  36.42,
        updatedAt: now,
        source:    'BCV',
        isStale:   false,
      },
      parallel: {
        usdToVes:  37.15,
        updatedAt: now,
        source:    'yadio.io',
        isStale:   false,
      },
      cacheExpiresInSeconds: 60,
    }
  },
}
