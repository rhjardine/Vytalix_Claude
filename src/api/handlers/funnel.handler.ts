// =============================================================================
// src/api/funnel.handler.ts
// Endpoints del funnel público de captación.
//
// Rutas:
//   POST /api/funnel/leads
//   POST /api/funnel/vitality-assessment
//   POST /api/funnel/facial-analysis
//   POST /api/funnel/booking
//
// Auth: X-Funnel-Key (API key pública) — NO requiere JWT médico
// Rate limiting: manejado en server.ts via Redis
// Validación: Zod en cada handler — falla rápido con 422 descriptivo
// =============================================================================

import { Request, Response } from 'express'
import { z, ZodError }       from 'zod'
import { randomUUID, createHash } from 'crypto'
import { getDb }             from '../../platform/db'
import { logger }            from '../../platform/logger'

// ─── Tenant por defecto para el funnel público ────────────────────
// En multi-tenant real esto vendría del API key registry
const DEFAULT_TENANT = () =>
  process.env.DEFAULT_FUNNEL_TENANT_ID ?? 'a1b2c3d4-0000-4000-8000-000000000001'

// ─── Helper: respuesta de error RFC-7807 ─────────────────────────
function problem(
  res: Response,
  status: number,
  detail: string,
  correlationId: string,
) {
  return res.status(status).json({
    type:          `https://api.vytalix.health/errors/${status}`,
    title:         status === 422 ? 'Validation Failed'
                 : status === 409 ? 'Conflict'
                 : status === 429 ? 'Too Many Requests'
                 : 'Error',
    status,
    detail,
    correlationId,
  })
}

// ─── Helper: extraer correlationId del request ────────────────────
function corr(req: Request): string {
  return (req as any).correlationId ?? randomUUID()
}

// =============================================================================
// SCHEMAS ZOD
// =============================================================================

const LeadSchema = z.object({
  name:          z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(200),
  email:         z.string().email('Email inválido'),
  organization:  z.string().max(255).optional(),
  phone:         z.string().max(50).optional(),
  country:       z.string().length(2).optional(),
  interestType:  z.enum([
    'DEMO_PLATAFORMA', 'INTEGRACION_EMR', 'PARTNERSHIP_CLINICO',
    'INFORMACION_GENERAL', 'LONGEVIDAD_CLINICA',
    'ODONTOLOGIA_LONGEVIDAD', 'TURISMO_SALUD',
  ]),
  message:       z.string().max(2000).optional(),
  source:        z.enum([
    'CTA_FORM', 'VITALITY_TEST_RESULT', 'FACIAL_ANALYSIS_RESULT',
    'CONSULTA_EXPLORATORIA', 'HERO_CTA',
  ]),
  utmSource:     z.string().max(100).optional(),
  utmCampaign:   z.string().max(100).optional(),
  referralCode:  z.string().max(50).optional(),
  vitalityAssessmentId: z.string().uuid().optional(),
  facialAnalysisId:     z.string().uuid().optional(),
  consentMarketing:      z.boolean(),
  consentDataProcessing: z.boolean(),
})

const AssessmentSchema = z.object({
  score:            z.number().int().min(0).max(100),
  category:         z.enum(['EXCELENTE', 'BUENO', 'REGULAR', 'CRITICO']),
  yearsBiological:  z.number().int().min(18).max(120),
  chronologicalAgeGroup: z.enum(['45', '59', '69', '78']),
  dimensions: z.object({
    energiaEstadoMental:  z.number().int().min(0).max(100),
    suenoCognicion:       z.number().int().min(0).max(100),
    composicionCorporal:  z.number().int().min(0).max(100),
    signosEnvejecimiento: z.number().int().min(0).max(100),
    rangoEdad:            z.number().int().min(0).max(100),
  }),
  answersPayload:  z.record(z.string(), z.boolean()),
  completedAt:     z.string().datetime(),
  durationSeconds: z.number().int().positive().optional(),
  deviceType:      z.enum(['mobile', 'desktop', 'tablet']).optional(),
  sessionId:       z.string().max(100).optional(),
  leadId:          z.string().uuid().optional(),
})

const FacialSchema = z.object({
  // base64 string — min 100 chars, max ~2.25MB encoded
  imageBase64: z.string()
    .min(100, 'Imagen inválida o demasiado pequeña')
    .max(3_100_000, 'Imagen demasiado grande — máximo 2MB'),
  sessionId:   z.string().max(100).optional(),
  leadId:      z.string().uuid().optional(),
})

const BookingSchema = z.object({
  name:  z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  consultationType: z.enum([
    'EXPLORATORIA_LONGEVIDAD', 'EXPLORATORIA_DENTAL',
    'EXPLORATORIA_PREVENTIVA', 'SEGUNDA_OPINION',
  ]),
  specialistPreference: z.enum(['longevity', 'dental', 'preventive', 'any']).optional(),
  preferredDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredTime:  z.enum(['morning', 'afternoon', 'evening']).optional(),
  timezone:       z.string().max(50).optional(),
  vitalityScore:    z.number().int().min(0).max(100).optional(),
  vitalityCategory: z.enum(['EXCELENTE', 'BUENO', 'REGULAR', 'CRITICO']).optional(),
  chiefConcern:     z.string().max(500).optional(),
  leadId:           z.string().uuid().optional(),
  sessionId:        z.string().max(100).optional(),
})

// =============================================================================
// HANDLER 1: POST /api/funnel/leads
// =============================================================================

export async function handleSubmitLead(req: Request, res: Response) {
  const id = corr(req)
  const parsed = LeadSchema.safeParse(req.body)

  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => i.message).join('. ')
    return problem(res, 422, msg, id)
  }

  const d = parsed.data

  // Consentimiento de datos es REQUERIDO — nunca un éxito falso
  if (!d.consentDataProcessing) {
    return problem(res, 422,
      'El consentimiento de tratamiento de datos es requerido para continuar.', id)
  }

  const db       = getDb()
  const tenantId = DEFAULT_TENANT()

  // Anti-spam: bloquear mismo email en últimas 24h para el mismo tenant
  const recent = await db.rawQuery(
    `SELECT id FROM funnel_leads
     WHERE email = $1
       AND "tenantId" = $2::uuid
       AND "createdAt" > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [d.email.toLowerCase(), tenantId],
  )

  if (recent.rows.length > 0) {
    // Responder 200 con el ID existente — no revelar que es duplicado (privacidad)
    return res.status(200).json({
      data: { id: recent.rows[0].id, status: 'EXISTING' },
      meta: { correlationId: id, timestamp: new Date().toISOString() },
    })
  }

  const result = await db.rawQuery(
    `INSERT INTO funnel_leads (
      "tenantId", name, email, organization, phone, country,
      "interestType", message, source,
      "utmSource", "utmCampaign", "referralCode",
      "vitalityAssessmentId", "facialAnalysisId",
      "consentMarketing", "consentDataProcessing", status
    ) VALUES (
      $1::uuid, $2, $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12,
      $13, $14,
      $15, $16, 'NEW'
    ) RETURNING id`,
    [
      tenantId,
      d.name, d.email.toLowerCase(), d.organization ?? null,
      d.phone ?? null, d.country ?? null,
      d.interestType, d.message ?? null, d.source,
      d.utmSource ?? null, d.utmCampaign ?? null, d.referralCode ?? null,
      d.vitalityAssessmentId ?? null, d.facialAnalysisId ?? null,
      d.consentMarketing, d.consentDataProcessing,
    ],
  )

  logger.info({ correlationId: id, email: d.email, source: d.source }, 'Funnel lead created')

  return res.status(201).json({
    data: {
      id:                    result.rows[0].id,
      status:                'NEW',
      confirmationEmailSent: false, // TODO: integrar servicio de email
    },
    meta: { correlationId: id, timestamp: new Date().toISOString() },
  })
}

// =============================================================================
// HANDLER 2: POST /api/funnel/vitality-assessment
// =============================================================================

export async function handleSubmitAssessment(req: Request, res: Response) {
  const id     = corr(req)
  const parsed = AssessmentSchema.safeParse(req.body)

  if (!parsed.success) {
    return problem(res, 422, parsed.error.issues[0].message, id)
  }

  const d        = parsed.data
  const db       = getDb()
  const tenantId = DEFAULT_TENANT()

  const result = await db.rawQuery(
    `INSERT INTO vitality_assessments (
      "tenantId", score, category, "yearsBiological", "chronologicalAgeGroup",
      "dimEnergiaEstadoMental", "dimSuenoCognicion", "dimComposicionCorporal",
      "dimSignosEnvejecimiento", "dimRangoEdad",
      "answersPayload", "completedAt", "durationSeconds", "deviceType",
      "sessionId", "leadId"
    ) VALUES (
      $1::uuid, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11::jsonb, $12::timestamptz, $13, $14,
      $15, $16::uuid
    ) RETURNING id`,
    [
      tenantId,
      d.score, d.category, d.yearsBiological, d.chronologicalAgeGroup,
      d.dimensions.energiaEstadoMental, d.dimensions.suenoCognicion,
      d.dimensions.composicionCorporal, d.dimensions.signosEnvejecimiento,
      d.dimensions.rangoEdad,
      JSON.stringify(d.answersPayload),
      d.completedAt,
      d.durationSeconds ?? null,
      d.deviceType ?? null,
      d.sessionId ?? null,
      d.leadId ?? null,
    ],
  )

  logger.info(
    { correlationId: id, score: d.score, category: d.category },
    'Vitality assessment persisted',
  )

  return res.status(201).json({
    data: { id: result.rows[0].id },
    meta: { correlationId: id, timestamp: new Date().toISOString() },
  })
}

// =============================================================================
// HANDLER 3: POST /api/funnel/facial-analysis
// =============================================================================

// Análisis determinístico para modo mock — NO Math.random()
function deterministicAge(imageBase64: string): { age: number; confidence: number } {
  let hash = 0
  const sample = imageBase64.slice(0, 120)
  for (let i = 0; i < sample.length; i++) {
    hash = (hash * 31 + sample.charCodeAt(i)) & 0x7fffffff
  }
  return {
    age:        35 + (hash % 30),                    // 35–64 años
    confidence: 0.72 + (hash % 20) / 100,            // 0.72–0.91
  }
}

export async function handleFacialAnalysis(req: Request, res: Response) {
  const id     = corr(req)
  const parsed = FacialSchema.safeParse(req.body)

  if (!parsed.success) {
    return problem(res, 422, parsed.error.issues[0].message, id)
  }

  const { imageBase64, sessionId, leadId } = parsed.data

  // Hash de la imagen para auditoría — imagen NO se almacena
  const imageHash = createHash('sha256').update(imageBase64).digest('hex')

  const provider = process.env.VISION_PROVIDER ?? 'mock'
  let estimatedAge: number
  let confidence: number

  if (provider === 'mock') {
    const result = deterministicAge(imageBase64)
    estimatedAge = result.age
    confidence   = Math.round(result.confidence * 100) / 100
  } else {
    // TODO: integrar proveedor real (openai | azure | aws)
    // Retornar 501 hasta que se configure el proveedor
    logger.warn({ provider, correlationId: id }, 'Vision provider not implemented')
    return problem(res, 501,
      `El proveedor de visión '${provider}' no está configurado aún. ` +
      `Configura VISION_PROVIDER=mock para desarrollo.`, id)
  }

  const db       = getDb()
  const tenantId = DEFAULT_TENANT()

  const result = await db.rawQuery(
    `INSERT INTO facial_analyses (
      "tenantId", "estimatedAge", confidence, "analysisPoints",
      status, provider, "imageHash", "analyzedAt", "leadId"
    ) VALUES (
      $1::uuid, $2, $3, 24, 'COMPLETED', $4, $5, NOW(), $6::uuid
    ) RETURNING id`,
    [tenantId, estimatedAge, confidence, provider, imageHash, leadId ?? null],
  )

  logger.info(
    { correlationId: id, estimatedAge, provider },
    'Facial analysis completed',
  )

  return res.json({
    data: {
      id:             result.rows[0].id,
      estimatedAge,
      confidence,
      analysisPoints: 24,
      status:         'COMPLETED',
      provider,
      analyzedAt:     new Date().toISOString(),
    },
    meta: { correlationId: id, timestamp: new Date().toISOString() },
  })
}

// =============================================================================
// HANDLER 4: POST /api/funnel/booking
// =============================================================================

function generateConfirmationCode(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff
  }
  return 'VYT' + hash.toString(36).toUpperCase().slice(0, 6).padStart(6, '0')
}

export async function handleBooking(req: Request, res: Response) {
  const id     = corr(req)
  const parsed = BookingSchema.safeParse(req.body)

  if (!parsed.success) {
    return problem(res, 422, parsed.error.issues[0].message, id)
  }

  const d          = parsed.data
  const db         = getDb()
  const tenantId   = DEFAULT_TENANT()
  const waNumber   = process.env.WHATSAPP_NUMBER ?? '58412XXXXXXX'

  // Código determinístico por email+tipo+timestamp (colisiones mínimas)
  const codeSeed = `${d.email}:${d.consultationType}:${Date.now()}`
  const code     = generateConfirmationCode(codeSeed)

  const waText = encodeURIComponent(
    `Hola! Soy ${d.name}. ` +
    `Mi código de consulta Vytalix es *${code}*. ` +
    `Tipo: ${d.consultationType}. ` +
    `Email: ${d.email}` +
    (d.chiefConcern ? `. Motivo: ${d.chiefConcern}` : ''),
  )
  const whatsappUrl = `https://wa.me/${waNumber}?text=${waText}`

  await db.rawQuery(
    `INSERT INTO bookings (
      "tenantId", name, email, phone, "consultationType",
      "specialistPreference", "preferredDate", "preferredTime", timezone,
      "vitalityScore", "vitalityCategory", "chiefConcern",
      status, "confirmationCode", "confirmationChannel", "leadId"
    ) VALUES (
      $1::uuid, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      'WHATSAPP_ONLY', $13, 'WHATSAPP', $14::uuid
    )`,
    [
      tenantId,
      d.name, d.email.toLowerCase(), d.phone ?? null, d.consultationType,
      d.specialistPreference ?? null, d.preferredDate ?? null,
      d.preferredTime ?? null, d.timezone ?? 'America/Caracas',
      d.vitalityScore ?? null, d.vitalityCategory ?? null, d.chiefConcern ?? null,
      code, d.leadId ?? null,
    ],
  )

  logger.info(
    { correlationId: id, consultationType: d.consultationType, code },
    'Booking created',
  )

  return res.status(201).json({
    data: {
      id:                  randomUUID(),
      status:              'WHATSAPP_ONLY',
      confirmationCode:    code,
      confirmationChannel: 'WHATSAPP',
      whatsappFallbackUrl: whatsappUrl,
      nextSteps: [
        `Tu código de consulta es: ${code}`,
        'Toca el botón de WhatsApp para confirmar tu cita con nuestro equipo',
        'Un especialista te contactará en menos de 24 horas hábiles',
        'Guarda este código — lo necesitarás para tu primera consulta',
      ],
    },
    meta: { correlationId: id, timestamp: new Date().toISOString() },
  })
}
