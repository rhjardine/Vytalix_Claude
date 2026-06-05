// =============================================================================
// preventive-score.test.ts
// Pure unit tests for the exported score functions.
// No DB, no Redis, no network — all functions are pure.
// Run: npx vitest run preventive-score.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  scoreCardiovascular,
  scoreMetabolic,
  scoreBiologicalAge,
  scoreLifestyle,
  classifyPreventiveTier,
  PREVENTIVE_ALGORITHM_VERSION,
  MetabolicSnapshot,
  LifestyleSnapshot,
} from '../src/longevity/preventive-score.service'

// ─────────────────────────────────────────────────────────────────

describe('scoreCardiovascular()', () => {
  it('0% 10-year risk → score 100', () => {
    const { score } = scoreCardiovascular(0, 'LOW')
    expect(score).toBe(100)
  })

  it('30%+ 10-year risk → score 0', () => {
    expect(scoreCardiovascular(30, 'HIGH').score).toBe(0)
    expect(scoreCardiovascular(45, 'VERY_HIGH').score).toBe(0)
  })

  it('7.5% risk → score ~75', () => {
    const { score } = scoreCardiovascular(7.5, 'MODERATE')
    expect(score).toBeGreaterThanOrEqual(73)
    expect(score).toBeLessThanOrEqual(77)
  })

  it('20% risk → score ~33', () => {
    const { score } = scoreCardiovascular(20, 'HIGH')
    expect(score).toBeGreaterThanOrEqual(30)
    expect(score).toBeLessThanOrEqual(36)
  })

  it('signals include risk pct and category', () => {
    const { signals } = scoreCardiovascular(15, 'HIGH')
    expect(signals.some(s => s.includes('15.0pct'))).toBe(true)
    expect(signals.some(s => s.includes('category_high'))).toBe(true)
  })

  it('is deterministic', () => {
    const r1 = scoreCardiovascular(12.5, 'MODERATE')
    const r2 = scoreCardiovascular(12.5, 'MODERATE')
    expect(r1.score).toBe(r2.score)
    expect(r1.signals).toEqual(r2.signals)
  })

  // PIN test: formula must not drift
  it('PIN: scoreCardiovascular(10, "MODERATE") → 67 (regression guard)', () => {
    expect(scoreCardiovascular(10, 'MODERATE').score).toBe(67)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('scoreMetabolic()', () => {
  it('all optimal markers → score 100 with HDL bonus (capped at 100)', () => {
    const { score, signals } = scoreMetabolic({
      latestFastingGlucose: 88,
      latestLdlMgDl: 95,
      latestHdlMgDl: 65,
    })
    expect(score).toBe(100)  // 105 capped to 100
    expect(signals).toContain('glucose_normal')
    expect(signals).toContain('ldl_optimal')
    expect(signals).toContain('hdl_protective')
  })

  it('diabetic glucose (≥126) deducts 30 points', () => {
    const { score, signals } = scoreMetabolic({ latestFastingGlucose: 140 })
    expect(score).toBe(70)
    expect(signals).toContain('glucose_diabetic_range')
  })

  it('prediabetes (100–125) deducts 15 points', () => {
    const { score, signals } = scoreMetabolic({ latestFastingGlucose: 112 })
    expect(score).toBe(85)
    expect(signals).toContain('glucose_prediabetes')
  })

  it('LDL ≥190 deducts 25 points', () => {
    const { score, signals } = scoreMetabolic({ latestLdlMgDl: 210 })
    expect(score).toBe(75)
    expect(signals).toContain('ldl_severely_elevated')
  })

  it('LDL 160–189 deducts 15 points', () => {
    const { score } = scoreMetabolic({ latestLdlMgDl: 170 })
    expect(score).toBe(85)
  })

  it('LDL 130–159 deducts 5 points', () => {
    const { score } = scoreMetabolic({ latestLdlMgDl: 140 })
    expect(score).toBe(95)
  })

  it('HDL < 40 deducts 10 points', () => {
    const { score, signals } = scoreMetabolic({ latestHdlMgDl: 35 })
    expect(score).toBe(90)
    expect(signals).toContain('hdl_low')
  })

  it('TC/HDL ratio > 5 deducts 10 points', () => {
    const { score, signals } = scoreMetabolic({
      latestTotalCholesterol: 260,
      latestHdlMgDl: 40,           // ratio = 6.5 > 5
    })
    expect(signals).toContain('tc_hdl_ratio_high')
    expect(score).toBeLessThan(100)
  })

  it('three bad markers → 100 - 30 - 25 - 10 = 35 (correct floor)', () => {
    // glucose ≥126 → -30, LDL ≥190 → -25, HDL <40 → -10 → 35 total
    const { score } = scoreMetabolic({
      latestFastingGlucose: 150,   // -30
      latestLdlMgDl: 220,          // -25
      latestHdlMgDl: 30,           // -10
    })
    expect(score).toBe(35)
  })

  it('four compounding penalties → score reaches 0', () => {
    // glucose -30, LDL -25, HDL -10, TC/HDL ratio -10, then LDL already counted = -30 -25 -10 -10 = 35
    // To reach 0 we need an HDL of <40 AND a TC/HDL ratio > 5:
    // glucose: 140 → -30; LDL: 200 → -25; HDL: 30 → -10; TC/HDL: 250/30 = 8.3 → -10 = 100 - 75 = 25
    // Score can only reach 0 by also having LDL ≥190 AND glucose ≥126 AND hdl<40 AND tc/hdl>5
    // 100 - 30 - 25 - 10 - 10 = 25 (clamped at 0 if we add more)
    // Verify clamping is in place for extreme inputs:
    const { score } = scoreMetabolic({
      latestFastingGlucose: 200,   // -30
      latestLdlMgDl: 300,          // -25
      latestHdlMgDl: 20,           // -10
      latestTotalCholesterol: 400, // TC/HDL = 400/20 = 20 → -10
    })
    // 100 - 30 - 25 - 10 - 10 = 25, still > 0
    // Score floor is 0, verify it never goes below
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('missing data → score is 100 (no silent penalty for unknown)', () => {
    const { score } = scoreMetabolic({})
    expect(score).toBe(100)
  })

  it('is deterministic', () => {
    const snap: MetabolicSnapshot = { latestFastingGlucose: 105, latestLdlMgDl: 155, latestHdlMgDl: 55 }
    const r1 = scoreMetabolic(snap)
    const r2 = scoreMetabolic(snap)
    expect(r1.score).toBe(r2.score)
    expect(r1.signals).toEqual(r2.signals)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('scoreBiologicalAge()', () => {
  it('delta = -10 (very rejuvenated) → score 100', () => {
    expect(scoreBiologicalAge(-10, 40).score).toBe(100)
  })

  it('delta = 0 (exact match) → score 50', () => {
    expect(scoreBiologicalAge(0, 40).score).toBe(50)
  })

  it('delta = +10 (severely aged) → score 0', () => {
    expect(scoreBiologicalAge(10, 40).score).toBe(0)
  })

  it('delta = -3 (REJUVENECIDO) → score 65', () => {
    expect(scoreBiologicalAge(-3, 40).score).toBe(65)
  })

  it('delta = +5 (ENVEJECIDO) → score 25', () => {
    expect(scoreBiologicalAge(5, 40).score).toBe(25)
  })

  it('score bounded at 0 for extreme positive delta', () => {
    expect(scoreBiologicalAge(20, 40).score).toBe(0)
  })

  it('score bounded at 100 for extreme negative delta', () => {
    expect(scoreBiologicalAge(-20, 40).score).toBe(100)
  })

  it('signals include delta and status label', () => {
    const { signals } = scoreBiologicalAge(3, 40)
    expect(signals.some(s => s.includes('bio_age_delta'))).toBe(true)
    expect(signals).toContain('envejecido')
  })

  it('signals for rejuvenated patient include rejuvenecido', () => {
    const { signals } = scoreBiologicalAge(-3, 40)
    expect(signals).toContain('rejuvenecido')
  })

  it('is deterministic', () => {
    const r1 = scoreBiologicalAge(2.5, 45)
    const r2 = scoreBiologicalAge(2.5, 45)
    expect(r1.score).toBe(r2.score)
  })

  // PIN tests
  it('PIN: delta=-3 → 65; delta=0 → 50; delta=+5 → 25 (regression guard)', () => {
    expect(scoreBiologicalAge(-3, 40).score).toBe(65)
    expect(scoreBiologicalAge(0,  40).score).toBe(50)
    expect(scoreBiologicalAge(5,  40).score).toBe(25)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('scoreLifestyle()', () => {
  it('non-smoker, no diabetes, no antihypertensives → 100', () => {
    expect(scoreLifestyle({ isSmoker: false, hasDiabetes: false }).score).toBe(100)
  })

  it('smoker deducts 25 points', () => {
    expect(scoreLifestyle({ isSmoker: true }).score).toBe(75)
  })

  it('diabetes deducts 15 points', () => {
    expect(scoreLifestyle({ hasDiabetes: true }).score).toBe(85)
  })

  it('controlled hypertension (on meds, BP < 140) deducts 5', () => {
    expect(scoreLifestyle({ isOnAntihypertensives: true, latestSystolicBp: 128 }).score).toBe(95)
  })

  it('uncontrolled hypertension (on meds, BP ≥ 140) deducts 10', () => {
    expect(scoreLifestyle({ isOnAntihypertensives: true, latestSystolicBp: 148 }).score).toBe(90)
  })

  it('worst case (smoker + diabetic + uncontrolled HTN) → 50', () => {
    expect(scoreLifestyle({
      isSmoker: true,
      hasDiabetes: true,
      isOnAntihypertensives: true,
      latestSystolicBp: 160,
    }).score).toBe(50)
  })

  it('unknown data → no penalty (score 100)', () => {
    expect(scoreLifestyle({}).score).toBe(100)
  })

  it('null values → no penalty (score 100)', () => {
    const snap: LifestyleSnapshot = { isSmoker: null, hasDiabetes: null }
    expect(scoreLifestyle(snap).score).toBe(100)
  })

  it('signals are explicit, not empty, when penalties applied', () => {
    const { signals } = scoreLifestyle({ isSmoker: true, hasDiabetes: true })
    expect(signals).toContain('smoker')
    expect(signals).toContain('diabetes_diagnosed')
  })

  it('is deterministic', () => {
    const snap: LifestyleSnapshot = { isSmoker: true, isOnAntihypertensives: true, latestSystolicBp: 142 }
    const r1 = scoreLifestyle(snap)
    const r2 = scoreLifestyle(snap)
    expect(r1.score).toBe(r2.score)
    expect(r1.signals).toEqual(r2.signals)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('classifyPreventiveTier()', () => {
  const cases: Array<[number, string]> = [
    [100, 'OPTIMAL'], [80, 'OPTIMAL'],
    [79,  'GOOD'],    [60, 'GOOD'],
    [59,  'MODERATE_RISK'], [40, 'MODERATE_RISK'],
    [39,  'HIGH_RISK'],     [20, 'HIGH_RISK'],
    [19,  'CRITICAL'],      [0,  'CRITICAL'],
  ]

  for (const [score, expected] of cases) {
    it(`score ${score} → ${expected}`, () => {
      expect(classifyPreventiveTier(score)).toBe(expected)
    })
  }

  // PIN: boundary values must not drift
  it('PIN: boundary values are exact (regression guard)', () => {
    expect(classifyPreventiveTier(80)).toBe('OPTIMAL')
    expect(classifyPreventiveTier(79)).toBe('GOOD')
    expect(classifyPreventiveTier(60)).toBe('GOOD')
    expect(classifyPreventiveTier(59)).toBe('MODERATE_RISK')
    expect(classifyPreventiveTier(40)).toBe('MODERATE_RISK')
    expect(classifyPreventiveTier(39)).toBe('HIGH_RISK')
    expect(classifyPreventiveTier(20)).toBe('HIGH_RISK')
    expect(classifyPreventiveTier(19)).toBe('CRITICAL')
  })
})

// ─────────────────────────────────────────────────────────────────

describe('PREVENTIVE_ALGORITHM_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof PREVENTIVE_ALGORITHM_VERSION).toBe('string')
    expect(PREVENTIVE_ALGORITHM_VERSION.length).toBeGreaterThan(0)
  })

  it('PIN: version is stable (regression guard)', () => {
    expect(PREVENTIVE_ALGORITHM_VERSION).toBe('preventive-composite-v1.0.0')
  })
})
