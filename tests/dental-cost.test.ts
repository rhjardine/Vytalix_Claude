// =============================================================================
// tests/unit/dental-cost.test.ts — DentalCostEngine unit tests
// Run: npx vitest run tests/unit/dental-cost.test.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { DentalCostEngine, TREATMENT_CATALOG } from '../src/dental/dental-cost.engine'

describe('DentalCostEngine', () => {
  let engine: DentalCostEngine

  beforeEach(() => { engine = new DentalCostEngine() })

  // ── getCatalog() ──────────────────────────────────────────────

  describe('getCatalog()', () => {
    it('returns all 18 treatments without filter', () => {
      const catalog = engine.getCatalog()
      expect(catalog.length).toBe(18)
    })

    it('filters by SURGICAL category', () => {
      const surgical = engine.getCatalog('SURGICAL')
      expect(surgical.length).toBeGreaterThan(0)
      surgical.forEach(t => expect(t.category).toBe('SURGICAL'))
    })

    it('filters by AESTHETIC category', () => {
      const aesthetic = engine.getCatalog('AESTHETIC')
      expect(aesthetic.every(t => t.category === 'AESTHETIC')).toBe(true)
    })

    it('all treatments have required fields', () => {
      const catalog = engine.getCatalog()
      catalog.forEach(t => {
        expect(t.code).toBeTruthy()
        expect(t.name).toBeTruthy()
        expect(t.nameEs).toBeTruthy()
        expect(t.materialsCostUsd).toBeGreaterThan(0)
        expect(t.avgDurationMinutes).toBeGreaterThan(0)
        expect(t.complexityFactor).toBeGreaterThanOrEqual(1.0)
      })
    })
  })

  // ── compute() ────────────────────────────────────────────────

  describe('compute() — basic calculations', () => {
    const baseInput = {
      treatmentCode: 'LIMPIEZA_PROFILAXIS' as const,
      quantity: 1,
      locationCode: 'MX-CDMX',
      chairRatePerHour: 80,
      overheadPct: 0.35,
    }

    it('returns all required fields', () => {
      const r = engine.compute(baseInput)
      expect(r).toMatchObject({
        treatmentCode:     'LIMPIEZA_PROFILAXIS',
        treatmentName:     expect.any(String),
        quantity:          1,
        breakdown:         expect.objectContaining({
          materialsUsd: expect.any(Number),
          labWorkUsd:   expect.any(Number),
          laborUsd:     expect.any(Number),
          overheadUsd:  expect.any(Number),
        }),
        subtotalUsd:       expect.any(Number),
        adjustedTotalUsd:  expect.any(Number),
        algorithmVersion:  '1.0.0',
        computedAt:        expect.any(String),
      })
    })

    it('subtotal = materials + labWork + labor + overhead', () => {
      const r = engine.compute(baseInput)
      const computedSubtotal = r.breakdown.materialsUsd + r.breakdown.labWorkUsd
        + r.breakdown.laborUsd + r.breakdown.overheadUsd
      expect(r.subtotalUsd).toBeCloseTo(computedSubtotal, 1)
    })

    it('adjustedTotal reflects location factor', () => {
      const cdmx   = engine.compute({ ...baseInput, locationCode: 'MX-CDMX' })
      const border = engine.compute({ ...baseInput, locationCode: 'US-BORDER' })
      // US-BORDER factor (1.20) > MX-CDMX (1.00)
      expect(border.adjustedTotalUsd).toBeGreaterThan(cdmx.adjustedTotalUsd)
    })

    it('quantity multiplies materials and lab costs', () => {
      const r1 = engine.compute({ ...baseInput, quantity: 1 })
      const r4 = engine.compute({ ...baseInput, quantity: 4 })
      expect(r4.breakdown.materialsUsd).toBeCloseTo(r1.breakdown.materialsUsd * 4, 1)
    })

    it('higher chair rate increases labor cost', () => {
      const low  = engine.compute({ ...baseInput, chairRatePerHour: 50 })
      const high = engine.compute({ ...baseInput, chairRatePerHour: 150 })
      expect(high.breakdown.laborUsd).toBeGreaterThan(low.breakdown.laborUsd)
    })

    it('overhead is proportional to base cost', () => {
      const r = engine.compute({ ...baseInput, overheadPct: 0.35 })
      const base = r.breakdown.materialsUsd + r.breakdown.labWorkUsd + r.breakdown.laborUsd
      expect(r.breakdown.overheadUsd).toBeCloseTo(base * 0.35, 1)
    })

    it('zero overhead = no overhead charge', () => {
      const r = engine.compute({ ...baseInput, overheadPct: 0 })
      expect(r.breakdown.overheadUsd).toBe(0)
    })
  })

  // ── Treatment-specific tests ──────────────────────────────────

  describe('compute() — treatment specifics', () => {
    it('IMPLANTE_TITANIO costs more than LIMPIEZA_PROFILAXIS', () => {
      const implant  = engine.compute({ treatmentCode: 'IMPLANTE_TITANIO',   quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      const cleaning = engine.compute({ treatmentCode: 'LIMPIEZA_PROFILAXIS', quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      expect(implant.adjustedTotalUsd).toBeGreaterThan(cleaning.adjustedTotalUsd * 5)
    })

    it('CORONA_ZIRCONIA includes lab work', () => {
      const r = engine.compute({ treatmentCode: 'CORONA_ZIRCONIA', quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      expect(r.breakdown.labWorkUsd).toBeGreaterThan(0)
    })

    it('EXTRACCION_SIMPLE has no lab work', () => {
      const r = engine.compute({ treatmentCode: 'EXTRACCION_SIMPLE', quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      expect(r.breakdown.labWorkUsd).toBe(0)
    })

    it('complexity label reflects factor', () => {
      const complex = engine.compute({ treatmentCode: 'INJERTO_OSEO', quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      expect(complex.complexityLabel).not.toBe('Estándar')
    })

    it('input snapshot is included in result for auditability', () => {
      const input = { treatmentCode: 'BLANQUEAMIENTO_LASER' as const, quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 }
      const r = engine.compute(input)
      expect(r.inputSnapshot.treatmentCode).toBe('BLANQUEAMIENTO_LASER')
      expect(r.inputSnapshot.chairRatePerHour).toBe(80)
    })
  })

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('throws 422 for unknown treatment code', () => {
      expect(() => engine.compute({
        treatmentCode: 'INVALID_CODE' as any,
        quantity: 1, chairRatePerHour: 80, overheadPct: 0.35,
      })).toThrow()
    })

    it('throws with statusCode 422', () => {
      try {
        engine.compute({ treatmentCode: 'DOES_NOT_EXIST' as any, quantity: 1, chairRatePerHour: 80, overheadPct: 0.35 })
      } catch (err: any) {
        expect(err.statusCode).toBe(422)
      }
    })
  })

  // ── Determinism ───────────────────────────────────────────────

  describe('determinism', () => {
    it('same inputs produce identical outputs', () => {
      const input = { treatmentCode: 'CORONA_METAL_PORCELANA' as const, quantity: 2, locationCode: 'MX-MTY', chairRatePerHour: 90, overheadPct: 0.30 }
      const r1 = engine.compute(input)
      const r2 = engine.compute(input)
      expect(r1.adjustedTotalUsd).toBe(r2.adjustedTotalUsd)
      expect(JSON.stringify(r1.breakdown)).toBe(JSON.stringify(r2.breakdown))
    })
  })
})

// ─────────────────────────────────────────────────────────────────

describe('TREATMENT_CATALOG — completeness', () => {
  it('has entries for all expected categories', () => {
    const categories = new Set(Object.values(TREATMENT_CATALOG).map(t => t.category))
    const expected   = ['AESTHETIC','RESTORATIVE','SURGICAL','ORTHODONTIC','PREVENTIVE','PROSTHETIC']
    expected.forEach(c => expect(categories.has(c as any)).toBe(true))
  })

  it('all material costs are positive', () => {
    Object.values(TREATMENT_CATALOG).forEach(t => {
      expect(t.materialsCostUsd).toBeGreaterThan(0)
    })
  })

  it('all complexity factors are >= 1.0', () => {
    Object.values(TREATMENT_CATALOG).forEach(t => {
      expect(t.complexityFactor).toBeGreaterThanOrEqual(1.0)
    })
  })
})
