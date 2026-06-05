import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotEngine, DentalProcedure, FinancialSnapshot, TreatmentPlan } from '../src/dental/snapshot.engine'

describe('SnapshotEngine', () => {
  let engine: SnapshotEngine
  const dummyProcedures: DentalProcedure[] = [{ code: 'LIMPIEZA_PROFILAXIS', quantity: 1 }]
  const dummyFinancials: FinancialSnapshot = {
    totalCostUsd: 100,
    suggestedMarginPct: 0.4,
    finalPriceUsd: 166.67,
    currency: 'USD',
    exchangeRate: 1.0,
    totalInCurrency: 166.67
  }
  const tenantId = 't1'
  const patientRef = 'p1'
  const creator = 'user1'

  beforeEach(() => {
    engine = new SnapshotEngine()
  })

  it('creates an initial plan with version 1', () => {
    const plan = engine.createInitialPlan(tenantId, patientRef, dummyProcedures, dummyFinancials, creator)
    expect(plan.planId).toMatch(/^TP-/)
    expect(plan.currentVersion).toBe(1)
    expect(plan.status).toBe('DRAFT')
    expect(plan.versions.length).toBe(1)
    
    const v1 = plan.versions[0]
    expect(v1.versionNumber).toBe(1)
    expect(v1.modificationsNote).toContain('Initial')
  })

  it('creates a new version without mutating original plan', () => {
    const planV1 = engine.createInitialPlan(tenantId, patientRef, dummyProcedures, dummyFinancials, creator)
    
    const newProcs: DentalProcedure[] = [...dummyProcedures, { code: 'BLANQUEAMIENTO_LASER', quantity: 1 }]
    const planV2 = engine.createNextVersion(planV1, newProcs, dummyFinancials, creator, 'Added whitening')
    
    // v1 should be intact
    expect(planV1.currentVersion).toBe(1)
    expect(planV1.versions.length).toBe(1)

    // v2 should reflect changes
    expect(planV2.currentVersion).toBe(2)
    expect(planV2.versions.length).toBe(2)
    expect(planV2.status).toBe('DRAFT')
    
    const latest = engine.getLatestVersion(planV2)
    expect(latest.versionNumber).toBe(2)
    expect(latest.procedures.length).toBe(2)
    expect(latest.modificationsNote).toBe('Added whitening')
  })

  it('getLatestVersion retrieves the current version', () => {
    const plan = engine.createInitialPlan(tenantId, patientRef, dummyProcedures, dummyFinancials, creator)
    const latest = engine.getLatestVersion(plan)
    expect(latest.versionNumber).toBe(plan.currentVersion)
  })
})
