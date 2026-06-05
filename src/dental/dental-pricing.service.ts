// =============================================================================
// src/dental/dental-pricing.service.ts
// CFE Dental — Patient-facing pricing orchestration
//
// Responsibilities:
//   - Orchestrate CostEngine, MarginEngine, and ExchangeEngine.
//   - Generate patient-facing price quotes.
//   - Compute financing options (monthly installments).
//   - Maintain purity (no persistence).
// =============================================================================

import { DentalCostEngine, CostEstimateInput, TreatmentCode } from './dental-cost.engine'
import { MarginEngine, MarginEngineInput } from './margin.engine'
import { ExchangeEngine, ExchangeConversionInput } from './exchange.engine'
import { z } from 'zod'

// ── Input schema ──────────────────────────────────────────────────

export const PriceQuoteSchema = z.object({
  tenantId:         z.string().uuid(),
  patientRef:       z.string().max(100).optional(),
  treatments: z.array(z.object({
    code:     z.string(),
    quantity: z.number().int().min(1).max(32).default(1),
  })).min(1).max(20),
  locationCode:     z.string().max(20).optional(),
  currency:         z.string().length(3).default('USD'),
  includeFinancing: z.boolean().default(true),
  
  // Financial parameters
  targetProfitMargin:  z.number().min(0.1).max(0.9).optional(), // Override dynamic margin
  financialRiskFactor: z.number().min(1.0).max(2.0).default(1.0),
  chairRatePerHour:    z.number().min(1).default(80),
  overheadPct:         z.number().min(0).max(1).default(0.35),
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
  baseCostUsd:    number        // internal cost
  suggestedMarginPct: number
  priceUsd:       number        // patient-facing price
  netProfitUsd:   number        // expected profit
  sessions:       number
}

export interface PriceQuoteResult {
  quoteId:         string
  patientRef?:     string
  lineItems:       TreatmentLineItem[]
  subtotalUsd:     number
  totalUsd:        number
  totalNetProfitUsd: number
  currency:        string
  totalInCurrency: number
  exchangeRate:    number
  financingOptions?: FinancingOption[]
  validUntil:      string
  disclaimer:      string
  algorithmVersion: string
  generatedAt:     string
}

// ── Service ───────────────────────────────────────────────────────

export class DentalPricingService {
  private costEngine = new DentalCostEngine()
  private marginEngine = new MarginEngine()
  private exchangeEngine = new ExchangeEngine()

  generateQuote(rawInput: PriceQuoteInput): PriceQuoteResult {
    const input = PriceQuoteSchema.parse(rawInput)
    const lineItems: TreatmentLineItem[] = []
    let totalBaseCostUsd = 0
    let totalNetProfitUsd = 0
    let totalUsd = 0

    // 1. Compute costs and margins for all treatments
    for (const item of input.treatments) {
      const costInput: CostEstimateInput = {
        treatmentCode:    item.code as TreatmentCode,
        quantity:         item.quantity,
        locationCode:     input.locationCode,
        chairRatePerHour: input.chairRatePerHour,
        overheadPct:      input.overheadPct,
      }

      const cost = this.costEngine.compute(costInput)
      
      const marginInput: MarginEngineInput = {
        costEstimate: cost,
        financialRiskFactor: input.financialRiskFactor,
        targetProfitMargin: input.targetProfitMargin,
      }

      const margin = this.marginEngine.compute(marginInput)

      lineItems.push({
        treatmentCode:  item.code,
        treatmentName:  cost.treatmentName,
        quantity:       item.quantity,
        baseCostUsd:    margin.baseCostUsd,
        suggestedMarginPct: margin.suggestedMarginPct,
        priceUsd:       margin.suggestedPriceUsd,
        netProfitUsd:   margin.netProfitUsd,
        sessions:       cost.estimatedSessions,
      })

      totalBaseCostUsd += margin.baseCostUsd
      totalNetProfitUsd += margin.netProfitUsd
      totalUsd += margin.suggestedPriceUsd
    }

    const subtotalUsd = round2(totalUsd)
    totalUsd = subtotalUsd

    // 2. Currency conversion
    const conversion = this.exchangeEngine.convert({
      amount: totalUsd,
      baseCurrency: 'USD',
      targetCurrency: input.currency
    })

    // 3. Financing options
    const financing = input.includeFinancing
      ? computeFinancing(conversion.convertedAmount)
      : undefined

    const validUntil = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
    const quoteId    = `QT-${Date.now().toString(36).toUpperCase()}`

    return {
      quoteId,
      patientRef:      input.patientRef,
      lineItems,
      subtotalUsd,
      totalUsd,
      totalNetProfitUsd: round2(totalNetProfitUsd),
      currency:        conversion.currency,
      totalInCurrency: conversion.convertedAmount,
      exchangeRate:    conversion.appliedRate,
      financingOptions: financing,
      validUntil,
      disclaimer:      'Esta cotización es orientativa y puede variar según la evaluación clínica del odontólogo. Los precios no incluyen impuestos locales.',
      algorithmVersion: 'dental-pricing-v2.0.0',
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

function round2(n: number): number { return Math.round(n * 100) / 100 }
