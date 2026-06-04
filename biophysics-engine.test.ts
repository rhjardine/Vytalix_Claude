// =============================================================================
// biophysics-engine.test.ts
// Pure unit tests — no DB, no Redis, no network.
// Tests both the pure exported functions AND the BiophysicsEngine class.
// Run: npx vitest run biophysics-engine.test.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  BiophysicsEngine,
  BiophysicsMeasurements,
  BiophysicsPartialAges,
  BaremoRange,
  ALGORITHM_VERSION,
  ITEM_WEIGHTS,
  DEFAULT_BOARDS_MALE_NONATHLETE,
  reduceMeasurements,
  interpolateAge,
  computePartialAges,
  weightedAverage,
  classifyAgeStatus,
  resolveBoardsMap,
  buildFemaleDefaultBoards,
} from './biophysics-engine'

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

const FIXED_DATE = new Date('2025-01-15T12:00:00Z')

// ─────────────────────────────────────────────────────────────────

describe('Pure function: reduceMeasurements()', () => {
  it('computes reflexVolume as high × long × width', () => {
    const scalars = reduceMeasurements(MALE_40_HEALTHY)
    const expected = 0.7 * 12.0 * 7.5
    expect(scalars.reflexes).toBeCloseTo(expected, 6)
  })

  it('computes balanceProduct as high × long × width', () => {
    const scalars = reduceMeasurements(MALE_40_HEALTHY)
    const expected = 14.0 * 32.0 * 8.5
    expect(scalars.balance).toBeCloseTo(expected, 6)
  })

  it('passes scalar measurements through unchanged', () => {
    const scalars = reduceMeasurements(MALE_40_HEALTHY)
    expect(scalars.fatPercentage).toBe(18.0)
    expect(scalars.bmi).toBe(23.5)
    expect(scalars.visualAccommodation).toBe(3.2)
    expect(scalars.skinHydration).toBe(52.0)
    expect(scalars.systolicPressure).toBe(118.0)
    expect(scalars.diastolicPressure).toBe(75.0)
  })

  it('is deterministic: same input → same output', () => {
    const r1 = reduceMeasurements(MALE_40_HEALTHY)
    const r2 = reduceMeasurements(MALE_40_HEALTHY)
    expect(r1).toEqual(r2)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('Pure function: interpolateAge()', () => {
  const ranges: BaremoRange[] = [
    { ageMin: 20, ageMax: 30, valueMin: 10, valueMax: 20 },
    { ageMin: 30, ageMax: 40, valueMin: 20, valueMax: 30 },
    { ageMin: 40, ageMax: 50, valueMin: 30, valueMax: 40 },
  ]

  it('returns chronologicalAge when ranges are empty', () => {
    expect(interpolateAge(25, [], 42)).toBe(42)
  })

  it('interpolates correctly within the middle of a range', () => {
    // Mid-value (15) in first range maps to midAge (25)
    const age = interpolateAge(15, ranges, 40)
    expect(age).toBeCloseTo(25, 0)
  })

  it('is deterministic: same inputs → same output', () => {
    const a1 = interpolateAge(22, ranges, 35)
    const a2 = interpolateAge(22, ranges, 35)
    expect(a1).toBe(a2)
  })

  it('returns a number (never NaN) for extreme values', () => {
    expect(isNaN(interpolateAge(0, ranges, 40))).toBe(false)
    expect(isNaN(interpolateAge(99999, ranges, 40))).toBe(false)
  })

  it('extrapolates for value below all ranges without throwing', () => {
    const age = interpolateAge(1, ranges, 40)
    expect(typeof age).toBe('number')
    expect(isNaN(age)).toBe(false)
  })

  it('extrapolates for value above all ranges without throwing', () => {
    const age = interpolateAge(999, ranges, 40)
    expect(typeof age).toBe('number')
    expect(isNaN(age)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('Pure function: weightedAverage()', () => {
  it('weights sum to 1.0 (no drift)', () => {
    const sum = Object.values(ITEM_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('returns correct weighted average', () => {
    const uniform: BiophysicsPartialAges = {
      fatAge: 40, bmiAge: 40, reflexesAge: 40, visualAge: 40,
      balanceAge: 40, hydrationAge: 40, systolicAge: 40, diastolicAge: 40,
    }
    // All equal → result should equal the uniform value
    expect(weightedAverage(uniform)).toBeCloseTo(40, 5)
  })

  it('is deterministic', () => {
    const pa: BiophysicsPartialAges = {
      fatAge: 35, bmiAge: 42, reflexesAge: 38, visualAge: 44,
      balanceAge: 41, hydrationAge: 39, systolicAge: 50, diastolicAge: 37,
    }
    expect(weightedAverage(pa)).toBe(weightedAverage(pa))
  })
})

// ─────────────────────────────────────────────────────────────────

describe('Pure function: classifyAgeStatus()', () => {
  it('≤ -2 → REJUVENECIDO', () => {
    expect(classifyAgeStatus(-2)).toBe('REJUVENECIDO')
    expect(classifyAgeStatus(-10)).toBe('REJUVENECIDO')
    expect(classifyAgeStatus(-2.1)).toBe('REJUVENECIDO')
  })

  it('≥ +2 → ENVEJECIDO', () => {
    expect(classifyAgeStatus(2)).toBe('ENVEJECIDO')
    expect(classifyAgeStatus(10)).toBe('ENVEJECIDO')
    expect(classifyAgeStatus(2.0)).toBe('ENVEJECIDO')
  })

  it('(-2, +2) exclusive → NORMAL', () => {
    expect(classifyAgeStatus(0)).toBe('NORMAL')
    expect(classifyAgeStatus(1.9)).toBe('NORMAL')
    expect(classifyAgeStatus(-1.9)).toBe('NORMAL')
  })

  // Pin test: thresholds must not drift between releases
  it('PIN: boundary values are stable (no drift)', () => {
    expect(classifyAgeStatus(-2.0)).toBe('REJUVENECIDO')
    expect(classifyAgeStatus(-1.99)).toBe('NORMAL')
    expect(classifyAgeStatus(1.99)).toBe('NORMAL')
    expect(classifyAgeStatus(2.0)).toBe('ENVEJECIDO')
  })
})

// ─────────────────────────────────────────────────────────────────

describe('Pure function: resolveBoardsMap()', () => {
  it('returns DB boards when provided and non-empty', () => {
    const dbBoards = [{ measurementKey: 'fatPercentage', ranges: [{ ageMin: 20, ageMax: 40, valueMin: 10, valueMax: 25 }] }]
    const result = resolveBoardsMap(dbBoards, 'MALE')
    expect(result.fatPercentage).toHaveLength(1)
  })

  it('returns female boards when sex=FEMALE and no DB boards', () => {
    const female = resolveBoardsMap(undefined, 'FEMALE')
    const male   = resolveBoardsMap(undefined, 'MALE')
    // Female fat% ranges should be 7pp higher than male
    expect(female.fatPercentage[0].valueMin).toBe(male.fatPercentage[0].valueMin + 7)
  })

  it('returns male boards for INTERSEX (conservative fallback)', () => {
    const intersex = resolveBoardsMap(undefined, 'INTERSEX')
    const male     = resolveBoardsMap(undefined, 'MALE')
    expect(JSON.stringify(intersex)).toBe(JSON.stringify(male))
  })

  it('falls back to defaults when empty DB boards array is provided', () => {
    const result = resolveBoardsMap([], 'MALE')
    expect(result.fatPercentage).toHaveLength(DEFAULT_BOARDS_MALE_NONATHLETE.fatPercentage.length)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('Pure function: computePartialAges()', () => {
  it('returns all 8 keys', () => {
    const scalars = reduceMeasurements(MALE_40_HEALTHY)
    const boards  = resolveBoardsMap(undefined, 'MALE')
    const pa      = computePartialAges(scalars, 40, boards)
    expect(Object.keys(pa)).toEqual([
      'fatAge', 'bmiAge', 'reflexesAge', 'visualAge',
      'balanceAge', 'hydrationAge', 'systolicAge', 'diastolicAge',
    ])
  })

  it('no NaN in any partial age', () => {
    const scalars = reduceMeasurements(MALE_40_AGED)
    const boards  = resolveBoardsMap(undefined, 'MALE')
    const pa      = computePartialAges(scalars, 40, boards)
    for (const val of Object.values(pa)) {
      expect(isNaN(val)).toBe(false)
    }
  })
})

// ─────────────────────────────────────────────────────────────────

describe('BiophysicsEngine (class)', () => {
  let engine: BiophysicsEngine

  beforeEach(() => {
    engine = new BiophysicsEngine()
  })

  describe('compute()', () => {
    it('returns all required fields including inputSnapshot', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)

      expect(result).toMatchObject({
        biologicalAge:    expect.any(Number),
        differentialAge:  expect.any(Number),
        ageStatus:        expect.stringMatching(/^(REJUVENECIDO|NORMAL|ENVEJECIDO)$/),
        algorithmVersion: ALGORITHM_VERSION,
        computedAt:       FIXED_DATE,
      })
      expect(result.inputSnapshot).toMatchObject({
        measurements:      MALE_40_HEALTHY,
        chronologicalAge:  40,
        sex:               'MALE',
        isAthlete:         false,
      })
    })

    it('inputSnapshot preserves original measurements exactly', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(result.inputSnapshot.measurements).toEqual(MALE_40_HEALTHY)
    })

    it('returns all 8 partial ages with valid numbers', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
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

    it('healthy 40yo scores REJUVENECIDO or NORMAL', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(['REJUVENECIDO', 'NORMAL']).toContain(result.ageStatus)
      expect(result.biologicalAge).toBeLessThanOrEqual(44)
    })

    it('unhealthy 40yo scores ENVEJECIDO with positive differential', () => {
      const result = engine.compute(MALE_40_AGED, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(result.ageStatus).toBe('ENVEJECIDO')
      expect(result.differentialAge).toBeGreaterThan(0)
      expect(result.biologicalAge).toBeGreaterThan(40)
    })

    it('athlete profile is more rejuvenated than aged profile', () => {
      const athleteResult = engine.compute(MALE_40_ATHLETE, 40, 'MALE', true,  undefined, FIXED_DATE)
      const agedResult    = engine.compute(MALE_40_AGED,    40, 'MALE', false, undefined, FIXED_DATE)
      expect(athleteResult.biologicalAge).toBeLessThan(agedResult.biologicalAge)
    })

    it('biological age is rounded to 1 decimal', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      const decimalPlaces = (result.biologicalAge.toString().split('.')[1] ?? '').length
      expect(decimalPlaces).toBeLessThanOrEqual(1)
    })

    it('differential = biologicalAge − chronologicalAge (rounded)', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      const expected = parseFloat((result.biologicalAge - 40).toFixed(1))
      expect(result.differentialAge).toBeCloseTo(expected, 5)
    })

    it('INTERSEX falls back to MALE boards without throwing', () => {
      expect(() => engine.compute(MALE_40_HEALTHY, 40, 'INTERSEX', false, undefined, FIXED_DATE)).not.toThrow()
    })

    it('accepts empty boards array and falls back to defaults', () => {
      expect(() => engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, [], FIXED_DATE)).not.toThrow()
    })
  })

  describe('sex-specific computation', () => {
    it('female boards yield different fatAge than male boards', () => {
      const male   = engine.compute(MALE_40_HEALTHY, 40, 'MALE',   false, undefined, FIXED_DATE)
      const female = engine.compute(MALE_40_HEALTHY, 40, 'FEMALE', false, undefined, FIXED_DATE)
      expect(male.partialAges.fatAge).not.toEqual(female.partialAges.fatAge)
    })
  })

  describe('edge cases', () => {
    it('very young patient (18) does not throw or produce NaN', () => {
      const result = engine.compute(MALE_40_HEALTHY, 18, 'MALE', false, undefined, FIXED_DATE)
      expect(isNaN(result.biologicalAge)).toBe(false)
    })

    it('elderly patient (80) does not throw or produce NaN', () => {
      const result = engine.compute(MALE_40_AGED, 80, 'MALE', false, undefined, FIXED_DATE)
      expect(isNaN(result.biologicalAge)).toBe(false)
    })

    it('minimum-value measurements do not produce NaN', () => {
      const minMeasurements: BiophysicsMeasurements = {
        fatPercentage: 2, bmi: 10,
        digitalReflexes: { high: 0.1, long: 1.0, width: 1.0 },
        visualAccommodation: 0,
        staticBalance: { high: 0.1, long: 1.0, width: 1.0 },
        skinHydration: 1, systolicPressure: 60, diastolicPressure: 40,
      }
      const result = engine.compute(minMeasurements, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(isNaN(result.biologicalAge)).toBe(false)
      expect(isNaN(result.differentialAge)).toBe(false)
    })

    it('same measurements yield same biologicalAge regardless of chronologicalAge', () => {
      // Biological age is determined by measurements, not by reference to chronological age
      const result20 = engine.compute(MALE_40_HEALTHY, 20, 'MALE', false, undefined, FIXED_DATE)
      const result60 = engine.compute(MALE_40_HEALTHY, 60, 'MALE', false, undefined, FIXED_DATE)
      expect(result20.biologicalAge).toBeCloseTo(result60.biologicalAge, 1)
      expect(result20.differentialAge).toBeGreaterThan(result60.differentialAge)
    })
  })

  describe('determinism — PIN tests (must never change)', () => {
    it('same inputs always produce exact same output', () => {
      const r1 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      const r2 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      const r3 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)

      expect(r1.biologicalAge).toBe(r2.biologicalAge)
      expect(r2.biologicalAge).toBe(r3.biologicalAge)
      expect(r1.differentialAge).toBe(r2.differentialAge)
      expect(JSON.stringify(r1.partialAges)).toBe(JSON.stringify(r2.partialAges))
    })

    it('algorithmVersion is stable across calls', () => {
      const r1 = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      const r2 = engine.compute(MALE_40_AGED,    40, 'MALE', false, undefined, FIXED_DATE)
      expect(r1.algorithmVersion).toBe(r2.algorithmVersion)
      expect(r1.algorithmVersion).toBe(ALGORITHM_VERSION)
    })

    it('PIN: MALE_40_HEALTHY ageStatus is REJUVENECIDO or NORMAL (regression guard)', () => {
      const result = engine.compute(MALE_40_HEALTHY, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(['REJUVENECIDO', 'NORMAL']).toContain(result.ageStatus)
    })

    it('PIN: MALE_40_AGED is ENVEJECIDO (regression guard)', () => {
      const result = engine.compute(MALE_40_AGED, 40, 'MALE', false, undefined, FIXED_DATE)
      expect(result.ageStatus).toBe('ENVEJECIDO')
    })
  })
})
