// =============================================================================
// tests/quote-orchestrator.test.ts — QuoteOrchestrator integration tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { QuoteOrchestrator, QuoteRequest } from '../src/dental/quote.orchestrator'
import { createEmptyInventoryState, InventoryEngine } from '../src/dental/inventory.engine'

const BASE_REQUEST: QuoteRequest = {
  tenantId:          '123e4567-e89b-12d3-a456-426614174000',
  patientRef:        'PAC-001',
  doctorRef:         'DR-001',
  procedures: [{ code: 'LIMPIEZA_PROFILAXIS', quantity: 1 }],
  currency:          'USD',
  chairRatePerHour:  80,
  overheadPct:       0.35,
  financialRiskFactor: 1.0,
}

describe('QuoteOrchestrator', () => {
  let orchestrator: QuoteOrchestrator

  beforeEach(() => { orchestrator = new QuoteOrchestrator() })

  // ── Basic generation ──────────────────────────────────────────────

  describe('generate()', () => {
    it('returns a TreatmentPlan with version 1', () => {
      const result = orchestrator.generate(BASE_REQUEST)
      expect(result.plan.planId).toMatch(/^TP-/)
      expect(result.plan.currentVersion).toBe(1)
      expect(result.plan.status).toBe('DRAFT')
      expect(result.plan.versions.length).toBe(1)
    })

    it('includes a frozen FinancialSnapshot', () => {
      const result = orchestrator.generate(BASE_REQUEST)
      const snapshot = result.plan.versions[0].financials
      expect(snapshot.snapshotId).toMatch(/^FS-/)
      expect(snapshot.frozenAt).toBeTruthy()
      expect(snapshot.algorithmVersion).toContain('dental-quote')
    })

    it('financial summary is consistent with snapshot', () => {
      const result  = orchestrator.generate(BASE_REQUEST)
      const snap    = result.plan.versions[0].financials
      expect(result.financialSummary.finalPriceUsd).toBe(snap.finalPriceUsd)
      expect(result.financialSummary.netProfitUsd).toBe(snap.netProfitUsd)
      expect(result.financialSummary.totalBaseCostUsd).toBe(snap.totalBaseCostUsd)
    })

    it('price > cost (margin is applied)', () => {
      const result = orchestrator.generate(BASE_REQUEST)
      expect(result.financialSummary.finalPriceUsd).toBeGreaterThan(result.financialSummary.totalBaseCostUsd)
    })

    it('has a validUntil 30 days in future', () => {
      const result   = orchestrator.generate(BASE_REQUEST)
      const until    = new Date(result.validUntil)
      const diff     = until.getTime() - Date.now()
      const days     = diff / (24 * 3600_000)
      expect(days).toBeGreaterThan(29)
      expect(days).toBeLessThan(31)
    })

    it('includes a locked ExchangeRateSnapshot', () => {
      const result   = orchestrator.generate({ ...BASE_REQUEST, currency: 'MXN' })
      const fxSnap   = result.plan.versions[0].exchangeSnapshot
      expect(fxSnap.snapshotId).toMatch(/^FX-/)
      expect(fxSnap.targetCurrency).toBe('MXN')
      expect(fxSnap.rate).toBeGreaterThan(10)
    })

    it('converts totalInCurrency correctly', () => {
      const result = orchestrator.generate({ ...BASE_REQUEST, currency: 'MXN' })
      const { finalPriceUsd, totalInCurrency, exchangeRate } = result.financialSummary
      expect(totalInCurrency).toBeCloseTo(finalPriceUsd * exchangeRate, 2)
    })

    it('is deterministic for identical inputs (price)', () => {
      const r1 = orchestrator.generate(BASE_REQUEST)
      const r2 = orchestrator.generate(BASE_REQUEST)
      expect(r1.financialSummary.finalPriceUsd).toBe(r2.financialSummary.finalPriceUsd)
      expect(r1.financialSummary.netProfitUsd).toBe(r2.financialSummary.netProfitUsd)
    })

    it('generates unique plan IDs for identical inputs', () => {
      const r1 = orchestrator.generate(BASE_REQUEST)
      const r2 = orchestrator.generate(BASE_REQUEST)
      expect(r1.plan.planId).not.toBe(r2.plan.planId)
    })
  })

  // ── Multi-procedure quotes ────────────────────────────────────────

  describe('multi-procedure quotes', () => {
    it('aggregates costs correctly for multiple procedures', () => {
      const result = orchestrator.generate({
        ...BASE_REQUEST,
        procedures: [
          { code: 'LIMPIEZA_PROFILAXIS', quantity: 1 },
          { code: 'EXTRACCION_SIMPLE',   quantity: 2 },
          { code: 'CORONA_ZIRCONIA',     quantity: 1 },
        ],
      })
      const snap = result.plan.versions[0].financials
      // Total materials > single procedure
      expect(snap.totalMaterialsCostUsd).toBeGreaterThan(10)
      expect(result.plan.versions[0].procedures.length).toBe(3)
    })

    it('expensive procedures produce higher price', () => {
      const cheap     = orchestrator.generate({ ...BASE_REQUEST, procedures: [{ code: 'LIMPIEZA_PROFILAXIS', quantity: 1 }] })
      const expensive = orchestrator.generate({ ...BASE_REQUEST, procedures: [{ code: 'IMPLANTE_TITANIO', quantity: 2 }] })
      expect(expensive.financialSummary.finalPriceUsd).toBeGreaterThan(cheap.financialSummary.finalPriceUsd * 5)
    })
  })

  // ── PricingRules ─────────────────────────────────────────────────

  describe('PricingRules application', () => {
    const now = new Date()
    const validRule = {
      ruleId:      'RULE-001',
      type:        'PERCENT_DISCOUNT' as const,
      description: '10% welcome discount',
      discountPct: 0.10,
      validFrom:   new Date(now.getTime() - 86400_000).toISOString(),
      validUntil:  new Date(now.getTime() + 86400_000).toISOString(),
    }

    it('applies a percent discount correctly', () => {
      const baseResult   = orchestrator.generate(BASE_REQUEST)
      const discountResult = orchestrator.generate({ ...BASE_REQUEST, pricingRules: [validRule] })

      expect(discountResult.financialSummary.discountApplied).toBeGreaterThan(0)
      expect(discountResult.financialSummary.finalPriceUsd).toBeLessThan(baseResult.financialSummary.finalPriceUsd)
    })

    it('ignores expired pricing rules', () => {
      const expiredRule = {
        ...validRule,
        validFrom:  new Date(now.getTime() - 200000_000).toISOString(),
        validUntil: new Date(now.getTime() - 100000_000).toISOString(),
      }
      const baseResult    = orchestrator.generate(BASE_REQUEST)
      const expiredResult = orchestrator.generate({ ...BASE_REQUEST, pricingRules: [expiredRule] })
      expect(expiredResult.financialSummary.discountApplied).toBe(0)
      expect(expiredResult.financialSummary.finalPriceUsd).toBe(baseResult.financialSummary.finalPriceUsd)
    })
  })

  // ── Financing ─────────────────────────────────────────────────────

  describe('financing', () => {
    it('calculates financing when months are specified', () => {
      const result = orchestrator.generate({ ...BASE_REQUEST, financingMonths: 12, currency: 'MXN' })
      const fin    = result.financialSummary.financingOption
      expect(fin).toBeDefined()
      expect(fin!.months).toBe(12)
      expect(fin!.monthlyPayment).toBeGreaterThan(0)
      expect(fin!.totalAmount).toBeGreaterThanOrEqual(result.financialSummary.totalInCurrency)
    })

    it('no financing option when financingMonths not provided', () => {
      const result = orchestrator.generate(BASE_REQUEST)
      expect(result.financialSummary.financingOption).toBeUndefined()
    })
  })

  // ── Inventory integration ─────────────────────────────────────────

  describe('inventory integration', () => {
    it('produces inventoryWarnings when stock is insufficient', () => {
      const inventoryState = createEmptyInventoryState() // no items = no stock
      const result = orchestrator.generate({ ...BASE_REQUEST, inventoryState })
      // LIMPIEZA_PROFILAXIS consumes prophylaxis-paste and fluoride-varnish
      expect(result.inventoryWarnings.length).toBeGreaterThan(0)
    })

    it('produces no warnings when stock is sufficient', () => {
      const invEngine = new InventoryEngine()
      let invState    = createEmptyInventoryState()
      const TENANT    = BASE_REQUEST.tenantId

      // Add enough stock
      const r1 = invEngine.addItem(invState,  { tenantId: TENANT, name: 'prophylaxis-paste', unit: 'UNIT', unitCostUsd: 2, initialStock: 100, minimumStock: 10 })
      invState  = r1.newState
      // Override itemId to match consumption map key
      invState.items.delete(r1.item.itemId)
      invState.items.set('prophylaxis-paste',  { ...r1.item, itemId: 'prophylaxis-paste' })

      const r2 = invEngine.addItem(invState, { tenantId: TENANT, name: 'fluoride-varnish', unit: 'UNIT', unitCostUsd: 3, initialStock: 100, minimumStock: 10 })
      invState  = r2.newState
      invState.items.delete(r2.item.itemId)
      invState.items.set('fluoride-varnish', { ...r2.item, itemId: 'fluoride-varnish' })

      const result = orchestrator.generate({ ...BASE_REQUEST, inventoryState: invState })
      expect(result.inventoryWarnings.length).toBe(0)
    })
  })

  // ── Revision (new version) ────────────────────────────────────────

  describe('revise()', () => {
    it('creates a new version without mutating original plan', () => {
      const original = orchestrator.generate(BASE_REQUEST)
      const revised  = orchestrator.revise(
        original.plan,
        { ...BASE_REQUEST, procedures: [{ code: 'CORONA_ZIRCONIA', quantity: 1 }] },
        'Patient switched to zirconia crown'
      )

      // Original plan untouched
      expect(original.plan.currentVersion).toBe(1)
      expect(original.plan.versions.length).toBe(1)

      // Revised plan has 2 versions
      expect(revised.plan.currentVersion).toBe(2)
      expect(revised.plan.versions.length).toBe(2)
      expect(revised.plan.status).toBe('DRAFT')

      // Version history is preserved
      expect(revised.plan.versions[0].procedures[0].code).toBe('LIMPIEZA_PROFILAXIS')
      expect(revised.plan.versions[1].procedures[0].code).toBe('CORONA_ZIRCONIA')
    })

    it('each version has its own frozen snapshot', () => {
      const original = orchestrator.generate(BASE_REQUEST)
      const revised  = orchestrator.revise(
        original.plan,
        { ...BASE_REQUEST, procedures: [{ code: 'IMPLANTE_TITANIO', quantity: 1 }] },
        'Added implant'
      )
      const snap1 = revised.plan.versions[0].financials
      const snap2 = revised.plan.versions[1].financials
      expect(snap1.snapshotId).not.toBe(snap2.snapshotId)
      expect(snap1.finalPriceUsd).not.toBe(snap2.finalPriceUsd)
    })
  })
})
