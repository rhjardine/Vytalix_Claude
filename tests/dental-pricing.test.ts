import { describe, it, expect, beforeEach } from 'vitest'
import { DentalPricingService, PriceQuoteInput } from '../src/dental/dental-pricing.service'

describe('DentalPricingService', () => {
  let service: DentalPricingService

  beforeEach(() => {
    service = new DentalPricingService()
  })

  it('generates a complete quote orchestrating cost, margin, and exchange engines', () => {
    const input: PriceQuoteInput = {
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      patientRef: 'P1',
      treatments: [{ code: 'LIMPIEZA_PROFILAXIS', quantity: 1 }],
      currency: 'MXN', // tests exchange
      includeFinancing: true,
      targetProfitMargin: 0.5,
    }

    const quote = service.generateQuote(input)
    
    expect(quote.quoteId).toMatch(/^QT-/)
    expect(quote.currency).toBe('MXN')
    expect(quote.exchangeRate).toBeGreaterThan(1) // USD -> MXN
    
    expect(quote.lineItems.length).toBe(1)
    const item = quote.lineItems[0]
    expect(item.treatmentCode).toBe('LIMPIEZA_PROFILAXIS')
    expect(item.suggestedMarginPct).toBe(0.5)
    
    // Total price should be higher than base cost
    expect(item.priceUsd).toBeGreaterThan(item.baseCostUsd)
    
    // Financing
    expect(quote.financingOptions).toBeDefined()
    expect(quote.financingOptions?.length).toBeGreaterThan(0)
    
    expect(quote.totalInCurrency).toBeCloseTo(quote.totalUsd * quote.exchangeRate, 1)
  })

  it('generates without financing if requested', () => {
    const input: PriceQuoteInput = {
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      treatments: [{ code: 'EXTRACCION_SIMPLE', quantity: 1 }],
      currency: 'USD',
      includeFinancing: false,
    }

    const quote = service.generateQuote(input)
    expect(quote.financingOptions).toBeUndefined()
    expect(quote.currency).toBe('USD')
    expect(quote.exchangeRate).toBe(1.0)
  })

  it('calculates total net profit', () => {
    const input: PriceQuoteInput = {
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      treatments: [
        { code: 'EXTRACCION_SIMPLE', quantity: 1 },
        { code: 'LIMPIEZA_PROFILAXIS', quantity: 1 }
      ],
      targetProfitMargin: 0.5,
    }

    const quote = service.generateQuote(input)
    
    const sumProfit = quote.lineItems.reduce((acc, item) => acc + item.netProfitUsd, 0)
    expect(quote.totalNetProfitUsd).toBeCloseTo(sumProfit, 1)
  })
})
