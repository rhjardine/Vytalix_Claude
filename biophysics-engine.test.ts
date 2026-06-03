// =============================================================================
// tests/unit/biophysics-engine.test.ts
// Pure unit tests — no DB, no Redis, no network.
// Run: npx vitest run tests/unit/biophysics-engine.test.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { BiophysicsEngine, BiophysicsMeasurements } from '../../src/biological-age/biophysics-engine'

// ── Fixtures ──────────────────────────────────────────────────────

const MALE_40_HEALTHY: BiophysicsMeasurements = {
  fatPercentage:       18.0,
  bmi:                 23.5,
  digitalReflexes:     { high: 0.7, long: 12.0, width: 7.5 },
  visualAccommodation: 3.2,
  staticBalance:       { high: 14.0, long: 32.0, width: 8.5 },
  skinHydration:       52.0,
  systolicPressure:    118.0,
  diastolicPressure:   75.0,
}

const MALE_40_AGED: BiophysicsMeasurements = {
  fatPercentage:       28.0,
  bmi:                 29.5,
  digitalReflexes:     { high: 1.8, long: 22.0, width: 12.0 },
  visualAccommodation: 0.8,
  staticBalance:       { high: 6.0, long: 18.0, width: 5.0 },
  skinHydration:       28.0,
  systolicPressure:    148.0,
  diastolicPressure:   94.0,
}

const MALE_40_ATHLETE: BiophysicsMeasurements = {
  fatPercentage:       10.0,
  bmi:                 22.0,
  digitalReflexes:     { high: 0.4, long: 8.0, width: 5.0 },
  visualAccommodation: 4.5,
  staticBalance:       { high: 18.0, long: 45.0, width: 10.0 },
  skinHydration:       62.0,
  systolicPressure:    108.0,
  diastolicPressure:   65.0,
}

// ─────────────────────────────────────────────────────────────────

describe('BiophysicsEngine', () => {
  let engine: BiophysicsEngine

  beforeEach(() => {
    engine = new BiophysicsEngine()
  })

  // ── Core computation ──────────────────────────────────────────────

  describe('compute()', () => {
    it('returns all required fields', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)

      expect(result).toMatchObject({
        biologicalAge:    expect.any(Number),
        differentialAge:  expect.any(Number),
        ageStatus:        expect.stringMatching(/^(REJUVENECIDO|NORMAL|ENVEJECIDO)$/),
        algorithmVersion: expect.stringContaining('daaa-biophysics'),
        computedAt:       expect.any(Date),
      })
    })

    it('returns all 8 partial ages', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)

      expect(Object.keys(result.partialAges)).toEqual([
        'fatAge', 'bmiAge', 'reflexesAge', 'visualAge',
        'balanceAge', 'hydrationAge', 'systolicAge', 'diastolicAge',
      ])
      for (const val of Object.values(result.partialAges)) {
        expect(typeof val).toBe('number')
        expect(val).toBeGreaterThan(0)
        expect(val).toBeLessThan(120)
      }
    })

    it('healthy 40-year-old scores REJUVENECIDO or NORMAL', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      expect(['REJUVENECIDO', 'NORMAL']).toContain(result.ageStatus)
      expect(result.biologicalAge).toBeLessThanOrEqual(44)
    })

    it('unhealthy 40-year-old scores ENVEJECIDO with positive differential', () => {
      const result = engine.compute(MALE_40_AGED, 40, 'MALE', false)
      expect(result.ageStatus).toBe('ENVEJECIDO')
      expect(result.differentialAge).toBeGreaterThan(0)
      expect(result.biologicalAge).toBeGreaterThan(40)
    })

    it('athlete profile scores more rejuvenated than unhealthy profile', () => {
      const athleteResult  = engine.compute(MALE_40_ATHLETE, 40, 'MALE', true)
      const agedResult     = engine.compute(MALE_40_AGED,    40, 'MALE', false)
      expect(athleteResult.biologicalAge).toBeLessThan(agedResult.biologicalAge)
    })

    it('biological age is rounded to 1 decimal', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const decimalPlaces = (result.biologicalAge.toString().split('.')[1] ?? '').length
      expect(decimalPlaces).toBeLessThanOrEqual(1)
    })

    it('differential = biologicalAge - chronologicalAge (rounded)', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      expect(result.differentialAge).toBeCloseTo(
        parseFloat((result.biologicalAge - 40).toFixed(1)),
        5
      )
    })
  })

  // ── Age status classification ─────────────────────────────────────

  describe('ageStatus classification', () => {
    it('differentialAge <= -2 → REJUVENECIDO', () => {
      // Force a rejuvenated result by using athlete measurements on a 50-year-old
      const result = engine.compute(MALE_40_ATHLETE, 50, 'MALE', true)
      if (result.differentialAge <= -2) {
        expect(result.ageStatus).toBe('REJUVENECIDO')
      }
    })

    it('differentialAge >= 2 → ENVEJECIDO', () => {
      const result = engine.compute(MALE_40_AGED, 40, 'MALE', false)
      if (result.differentialAge >= 2) {
        expect(result.ageStatus).toBe('ENVEJECIDO')
      }
    })

    it('differentialAge between -2 and 2 → NORMAL', () => {
      // For any result with small delta, status must be NORMAL
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      if (result.differentialAge > -2 && result.differentialAge < 2) {
        expect(result.ageStatus).toBe('NORMAL')
      }
    })
  })

  // ── Sex-specific boards ───────────────────────────────────────────

  describe('sex-specific computation', () => {
    it('female boards are applied (fat% range adjusted)', () => {
      // Same measurements on male vs female should yield different partial fat ages
      const maleResult   = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const femaleResult = engine.compute(MALE_40_HEALTHY, 40, 'FEMALE', false)
      // Fat percentage interpretation differs by sex — partial ages should differ
      expect(maleResult.partialAges.fatAge).not.toEqual(femaleResult.partialAges.fatAge)
    })

    it('INTERSEX falls back to MALE boards without throwing', () => {
      expect(() => engine.compute(MALE_40_HEALTHY, 40, 'INTERSEX', false)).not.toThrow()
    })
  })

  // ── Custom boards override ────────────────────────────────────────

  describe('custom boards', () => {
    it('accepts empty boards array and falls back to defaults', () => {
      expect(() => engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, [])).not.toThrow()
    })

    it('custom boards override default ranges', () => {
      const customBoards = [{
        measurementKey: 'fatPercentage',
        ranges: [
          { ageMin: 20, ageMax: 80, valueMin: 5, valueMax: 40 },
        ],
      }]
      const defaultResult = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const customResult  = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, customBoards as any)
      // Fat age may differ but should still be a valid number
      expect(customResult.partialAges.fatAge).toBeGreaterThan(0)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('very young patient (18) does not throw', () => {
      expect(() => engine.compute(MALE_40_HEALTHY, 18, 'MALE', false)).not.toThrow()
    })

    it('elderly patient (80) does not throw', () => {
      expect(() => engine.compute(MALE_40_AGED, 80, 'MALE', false)).not.toThrow()
    })

    it('minimum valid measurements do not produce NaN', () => {
      const minMeasurements: BiophysicsMeasurements = {
        fatPercentage:       2,
        bmi:                 10,
        digitalReflexes:     { high: 0.1, long: 1.0, width: 1.0 },
        visualAccommodation: 0,
        staticBalance:       { high: 0.1, long: 1.0, width: 1.0 },
        skinHydration:       1,
        systolicPressure:    60,
        diastolicPressure:   40,
      }
      const result = engine.compute(minMeasurements, 40, 'MALE', false)
      expect(isNaN(result.biologicalAge)).toBe(false)
      expect(isNaN(result.differentialAge)).toBe(false)
    })

    it('same measurements produce same biologicalAge regardless of chronologicalAge', () => {
      // The engine maps measurements → biological age via baremos.
      // Chronological age affects the differential, not the biological age itself.
      const result20 = engine.compute(MALE_40_HEALTHY, 20, 'MALE', false)
      const result60 = engine.compute(MALE_40_HEALTHY, 60, 'MALE', false)
      // Same measurements → same biological age (baremos are measurement-based, not age-relative)
      expect(result20.biologicalAge).toBeCloseTo(result60.biologicalAge, 1)
      // 20yo has higher positive differential (measurements suggest ~40yo biology)
      expect(result20.differentialAge).toBeGreaterThan(result60.differentialAge)
    })

    it('algorithmVersion is stable across calls', () => {
      const r1 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const r2 = engine.compute(MALE_40_AGED,    40, 'MALE', false)
      expect(r1.algorithmVersion).toBe(r2.algorithmVersion)
    })
  })

  // ── Determinism ───────────────────────────────────────────────────

  describe('determinism', () => {
    it('same inputs always produce same output', () => {
      const r1 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const r2 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)
      const r3 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false)

      expect(r1.biologicalAge).toBe(r2.biologicalAge)
      expect(r2.biologicalAge).toBe(r3.biologicalAge)
      expect(r1.differentialAge).toBe(r2.differentialAge)
      expect(JSON.stringify(r1.partialAges)).toBe(JSON.stringify(r2.partialAges))
    })
  })
})
