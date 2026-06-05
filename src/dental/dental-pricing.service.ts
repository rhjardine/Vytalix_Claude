// =============================================================================
// src/dental/dental-pricing.service.ts
// CFE Dental — Patient-facing pricing with margin, financing and exchange rates
//
// Responsibilities:
//   - Apply margin on top of DentalCostEngine output
//   - Generate patient-facing price quote
//   - Compute financing options (monthly installments)
//   - Support multi-currency pricing via exchange engine
// =============================================================================

import { DentalCostEngine, CostEstimateInput, TreatmentCode } from './dental-cost.engine'
import { getDb }    from '../platform/db'
import { logger }   from '../platform/logger'
import { z }        from 'zod'

// ── Input schema ──────────────────────────────────────────────────

export const PriceQuoteSchema = z.object({
  tenantId:         z.string().uuid(),
  patientRef:       z.string().max(100).optional(),  // pseudonymous
  treatments: z.array(z.object({
    code:     z.string(),
    quantity: z.number().int().min(1).max(32).default(1),
  })).min(1).max(20),
  locationCode:     z.string().max(20).optional(),
  currency:         z.string().length(3).default('USD'),
  includeFinancing: z.boolean().default(true),
  marginPct:        z.number().min(0.1).max(5.0).default(2.5),  // default 2.5x markup
  chairRatePerHour: z.number().min(1).default(80),
  overheadPct:      z.number().min(0).max(1).default(0.35),
})

export type PriceQuoteInput = z.infer<typeof PriceQuoteSchema>

// ── Financing options ─────────────────────────────────────────────

const FINANCING_PLANS = [
  { months: 3,  interestPct: 0.00,  label: '3 meses sin intereses' },
  { months: 6,  interestPct: 0.00,  label: '6 meses sin intereses' },
  { months: 12, interestPct: 0.08,  label: '12 meses (8% anual)' },
  { months: 18, interestPct: 0.12,  label: '18 meses (12% anual)' },
  { months: 24, interestPct: 0.15,  label: '24 meses (15% anual)' },
]

export interface FinancingOption {
  months:         number
  label:          string
  monthlyPayment: number
  totalAmount:    number
  interestAmount: number
}

export interface TreatmentLineItem {
  treatmentCode:  string
  treatmentName:  string
  quantity:       number
  costUsd:        number        // internal cost
  priceUsd:       number        // patient-facing price
  margin:         number        // priceUsd / costUsd
  sessions:       number
}

export interface PriceQuoteResult {
  quoteId:         string
  patientRef?:     string
  lineItems:       TreatmentLineItem[]
  subtotalUsd:     number
  totalUsd:        number
  currency:        string
  totalInCurrency: number
  exchangeRate:    number
  financingOptions?: FinancingOption[]
  validUntil:      string        // ISO — 30-day validity
  disclaimer:      string
  algorithmVersion: string
  generatedAt:     string
}

// ── Service ───────────────────────────────────────────────────────

export class DentalPricingService {
  private costEngine = new DentalCostEngine()

  async generateQuote(input: PriceQuoteInput): Promise<PriceQuoteResult> {
    const log = logger.child({ fn: 'DentalPricing.generateQuote', tenantId: input.tenantId })

    // 1. Compute costs for all treatments
    const lineItems: TreatmentLineItem[] = []

    for (const item of input.treatments) {
      const costInput: CostEstimateInput = {
        treatmentCode:    item.code as TreatmentCode,
        quantity:         item.quantity,
        locationCode:     input.locationCode,
        chairRatePerHour: input.chairRatePerHour,
        overheadPct:      input.overheadPct,
      }

      const cost  = this.costEngine.compute(costInput)
      const price = round2(cost.adjustedTotalUsd * input.marginPct)

      lineItems.push({
        treatmentCode:  item.code,
        treatmentName:  cost.treatmentName,
        quantity:       item.quantity,
        costUsd:        cost.adjustedTotalUsd,
        priceUsd:       price,
        margin:         input.marginPct,
        sessions:       cost.estimatedSessions,
      })
    }

    const subtotalUsd = round2(lineItems.reduce((s, l) => s + l.priceUsd, 0))
    const totalUsd    = subtotalUsd  // extensions: discounts, taxes

    // 2. Currency conversion
    const { rate, totalInCurrency } = await convertCurrency(totalUsd, input.currency)

    // 3. Financing options
    const financing = input.includeFinancing
      ? computeFinancing(totalInCurrency)
      : undefined

    const validUntil = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
    const quoteId    = `QT-${Date.now().toString(36).toUpperCase()}`

    log.info({ quoteId, totalUsd, treatments: input.treatments.length }, 'Quote generated')

    return {
      quoteId,
      patientRef:      input.patientRef,
      lineItems,
      subtotalUsd,
      totalUsd,
      currency:        input.currency.toUpperCase(),
      totalInCurrency: round2(totalInCurrency),
      exchangeRate:    rate,
      financingOptions: financing,
      validUntil,
      disclaimer:      'Esta cotización es orientativa y puede variar según la evaluación clínica del odontólogo. Los precios no incluyen impuestos locales.',
      algorithmVersion: 'dental-pricing-v1.0.0',
      generatedAt:     new Date().toISOString(),
    }
  }
}

function computeFinancing(totalAmount: number): FinancingOption[] {
  return FINANCING_PLANS.map(plan => {
    const monthlyRate  = plan.interestPct / 12
    const monthlyPayment = monthlyRate === 0
      ? round2(totalAmount / plan.months)
      : round2(totalAmount * (monthlyRate * Math.pow(1 + monthlyRate, plan.months)) / (Math.pow(1 + monthlyRate, plan.months) - 1))
    const totalAmount2 = round2(monthlyPayment * plan.months)
    return {
      months:         plan.months,
      label:          plan.label,
      monthlyPayment,
      totalAmount:    totalAmount2,
      interestAmount: round2(totalAmount2 - totalAmount),
    }
  })
}

async function convertCurrency(amountUsd: number, toCurrency: string): Promise<{ rate: number; totalInCurrency: number }> {
  if (toCurrency.toUpperCase() === 'USD') return { rate: 1.0, totalInCurrency: amountUsd }
  // Static rates — replace with live API in Fase 3
  const RATES: Record<string, number> = {
    MXN: 17.15, COP: 4000, ARS: 870, CLP: 930,
    PEN: 3.72, BRL: 4.97, EUR: 0.92, CAD: 1.37,
  }
  const rate = RATES[toCurrency.toUpperCase()] ?? 1.0
  return { rate, totalInCurrency: round2(amountUsd * rate) }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

// =============================================================================
// src/dental/dental-treatment.service.ts
// Treatment snapshots — immutable records of approved treatment plans
// =============================================================================

export interface TreatmentSnapshotInput {
  tenantId:       string
  patientRef:     string         // pseudonymous patient reference
  treatments:     Array<{ code: string; quantity: number; notes?: string }>
  priceQuoteId:   string
  totalUsd:       number
  currency:       string
  approvedBy?:    string        // dentist UUID
  consentGiven:   boolean
  locationCode?:  string
}

export interface TreatmentSnapshot {
  snapshotId:      string
  tenantId:        string
  patientRef:      string
  status:          'PENDING' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  treatments:      TreatmentSnapshotInput['treatments']
  priceQuoteId:    string
  totalUsd:        number
  currency:        string
  approvedBy?:     string
  consentGiven:    boolean
  algorithmVersion: string
  createdAt:       string
}

export async function createTreatmentSnapshot(input: TreatmentSnapshotInput): Promise<TreatmentSnapshot> {
  if (!input.consentGiven) {
    throw Object.assign(new Error('Patient consent is required before creating a treatment snapshot'), { statusCode: 403 })
  }

  const db = getDb()
  const row = await db.rawQueryOne(
    `INSERT INTO dental_treatment_snapshots (
       id, "tenantId", "patientRef", status,
       treatments, "priceQuoteId", "totalUsd", currency,
       "approvedBy", "consentGiven", "algorithmVersion", "createdAt"
     ) VALUES (
       gen_random_uuid(), $1::uuid, $2, 'PENDING',
       $3::jsonb, $4, $5, $6,
       $7, $8, 'dental-treatment-v1.0.0', NOW()
     ) RETURNING id, "createdAt"`,
    [
      input.tenantId, input.patientRef,
      JSON.stringify(input.treatments), input.priceQuoteId,
      input.totalUsd, input.currency,
      input.approvedBy ?? null, input.consentGiven,
    ]
  )

  logger.info({ tenantId: input.tenantId, snapshotId: row!.id, total: input.totalUsd }, 'Treatment snapshot created')

  return {
    snapshotId:       row!.id as string,
    tenantId:         input.tenantId,
    patientRef:       input.patientRef,
    status:           'PENDING',
    treatments:       input.treatments,
    priceQuoteId:     input.priceQuoteId,
    totalUsd:         input.totalUsd,
    currency:         input.currency,
    approvedBy:       input.approvedBy,
    consentGiven:     input.consentGiven,
    algorithmVersion: 'dental-treatment-v1.0.0',
    createdAt:        (row!.createdAt as Date).toISOString(),
  }
}
