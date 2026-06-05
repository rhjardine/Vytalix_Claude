// =============================================================================
// referral.engine.test.ts
// Pure unit tests for selectReferralTrigger and buildCtaUrl.
// No DB, no Redis, no eventBus — all functions are pure.
// Run: npx vitest run referral.engine.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  selectReferralTrigger,
  buildCtaUrl,
  REFERRAL_ALGORITHM_VERSION,
  ReferralTriggerContext,
} from '../src/core/referral.engine'

// ── Fixtures ──────────────────────────────────────────────────────

const BASE_CTX: ReferralTriggerContext = {
  tenantId:      '00000000-0000-0000-0000-000000000001',
  patientId:     '00000000-0000-0000-0000-000000000099',
  correlationId: 'test-corr-001',
}

const FIXED_MS = 1_700_000_000_000   // Fixed timestamp for deterministic URL tokens

// ─────────────────────────────────────────────────────────────────

describe('buildCtaUrl()', () => {
  it('returns a string starting with the expected base URL', () => {
    const url = buildCtaUrl('patient-1', 'premium_consult', FIXED_MS)
    expect(url).toMatch(/^https:\/\/doctorantivejez\.com\/ref\/premium_consult/)
  })

  it('is deterministic: same inputs → exact same URL', () => {
    const url1 = buildCtaUrl('patient-1', 'premium_consult', FIXED_MS)
    const url2 = buildCtaUrl('patient-1', 'premium_consult', FIXED_MS)
    expect(url1).toBe(url2)
  })

  it('different timestamps → different tokens', () => {
    const url1 = buildCtaUrl('patient-1', 'premium_consult', FIXED_MS)
    const url2 = buildCtaUrl('patient-1', 'premium_consult', FIXED_MS + 1)
    expect(url1).not.toBe(url2)
  })

  it('different patientIds → different tokens', () => {
    const url1 = buildCtaUrl('patient-A', 'lab_panel', FIXED_MS)
    const url2 = buildCtaUrl('patient-B', 'lab_panel', FIXED_MS)
    expect(url1).not.toBe(url2)
  })
})

// ─────────────────────────────────────────────────────────────────

describe('selectReferralTrigger() — trigger hierarchy', () => {

  describe('T1: Critical bio age gap (delta ≥ 7)', () => {
    it('delta = 7 → PREMIUM_CONSULT URGENT (T1)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 7 }, FIXED_MS)
      expect(cta).not.toBeNull()
      expect(cta!.referralType).toBe('PREMIUM_CONSULT')
      expect(cta!.urgency).toBe('URGENT')
      expect(cta!.triggerCode).toBe('T1')
      expect(cta!.triggerReason).toBe('differential_age_critical')
    })

    it('delta = 12 → still T1', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 12 }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T1')
    })

    it('delta = 6.9 → does NOT trigger T1', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 6.9, cvRiskCategory: 'LOW' }, FIXED_MS)
      expect(cta?.triggerCode).not.toBe('T1')
    })
  })

  describe('T2: High cardiovascular risk', () => {
    it('cvRiskCategory=HIGH → SPECIALIST_REFERRAL SOON (T2)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, cvRiskCategory: 'HIGH' }, FIXED_MS)
      expect(cta).not.toBeNull()
      expect(cta!.referralType).toBe('SPECIALIST_REFERRAL')
      expect(cta!.urgency).toBe('SOON')
      expect(cta!.triggerCode).toBe('T2')
    })

    it('cvRiskCategory=VERY_HIGH → T2', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, cvRiskCategory: 'VERY_HIGH' }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T2')
    })

    it('cvRiskCategory=MODERATE → does NOT trigger T2', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, cvRiskCategory: 'MODERATE' }, FIXED_MS)
      expect(cta?.triggerCode).not.toBe('T2')
    })
  })

  describe('T3: Moderate bio age delta + high engagement', () => {
    it('delta=5 + ENGAGED → PREMIUM_CONSULT SOON (T3)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 5, engagementTier: 'ENGAGED' }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T3')
      expect(cta!.urgency).toBe('SOON')
    })

    it('delta=6 + CHAMPION → T3', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 6, engagementTier: 'CHAMPION' }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T3')
    })

    it('delta=5 + DORMANT → no referral (engagement required for T3)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 5, engagementTier: 'DORMANT' }, FIXED_MS)
      expect(cta?.triggerCode).not.toBe('T3')
    })

    it('delta=4.9 + CHAMPION → does NOT trigger T3 (threshold is 5)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 4.9, engagementTier: 'CHAMPION' }, FIXED_MS)
      expect(cta?.triggerCode).not.toBe('T3')
    })
  })

  describe('T4: Labs overdue (≥180 days)', () => {
    it('daysSinceLastLab=180 → LAB_PANEL ROUTINE (T4)', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, daysSinceLastLab: 180 }, FIXED_MS)
      expect(cta!.referralType).toBe('LAB_PANEL')
      expect(cta!.urgency).toBe('ROUTINE')
      expect(cta!.triggerCode).toBe('T4')
    })

    it('daysSinceLastLab=365 → T4', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, daysSinceLastLab: 365 }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T4')
    })

    it('daysSinceLastLab=179 → does NOT trigger T4', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, daysSinceLastLab: 179 }, FIXED_MS)
      expect(cta?.triggerCode).not.toBe('T4')
    })
  })

  describe('Priority ordering (T1 > T2 > T3 > T4)', () => {
    it('T1 takes priority over T2 when delta≥7 AND HIGH cvRisk', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 8, cvRiskCategory: 'HIGH' }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T1')
    })

    it('T1 takes priority over T4 when delta≥7 AND labs overdue', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 9, daysSinceLastLab: 200 }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T1')
    })

    it('T2 takes priority over T3 when HIGH cvRisk AND delta=5 CHAMPION', () => {
      const cta = selectReferralTrigger({
        ...BASE_CTX, cvRiskCategory: 'HIGH', differentialAge: 5, engagementTier: 'CHAMPION',
      }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T2')
    })

    it('T2 takes priority over T4 when HIGH cvRisk AND labs overdue', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, cvRiskCategory: 'HIGH', daysSinceLastLab: 200 }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T2')
    })

    it('T3 takes priority over T4 when delta=5 CHAMPION AND labs overdue', () => {
      const cta = selectReferralTrigger({
        ...BASE_CTX, differentialAge: 5, engagementTier: 'CHAMPION', daysSinceLastLab: 200,
      }, FIXED_MS)
      expect(cta!.triggerCode).toBe('T3')
    })
  })

  describe('Null cases (no trigger)', () => {
    it('optimal profile → null', () => {
      const cta = selectReferralTrigger({
        ...BASE_CTX,
        differentialAge: -3,
        cvRiskCategory: 'LOW',
        engagementTier: 'CHAMPION',
        daysSinceLastLab: 30,
      }, FIXED_MS)
      expect(cta).toBeNull()
    })

    it('empty context → null (all defaults are safe)', () => {
      expect(selectReferralTrigger(BASE_CTX, FIXED_MS)).toBeNull()
    })

    it('delta=4 + LOW cvRisk + daysSinceLab=100 → null', () => {
      const cta = selectReferralTrigger({
        ...BASE_CTX, differentialAge: 4, cvRiskCategory: 'LOW', daysSinceLastLab: 100,
      }, FIXED_MS)
      expect(cta).toBeNull()
    })
  })

  describe('inputSnapshot traceability', () => {
    it('CTA includes inputSnapshot with evaluated values', () => {
      const cta = selectReferralTrigger({
        ...BASE_CTX,
        differentialAge: 8,
        cvRiskCategory: 'HIGH',
        daysSinceLastLab: 200,
      }, FIXED_MS)
      expect(cta!.inputSnapshot).toMatchObject({
        differentialAge:  8,
        cvRiskCategory:   'HIGH',
        daysSinceLastLab: 200,
      })
    })

    it('CTA includes algorithmVersion', () => {
      const cta = selectReferralTrigger({ ...BASE_CTX, differentialAge: 7 }, FIXED_MS)
      expect(cta!.algorithmVersion).toBe(REFERRAL_ALGORITHM_VERSION)
    })
  })

  describe('Determinism — PIN tests', () => {
    it('same inputs → exact same CTA (no drift)', () => {
      const ctx = { ...BASE_CTX, differentialAge: 7.5, cvRiskCategory: 'HIGH' }
      const r1 = selectReferralTrigger(ctx, FIXED_MS)
      const r2 = selectReferralTrigger(ctx, FIXED_MS)
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
    })

    it('PIN: T1 threshold is exactly 7.0 (regression guard)', () => {
      expect(selectReferralTrigger({ ...BASE_CTX, differentialAge: 7.0 }, FIXED_MS)!.triggerCode).toBe('T1')
      expect(selectReferralTrigger({ ...BASE_CTX, differentialAge: 6.9 }, FIXED_MS)?.triggerCode).not.toBe('T1')
    })

    it('PIN: T4 threshold is exactly 180 days (regression guard)', () => {
      expect(selectReferralTrigger({ ...BASE_CTX, daysSinceLastLab: 180 }, FIXED_MS)!.triggerCode).toBe('T4')
      expect(selectReferralTrigger({ ...BASE_CTX, daysSinceLastLab: 179 }, FIXED_MS)?.triggerCode).not.toBe('T4')
    })

    it('PIN: algorithmVersion is stable across calls', () => {
      const r1 = selectReferralTrigger({ ...BASE_CTX, differentialAge: 7 }, FIXED_MS)
      const r2 = selectReferralTrigger({ ...BASE_CTX, cvRiskCategory: 'HIGH' }, FIXED_MS)
      expect(r1!.algorithmVersion).toBe(REFERRAL_ALGORITHM_VERSION)
      expect(r2!.algorithmVersion).toBe(REFERRAL_ALGORITHM_VERSION)
    })
  })
})

describe('REFERRAL_ALGORITHM_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof REFERRAL_ALGORITHM_VERSION).toBe('string')
    expect(REFERRAL_ALGORITHM_VERSION.length).toBeGreaterThan(0)
  })

  it('PIN: version is stable (regression guard)', () => {
    expect(REFERRAL_ALGORITHM_VERSION).toBe('referral-engine-v1.1.0')
  })
})
