// @ts-nocheck
// =============================================================================
// Risk Scoring Service — Framingham 2008 Updated Cardiovascular Risk
// Reference: D'Agostino et al., Circulation 2008;117:743-753
// Uses raw SQL via withTenant() — no Prisma generate required
// =============================================================================

import { withTenant } from '../lib/db'
import { logger, clinicalLog } from '../lib/logger'

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

  // ── Framingham 2008 General CVD equation (D'Agostino et al.) ─────
  //
  // Reference: D'Agostino RB, Vasan RS, Pencina MJ, et al.
  //   "General Cardiovascular Risk Profile for Use in Primary Care:
  //    The Framingham Heart Study." Circulation. 2008;117:743-753.
  //   Table 2 (sex-specific beta coefficients), Appendix score sheets
  //   (baseline 10-year survival S0 and mean of the linear predictor).
  //
  // 10-year risk = 1 − S0 ^ exp( Σβ·X − Σβ·X̄ )
  //
  // IMPORTANT (clinical correctness): the published men's model has NO
  // age×HDL interaction term, and uses lnAge coefficient 3.06117 with a
  // mean linear predictor of 23.9802 (S0 = 0.88936). A prior revision of
  // this file used an invalid age×HDL term and an off-by mean (23.9388),
  // which produced impossible risks (~99%) for average male profiles.
  // Constants below are validated against the paper's worked examples.

  private static readonly FRAMINGHAM = {
    MALE: {
      lnAge: 3.06117, lnTC: 1.12370, lnHDL: -0.93263,
      lnSBPTreated: 1.99881, lnSBPUntreated: 1.93303,
      smoker: 0.65451, diabetes: 0.57367,
      meanLinearPredictor: 23.9802, baselineSurvival: 0.88936,
    },
    FEMALE: {
      lnAge: 2.32888, lnTC: 1.20904, lnHDL: -0.70833,
      lnSBPTreated: 2.82263, lnSBPUntreated: 2.76157,
      smoker: 0.52873, diabetes: 0.69154,
      meanLinearPredictor: 26.1931, baselineSurvival: 0.95012,
    },
  } as const

  private framinghamEquation(inputs: CardiovascularInputs) {
    const sex = inputs.biologicalSex === 'MALE' ? 'MALE' : 'FEMALE'
    const c = RiskScoringService.FRAMINGHAM[sex]

    const lnAge = Math.log(inputs.age)
    const lnTC  = Math.log(inputs.totalCholesterol)
    const lnHDL = Math.log(inputs.hdlCholesterol)
    const lnSBP = Math.log(inputs.systolicBp)
    const lnSBPTreated   = inputs.isOnAntihypertensives ? lnSBP : 0
    const lnSBPUntreated = inputs.isOnAntihypertensives ? 0 : lnSBP
    const smoke = inputs.isSmoker ? 1 : 0
    const diab  = inputs.hasDiabetes ? 1 : 0

    const sum =
        c.lnAge * lnAge
      + c.lnTC  * lnTC
      + c.lnHDL * lnHDL
      + c.lnSBPTreated   * lnSBPTreated
      + c.lnSBPUntreated * lnSBPUntreated
      + c.smoker   * smoke
      + c.diabetes * diab

    const risk = Math.max(
      0.001,
      Math.min(0.999, 1 - Math.pow(c.baselineSurvival, Math.exp(sum - c.meanLinearPredictor)))
    )
    const pct = parseFloat((risk * 100).toFixed(2))

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
