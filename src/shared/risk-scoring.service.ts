// @ts-nocheck
// =============================================================================
// Risk Scoring Service — Framingham 2008 Updated Cardiovascular Risk
// Reference: D'Agostino et al., Circulation 2008;117:743-753
// Uses raw SQL via withTenant() — no Prisma generate required
// =============================================================================

import { withTenant } from '../platform/db'
import { logger, clinicalLog } from '../platform/logger'

interface CardiovascularInputs {
  age: number
  totalCholesterol: number
  hdlCholesterol: number
  systolicBp: number
  isOnAntihypertensives: boolean
  isSmoker: boolean
  hasDiabetes: boolean
  biologicalSex: 'MALE' | 'FEMALE' | 'INTERSEX'
}

export class RiskScoringService {
  async computeCardiovascularRisk(tenantId: string, patientId: string, correlationId: string) {
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'RiskScoring' })

    return withTenant(tenantId, async (tc) => {
      // Fetch patient demographics
      const patient = await tc.queryOne(
        `SELECT "dateOfBirth", "biologicalSex" FROM patients WHERE id = $1::uuid`,
        [patientId]
      )
      if (!patient) throw new Error(`Patient ${patientId} not found`)

      // Fetch health snapshot
      const snapshot = await tc.queryOne(
        `SELECT "latestTotalCholesterol"::float, "latestHdlMgDl"::float,
                "latestSystolicBp"::float, "latestFastingGlucose"::float,
                "isOnAntihypertensives", "isSmoker", "hasDiabetes"
         FROM patient_health_snapshots WHERE "patientId" = $1::uuid`,
        [patientId]
      )

      const age = this.calculateAge(new Date(patient.dateOfBirth))

      const missing: string[] = []
      if (!snapshot?.latestTotalCholesterol) missing.push('total_cholesterol')
      if (!snapshot?.latestHdlMgDl)          missing.push('hdl_cholesterol')
      if (!snapshot?.latestSystolicBp)        missing.push('systolic_bp')

      if (missing.length === 3) {
        log.warn({ missing }, 'Insufficient data for Framingham — skipping')
        return null
      }

      const inputs: CardiovascularInputs = {
        age: Math.max(30, Math.min(79, age)),
        totalCholesterol:   Number(snapshot?.latestTotalCholesterol ?? 200),
        hdlCholesterol:     Number(snapshot?.latestHdlMgDl ?? 50),
        systolicBp:         Number(snapshot?.latestSystolicBp ?? 120),
        isOnAntihypertensives: Boolean(snapshot?.isOnAntihypertensives ?? false),
        isSmoker:           Boolean(snapshot?.isSmoker ?? false),
        hasDiabetes:        Boolean(snapshot?.hasDiabetes ?? false),
        biologicalSex:      patient.biologicalSex,
      }

      const result = this.framinghamEquation(inputs)

      // Persist the score
      const score = await tc.queryOne(
        `INSERT INTO risk_scores (
           id, "tenantId", "patientId", "scoreType",
           value, "valuePercent", "riskCategory",
           "algorithmId", "algorithmVersion", "inputSnapshot", "computedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, 'CARDIOVASCULAR_10Y',
           $3, $4, $5, 'framingham_2008_updated', '1.0.0', $6::jsonb, NOW()
         ) RETURNING id, "riskCategory", "valuePercent"::float`,
        [
          tenantId, patientId,
          result.tenYearRisk.toFixed(4),
          result.tenYearRiskPercent.toFixed(2),
          result.category,
          JSON.stringify(inputs),
        ]
      )

      clinicalLog.riskCalculated({
        correlationId, tenantId, patientId,
        category: result.category,
        percent:  result.tenYearRiskPercent,
      })

      return score
    })
  }

  // ── Framingham 2008 Updated equation (D'Agostino et al.) ─────────

  private framinghamEquation(inputs: CardiovascularInputs) {
    const sex = inputs.biologicalSex === 'MALE' ? 'MALE' : 'FEMALE'
    const lnAge = Math.log(inputs.age)
    const lnTC  = Math.log(inputs.totalCholesterol)
    const lnHDL = Math.log(inputs.hdlCholesterol)
    const lnSBPt  = inputs.isOnAntihypertensives ? Math.log(inputs.systolicBp) : 0
    const lnSBPut = !inputs.isOnAntihypertensives ? Math.log(inputs.systolicBp) : 0
    const smoke = inputs.isSmoker  ? 1 : 0
    const diab  = inputs.hasDiabetes ? 1 : 0

    let sum: number, baseline: number

    if (sex === 'MALE') {
      sum = 3.11296*lnAge + 1.12370*lnTC - 0.93263*lnHDL + 0.17666*(lnAge*lnHDL)
          + 1.99881*lnSBPt + 1.93303*lnSBPut + 0.65451*smoke + 0.57367*diab
      baseline = 0.88936
    } else {
      sum = 2.32888*lnAge + 1.20904*lnTC - 0.70833*lnHDL + 0.04754*(lnAge*lnHDL)
          + 2.76157*lnSBPt + 2.82263*lnSBPut + 0.52873*smoke + 0.69154*diab
      baseline = 0.94833
    }

    const meanCoeff = sex === 'MALE' ? 23.9388 : 26.1931
    const risk = Math.max(0.001, Math.min(0.999, 1 - Math.pow(baseline, Math.exp(sum - meanCoeff))))
    const pct  = parseFloat((risk * 100).toFixed(2))

    return {
      tenYearRisk:        risk,
      tenYearRiskPercent: pct,
      category:           this.categorize(pct),
    }
  }

  private categorize(pct: number): string {
    if (pct < 7.5)  return 'LOW'
    if (pct < 20)   return 'MODERATE'
    if (pct < 30)   return 'HIGH'
    return 'VERY_HIGH'
  }

  private calculateAge(dob: Date): number {
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
    return age
  }
}
