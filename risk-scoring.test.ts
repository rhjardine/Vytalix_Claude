// =============================================================================
// Unit Tests — Risk Scoring Service
// Tests the Framingham 2008 Updated equation with known reference values
// and boundary conditions.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RiskScoringService } from '../../src/pipeline/risk-scoring.service'

// Mock getTenantDb to avoid real DB connections in unit tests
vi.mock('../../src/lib/prisma', () => ({
  getTenantDb: vi.fn(),
}))

import { getTenantDb } from '../../src/lib/prisma'

function makeDbMock(overrides: Partial<{
  dateOfBirth: Date
  biologicalSex: string
  snapshot: Record<string, unknown> | null
}> = {}) {
  const defaults = {
    dateOfBirth: new Date('1960-01-01'),   // ~64 years old
    biologicalSex: 'MALE',
    snapshot: {
      latestTotalCholesterol: { toNumber: () => 210 },
      latestHdlMgDl: { toNumber: () => 50 },
      latestSystolicBp: { toNumber: () => 130 },
      isOnAntihypertensives: false,
      isSmoker: false,
      hasDiabetes: false,
    },
  }
  const config = { ...defaults, ...overrides }

  const txMock = {
    patient: { findUnique: vi.fn().mockResolvedValue({ dateOfBirth: config.dateOfBirth, biologicalSex: config.biologicalSex }) },
    patientHealthSnapshot: { findUnique: vi.fn().mockResolvedValue(config.snapshot) },
    riskScore: { create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'score-test-id', ...data })) },
  }

  return {
    $tx: vi.fn().mockImplementation((fn: any) => fn(txMock)),
    ...txMock,
  }
}

describe('RiskScoringService', () => {
  let service: RiskScoringService

  beforeEach(() => {
    service = new RiskScoringService()
    vi.clearAllMocks()
  })

  // ── Framingham known reference values ──
  describe('Framingham equation accuracy', () => {
    it('should compute moderate risk for average male profile', async () => {
      ;(getTenantDb as any).mockResolvedValue(makeDbMock({
        dateOfBirth: new Date('1960-01-01'),
        biologicalSex: 'MALE',
        snapshot: {
          latestTotalCholesterol: { toNumber: () => 210 },
          latestHdlMgDl: { toNumber: () => 50 },
          latestSystolicBp: { toNumber: () => 130 },
          isOnAntihypertensives: false,
          isSmoker: false,
          hasDiabetes: false,
        },
      }))

      const score = await service.computeCardiovascularRisk('t1', 'p1', 'corr1')
      expect(score).not.toBeNull()
      expect(Number(score!.valuePercent)).toBeGreaterThan(5)
      expect(Number(score!.valuePercent)).toBeLessThan(25)
    })

    it('should produce HIGH or VERY_HIGH risk for high-risk profile', async () => {
      ;(getTenantDb as any).mockResolvedValue(makeDbMock({
        dateOfBirth: new Date('1950-01-01'),   // ~74 years old
        biologicalSex: 'MALE',
        snapshot: {
          latestTotalCholesterol: { toNumber: () => 280 },
          latestHdlMgDl: { toNumber: () => 35 },
          latestSystolicBp: { toNumber: () => 155 },
          isOnAntihypertensives: true,
          isSmoker: true,
          hasDiabetes: true,
        },
      }))

      const score = await service.computeCardiovascularRisk('t1', 'p1', 'corr1')
      expect(score).not.toBeNull()
      expect(['HIGH', 'VERY_HIGH']).toContain(score!.riskCategory)
      expect(Number(score!.valuePercent)).toBeGreaterThan(20)
    })

    it('should produce LOW risk for young healthy female', async () => {
      ;(getTenantDb as any).mockResolvedValue(makeDbMock({
        dateOfBirth: new Date('1990-01-01'),   // ~34 years old
        biologicalSex: 'FEMALE',
        snapshot: {
          latestTotalCholesterol: { toNumber: () => 170 },
          latestHdlMgDl: { toNumber: () => 75 },
          latestSystolicBp: { toNumber: () => 110 },
          isOnAntihypertensives: false,
          isSmoker: false,
          hasDiabetes: false,
        },
      }))

      const score = await service.computeCardiovascularRisk('t1', 'p1', 'corr1')
      expect(score).not.toBeNull()
      expect(score!.riskCategory).toBe('LOW')
      expect(Number(score!.valuePercent)).toBeLessThan(7.5)
    })
  })

  // ── Insufficient data handling ──
  describe('data completeness handling', () => {
    it('should return null when all critical inputs are missing', async () => {
      ;(getTenantDb as any).mockResolvedValue(makeDbMock({ snapshot: null }))

      const score = await service.computeCardiovascularRisk('t1', 'p1', 'corr1')
      expect(score).toBeNull()
    })

    it('should return null when snapshot has no lipid or BP data', async () => {
      ;(getTenantDb as any).mockResolvedValue(makeDbMock({
        snapshot: {
          latestTotalCholesterol: null,
          latestHdlMgDl: null,
          latestSystolicBp: null,
          isOnAntihypertensives: null,
          isSmoker: null,
          hasDiabetes: null,
        },
      }))

      const score = await service.computeCardiovascularRisk('t1', 'p1', 'corr1')
      expect(score).toBeNull()
    })
  })

  // ── Risk category boundaries ──
  describe('risk category thresholds', () => {
    const categories = [
      { label: 'LOW', percent: 5.0 },
      { label: 'MODERATE', percent: 10.0 },
      { label: 'HIGH', percent: 25.0 },
      { label: 'VERY_HIGH', percent: 35.0 },
    ]

    categories.forEach(({ label, percent }) => {
      it(`maps ${percent}% to ${label}`, () => {
        // Access the private categorize method via any cast for testing
        const categorize = (service as any).categorize.bind(service)
        if (label === 'LOW') expect(categorize(percent)).toBe('LOW')
        else if (label === 'MODERATE') expect(categorize(percent)).toBe('MODERATE')
        else if (label === 'HIGH') expect(categorize(percent)).toBe('HIGH')
        else expect(categorize(percent)).toBe('VERY_HIGH')
      })
    })

    it('assigns LOW for < 7.5%', () => {
      expect((service as any).categorize(7.4)).toBe('LOW')
    })
    it('assigns MODERATE for exactly 7.5%', () => {
      expect((service as any).categorize(7.5)).toBe('MODERATE')
    })
    it('assigns HIGH for exactly 20%', () => {
      expect((service as any).categorize(20.0)).toBe('HIGH')
    })
    it('assigns VERY_HIGH for exactly 30%', () => {
      expect((service as any).categorize(30.0)).toBe('VERY_HIGH')
    })
  })

  // ── Determinism ──
  describe('determinism', () => {
    it('produces identical scores for identical inputs', async () => {
      const mockDb = makeDbMock()
      ;(getTenantDb as any).mockResolvedValue(mockDb)

      const score1 = await service.computeCardiovascularRisk('t1', 'p1', 'c1')
      ;(getTenantDb as any).mockResolvedValue(makeDbMock())
      const score2 = await service.computeCardiovascularRisk('t1', 'p1', 'c2')

      expect(Number(score1!.valuePercent)).toBe(Number(score2!.valuePercent))
      expect(score1!.riskCategory).toBe(score2!.riskCategory)
    })
  })
})
