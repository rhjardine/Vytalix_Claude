// =============================================================================
// src/dental/exchange.engine.ts
// CFE Dental — Exchange Rate Engine
//
// Responsibilities:
//   - Convert currencies securely and deterministically.
//   - Generate ExchangeRateSnapshots to lock in rates for quotes.
//
// Pure engine. No persistence.
// =============================================================================

export const EXCHANGE_ENGINE_VERSION = '1.0.0'

export interface ExchangeRateSnapshot {
  baseCurrency: string
  targetCurrency: string
  rate: number
  lockedAt: string
  validUntil: string
  provider: string
}

export interface ExchangeConversionInput {
  amount: number
  baseCurrency: string
  targetCurrency: string
  snapshot?: ExchangeRateSnapshot
}

export interface ExchangeConversionResult {
  originalAmount: number
  convertedAmount: number
  appliedRate: number
  currency: string
  snapshotUsed: ExchangeRateSnapshot
}

export class ExchangeEngine {
  private readonly version = EXCHANGE_ENGINE_VERSION

  // Static fallback rates (simulating a provider)
  private readonly STATIC_RATES: Record<string, number> = {
    MXN: 17.15,
    COP: 4000.0,
    ARS: 870.0,
    CLP: 930.0,
    PEN: 3.72,
    BRL: 4.97,
    EUR: 0.92,
    CAD: 1.37,
  }

  generateSnapshot(baseCurrency: string, targetCurrency: string): ExchangeRateSnapshot {
    const b = baseCurrency.toUpperCase()
    const t = targetCurrency.toUpperCase()
    
    let rate = 1.0
    
    if (b === 'USD' && this.STATIC_RATES[t]) {
      rate = this.STATIC_RATES[t]
    } else if (t === 'USD' && this.STATIC_RATES[b]) {
      rate = 1.0 / this.STATIC_RATES[b]
    } else if (b !== t) {
      // Cross-conversion through USD
      const bToUsd = b === 'USD' ? 1.0 : (1.0 / (this.STATIC_RATES[b] || 1.0))
      const usdToT = t === 'USD' ? 1.0 : (this.STATIC_RATES[t] || 1.0)
      rate = bToUsd * usdToT
    }

    const now = new Date()
    // Lock rate for 7 days
    const validUntil = new Date(now.getTime() + 7 * 24 * 3600_000)

    return {
      baseCurrency: b,
      targetCurrency: t,
      rate: round4(rate),
      lockedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      provider: 'STATIC_FALLBACK_v1',
    }
  }

  convert(input: ExchangeConversionInput): ExchangeConversionResult {
    let snapshot = input.snapshot
    
    if (!snapshot) {
      snapshot = this.generateSnapshot(input.baseCurrency, input.targetCurrency)
    }

    // Ensure snapshot matches requested currencies
    if (snapshot.baseCurrency !== input.baseCurrency.toUpperCase() || 
        snapshot.targetCurrency !== input.targetCurrency.toUpperCase()) {
      throw new Error(`Snapshot currencies (${snapshot.baseCurrency}->${snapshot.targetCurrency}) do not match request (${input.baseCurrency}->${input.targetCurrency})`)
    }

    const convertedAmount = input.amount * snapshot.rate

    return {
      originalAmount: input.amount,
      convertedAmount: round2(convertedAmount),
      appliedRate: snapshot.rate,
      currency: snapshot.targetCurrency,
      snapshotUsed: snapshot,
    }
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round4(n: number): number { return Math.round(n * 10000) / 10000 }
