// =============================================================================
// src/dental/quote.orchestrator.ts
// CFE Dental — Quote Orchestrator
//
// The single entrypoint for generating a complete, auditable, frozen quote.
//
// Responsibilities:
//   - Accept raw procedure list + clinic config
//   - Coordinate: CostEngine → MarginEngine → PricingRules → ExchangeEngine
//                 → InventoryEngine.estimateImpact → SnapshotEngine
//   - Output a fully self-contained TreatmentPlan (version 1)
//   - Apply PricingRules before finalizing price
//   - Freeze ExchangeRateSnapshot at quote time
//   - Detect if stock is insufficient and flag accordingly
//
// The orchestrator is pure (no I/O). Caller provides context.
// =============================================================================

import crypto from 'node:crypto'
import { z } from 'zod'

import {
  TreatmentCode,
  DentalProcedure,
  PricingRule,
  ExchangeRateSnapshot,
  FinancialSnapshot,
  TreatmentVersion,
  TreatmentPlan,
  InventoryImpactEstimate,
} from './types'

import { DentalCostEngine } from './dental-cost.engine'
import { MarginEngine }     from './margin.engine'
import { ExchangeEngine }   from './exchange.engine'
import { InventoryEngine, InventoryState } from './inventory.engine'

export const QUOTE_ORCHESTRATOR_VERSION = 'dental-quote-v2.0.0'

// ── Input Schema ──────────────────────────────────────────────────

export const QuoteRequestSchema = z.object({
  tenantId:        z.string().uuid(),
  patientRef:      z.string().min(1).max(100),
  doctorRef:       z.string().min(1),
  procedures: z.array(z.object({
    code:      z.string(),
    quantity:  z.number().int().min(1).max(32).default(1),
    toothRef:  z.string().optional(),
    notes:     z.string().optional(),
  })).min(1).max(30),
  // Clinic config
  locationCode:       z.string().max(20).optional(),
  chairRatePerHour:   z.number().min(0).default(80),
  overheadPct:        z.number().min(0).max(1).default(0.35),
  // Pricing
  targetProfitMargin: z.number().min(0.05).max(0.90).optional(),
  financialRiskFactor: z.number().min(1.0).max(2.0).default(1.0),
  pricingRules:       z.array(z.any()).optional(),    // PricingRule[]
  // Currency
  currency:           z.string().length(3).default('USD'),
  // Financing
  financingMonths:    z.number().int().optional(),
  // Inventory context (optional — omit if no inventory tracking)
  inventoryState:     z.any().optional(),
  // Notes
  modificationsNote:  z.string().optional(),
})

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>

// ── Output ────────────────────────────────────────────────────────

export interface QuoteResult {
  plan:                TreatmentPlan
  financialSummary: {
    totalBaseCostUsd:  number
    finalPriceUsd:     number
    netProfitUsd:      number
    marginPct:         number
    currency:          string
    totalInCurrency:   number
    exchangeRate:      number
    discountApplied:   number
    financingOption?:  {
      months:          number
      monthlyPayment:  number
      totalAmount:     number
      interestUsd:     number
    }
  }
  inventoryWarnings:    string[]
  validUntil:           string
  algorithmVersion:     string
}

// ── Orchestrator ──────────────────────────────────────────────────

export class QuoteOrchestrator {
  private costEngine      = new DentalCostEngine()
  private marginEngine    = new MarginEngine()
  private exchangeEngine  = new ExchangeEngine()
  private inventoryEngine = new InventoryEngine()

  generate(rawInput: QuoteRequest): QuoteResult {
    const input = QuoteRequestSchema.parse(rawInput)
    const now   = new Date()

    // ── 1. Cost & Margin per procedure ───────────────────────────
    let totalMaterialsCost = 0
    let totalLabWork       = 0
    let totalLabor         = 0
    let totalOverhead      = 0
    let totalBaseCost      = 0
    let totalSuggestedPrice = 0
    let totalNetProfit     = 0

    const procedures: DentalProcedure[] = input.procedures.map(p => ({
      code:     p.code as TreatmentCode,
      quantity: p.quantity,
      toothRef: p.toothRef,
      notes:    p.notes,
    }))

    for (const proc of procedures) {
      const cost = this.costEngine.compute({
        treatmentCode:    proc.code,
        quantity:         proc.quantity,
        locationCode:     input.locationCode,
        chairRatePerHour: input.chairRatePerHour,
        overheadPct:      input.overheadPct,
      })

      const margin = this.marginEngine.compute({
        costEstimate:       cost,
        financialRiskFactor: input.financialRiskFactor,
        targetProfitMargin:  input.targetProfitMargin,
      })

      totalMaterialsCost  += cost.breakdown.materialsUsd
      totalLabWork        += cost.breakdown.labWorkUsd
      totalLabor          += cost.breakdown.laborUsd
      totalOverhead       += cost.breakdown.overheadUsd
      totalBaseCost       += margin.baseCostUsd
      totalSuggestedPrice += margin.suggestedPriceUsd
      totalNetProfit      += margin.netProfitUsd
    }

    // ── 2. Apply PricingRules ─────────────────────────────────────
    const rules: PricingRule[] = (input.pricingRules ?? []) as PricingRule[]
    let discountAppliedUsd = 0
    let priceAfterRules   = round2(totalSuggestedPrice)

    for (const rule of rules) {
      const ruleIsValid = rule.validFrom <= now.toISOString() && rule.validUntil >= now.toISOString()
      if (!ruleIsValid) continue

      if (rule.type === 'FLAT_DISCOUNT' && rule.flatAmountUsd) {
        discountAppliedUsd += rule.flatAmountUsd
        priceAfterRules    -= rule.flatAmountUsd
      }
      if (rule.type === 'PERCENT_DISCOUNT' && rule.discountPct) {
        const disc = round2(priceAfterRules * rule.discountPct)
        discountAppliedUsd += disc
        priceAfterRules    -= disc
      }
    }

    priceAfterRules    = round2(Math.max(0, priceAfterRules))
    discountAppliedUsd = round2(discountAppliedUsd)
    const finalNetProfit = round2(priceAfterRules - totalBaseCost)

    // ── 3. Exchange rate snapshot ─────────────────────────────────
    const exchangeSnap: ExchangeRateSnapshot = {
      ...this.exchangeEngine.generateSnapshot('USD', input.currency),
      snapshotId: `FX-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
    }

    const totalInCurrency = round2(priceAfterRules * exchangeSnap.rate)

    // ── 4. Financing calculation ──────────────────────────────────
    let financingResult: FinancialSnapshot['financingMonths'] = undefined
    let financingMonthlyPayment: FinancialSnapshot['financingMonthlyPayment'] = undefined
    let financingTotalAmount: FinancialSnapshot['financingTotalAmount']       = undefined
    let financingInterestUsd: FinancialSnapshot['financingInterestUsd']       = undefined

    if (input.financingMonths) {
      // Simple amortization (annuity formula). Assume interest per complexity tier.
      const annualRate    = 0.10   // 10% annual — configurable in future
      const monthlyRate   = annualRate / 12
      const m             = input.financingMonths
      const payment = monthlyRate === 0
        ? round2(totalInCurrency / m)
        : round2(totalInCurrency * (monthlyRate * Math.pow(1 + monthlyRate, m)) / (Math.pow(1 + monthlyRate, m) - 1))
      const total   = round2(payment * m)
      financingResult          = m
      financingMonthlyPayment  = payment
      financingTotalAmount     = total
      financingInterestUsd     = round2(total - totalInCurrency)
    }

    // ── 5. Inventory impact estimation ───────────────────────────
    const inventoryWarnings: string[] = []
    let inventoryImpact: InventoryImpactEstimate[] = []

    if (input.inventoryState) {
      inventoryImpact = this.inventoryEngine.estimateImpact(
        input.inventoryState as InventoryState,
        input.tenantId,
        procedures.map(p => ({ code: p.code, quantity: p.quantity }))
      )

      for (const impact of inventoryImpact) {
        if (!impact.isStockSufficient) {
          inventoryWarnings.push(
            `Insufficient stock for '${impact.itemName}': need ${impact.quantityNeeded} ${impact.unit}, have ${impact.stockAvailable}`
          )
        }
      }
    }

    // ── 6. Build FinancialSnapshot (immutable) ───────────────────
    const financialSnapshot: FinancialSnapshot = {
      snapshotId:             `FS-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      totalMaterialsCostUsd:  round2(totalMaterialsCost),
      totalLabWorkUsd:        round2(totalLabWork),
      totalLaborUsd:          round2(totalLabor),
      totalOverheadUsd:       round2(totalOverhead),
      totalBaseCostUsd:       round2(totalBaseCost),
      appliedMarginPct:       round2(finalNetProfit / priceAfterRules || 0),
      suggestedPriceUsd:      round2(totalSuggestedPrice),
      discountAppliedUsd,
      finalPriceUsd:          priceAfterRules,
      netProfitUsd:           finalNetProfit,
      currency:               exchangeSnap.targetCurrency,
      exchangeRate:           exchangeSnap.rate,
      exchangeSnapshotId:     exchangeSnap.snapshotId,
      totalInCurrency,
      financingMonths:        financingResult,
      financingMonthlyPayment,
      financingTotalAmount,
      financingInterestUsd,
      algorithmVersion:       QUOTE_ORCHESTRATOR_VERSION,
      frozenAt:               now.toISOString(),
    }

    // ── 7. Build TreatmentVersion (immutable) ────────────────────
    const version1: TreatmentVersion = {
      versionNumber:     1,
      procedures,
      appliedRules:      rules,
      financials:        financialSnapshot,
      exchangeSnapshot:  exchangeSnap,
      inventoryImpact,
      createdAt:         now.toISOString(),
      createdBy:         input.doctorRef,
      modificationsNote: input.modificationsNote ?? 'Initial quote',
    }

    // ── 8. Build TreatmentPlan ────────────────────────────────────
    const plan: TreatmentPlan = {
      planId:         `TP-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      tenantId:       input.tenantId,
      patientRef:     input.patientRef,
      doctorRef:      input.doctorRef,
      status:         'DRAFT',
      currentVersion: 1,
      versions:       [version1],
      createdAt:      now.toISOString(),
      updatedAt:      now.toISOString(),
    }

    // ── 9. Output ─────────────────────────────────────────────────
    const validUntil = new Date(now.getTime() + 30 * 24 * 3600_000).toISOString()

    return {
      plan,
      financialSummary: {
        totalBaseCostUsd:  round2(totalBaseCost),
        finalPriceUsd:     priceAfterRules,
        netProfitUsd:      finalNetProfit,
        marginPct:         round2(finalNetProfit / (priceAfterRules || 1)),
        currency:          exchangeSnap.targetCurrency,
        totalInCurrency,
        exchangeRate:      exchangeSnap.rate,
        discountApplied:   discountAppliedUsd,
        financingOption:   financingResult ? {
          months:         financingResult,
          monthlyPayment: financingMonthlyPayment!,
          totalAmount:    financingTotalAmount!,
          interestUsd:    financingInterestUsd!,
        } : undefined,
      },
      inventoryWarnings,
      validUntil,
      algorithmVersion: QUOTE_ORCHESTRATOR_VERSION,
    }
  }

  // ── Revise plan — create new version ─────────────────────────────
  // Non-destructive: previous version is preserved in versions[].

  revise(
    existingPlan: TreatmentPlan,
    newRequest: QuoteRequest,
    modificationsNote: string
  ): QuoteResult {
    // Generate fresh quote to get new financial snapshot
    const fresh = this.generate({ ...newRequest, modificationsNote })

    const newVersionNumber = existingPlan.currentVersion + 1
    const newVersion: TreatmentVersion = {
      ...fresh.plan.versions[0],
      versionNumber: newVersionNumber,
    }

    const revisedPlan: TreatmentPlan = {
      ...existingPlan,
      currentVersion: newVersionNumber,
      versions:       [...existingPlan.versions, newVersion],
      status:         'DRAFT',
      updatedAt:      new Date().toISOString(),
    }

    return {
      ...fresh,
      plan: revisedPlan,
    }
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
