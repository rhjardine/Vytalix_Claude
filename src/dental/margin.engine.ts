// =============================================================================
// src/dental/margin.engine.ts
// CFE Dental — Margin & Profitability Engine
//
// Responsibilities:
//   - Calculate suggested margins based on base costs.
//   - Incorporate financial risk factors (complexity, market volatility, etc.).
//   - Provide clear transparency: "How much do I actually earn?"
//
// Pure engine. No persistence.
// =============================================================================

import { CostEstimateResult } from './dental-cost.engine'

export const MARGIN_ENGINE_VERSION = '1.0.0'

export interface MarginEngineInput {
  costEstimate: CostEstimateResult
  financialRiskFactor?: number // 1.0 (normal) to 2.0 (high risk: volatile currency, high default probability)
  targetProfitMargin?: number // Desired profit margin percentage, e.g., 0.40 for 40% margin. If not provided, dynamic based on complexity.
}

export interface MarginEngineResult {
  treatmentCode: string
  baseCostUsd: number
  suggestedMarginPct: number
  suggestedPriceUsd: number
  netProfitUsd: number
  financialRiskAdjustmentUsd: number
  algorithmVersion: string
}

export class MarginEngine {
  private readonly version = MARGIN_ENGINE_VERSION

  compute(input: MarginEngineInput): MarginEngineResult {
    const cost = input.costEstimate.adjustedTotalUsd
    
    // Financial risk adjustment (if risk > 1.0, add a buffer to the base cost)
    const riskFactor = Math.max(1.0, input.financialRiskFactor ?? 1.0)
    const riskAdjustmentUsd = cost * (riskFactor - 1.0)
    const riskAdjustedCost = cost + riskAdjustmentUsd

    // Determine target margin
    let marginPct = input.targetProfitMargin
    if (marginPct === undefined) {
      // Dynamic margin based on clinical complexity
      switch (input.costEstimate.complexityLabel) {
        case 'Estándar': marginPct = 0.30; break;
        case 'Moderada': marginPct = 0.40; break;
        case 'Compleja': marginPct = 0.50; break;
        case 'Muy compleja': marginPct = 0.60; break;
        default: marginPct = 0.35; break;
      }
    }
    
    // Enforce reasonable bounds for dynamic or input margins
    marginPct = Math.max(0.10, Math.min(0.90, marginPct))

    // Price = Cost / (1 - Margin%)
    // E.g., Cost 100, Margin 40% -> Price 166.67 (Profit 66.67 = 40% of 166.67)
    let suggestedPriceUsd = riskAdjustedCost / (1 - marginPct)
    
    const netProfitUsd = suggestedPriceUsd - riskAdjustedCost

    return {
      treatmentCode: input.costEstimate.treatmentCode,
      baseCostUsd: round2(cost),
      suggestedMarginPct: round2(marginPct),
      suggestedPriceUsd: round2(suggestedPriceUsd),
      netProfitUsd: round2(netProfitUsd),
      financialRiskAdjustmentUsd: round2(riskAdjustmentUsd),
      algorithmVersion: this.version
    }
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
