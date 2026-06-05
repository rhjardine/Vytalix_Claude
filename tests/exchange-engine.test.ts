import { describe, it, expect, beforeEach } from 'vitest'
import { ExchangeEngine } from '../src/dental/exchange.engine'

describe('ExchangeEngine', () => {
  let engine: ExchangeEngine

  beforeEach(() => {
    engine = new ExchangeEngine()
  })

  it('generates a snapshot for a given currency pair', () => {
    const snapshot = engine.generateSnapshot('USD', 'MXN')
    expect(snapshot.baseCurrency).toBe('USD')
    expect(snapshot.targetCurrency).toBe('MXN')
    expect(snapshot.rate).toBeGreaterThan(10) // e.g. 17.15
    expect(snapshot.lockedAt).toBeTruthy()
    expect(snapshot.validUntil).toBeTruthy()
  })

  it('converts USD to target currency using generated snapshot automatically', () => {
    const result = engine.convert({ amount: 100, baseCurrency: 'USD', targetCurrency: 'MXN' })
    expect(result.currency).toBe('MXN')
    expect(result.convertedAmount).toBeCloseTo(100 * result.appliedRate, 2)
  })

  it('allows passing an explicit snapshot', () => {
    const snap = engine.generateSnapshot('USD', 'COP')
    // modify rate to test explicit usage
    snap.rate = 5000 
    const result = engine.convert({ amount: 10, baseCurrency: 'USD', targetCurrency: 'COP', snapshot: snap })
    expect(result.convertedAmount).toBe(50000)
    expect(result.snapshotUsed.rate).toBe(5000)
  })

  it('throws if explicit snapshot currencies do not match request', () => {
    const snap = engine.generateSnapshot('USD', 'MXN')
    expect(() => {
      engine.convert({ amount: 100, baseCurrency: 'USD', targetCurrency: 'COP', snapshot: snap })
    }).toThrow(/do not match request/)
  })

  it('handles cross-currency conversion (e.g. MXN to EUR)', () => {
    const result = engine.convert({ amount: 1000, baseCurrency: 'MXN', targetCurrency: 'EUR' })
    // USD->MXN is 17.15, USD->EUR is 0.92
    // MXN to USD = 1/17.15. Then USD to EUR = *0.92.
    // So 1000 MXN -> ~53.64 EUR
    expect(result.appliedRate).toBeCloseTo((1 / 17.15) * 0.92, 4)
    expect(result.convertedAmount).toBeCloseTo(1000 * ((1 / 17.15) * 0.92), 1)
  })

  it('same currency conversion returns 1.0 rate', () => {
    const result = engine.convert({ amount: 150, baseCurrency: 'USD', targetCurrency: 'USD' })
    expect(result.appliedRate).toBe(1.0)
    expect(result.convertedAmount).toBe(150)
  })
})
