// =============================================================================
// Vytalix — Contratos de datos del Funnel Público
// packages/types/src/funnel.ts  (o  src/types/funnel.ts en el repo landing)
//
// VERSIONING: v1.0 — INMUTABLE EN PRODUCCIÓN
//   - Nuevos campos: siempre opcionales (no breaking)
//   - Nunca eliminar ni renombrar campos en la misma versión
//   - Cambios breaking → bump de versión mayor + nuevo archivo v2/
// =============================================================================

// ─── Enums / Union Types ──────────────────────────────────────────────────

export type FunnelInterestType =
  | 'DEMO_PLATAFORMA'        // Quiere ver la plataforma en acción
  | 'INTEGRACION_EMR'        // Quiere integrar con su sistema actual
  | 'PARTNERSHIP_CLINICO'    // Quiere ser aliado clínico / validador
  | 'INFORMACION_GENERAL'    // Solo quiere información
  | 'LONGEVIDAD_CLINICA'     // Interesado en módulo de longevidad
  | 'ODONTOLOGIA_LONGEVIDAD' // Interesado en CFE dental
  | 'TURISMO_SALUD'          // Interesado en paquetes de turismo médico

export type FunnelLeadSource =
  | 'CTA_FORM'               // Formulario principal de contacto
  | 'VITALITY_TEST_RESULT'   // Después de completar test celular
  | 'FACIAL_ANALYSIS_RESULT' // Después del AgeBot facial
  | 'CONSULTA_EXPLORATORIA'  // Desde página de reserva
  | 'HERO_CTA'               // CTA del hero de la landing

export type FunnelLeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'CONVERTED'
  | 'UNQUALIFIED'

export type VitalityCategory = 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRITICO'

export type FacialAnalysisProvider =
  | 'MOCK'
  | 'OPENAI_VISION'
  | 'AZURE_FACE'
  | 'AWS_REKOGNITION'

export type FacialAnalysisErrorCode =
  | 'NO_FACE_DETECTED'
  | 'MULTIPLE_FACES'
  | 'LOW_QUALITY_IMAGE'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'

export type ConsultationType =
  | 'EXPLORATORIA_LONGEVIDAD'
  | 'EXPLORATORIA_DENTAL'
  | 'EXPLORATORIA_PREVENTIVA'
  | 'SEGUNDA_OPINION'

export type BookingStatus =
  | 'CONFIRMED'
  | 'PENDING_CONFIRM'
  | 'WHATSAPP_ONLY'
  | 'FAILED'

export type FunnelStep =
  | 'landing'
  | 'vitality_test'
  | 'facial_analysis'
  | 'results'
  | 'lead_capture'
  | 'booking'
  | 'confirmed'

// ─── FunnelLead ───────────────────────────────────────────────────────────

export interface FunnelLead {
  // Asignados por el servidor
  id?:        string
  tenantId?:  string
  createdAt?: string   // ISO-8601 UTC
  status?:    FunnelLeadStatus

  // Datos del prospecto (frontend envía)
  name:          string  // Nombre completo (REQUERIDO)
  email:         string  // Email validado RFC 5322 (REQUERIDO)
  organization?: string  // Nombre de la institución
  phone?:        string  // Teléfono con código de país
  country?:      string  // ISO 3166-1 alpha-2 ('VE', 'CO', 'PA', etc.)

  // Contexto de interés
  interestType:  FunnelInterestType  // REQUERIDO
  message?:      string              // max 2000 chars

  // Atribución y rastreo
  source:        FunnelLeadSource    // REQUERIDO
  utmSource?:    string
  utmCampaign?:  string
  referralCode?: string              // Código de afiliado si aplica

  // Assessment vinculado (opcional — si completó el test antes)
  vitalityAssessmentId?: string
  facialAnalysisId?:     string

  // Consentimiento LOPD/GDPR
  consentMarketing:      boolean  // Acepta comunicaciones de marketing
  consentDataProcessing: boolean  // REQUERIDO — bloquea si es false
}

// ─── VitalityAssessmentResult ─────────────────────────────────────────────

export interface VitalityDimensions {
  energiaEstadoMental:  number  // Grupo 1 — 11 preguntas (0-100)
  suenoCognicion:       number  // Grupo 2 — 6 preguntas  (0-100)
  composicionCorporal:  number  // Grupo 3 — 13 preguntas (0-100)
  signosEnvejecimiento: number  // Grupo 4 — 12 preguntas (0-100)
  rangoEdad:            number  // Grupo 5 — 3 preguntas  (0-100)
}

export interface VitalityAssessmentResult {
  // Asignados por servidor
  id?:       string
  tenantId?: string

  // Resultado principal
  score:             number          // 0-100 global
  category:          VitalityCategory
  yearsBiological:   number          // Edad biológica estimada
  chronologicalAgeGroup: '45' | '59' | '69' | '78'  // Grupo de edad (R43/R44/R45)

  // Dimensiones por grupo
  dimensions: VitalityDimensions

  // Payload de respuestas raw (auditoría + ML futuro)
  answersPayload: Record<string, boolean>  // { 'R1': true, 'R2': false, ... }

  // Contexto de captura
  completedAt:     string          // ISO-8601 UTC
  durationSeconds?: number
  deviceType?:     'mobile' | 'desktop' | 'tablet'
  sessionId?:      string          // Session ID anónima del browser

  // Vinculación
  leadId?: string
}

// ─── FacialAnalysisResult ─────────────────────────────────────────────────

export interface FacialAnalysisResult {
  id?:       string
  tenantId?: string

  // Resultado
  estimatedAge:   number   // Edad visual estimada en años
  confidence:     number   // 0.0 – 1.0
  analysisPoints: number   // Nº de landmarks faciales detectados

  // Factores de vitalidad (solo proveedores reales, no mock)
  vitalityFactors?: {
    skinQuality?:       number  // 0-100
    symmetry?:          number  // 0-100
    eyeVitality?:       number  // 0-100
    overallImpression?: number  // 0-100
  }

  // Estado y proveedor
  status:         'PENDING' | 'COMPLETED' | 'FAILED'
  errorCode?:     FacialAnalysisErrorCode
  provider:       FacialAnalysisProvider
  providerModel?: string

  // Metadatos — PRIVACIDAD: imagen NO se almacena nunca
  analyzedAt:  string   // ISO-8601
  imageHash?:  string   // SHA-256 de la imagen (solo el hash)
  leadId?:     string
}

// ─── BookingRequest / BookingResponse ────────────────────────────────────

export interface BookingRequest {
  name:  string
  email: string
  phone?: string

  consultationType:       ConsultationType
  specialistPreference?:  'longevity' | 'dental' | 'preventive' | 'any'

  preferredDate?: string  // ISO date 'YYYY-MM-DD'
  preferredTime?: 'morning' | 'afternoon' | 'evening'
  timezone?:      string  // IANA — default: 'America/Caracas'

  // Contexto clínico previo (si completó el test)
  vitalityScore?:    number
  vitalityCategory?: VitalityCategory
  chiefConcern?:     string   // max 500 chars

  leadId?:    string
  sessionId?: string
}

export interface BookingResponse {
  id:                  string
  status:              BookingStatus
  confirmationCode?:   string   // Alfanumérico 8 chars (ej: 'VYT3A7K2')
  scheduledAt?:        string   // ISO-8601 si hay slot asignado
  confirmationChannel: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'NONE'
  whatsappFallbackUrl?: string  // URL pre-filled para WhatsApp
  nextSteps:           string[] // Pasos para el paciente
}

// ─── ExchangeRateData — Widget Cambiario ─────────────────────────────────

export interface ExchangeRateEntry {
  usdToVes:  number
  updatedAt: string   // ISO-8601 UTC
  source:    string
  isStale?:  boolean  // true si la API fuente no respondió
}

export interface ExchangeRateData {
  bcv:      ExchangeRateEntry & { source: 'BCV' }
  parallel: ExchangeRateEntry & { source: 'yadio.io' | 'estimated' }
  cacheExpiresInSeconds: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Convierte un monto en USD a VES usando la tasa BCV.
 * Ejemplo: formatVES(1000, rate) → 'Bs. 36.420'
 */
export function formatVES(usdAmount: number, rate: ExchangeRateData): string {
  const ves = usdAmount * rate.bcv.usdToVes
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    maximumFractionDigits: 0,
  }).format(ves)
}

/**
 * Mapea los groups 1-5 del calcularScore() existente al contrato VitalityDimensions.
 * Usar en el componente tests.tsx cuando se llame a funnelApi.submitAssessment()
 */
export function mapDimensiones(
  dimensiones: Record<string, number>
): VitalityDimensions {
  return {
    energiaEstadoMental:  dimensiones['grupo1'] ?? 0,
    suenoCognicion:       dimensiones['grupo2'] ?? 0,
    composicionCorporal:  dimensiones['grupo3'] ?? 0,
    signosEnvejecimiento: dimensiones['grupo4'] ?? 0,
    rangoEdad:            dimensiones['grupo5'] ?? 0,
  }
}

/**
 * Infiere el chronologicalAgeGroup desde las respuestas del test.
 * Idéntica lógica al calcularScore() existente en tests.tsx.
 */
export function inferAgeGroup(
  answers: Record<string, boolean>
): VitalityAssessmentResult['chronologicalAgeGroup'] {
  if (answers['R45']) return '78'
  if (answers['R44']) return '69'
  if (answers['R43']) return '59'
  return '45'
}
