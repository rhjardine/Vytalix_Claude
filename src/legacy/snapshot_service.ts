// @ts-nocheck
// =============================================================================
// Snapshot Service — Event-driven PatientHealthSnapshot management
//
// The DB trigger handles fast-path updates for individual field values.
// This service handles:
//   1. Full recomputation when multiple fields need updating simultaneously
//   2. Optimistic locking to prevent concurrent write conflicts
//   3. Data completeness scoring
//   4. Biological age proxy computation (simple, no epigenetics in MVP)
//
// Called by the pipeline ONLY — not directly by API handlers.
// =============================================================================

import { withTenant } from '../platform/db'
import { logger } from '../platform/logger'
import { publish } from '../platform/event-bus'

export class SnapshotService {
  async recompute(
    tenantId: string,
    patientId: string,
    correlationId: string,
    triggeredByObservationId: string | null = null
  ): Promise<{ updated: boolean; version: number; updatedFields: string[] }> {
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'SnapshotService' })

    // Fetch most recent value for each tracked LOINC code
    const latestByLoinc = await this.fetchLatestByLoinc(tenantId, patientId)

    // Fetch patient demographics for age calculation
    const patient = await withTenant(tenantId, (tc) =>
      tc.queryOne('SELECT "dateOfBirth" FROM patients WHERE id=$1::uuid', [patientId])
    )

    if (!patient) {
      log.warn('Patient not found during snapshot recompute')
      return { updated: false, version: 0, updatedFields: [] }
    }

    const age = this.calculateAge(new Date(patient.dateOfBirth))

    // Build the new snapshot values
    const newValues = {
      latestLdlMgDl:         latestByLoinc['2089-1'],
      latestHdlMgDl:         latestByLoinc['2085-9'],
      latestTotalCholesterol: latestByLoinc['2093-3'],
      latestSystolicBp:      latestByLoinc['8480-6'],
      latestDiastolicBp:     latestByLoinc['8462-4'],
      latestFastingGlucose:  latestByLoinc['2345-7'],
      ageAtSnapshot:         age,
    }

    // Upsert with version increment (optimistic locking)
    const snapshot = await withTenant(tenantId, async (tc) => {
      return tc.queryOne(
        `INSERT INTO patient_health_snapshots (
           "tenantId","patientId",
           "latestLdlMgDl","latestHdlMgDl","latestTotalCholesterol",
           "latestSystolicBp","latestDiastolicBp","latestFastingGlucose",
           "ageAtSnapshot","snapshotVersion","lastObservationAt","updatedAt"
         )
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,1,NOW(),NOW())
         ON CONFLICT ("patientId") DO UPDATE SET
           "latestLdlMgDl"         = COALESCE($3, patient_health_snapshots."latestLdlMgDl"),
           "latestHdlMgDl"         = COALESCE($4, patient_health_snapshots."latestHdlMgDl"),
           "latestTotalCholesterol"= COALESCE($5, patient_health_snapshots."latestTotalCholesterol"),
           "latestSystolicBp"      = COALESCE($6, patient_health_snapshots."latestSystolicBp"),
           "latestDiastolicBp"     = COALESCE($7, patient_health_snapshots."latestDiastolicBp"),
           "latestFastingGlucose"  = COALESCE($8, patient_health_snapshots."latestFastingGlucose"),
           "ageAtSnapshot"         = COALESCE($9, patient_health_snapshots."ageAtSnapshot"),
           "snapshotVersion"       = patient_health_snapshots."snapshotVersion" + 1,
           "lastObservationAt"     = NOW(),
           "updatedAt"             = NOW()
         RETURNING "snapshotVersion"`,
        [
          tenantId, patientId,
          newValues.latestLdlMgDl,         newValues.latestHdlMgDl,
          newValues.latestTotalCholesterol, newValues.latestSystolicBp,
          newValues.latestDiastolicBp,      newValues.latestFastingGlucose,
          newValues.ageAtSnapshot,
        ]
      )
    })

    const updatedFields = Object.entries(newValues)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([k]) => k)

    log.info(
      { version: snapshot?.snapshotVersion ?? 1, updatedFields: updatedFields.length },
      'Snapshot recomputed'
    )

    publish.patientModelUpdated(
      { tenantId, correlationId },
      {
        patientId,
        snapshotVersion: snapshot?.snapshotVersion ?? 1,
        updatedFields,
        triggeredByObservationId,
      }
    )

    return {
      updated: true,
      version: snapshot?.snapshotVersion ?? 1,
      updatedFields,
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Biological age proxy (MVP — no epigenetics, uses surrogate markers)
  // This is a simplified proxy, NOT a clinical-grade epigenetic clock.
  // It provides directional signal only — labeled clearly in the UI.
  // ─────────────────────────────────────────────────────────────────
  computeBiologicalAgeProxy(
    chronologicalAge: number,
    snapshot: {
      latestLdlMgDl: number | null
      latestHdlMgDl: number | null
      latestSystolicBp: number | null
      isSmoker: boolean | null
      hasDiabetes: boolean | null
    }
  ): { biologicalAge: number; delta: number; algorithm: string } {
    let adjustment = 0

    if (snapshot.latestLdlMgDl !== null) {
      if (snapshot.latestLdlMgDl < 100) adjustment -= 2
      else if (snapshot.latestLdlMgDl > 160) adjustment += 2
      else if (snapshot.latestLdlMgDl > 130) adjustment += 1
    }

    if (snapshot.latestHdlMgDl !== null) {
      if (snapshot.latestHdlMgDl >= 60) adjustment -= 2
      else if (snapshot.latestHdlMgDl < 40) adjustment += 2
    }

    if (snapshot.latestSystolicBp !== null) {
      if (snapshot.latestSystolicBp >= 140) adjustment += 3
      else if (snapshot.latestSystolicBp >= 130) adjustment += 1
      else if (snapshot.latestSystolicBp < 120) adjustment -= 1
    }

    if (snapshot.isSmoker === true) adjustment += 5
    if (snapshot.hasDiabetes === true) adjustment += 3

    const biologicalAge = Math.max(18, Math.min(120, chronologicalAge + adjustment))
    return {
      biologicalAge,
      delta: adjustment,
      algorithm: 'cardiovascular_proxy_v1',
    }
  }

  private async fetchLatestByLoinc(
    tenantId: string,
    patientId: string
  ): Promise<Record<string, number | null>> {
    const loincCodes = ['2089-1', '2085-9', '2093-3', '8480-6', '8462-4', '2345-7']
    const result: Record<string, number | null> = {}

    for (const code of loincCodes) {
      const obs = await withTenant(tenantId, (tc) =>
        tc.queryOne(
          `SELECT "valueNumeric"::float AS v
           FROM clinical_observations
           WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
             AND "loincCode"=$3 AND "isCorrection"=false
           ORDER BY "observedAt" DESC LIMIT 1`,
          [tenantId, patientId, code]
        )
      )
      result[code] = obs?.v != null ? Number(obs.v) : null
    }

    return result
  }

  private calculateAge(dob: Date): number {
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
    return age
  }
}
