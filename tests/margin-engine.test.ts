import { describe, it, expect, beforeEach } from 'vitest'
import { MarginEngine } from '../src/dental/margin.engine'
import { CostEstimateResult } from '../src/dental/dental-cost.engine'

describe('MarginEngine', () => {
  let engine: MarginEngine
  let baseCost: CostEstimateResult

  beforeEach(() => {
    engine = new MarginEngine()
    baseCost = {
      treatmentCode: 'LIMPIEZA_PROFILAXIS',
      treatmentName: 'Limpieza',
      quantity: 1,
      breakdown: { materialsUsd: 10, labWorkUsd: 0, laborUsd: 20, overheadUsd: 5 },
      subtotalUsd: 35,
      locationFactor: 1.0,
      adjustedTotalUsd: 100, // Easy number for testing
      estimatedSessions: 1,
      durationMinutes: 30,
      complexityLabel: 'Estándar',
      algorithmVersion: '1.0.0',
      computedAt: new Date().toISOString(),
      inputSnapshot: { treatmentCode: 'LIMPIEZA_PROFILAXIS', quantity: 1, chairRatePerHour: 50, overheadPct: 0.1 }
    }
  })

  it('calculates price using explicit target margin', () => {
    // 100 / (1 - 0.4) = 166.67
    const result = engine.compute({ costEstimate: baseCost, targetProfitMargin: 0.40 })
    expect(result.suggestedMarginPct).toBe(0.40)
    expect(result.suggestedPriceUsd).toBe(166.67)
    expect(result.netProfitUsd).toBeCloseTo(66.67, 1)
  })

  it('applies dynamic margin based on complexity when target not provided', () => {
    baseCost.complexityLabel = 'Moderada'
    const result = engine.compute({ costEstimate: baseCost })
    expect(result.suggestedMarginPct).toBe(0.40) // from engine defaults

    baseCost.complexityLabel = 'Muy compleja'
    const resultHigh = engine.compute({ costEstimate: baseCost })
    expect(resultHigh.suggestedMarginPct).toBe(0.60)
  })

  it('applies financial risk factor', () => {
    // cost 100, risk 1.5 -> riskAdjustedCost 150
    // margin 0.5 (Compleja) -> price = 150 / 0.5 = 300
    baseCost.complexityLabel = 'Compleja'
    const result = engine.compute({ costEstimate: baseCost, financialRiskFactor: 1.5 })
    
    expect(result.financialRiskAdjustmentUsd).toBe(50)
    expect(result.suggestedPriceUsd).toBe(300)
    expect(result.netProfitUsd).toBe(150)
  })

  it('enforces bounds on margin', () => {
    const resultHigh = engine.compute({ costEstimate: baseCost, targetProfitMargin: 0.99 })
    expect(resultHigh.suggestedMarginPct).toBe(0.90) // capped

    const resultLow = engine.compute({ costEstimate: baseCost, targetProfitMargin: 0.01 })
    expect(resultLow.suggestedMarginPct).toBe(0.10) // minimum
  })
})
