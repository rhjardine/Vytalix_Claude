// @ts-nocheck — Prisma types require `prisma generate` (run `npm run db:generate`)
// =============================================================================
// Decision Engine — Rule-first clinical decision system
//
// Architecture:
//   1. Load active protocol rules for the patient's organization
//   2. Evaluate each rule deterministically against PatientHealthSnapshot
//   3. For each triggered rule: create Recommendation + DecisionTrace atomically
//   4. DecisionTrace includes ClinicalExplanation (deterministic, no LLM)
//
// Rules are NEVER evaluated probabilistically. ML scores are additive context,
// not the decision basis. This guarantees full reproducibility.
// =============================================================================

import { withTenant, writeAuditLog } from '../platform/db'
import { logger } from '../platform/logger'
import { ExplainabilityService } from '../shared/explainability.service'

export interface DecisionGenerationResult {
  generated: number
  skipped: number
  recommendations: Array<{
    id: string
    ruleId: string
    ruleName: string
    urgency: string
    title: string
  }>
}

// ─────────────────────────────────────────────────────────────────
// Built-in hardened rules (supplement protocol DB rules)
// These 5 rules encode clinical safety thresholds that should
// always be active regardless of protocol configuration.
// ─────────────────────────────────────────────────────────────────
interface HardenedRule {
  id: string          // Stable ID — never changes (referenced in DecisionTraces)
  name: string
  description: string
  evaluate: (snapshot: PatientSnapshotFields, recentTrend: TrendContext) => HardenedRuleResult | null
  urgency: 'ROUTINE' | 'SOON' | 'URGENT' | 'CRITICAL'
  actionType: string
  evidenceGrade?: string
  guidelineReference?: string
}

interface HardenedRuleResult {
  triggered: boolean
  title: string
  body: string
  primaryFactors: string[]
  cautionFactors: string[]
  missingData: string[]
  confidence: 'high' | 'medium' | 'low'
  patientValue?: number | boolean | null
}

interface PatientSnapshotFields {
  latestSystolicBp: number | null
  latestDiastolicBp: number | null
  latestLdlMgDl: number | null
  latestHdlMgDl: number | null
  latestTotalCholesterol: number | null
  latestFastingGlucose: number | null
  isSmoker: boolean | null
  hasDiabetes: boolean | null
  isOnAntihypertensives: boolean | null
  ageAtSnapshot: number | null
  lastObservationAt: Date | null
}

interface TrendContext {
  ldlTrend: 'RISING' | 'FALLING' | 'STABLE' | 'INSUFFICIENT_DATA'
  ldlLastThreeValues: number[]
  systolicTrend: 'RISING' | 'FALLING' | 'STABLE' | 'INSUFFICIENT_DATA'
  daysSinceLastObservation: number
}

// ─────────────────────────────────────────────────────────────────
// The 5 hardened clinical rules
// ─────────────────────────────────────────────────────────────────
const HARDENED_RULES: HardenedRule[] = [

  // Rule H-001: Severely elevated LDL
  {
    id: 'H-001',
    name: 'Severely elevated LDL (≥190 mg/dL)',
    description: 'ACC/AHA: LDL ≥190 mg/dL requires high-intensity statin regardless of 10-year risk',
    urgency: 'SOON',
    actionType: 'PRESCRIBE_MEDICATION',
    evidenceGrade: 'Grade I, Level B-R',
    guidelineReference: '2018 AHA/ACC Guideline on Management of Blood Cholesterol',
    evaluate(snapshot, _trend) {
      if (snapshot.latestLdlMgDl === null) return null
      const value = snapshot.latestLdlMgDl
      if (value < 190) return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }

      const missingData: string[] = []
      if (snapshot.isSmoker === null) missingData.push('Smoking status not recorded — affects overall cardiovascular risk assessment')
      if (snapshot.latestTotalCholesterol === null) missingData.push('Total cholesterol not available — full lipid panel recommended')

      return {
        triggered: true,
        patientValue: value,
        title: `Severely elevated LDL-C: ${value} mg/dL`,
        body: `LDL-C of ${value} mg/dL meets the ACC/AHA threshold (≥190 mg/dL) for high-intensity statin therapy, independent of estimated 10-year cardiovascular risk. Initiate atorvastatin 40–80 mg or rosuvastatin 20–40 mg. Recheck lipid panel in 4–12 weeks to assess response. Target: ≥50% LDL-C reduction from baseline.`,
        primaryFactors: [
          `LDL-C ${value} mg/dL ≥ ACC/AHA threshold of 190 mg/dL (Grade I, Level B-R)`,
          `High-intensity statin indicated regardless of calculated 10-year risk`,
        ],
        cautionFactors: [
          ...(snapshot.latestHdlMgDl !== null
            ? [`HDL-C ${snapshot.latestHdlMgDl} mg/dL — ${snapshot.latestHdlMgDl >= 60 ? 'protective range — consider in treatment monitoring' : 'below optimal protective range (target ≥60 mg/dL)'}`]
            : []),
          'Rule out secondary causes of hyperlipidemia (hypothyroidism, nephrotic syndrome, hepatic disease) before initiating treatment',
        ],
        missingData,
        confidence: missingData.length === 0 ? 'high' : 'medium',
      }
    },
  },

  // Rule H-002: Stage 2 Hypertension
  {
    id: 'H-002',
    name: 'Stage 2 Hypertension (systolic ≥140 mmHg)',
    description: 'ACC/AHA 2017: Systolic ≥140 mmHg = Stage 2 HTN requiring pharmacological intervention',
    urgency: 'SOON',
    actionType: 'PRESCRIBE_MEDICATION',
    evidenceGrade: 'Grade I, Level A',
    guidelineReference: '2017 ACC/AHA High Blood Pressure Guideline',
    evaluate(snapshot, _trend) {
      if (snapshot.latestSystolicBp === null) return null
      const systolic = snapshot.latestSystolicBp
      if (systolic < 140) return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }

      const stage = systolic >= 180 ? 'Hypertensive Crisis' : 'Stage 2 Hypertension'
      const urgency = systolic >= 180 ? 'CRITICAL' : 'SOON'

      const missingData: string[] = []
      if (snapshot.latestDiastolicBp === null) missingData.push('Diastolic BP not recorded — both values needed for complete classification')

      return {
        triggered: true,
        patientValue: systolic,
        title: `${stage}: ${systolic} mmHg${snapshot.latestDiastolicBp ? `/${snapshot.latestDiastolicBp} mmHg` : ''}`,
        body: `Systolic BP of ${systolic} mmHg meets criteria for ${stage}. ${urgency === 'CRITICAL' ? 'URGENT: Hypertensive crisis threshold reached — immediate evaluation required for end-organ damage (headache, vision changes, chest pain, neurological symptoms). Consider emergency department referral.' : `Initiate antihypertensive therapy. First-line agents: thiazide diuretic, ACE inhibitor, ARB, or calcium channel blocker per patient profile and comorbidities. ${snapshot.isOnAntihypertensives ? 'Patient is currently on antihypertensive therapy — consider dose adjustment or addition of second agent.' : ''} Target: <130/80 mmHg.`}`,
        primaryFactors: [
          `Systolic BP ${systolic} mmHg ≥ Stage 2 HTN threshold of 140 mmHg`,
          ...(snapshot.isOnAntihypertensives ? ['Currently on antihypertensive therapy — inadequate BP control'] : []),
        ],
        cautionFactors: [
          'Confirm with repeat measurements on ≥2 separate occasions before initiating or escalating therapy',
          'Assess for white-coat hypertension — ambulatory blood pressure monitoring recommended if suspected',
          ...(snapshot.hasDiabetes ? ['Diabetes present — ACE inhibitor or ARB preferred for renoprotection'] : []),
        ],
        missingData,
        confidence: missingData.length === 0 ? 'high' : 'medium',
      }
    },
  },

  // Rule H-003: Prediabetes / Elevated fasting glucose
  {
    id: 'H-003',
    name: 'Prediabetes — fasting glucose 100–125 mg/dL',
    description: 'ADA: Fasting glucose 100–125 mg/dL = impaired fasting glucose (IFG). Lifestyle intervention reduces T2DM progression by 58%.',
    urgency: 'ROUTINE',
    actionType: 'LIFESTYLE_INTERVENTION',
    evidenceGrade: 'Grade I, Level A',
    guidelineReference: 'ADA Standards of Medical Care in Diabetes',
    evaluate(snapshot, _trend) {
      if (snapshot.latestFastingGlucose === null) return null
      const glucose = snapshot.latestFastingGlucose
      const isDiabetic = glucose >= 126

      if (glucose < 100) return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }
      if (snapshot.hasDiabetes === true && isDiabetic) {
        // Diabetes already documented — don't duplicate with a prediabetes alert
        return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }
      }

      const label = isDiabetic ? 'Fasting glucose in diabetic range' : 'Prediabetes (Impaired Fasting Glucose)'

      return {
        triggered: true,
        patientValue: glucose,
        title: `${label}: ${glucose} mg/dL`,
        body: isDiabetic
          ? `Fasting glucose of ${glucose} mg/dL meets diagnostic criteria for Type 2 Diabetes (≥126 mg/dL). Confirm with a second fasting glucose or HbA1c. Initiate diabetes management protocol.`
          : `Fasting glucose of ${glucose} mg/dL falls in the prediabetes range (100–125 mg/dL per ADA criteria). Intensive lifestyle intervention (≥7% weight loss, 150 min/week moderate physical activity) reduces progression to T2DM by 58% (DPP trial). Order HbA1c to complete prediabetes evaluation. Consider metformin if BMI ≥35, age <60, or prior gestational diabetes.`,
        primaryFactors: [
          `Fasting glucose ${glucose} mg/dL — ${isDiabetic ? 'meets T2DM diagnostic threshold (≥126 mg/dL)' : 'prediabetes range (100–125 mg/dL per ADA)'}`,
        ],
        cautionFactors: [
          'Single fasting glucose measurement — confirm diagnosis with repeat test or HbA1c',
          ...(snapshot.isSmoker ? ['Active smoking accelerates insulin resistance — smoking cessation integral to prediabetes management'] : []),
        ],
        missingData: [
          ...(snapshot.latestHdlMgDl === null ? ['HbA1c not available — required for complete prediabetes/diabetes evaluation'] : []),
        ],
        confidence: 'medium',   // Single measurement — always medium confidence
      }
    },
  },

  // Rule H-004: Critical missing lab data alert
  {
    id: 'H-004',
    name: 'Critical labs overdue (>180 days)',
    description: 'No lipid panel or glucose data in >180 days for a patient with cardiovascular risk factors',
    urgency: 'ROUTINE',
    actionType: 'ORDER_LAB_TEST',
    evaluate(snapshot, trend) {
      const daysSince = trend.daysSinceLastObservation

      // Only alert if no data at all OR data is very old
      if (daysSince < 180 && snapshot.lastObservationAt !== null) {
        return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }
      }

      const missingCritical: string[] = []
      if (snapshot.latestLdlMgDl === null) missingCritical.push('LDL Cholesterol (LOINC 2089-1)')
      if (snapshot.latestHdlMgDl === null) missingCritical.push('HDL Cholesterol (LOINC 2085-9)')
      if (snapshot.latestFastingGlucose === null) missingCritical.push('Fasting Glucose (LOINC 2345-7)')
      if (snapshot.latestSystolicBp === null) missingCritical.push('Blood Pressure (LOINC 8480-6)')

      if (missingCritical.length === 0 && daysSince < 180) {
        return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }
      }

      const reason = snapshot.lastObservationAt === null
        ? 'No clinical data has been recorded for this patient'
        : `Last clinical observation was ${daysSince} days ago`

      return {
        triggered: true,
        title: 'Baseline labs required for risk assessment',
        body: `${reason}. Cardiovascular risk scoring requires a complete metabolic and lipid panel. Order: ${missingCritical.join(', ')}. ${snapshot.ageAtSnapshot && snapshot.ageAtSnapshot >= 40 ? 'Patient is ≥40 years — annual cardiovascular risk assessment is indicated per ACC/AHA guidelines.' : ''}`,
        primaryFactors: [
          ...(missingCritical.length > 0 ? [`${missingCritical.length} critical labs missing: ${missingCritical.join(', ')}`] : []),
          ...(daysSince >= 180 && snapshot.lastObservationAt !== null ? [`Last data recorded ${daysSince} days ago — data currency insufficient for reliable risk assessment`] : []),
        ],
        cautionFactors: [],
        missingData: missingCritical,
        confidence: 'low',
      }
    },
  },

  // Rule H-005: LDL deterioration trend (last 3 observations rising ≥15%)
  {
    id: 'H-005',
    name: 'LDL deteriorating trend (≥15% rise across last 3 values)',
    description: 'LDL values showing consistent upward trend across last 3 measurements, regardless of absolute threshold',
    urgency: 'ROUTINE',
    actionType: 'SCHEDULE_FOLLOWUP',
    evaluate(snapshot, trend) {
      if (trend.ldlTrend !== 'RISING') return null
      if (trend.ldlLastThreeValues.length < 3) return null

      const [v1, v2, v3] = trend.ldlLastThreeValues
      const totalRise = ((v3 - v1) / v1) * 100
      if (totalRise < 15) return { triggered: false, title: '', body: '', primaryFactors: [], cautionFactors: [], missingData: [], confidence: 'high' }

      return {
        triggered: true,
        title: `LDL-C rising trend: ${v1.toFixed(0)} → ${v2.toFixed(0)} → ${v3.toFixed(0)} mg/dL (+${totalRise.toFixed(0)}%)`,
        body: `LDL-C has risen ${totalRise.toFixed(0)}% over the last 3 measurements (${v1.toFixed(0)} → ${v2.toFixed(0)} → ${v3.toFixed(0)} mg/dL). Even if current absolute values are below treatment thresholds, this trajectory warrants clinical attention. Consider: dietary assessment, medication adherence review, and thyroid function testing to exclude secondary causes. Recheck lipid panel in 6–8 weeks.`,
        primaryFactors: [
          `LDL-C trajectory: ${v1.toFixed(0)} → ${v2.toFixed(0)} → ${v3.toFixed(0)} mg/dL (${totalRise.toFixed(0)}% total increase)`,
          'Consistent upward trend across 3 consecutive measurements',
        ],
        cautionFactors: [
          `Current LDL-C (${v3.toFixed(0)} mg/dL) ${v3 < 190 ? 'remains below the 190 mg/dL pharmacological intervention threshold' : 'has crossed the pharmacological intervention threshold'}`,
        ],
        missingData: [],
        confidence: 'medium',
      }
    },
  },
]

// ─────────────────────────────────────────────────────────────────
// Decision Engine
// ─────────────────────────────────────────────────────────────────

export class DecisionEngine {
  private explainability = new ExplainabilityService()

  async generateForPatient(
    tenantId: string,
    patientId: string,
    correlationId: string
  ): Promise<DecisionGenerationResult> {
    const log = logger.child({ correlationId, tenantId, patientId, fn: 'DecisionEngine' })

    
    // Load snapshot
    const snapshot = await withTenant(tenantId, (tc) =>
      tc.queryOne('SELECT * FROM patient_health_snapshots WHERE "patientId"=$1::uuid', [patientId])
    )

    if (!snapshot) {
      log.warn('No health snapshot found — skipping decision generation')
      return { generated: 0, skipped: 0, recommendations: [] }
    }

    // Compute trend context from observation history
    const trend = await this.computeTrendContext(tenantId, patientId)

    // Load latest risk score for context
    const latestRiskScore = await withTenant(tenantId, (tc) =>
      tc.queryOne(
        `SELECT * FROM risk_scores WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "scoreType"='CARDIOVASCULAR_10Y' ORDER BY "computedAt" DESC LIMIT 1`,
        [tenantId, patientId]
      )
    )

    // Load active protocol rules from DB
    const protocolRules = await withTenant(tenantId, (tc) =>
      tc.queryMany(
        `SELECT pr.*, p."organizationId" AS "protocol_orgId", p."clinicalDomain" AS "protocol_domain"
         FROM protocol_rules pr
         JOIN protocols p ON p.id = pr."protocolId"
         WHERE pr."tenantId"=$1::uuid AND pr."isActive"=true
         ORDER BY pr.priority ASC`,
        [tenantId]
      )
    )

    const snapshotFields: PatientSnapshotFields = {
      latestSystolicBp: snapshot.latestSystolicBp ? Number(snapshot.latestSystolicBp) : null,
      latestDiastolicBp: snapshot.latestDiastolicBp ? Number(snapshot.latestDiastolicBp) : null,
      latestLdlMgDl: snapshot.latestLdlMgDl ? Number(snapshot.latestLdlMgDl) : null,
      latestHdlMgDl: snapshot.latestHdlMgDl ? Number(snapshot.latestHdlMgDl) : null,
      latestTotalCholesterol: snapshot.latestTotalCholesterol ? Number(snapshot.latestTotalCholesterol) : null,
      latestFastingGlucose: snapshot.latestFastingGlucose ? Number(snapshot.latestFastingGlucose) : null,
      isSmoker: snapshot.isSmoker,
      hasDiabetes: snapshot.hasDiabetes,
      isOnAntihypertensives: snapshot.isOnAntihypertensives,
      ageAtSnapshot: snapshot.ageAtSnapshot,
      lastObservationAt: snapshot.lastObservationAt,
    }

    const generated: DecisionGenerationResult['recommendations'] = []
    let skipped = 0

    // Evaluate hardened rules first
    for (const rule of HARDENED_RULES) {
      const result = rule.evaluate(snapshotFields, trend)
      if (!result || !result.triggered) {
        skipped++
        continue
      }

      // Check for existing PENDING recommendation for same rule
      const existing = await withTenant(tenantId, (tc) =>
        tc.queryOne(
          `SELECT id FROM recommendations WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND status='PENDING' AND body LIKE $3 LIMIT 1`,
          [tenantId, patientId, `%${rule.id}%`]
        )
      )
      if (existing) {
        log.info({ ruleId: rule.id }, 'Skipping — PENDING recommendation exists')
        skipped++
        continue
      }

      const rec = await this.createRecommendation(
        tenantId, patientId, rule.id, rule.name, rule.urgency, rule.actionType,
        result, latestRiskScore, snapshotFields, correlationId
      )

      generated.push({ id: rec.id, ruleId: rule.id, ruleName: rule.name, urgency: rule.urgency, title: result.title })
      log.info({ ruleId: rule.id, recId: rec.id }, 'Recommendation generated')
    }

    // Evaluate DB protocol rules
    for (const rule of protocolRules) {
      const fieldValue = (snapshotFields as Record<string, unknown>)[rule.conditionField]
      const triggered = this.evaluateCondition(fieldValue, rule.conditionOperator, rule.conditionThreshold)

      if (!triggered) {
        skipped++
        continue
      }

      const bodyText = (rule.recommendationText as string).replace(
        '{value}',
        fieldValue != null ? String(fieldValue) : 'N/A'
      )

      const explanation = {
        summary: `${rule.name}: patient value meets the defined clinical threshold.`,
        primaryFactors: [`${rule.conditionField}: ${fieldValue} ${rule.conditionOperator} ${JSON.stringify(rule.conditionThreshold)}`],
        cautionFactors: [] as string[],
        missingData: [] as string[],
        confidence: 'high' as const,
      }

      const rec = await withTenant(tenantId, async (tc) => {
        const recommendation = await tc.queryOne(
          `INSERT INTO recommendations (id,"tenantId","patientId","protocolId","protocolRuleId","riskScoreId",category,urgency,title,body,status,"createdAt")
           VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'PENDING',NOW()) RETURNING *`,
          [tenantId, patientId, rule.protocolId, rule.id, latestRiskScore?.id ?? null,
           rule.protocol_domain ?? 'CARDIOVASCULAR', rule.urgency, rule.name, bodyText]
        )
        const rf = [{ ruleId: rule.id, ruleName: rule.name, passed: true, conditionField: rule.conditionField, patientValue: fieldValue, threshold: rule.conditionThreshold, operator: rule.conditionOperator }]
        await tc.execute(
          `INSERT INTO decision_traces ("tenantId","recommendationId","engineVersion","rulesFired","patientSnapshotAtDecision",explanation,"tracedAt")
           VALUES ($1::uuid,$2::uuid,'1.0.0',$3::jsonb,$4::jsonb,$5::jsonb,NOW())`,
          [tenantId, recommendation.id, JSON.stringify(rf), JSON.stringify(snapshotFields), JSON.stringify(explanation)]
        )
        await writeAuditLog(tc, { tenantId, resourceType: 'Recommendation', resourceId: recommendation.id, action: 'CREATE', diff: { after: { ruleId: rule.id, urgency: rule.urgency } } })
        return recommendation
      })

      generated.push({ id: rec.id, ruleId: rule.id, ruleName: rule.name, urgency: rule.urgency, title: rule.name })
    }

    return { generated: generated.length, skipped, recommendations: generated }
  }

  private async createRecommendation(
    tenantId: string, patientId: string, ruleId: string, ruleName: string,
    urgency: string, actionType: string, result: HardenedRuleResult,
    latestRiskScore: any, snapshot: PatientSnapshotFields,
    correlationId: string
  ) {
    // Find the first active protocol for this patient's organization
    const protocolRow = await withTenant(tenantId, (tc: any) =>
      tc.queryOne(
        `SELECT p.id, pr.id AS rule_id FROM protocols p
         LEFT JOIN protocol_rules pr ON pr."protocolId"=p.id AND pr."isActive"=true
         WHERE p."tenantId"=$1::uuid AND p."isActive"=true LIMIT 1`,
        [tenantId]
      )
    )
    const protocolId     = protocolRow?.id       ?? '00000000-0000-0000-0000-000000000000'
    const protocolRuleId = protocolRow?.rule_id   ?? '00000000-0000-0000-0000-000000000000'
    const rulesFired = [{ ruleId, ruleName, passed: true, conditionField: 'composite', patientValue: result.patientValue, threshold: null, operator: 'hardened_rule', clinicalWeight: 1.0 }]
    const explanation = { summary: result.title, primaryFactors: result.primaryFactors, cautionFactors: result.cautionFactors, missingData: result.missingData, confidence: result.confidence }
    const riskSnap = latestRiskScore ? { scoreType: latestRiskScore.scoreType, valuePercent: Number(latestRiskScore.valuePercent), riskCategory: latestRiskScore.riskCategory } : null

    return withTenant(tenantId, async (tc: any) => {
      const recommendation = await tc.queryOne(
        `INSERT INTO recommendations (id,"tenantId","patientId","protocolId","protocolRuleId","riskScoreId",category,urgency,title,body,status,"createdAt")
         VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'CARDIOVASCULAR',$6,$7,$8,'PENDING',NOW()) RETURNING *`,
        [tenantId, patientId, protocolId, protocolRuleId, latestRiskScore?.id ?? null, urgency, result.title, result.body]
      )

      await tc.execute(
        `INSERT INTO decision_traces ("tenantId","recommendationId","engineVersion","rulesFired","riskScoreSnapshot","patientSnapshotAtDecision",explanation,"tracedAt")
         VALUES ($1::uuid,$2::uuid,'1.0.0',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,NOW())`,
        [tenantId, recommendation.id, JSON.stringify(rulesFired), JSON.stringify(riskSnap), JSON.stringify(snapshot), JSON.stringify(explanation)]
      )

      await writeAuditLog(tc, {
        tenantId, resourceType: 'Recommendation', resourceId: recommendation.id,
        action: 'CREATE', diff: { after: { ruleId, urgency } },
      })

      return recommendation
    })
  }

  private async computeTrendContext(tenantId: string, patientId: string): Promise<TrendContext> {
    const [lastLdlObs, lastSystolicObs, lastObsArr] = await Promise.all([
      withTenant(tenantId, (tc: any) => tc.queryMany(
        `SELECT "valueNumeric"::float, "observedAt" FROM clinical_observations WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "loincCode"='2089-1' ORDER BY "observedAt" DESC LIMIT 3`,
        [tenantId, patientId])),
      withTenant(tenantId, (tc: any) => tc.queryMany(
        `SELECT "valueNumeric"::float, "observedAt" FROM clinical_observations WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid AND "loincCode"='8480-6' ORDER BY "observedAt" DESC LIMIT 3`,
        [tenantId, patientId])),
      withTenant(tenantId, (tc: any) => tc.queryMany(
        `SELECT "observedAt" FROM clinical_observations WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid ORDER BY "observedAt" DESC LIMIT 1`,
        [tenantId, patientId])),
    ])
    const lastObs = lastObsArr[0]

    const daysSince = lastObs
      ? Math.floor((Date.now() - lastObs.observedAt.getTime()) / 86400000)
      : 999

    const ldlValues = lastLdlObs.map((o: any) => Number(o.valueNumeric)).reverse()
    const systolicValues = lastSystolicObs.map((o: any) => Number(o.valueNumeric)).reverse()

    return {
      ldlTrend: this.computeTrend(ldlValues),
      ldlLastThreeValues: ldlValues,
      systolicTrend: this.computeTrend(systolicValues),
      daysSinceLastObservation: daysSince,
    }
  }

  private computeTrend(values: number[]): 'RISING' | 'FALLING' | 'STABLE' | 'INSUFFICIENT_DATA' {
    if (values.length < 2) return 'INSUFFICIENT_DATA'
    const first = values[0]
    const last = values[values.length - 1]
    const pctChange = ((last - first) / first) * 100
    if (pctChange > 5) return 'RISING'
    if (pctChange < -5) return 'FALLING'
    return 'STABLE'
  }

  private evaluateCondition(value: unknown, operator: string, threshold: unknown): boolean {
    if (value === null || value === undefined) return false
    const v = Number(value)
    const t = Number(threshold)
    switch (operator) {
      case 'gt': return v > t
      case 'gte': return v >= t
      case 'lt': return v < t
      case 'lte': return v <= t
      case 'eq': return v === t
      default: return false
    }
  }
}
