// =============================================================================
// Unit Tests — Risk Scoring Service
// Tests the Framingham 2008 Updated equation with known reference values
// and boundary conditions.
//
// NOTE: The canonical RiskScoringService uses raw SQL via withTenant()/tc.queryOne()
// (see src/lib/db.ts). These tests mock that interface — NOT the legacy Prisma API.
// Tenant IDs must be valid UUIDs because db.ts enforces UUID format at the boundary.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RiskScoringService } from '../../src/pipeline/risk-scoring.service'

// Mock the canonical DB layer (raw-SQL withTenant) to avoid real DB connections.
vi.mock('../../src/lib/db', () => ({
  withTenant: vi.fn(),
}))

import { withTenant } from '../../src/lib/db'

// Valid UUIDs — db.ts assertUUID() rejects non-UUID tenant/patient identifiers.
const TENANT_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const PATIENT_ID = 'b1b2c3d4-0000-4000-8000-0000000000a1'

/**
 * Build a withTenant mock that emulates tc.queryOne() returning, in order:
 *   1. patient demographics row  { dateOfBirth, biologicalSex }
 *   2. health-snapshot row (raw-SQL shaped — plain numbers, not Prisma Decimals)
 *   3. the INSERT ... RETURNING row { id, riskCategory, valuePercent }
 *
 * The service computes valuePercent itself; for the INSERT we echo back the
 * value the service passes via parameters, so assertions stay implementation-driven.
 */
function mockWithTenant(overrides: Partial<{
  dateOfBirth: Date
  biologicalSex: string
  snapshot: Record<string, unknown> | null
}> = {}) {
  const defaults = {
    dateOfBirth: new Date('1960-01-01'), // ~64 years old
    biologicalSex: 'MALE',
    snapshot: {
      latestTotalCholesterol: 210,
      latestHdlMgDl: 50,
      latestSystolicBp: 130,
      latestFastingGlucose: 90,
      isOnAntihypertensives: false,
      isSmoker: false,
      hasDiabetes: false,
    } as Record<string, unknown> | null,
  }
  const config = { ...defaults, ...overrides }

  ;(withTenant as any).mockImplementation(async (_tenantId: string, fn: any) => {
    let call = 0
    const tc = {
      queryOne: vi.fn().mockImplementation((sql: string, _params: unknown[]) => {
        call += 1
        // Call 1: patient demographics
        if (sql.includes('FROM patients')) {
          return Promise.resolve({
            dateOfBirth: config.dateOfBirth,
            biologicalSex: config.biologicalSex,
          })
        }
        // Call 2: health snapshot
        if (sql.includes('patient_health_snapshots')) {
          return Promise.resolve(config.snapshot)
        }
        // Call 3: INSERT ... RETURNING — echo computed value back
        if (sql.includes('INSERT INTO risk_scores')) {
          // valuePercent is the 4th positional param ($4)
          const valuePercent = Number(_params[3])
          const riskCategory = (RiskScoringService.prototype as any).categorize.call(
            null,
            valuePercent
          )
          return Promise.resolve({
            id: 'score-test-id',
            riskCategory,
            valuePercent,
          })
        }
        return Promise.resolve(null)
      }),
      query: vi.fn().mockResolvedValue([]),
    }
    return fn(tc)
  })
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
      mockWithTenant({
        dateOfBirth: new Date('1960-01-01'),
        biologicalSex: 'MALE',
        snapshot: {
          latestTotalCholesterol: 210,
          latestHdlMgDl: 50,
          latestSystolicBp: 130,
          isOnAntihypertensives: false,
          isSmoker: false,
          hasDiabetes: false,
        },
      })

      const score = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'corr1')
      expect(score).not.toBeNull()
      expect(Number(score!.valuePercent)).toBeGreaterThan(5)
      expect(Number(score!.valuePercent)).toBeLessThan(25)
    })

    it('should produce HIGH or VERY_HIGH risk for high-risk profile', async () => {
      mockWithTenant({
        dateOfBirth: new Date('1950-01-01'), // ~74 years old
        biologicalSex: 'MALE',
        snapshot: {
          latestTotalCholesterol: 280,
          latestHdlMgDl: 35,
          latestSystolicBp: 155,
          isOnAntihypertensives: true,
          isSmoker: true,
          hasDiabetes: true,
        },
      })

      const score = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'corr1')
      expect(score).not.toBeNull()
      expect(['HIGH', 'VERY_HIGH']).toContain(score!.riskCategory)
      expect(Number(score!.valuePercent)).toBeGreaterThan(20)
    })

    it('should produce LOW risk for young healthy female', async () => {
      mockWithTenant({
        dateOfBirth: new Date('1990-01-01'), // ~34 years old
        biologicalSex: 'FEMALE',
        snapshot: {
          latestTotalCholesterol: 170,
          latestHdlMgDl: 75,
          latestSystolicBp: 110,
          isOnAntihypertensives: false,
          isSmoker: false,
          hasDiabetes: false,
        },
      })

      const score = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'corr1')
      expect(score).not.toBeNull()
      expect(score!.riskCategory).toBe('LOW')
      expect(Number(score!.valuePercent)).toBeLessThan(7.5)
    })
  })

  // ── Insufficient data handling ──
  describe('data completeness handling', () => {
    it('should return null when all critical inputs are missing', async () => {
      mockWithTenant({ snapshot: null })

      const score = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'corr1')
      expect(score).toBeNull()
    })

    it('should return null when snapshot has no lipid or BP data', async () => {
      mockWithTenant({
        snapshot: {
          latestTotalCholesterol: null,
          latestHdlMgDl: null,
          latestSystolicBp: null,
          isOnAntihypertensives: null,
          isSmoker: null,
          hasDiabetes: null,
        },
      })

      const score = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'corr1')
      expect(score).toBeNull()
    })
  })

  // ── Risk category boundaries ──
  describe('risk category thresholds', () => {
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
      mockWithTenant()
      const score1 = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'c1')
      mockWithTenant()
      const score2 = await service.computeCardiovascularRisk(TENANT_ID, PATIENT_ID, 'c2')

      expect(Number(score1!.valuePercent)).toBe(Number(score2!.valuePercent))
      expect(score1!.riskCategory).toBe(score2!.riskCategory)
    })
  })
})
