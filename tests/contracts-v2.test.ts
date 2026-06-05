// =============================================================================
// tests/unit/contracts-v2.test.ts
// Validates: business message builders, tier labels, contract version manifest.
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  buildBioAgeInterpretation,
  buildScoreTierLabel,
  buildScoreRecommendation,
  buildEngagementMessage,
  buildCohortSummary,
  CONTRACT_VERSION,
  ALGORITHM_MANIFEST,
  type AgeStatus,
  type ScoreTier,
  type EngagementTier,
} from '../src/shared/contracts-v1'

// ─────────────────────────────────────────────────────────────────

describe('buildBioAgeInterpretation()', () => {
  it('REJUVENECIDO message contains the delta in years', () => {
    const msg = buildBioAgeInterpretation(38, 45, 'REJUVENECIDO')
    expect(msg).toContain('7')
    expect(msg.toLowerCase()).toMatch(/mejor|joven|año/)
  })

  it('NORMAL message acknowledges alignment and improvement opportunity', () => {
    const msg = buildBioAgeInterpretation(44, 45, 'NORMAL')
    expect(msg).toBeTruthy()
    expect(msg.length).toBeGreaterThan(10)
  })

  it('ENVEJECIDO message contains urgency and positive framing', () => {
    const msg = buildBioAgeInterpretation(52, 45, 'ENVEJECIDO')
    expect(msg).toContain('7')
    expect(msg.toLowerCase()).toMatch(/consulta|revertir|acelerado/)
  })

  it('singular year for delta = 1', () => {
    const msg = buildBioAgeInterpretation(44, 45, 'REJUVENECIDO')
    // "1 año" not "1 años"
    expect(msg).not.toContain('1 años')
    expect(msg).toContain('1 año')
  })

  it('plural years for delta > 1', () => {
    const msg = buildBioAgeInterpretation(40, 45, 'REJUVENECIDO')
    expect(msg).toContain('5 años')
  })

  it('returns non-empty string for all status values', () => {
    const statuses: AgeStatus[] = ['REJUVENECIDO', 'NORMAL', 'ENVEJECIDO']
    statuses.forEach(s => {
      const msg = buildBioAgeInterpretation(45, 45, s)
      expect(msg.length).toBeGreaterThan(10)
    })
  })
})

// ─────────────────────────────────────────────────────────────────

describe('buildScoreTierLabel()', () => {
  const tiers: ScoreTier[] = ['OPTIMAL', 'GOOD', 'MODERATE_RISK', 'HIGH_RISK', 'CRITICAL']

  it('returns distinct labels for all tiers', () => {
    const labels = tiers.map(buildScoreTierLabel)
    const unique  = new Set(labels)
    expect(unique.size).toBe(tiers.length)
  })

  it('OPTIMAL label is positive', () => {
    expect(buildScoreTierLabel('OPTIMAL').toLowerCase()).toMatch(/óptimo|excelente/)
  })

  it('CRITICAL label conveys urgency', () => {
    expect(buildScoreTierLabel('CRITICAL').toLowerCase()).toMatch(/crítico|urgente/)
  })

  it('all labels are non-empty strings', () => {
    tiers.forEach(t => expect(buildScoreTierLabel(t).length).toBeGreaterThan(5))
  })
})

// ─────────────────────────────────────────────────────────────────

describe('buildScoreRecommendation()', () => {
  it('returns actionable recommendation for each tier', () => {
    const tiers: ScoreTier[] = ['OPTIMAL', 'GOOD', 'MODERATE_RISK', 'HIGH_RISK', 'CRITICAL']
    tiers.forEach(t => {
      const rec = buildScoreRecommendation(t, [])
      expect(rec.length).toBeGreaterThan(10)
    })
  })

  it('CRITICAL recommendation has strong urgency language', () => {
    const rec = buildScoreRecommendation('CRITICAL', [])
    expect(rec.toLowerCase()).toMatch(/urgente|48 horas|médica/)
  })

  it('incomplete data adds lab suggestion', () => {
    const rec = buildScoreRecommendation('OPTIMAL', ['cardiovascular_risk_score'])
    expect(rec.toLowerCase()).toMatch(/análisis|laboratorio|perfil/)
  })

  it('complete data OPTIMAL does not add lab suggestion', () => {
    const rec = buildScoreRecommendation('OPTIMAL', [])
    expect(rec.toLowerCase()).not.toMatch(/laboratorio/)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('buildEngagementMessage()', () => {
  it('CHAMPION with long streak mentions top percentage', () => {
    const msg = buildEngagementMessage('CHAMPION', 14)
    expect(msg).toContain('14')
    expect(msg.toLowerCase()).toMatch(/racha|top/)
  })

  it('DORMANT message is encouraging not punishing', () => {
    const msg = buildEngagementMessage('DORMANT', 0)
    expect(msg.toLowerCase()).toMatch(/esperamos|oportunidad|bienestar/)
  })

  it('AT_RISK message conveys return invitation', () => {
    const msg = buildEngagementMessage('AT_RISK', 0)
    expect(msg.toLowerCase()).toMatch(/activi|necesita|tiempo/)
  })

  it('streak >= 7 always produces a streak-specific message', () => {
    const tiers: EngagementTier[] = ['CHAMPION', 'ENGAGED', 'PASSIVE']
    tiers.forEach(tier => {
      const msg = buildEngagementMessage(tier, 7)
      expect(msg).toContain('7')
    })
  })

  it('returns non-empty string for all tier/streak combinations', () => {
    const tiers: EngagementTier[] = ['CHAMPION', 'ENGAGED', 'PASSIVE', 'AT_RISK', 'DORMANT']
    tiers.forEach(tier => {
      [0, 3, 7, 14, 30].forEach(streak => {
        const msg = buildEngagementMessage(tier, streak)
        expect(msg.length).toBeGreaterThan(5)
      })
    })
  })
})

// ─────────────────────────────────────────────────────────────────

describe('buildCohortSummary()', () => {
  it('describes rejuvenated cohort positively', () => {
    const s = buildCohortSummary(-2.5, 45, 15)
    expect(s.toLowerCase()).toContain('joven')
    expect(s).toContain('45')
  })

  it('describes aged cohort accurately', () => {
    const s = buildCohortSummary(3.0, 10, 40)
    expect(s.toLowerCase()).toContain('envejecida')
    expect(s).toContain('40%')
  })

  it('neutral description for delta near zero', () => {
    const s = buildCohortSummary(0.5, 30, 20)
    expect(s.toLowerCase()).toContain('acorde')
  })

  it('includes both pct values in output', () => {
    const s = buildCohortSummary(-1.0, 38, 22)
    expect(s).toContain('38%')
    expect(s).toContain('22%')
  })
})

// ─────────────────────────────────────────────────────────────────

describe('CONTRACT_VERSION and ALGORITHM_MANIFEST', () => {
  it('CONTRACT_VERSION is 2.0.0', () => {
    expect(CONTRACT_VERSION).toBe('2.0.0')
  })

  it('ALGORITHM_MANIFEST has all required algorithms', () => {
    const keys = Object.keys(ALGORITHM_MANIFEST)
    expect(keys).toContain('biophysics')
    expect(keys).toContain('framingham')
    expect(keys).toContain('preventiveScore')
    expect(keys).toContain('referralEngine')
  })

  it('biophysics references Doctor Antivejez as provider', () => {
    expect(ALGORITHM_MANIFEST.biophysics.provider).toContain('Doctor Antivejez')
  })

  it('framingham references D\'Agostino as provider', () => {
    expect(ALGORITHM_MANIFEST.framingham.provider).toContain('D\'Agostino')
  })

  it('all manifest entries have id and version', () => {
    Object.entries(ALGORITHM_MANIFEST).forEach(([key, entry]) => {
      expect(entry.id,      `${key}: missing id`).toBeTruthy()
      expect(entry.version, `${key}: missing version`).toBeTruthy()
    })
  })
})
