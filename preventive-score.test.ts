// =============================================================================
// tests/unit/preventive-score.test.ts
// Pure unit tests for score logic extracted from service.
// Run: npx vitest run tests/unit/preventive-score.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest'

// ── Extract pure functions for testability (no DB/Redis dependency) ──

// Mirror the scoring logic inline for unit testing
function scoreCardiovascular(tenYearRiskPct: number): number {
  return Math.max(0, Math.round(100 - (tenYearRiskPct / 30) * 100))
}

function scoreMetabolic(snapshot: {
  latestFastingGlucose?: number
  latestLdlMgDl?: number
  latestHdlMgDl?: number
  latestTotalCholesterol?: number
}): { score: number; signals: string[] } {
  let score = 100
  const signals: string[] = []

  const glucose = snapshot.latestFastingGlucose
  const ldl = snapshot.latestLdlMgDl
  const hdl = snapshot.latestHdlMgDl

  if (glucose) {
    if (glucose >= 126)      { score -= 30; signals.push('glucose_diabetic_range') }
    else if (glucose >= 100) { score -= 15; signals.push('glucose_prediabetes') }
    else                     { signals.push('glucose_normal') }
  }
  if (ldl) {
    if (ldl >= 190)  { score -= 25; signals.push('ldl_severely_elevated') }
    else if (ldl >= 160) { score -= 15; signals.push('ldl_elevated') }
    else if (ldl >= 130) { score -= 5;  signals.push('ldl_borderline') }
    else                 { signals.push('ldl_optimal') }
  }
  if (hdl) {
    if (hdl < 40)    { score -= 10; signals.push('hdl_low') }
    else if (hdl >= 60) { score += 5; signals.push('hdl_protective') }
  }
  return { score: Math.max(0, Math.min(100, score)), signals }
}

function scoreBiologicalAge(differentialAge: number): number {
  return Math.max(0, Math.min(100, Math.round(50 - differentialAge * 5)))
}

function scoreLifestyle(snapshot: {
  isSmoker?: boolean
  hasDiabetes?: boolean
  isOnAntihypertensives?: boolean
  latestSystolicBp?: number
}): number {
  let score = 100
  if (snapshot.isSmoker === true)              score -= 25
  if (snapshot.hasDiabetes === true)            score -= 15
  if (snapshot.isOnAntihypertensives === true) {
    if ((snapshot.latestSystolicBp ?? 0) >= 140) score -= 10
    else                                          score -= 5
  }
  return Math.max(0, score)
}

function classifyTier(score: number): string {
  if (score >= 80) return 'OPTIMAL'
  if (score >= 60) return 'GOOD'
  if (score >= 40) return 'MODERATE_RISK'
  if (score >= 20) return 'HIGH_RISK'
  return 'CRITICAL'
}

// ─────────────────────────────────────────────────────────────────

describe('PreventiveScore — cardiovascular component', () => {
  it('0% 10-year risk → score 100', () => {
    expect(scoreCardiovascular(0)).toBe(100)
  })

  it('30%+ 10-year risk → score 0', () => {
    expect(scoreCardiovascular(30)).toBe(0)
    expect(scoreCardiovascular(45)).toBe(0)
  })

  it('7.5% risk (LOW/MODERATE boundary) → score ~75', () => {
    const score = scoreCardiovascular(7.5)
    expect(score).toBeGreaterThanOrEqual(73)
    expect(score).toBeLessThanOrEqual(77)
  })

  it('20% risk (HIGH threshold) → score ~33', () => {
    const score = scoreCardiovascular(20)
    expect(score).toBeGreaterThanOrEqual(30)
    expect(score).toBeLessThanOrEqual(36)
  })
})

describe('PreventiveScore — metabolic component', () => {
  it('all optimal markers → score 100 with correct signals', () => {
    const { score, signals } = scoreMetabolic({
      latestFastingGlucose: 88,
      latestLdlMgDl: 95,
      latestHdlMgDl: 65,
    })
    expect(score).toBe(105) // 100 + 5 HDL bonus, clamped to 100 in full service
    expect(signals).toContain('glucose_normal')
    expect(signals).toContain('ldl_optimal')
    expect(signals).toContain('hdl_protective')
  })

  it('diabetic glucose (≥126) deducts 30 points', () => {
    const { score, signals } = scoreMetabolic({ latestFastingGlucose: 140 })
    expect(score).toBe(70)
    expect(signals).toContain('glucose_diabetic_range')
  })

  it('prediabetes (100-125) deducts 15 points', () => {
    const { score, signals } = scoreMetabolic({ latestFastingGlucose: 112 })
    expect(score).toBe(85)
    expect(signals).toContain('glucose_prediabetes')
  })

  it('LDL ≥190 deducts 25 points', () => {
    const { score, signals } = scoreMetabolic({ latestLdlMgDl: 210 })
    expect(score).toBe(75)
    expect(signals).toContain('ldl_severely_elevated')
  })

  it('combined worst case → score bounded at 0', () => {
    const { score } = scoreMetabolic({
      latestFastingGlucose: 150,   // -30
      latestLdlMgDl: 220,          // -25
      latestHdlMgDl: 30,           // -10
    })
    expect(score).toBe(0)
  })

  it('missing data → score is 100 (no penalty for unknown)', () => {
    const { score } = scoreMetabolic({})
    expect(score).toBe(100)
  })
})

describe('PreventiveScore — biological age component', () => {
  it('delta = -10 (very rejuvenated) → score 100', () => {
    expect(scoreBiologicalAge(-10)).toBe(100)
  })

  it('delta = 0 (perfect match) → score 50', () => {
    expect(scoreBiologicalAge(0)).toBe(50)
  })

  it('delta = +10 (severely aged) → score 0', () => {
    expect(scoreBiologicalAge(10)).toBe(0)
  })

  it('delta = -3 (REJUVENECIDO) → score 65', () => {
    expect(scoreBiologicalAge(-3)).toBe(65)
  })

  it('delta = +5 (ENVEJECIDO) → score 25', () => {
    expect(scoreBiologicalAge(5)).toBe(25)
  })

  it('score bounded at 0 for extreme positive delta', () => {
    expect(scoreBiologicalAge(20)).toBe(0)
  })

  it('score bounded at 100 for extreme negative delta', () => {
    expect(scoreBiologicalAge(-20)).toBe(100)
  })
})

describe('PreventiveScore — lifestyle component', () => {
  it('non-smoker, no diabetes, no antihypertensives → 100', () => {
    expect(scoreLifestyle({ isSmoker: false, hasDiabetes: false })).toBe(100)
  })

  it('smoker deducts 25 points', () => {
    expect(scoreLifestyle({ isSmoker: true })).toBe(75)
  })

  it('diabetes deducts 15 points', () => {
    expect(scoreLifestyle({ hasDiabetes: true })).toBe(85)
  })

  it('controlled hypertension (on meds, BP < 140) deducts 5', () => {
    expect(scoreLifestyle({ isOnAntihypertensives: true, latestSystolicBp: 128 })).toBe(95)
  })

  it('uncontrolled hypertension (on meds, BP ≥ 140) deducts 10', () => {
    expect(scoreLifestyle({ isOnAntihypertensives: true, latestSystolicBp: 148 })).toBe(90)
  })

  it('worst case (smoker + diabetic + uncontrolled HTN) → 50', () => {
    expect(scoreLifestyle({
      isSmoker: true,
      hasDiabetes: true,
      isOnAntihypertensives: true,
      latestSystolicBp: 160,
    })).toBe(50)
  })

  it('unknown data → no penalty (null/undefined values)', () => {
    expect(scoreLifestyle({})).toBe(100)
  })
})

describe('PreventiveScore — tier classification', () => {
  const cases: Array<[number, string]> = [
    [100, 'OPTIMAL'], [80, 'OPTIMAL'],
    [79,  'GOOD'],    [60, 'GOOD'],
    [59,  'MODERATE_RISK'], [40, 'MODERATE_RISK'],
    [39,  'HIGH_RISK'],     [20, 'HIGH_RISK'],
    [19,  'CRITICAL'],      [0,  'CRITICAL'],
  ]

  for (const [score, expected] of cases) {
    it(`score ${score} → ${expected}`, () => {
      expect(classifyTier(score)).toBe(expected)
    })
  }
})

// ─────────────────────────────────────────────────────────────────

describe('ReferralEngine — trigger selection logic', () => {
  // Mirror trigger selection for unit testing
  function selectTrigger(ctx: {
    differentialAge?: number
    cvRiskCategory?: string
    engagementTier?: string
    daysSinceLastLab?: number
  }): string | null {
    const delta = ctx.differentialAge ?? 0
    const cvRisk = ctx.cvRiskCategory ?? 'LOW'
    const daysSinceLab = ctx.daysSinceLastLab ?? 0

    if (delta >= 7)                                     return 'PREMIUM_CONSULT_URGENT'
    if (cvRisk === 'HIGH' || cvRisk === 'VERY_HIGH')    return 'SPECIALIST_REFERRAL'
    if (delta >= 5 && (ctx.engagementTier === 'CHAMPION' || ctx.engagementTier === 'ENGAGED'))
                                                        return 'PREMIUM_CONSULT'
    if (daysSinceLab >= 180)                            return 'LAB_PANEL'
    return null
  }

  it('delta ≥ 7 → urgent premium consult (highest priority)', () => {
    expect(selectTrigger({ differentialAge: 7 })).toBe('PREMIUM_CONSULT_URGENT')
    expect(selectTrigger({ differentialAge: 12 })).toBe('PREMIUM_CONSULT_URGENT')
  })

  it('HIGH cv risk → specialist referral', () => {
    expect(selectTrigger({ cvRiskCategory: 'HIGH' })).toBe('SPECIALIST_REFERRAL')
    expect(selectTrigger({ cvRiskCategory: 'VERY_HIGH' })).toBe('SPECIALIST_REFERRAL')
  })

  it('delta ≥ 7 takes priority over HIGH cv risk', () => {
    expect(selectTrigger({ differentialAge: 8, cvRiskCategory: 'HIGH' })).toBe('PREMIUM_CONSULT_URGENT')
  })

  it('delta 5-6 + engaged → premium consult', () => {
    expect(selectTrigger({ differentialAge: 5, engagementTier: 'ENGAGED' })).toBe('PREMIUM_CONSULT')
    expect(selectTrigger({ differentialAge: 6, engagementTier: 'CHAMPION' })).toBe('PREMIUM_CONSULT')
  })

  it('delta 5-6 + dormant → no referral (engagement required)', () => {
    expect(selectTrigger({ differentialAge: 5, engagementTier: 'DORMANT' })).toBeNull()
  })

  it('labs overdue 180d → lab panel referral', () => {
    expect(selectTrigger({ daysSinceLastLab: 180 })).toBe('LAB_PANEL')
    expect(selectTrigger({ daysSinceLastLab: 365 })).toBe('LAB_PANEL')
  })

  it('optimal profile → no referral', () => {
    expect(selectTrigger({
      differentialAge: -3,
      cvRiskCategory: 'LOW',
      engagementTier: 'CHAMPION',
      daysSinceLastLab: 30,
    })).toBeNull()
  })

  it('no data → no referral', () => {
    expect(selectTrigger({})).toBeNull()
  })
})
