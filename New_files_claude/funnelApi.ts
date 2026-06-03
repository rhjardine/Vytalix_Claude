// =============================================================================
// src/services/api/funnelApi.ts
// Capa de red del funnel público.
//
// REGLA ABSOLUTA: ningún componente React hace fetch directamente.
// Todo pasa por aquí. Esto permite:
//   - Cambiar BASE URL sin tocar componentes
//   - Activar/desactivar mocks sin tocar componentes
//   - Agregar logging de analytics en un solo lugar
//   - Hacer tests de la lógica de UI sin mockear fetch
//
// USO en componentes:
//   import { funnelApi } from '@/services/api/funnelApi'
//   const result = await funnelApi.submitLead({ name, email, ... })
// =============================================================================

import type {
  FunnelLead,
  VitalityAssessmentResult,
  FacialAnalysisResult,
  BookingRequest,
  BookingResponse,
  ExchangeRateData,
} from '@/types/funnel'

// ─── Config ──────────────────────────────────────────────────────

const BASE    = import.meta.env.VITE_API_URL      ?? 'http://localhost:3001'
const API_KEY = import.meta.env.VITE_FUNNEL_API_KEY ?? 'dev_funnel_key'
const TIMEOUT = 10_000  // 10 segundos

// ─── Error class ─────────────────────────────────────────────────

export class FunnelApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'FunnelApiError'
  }
}

// ─── HTTP primitives ─────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Funnel-Key': API_KEY,
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new FunnelApiError(0, 'La solicitud tardó demasiado. Verifica tu conexión.', 'TIMEOUT')
    }
    throw new FunnelApiError(0, 'Error de conexión. Verifica tu acceso a internet.', 'NETWORK_ERROR')
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const payload = await res.json()
      detail = payload.detail ?? payload.message ?? detail
    } catch { /* ignore parse errors */ }
    throw new FunnelApiError(res.status, detail, String(res.status))
  }

  const payload = await res.json()
  return payload.data as T
}

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Funnel-Key': API_KEY },
      signal:  AbortSignal.timeout(5_000),
    })
  } catch {
    throw new FunnelApiError(0, 'Error de conexión', 'NETWORK_ERROR')
  }

  if (!res.ok) throw new FunnelApiError(res.status, `HTTP ${res.status}`)
  const payload = await res.json()
  return payload.data as T
}

// ─── Input types (campos que envía el frontend — sin campos de servidor) ───

type LeadInput = Omit<FunnelLead, 'id' | 'tenantId' | 'createdAt' | 'status'>
type AssessmentInput = Omit<VitalityAssessmentResult, 'id' | 'tenantId'>

// ─── API surface ─────────────────────────────────────────────────

export const funnelApi = {
  /**
   * Envía un lead capturado desde cualquier punto de contacto.
   * REEMPLAZA el setTimeout falso de cta.tsx
   */
  submitLead: (lead: LeadInput) =>
    post<{ id: string; status: string; confirmationEmailSent: boolean }>(
      '/api/funnel/leads',
      lead,
    ),

  /**
   * Persiste el resultado completo del test celular de 45 preguntas.
   * Llamar inmediatamente después de que calcularScore() termina.
   */
  submitAssessment: (assessment: AssessmentInput) =>
    post<{ id: string }>(
      '/api/funnel/vitality-assessment',
      assessment,
    ),

  /**
   * Envía la imagen para análisis facial.
   * REEMPLAZA el Math.random() de FaceAgeModal en tests.tsx
   */
  analyzeFacial: (imageBase64: string, sessionId?: string, leadId?: string) =>
    post<FacialAnalysisResult>(
      '/api/funnel/facial-analysis',
      { imageBase64, sessionId, leadId },
    ),

  /**
   * Solicita una consulta exploratoria.
   * Devuelve confirmationCode + whatsappFallbackUrl si el canal es WhatsApp.
   */
  requestBooking: (booking: BookingRequest) =>
    post<BookingResponse>(
      '/api/funnel/booking',
      booking,
    ),

  /**
   * Obtiene las tasas de cambio BCV y paralelo.
   * Cachear en el store — no llamar más de 1 vez por minuto.
   */
  getExchangeRate: () =>
    get<ExchangeRateData>('/api/exchange-rate'),
}
