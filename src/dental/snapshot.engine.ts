// =============================================================================
// src/dental/snapshot.engine.ts
// CFE Dental — Treatment Snapshot & Versioning Engine
//
// Responsibilities:
//   - Manage the lifecycle of TreatmentPlans and their versions.
//   - Provide immutable snapshots of financial estimates (FinancialSnapshot).
//   - Ensure history is preserved when patient modifies coverage, treatments, etc.
//
// Pure engine. No persistence.
// =============================================================================

import { TreatmentCode } from './dental-cost.engine'

export const SNAPSHOT_ENGINE_VERSION = '1.0.0'

export interface DentalProcedure {
  code: TreatmentCode
  quantity: number
  notes?: string
}

export interface FinancialSnapshot {
  totalCostUsd: number
  suggestedMarginPct: number
  finalPriceUsd: number
  currency: string
  exchangeRate: number
  totalInCurrency: number
  financingMonths?: number
  financingMonthlyPayment?: number
}

export interface TreatmentVersion {
  versionNumber: number
  procedures: DentalProcedure[]
  financials: FinancialSnapshot
  createdAt: string
  createdBy: string // UUID of doctor or system
  modificationsNote?: string // E.g., "Removed teeth whitening", "Added 12-month financing"
}

export interface TreatmentPlan {
  planId: string
  tenantId: string
  patientRef: string
  status: 'DRAFT' | 'PRESENTED' | 'ACCEPTED' | 'REJECTED'
  currentVersion: number
  versions: TreatmentVersion[]
}

export class SnapshotEngine {
  private readonly version = SNAPSHOT_ENGINE_VERSION

  createInitialPlan(
    tenantId: string, 
    patientRef: string, 
    procedures: DentalProcedure[], 
    financials: FinancialSnapshot,
    createdBy: string
  ): TreatmentPlan {
    const initialVersion: TreatmentVersion = {
      versionNumber: 1,
      procedures: [...procedures], // shallow copy
      financials: { ...financials },
      createdAt: new Date().toISOString(),
      createdBy,
      modificationsNote: 'Initial plan creation',
    }

    return {
      planId: `TP-${Date.now().toString(36).toUpperCase()}`,
      tenantId,
      patientRef,
      status: 'DRAFT',
      currentVersion: 1,
      versions: [initialVersion]
    }
  }

  createNextVersion(
    plan: TreatmentPlan,
    newProcedures: DentalProcedure[],
    newFinancials: FinancialSnapshot,
    createdBy: string,
    modificationsNote: string
  ): TreatmentPlan {
    const nextVersionNumber = plan.currentVersion + 1

    const nextVersion: TreatmentVersion = {
      versionNumber: nextVersionNumber,
      procedures: [...newProcedures],
      financials: { ...newFinancials },
      createdAt: new Date().toISOString(),
      createdBy,
      modificationsNote,
    }

    // Return a new TreatmentPlan object (immutable)
    return {
      ...plan,
      currentVersion: nextVersionNumber,
      versions: [...plan.versions, nextVersion],
      status: 'DRAFT' // Modifying a plan resets status to draft
    }
  }

  getLatestVersion(plan: TreatmentPlan): TreatmentVersion {
    const latest = plan.versions.find(v => v.versionNumber === plan.currentVersion)
    if (!latest) throw new Error('TreatmentPlan is missing its current version')
    return latest
  }
}
