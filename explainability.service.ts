// =============================================================================
// Explainability Service — Deterministic Clinical Narrative Generator
//
// HARD CONSTRAINTS:
//   - No LLM calls in this service
//   - All outputs map 1:1 to data in DecisionTrace
//   - Every narrative is reproducible given the same DecisionTrace
//   - Confidence levels follow strict data-quality rules, not heuristics
// =============================================================================

export interface ClinicalExplanation {
  summary: string
  primaryFactors: string[]
  cautionFactors: string[]
  missingData: string[]
  confidence: 'high' | 'medium' | 'low'
  evidenceGrade?: string
  guidelineReference?: string
}

export interface TraceData {
  rulesFired: Array<{
    ruleId: string
    ruleName: string
    passed: boolean
    conditionField: string
    patientValue: unknown
    threshold: unknown
    operator: string
    clinicalWeight?: number
  }>
  riskScoreSnapshot?: {
    scoreType: string
    valuePercent: number
    riskCategory: string
  } | null
  patientSnapshotAtDecision: {
    latestSystolicBp: number | null
    latestDiastolicBp: number | null
    latestLdlMgDl: number | null
    latestHdlMgDl: number | null
    latestTotalCholesterol: number | null
    latestFastingGlucose: number | null
    isSmoker: boolean | null
    hasDiabetes: boolean | null
    ageAtSnapshot: number | null
    lastObservationAt: string | null
  }
  existingExplanation?: ClinicalExplanation
}

export class ExplainabilityService {
  // ─────────────────────────────────────────────────────────────────
  // Render a complete ClinicalExplanation from a stored DecisionTrace.
  // If the trace already has a pre-generated explanation (from hardened
  // rules), this method enriches it with risk score context.
  // ─────────────────────────────────────────────────────────────────
  renderExplanation(trace: TraceData): ClinicalExplanation {
    // Use pre-generated explanation from decision engine if available
    if (trace.existingExplanation) {
      return this.enrichWithRiskContext(trace.existingExplanation, trace)
    }

    // Fallback: derive explanation from raw trace fields
    return this.deriveFromTrace(trace)
  }

  private enrichWithRiskContext(
    base: ClinicalExplanation,
    trace: TraceData
  ): ClinicalExplanation {
    const additionalFactors: string[] = []

    if (trace.riskScoreSnapshot) {
      const { valuePercent, riskCategory } = trace.riskScoreSnapshot
      const categoryText = {
        LOW: 'low (<7.5%)',
        MODERATE: 'moderate (7.5–20%)',
        HIGH: 'high (20–30%)',
        VERY_HIGH: 'very high (≥30%)',
      }[riskCategory] ?? riskCategory

      additionalFactors.push(
        `10-year cardiovascular risk: ${valuePercent.toFixed(1)}% (${categoryText} per ACC/AHA Framingham-based model)`
      )
    }

    // Compute confidence considering data staleness
    const confidence = this.computeConfidence(trace)

    return {
      ...base,
      primaryFactors: [...(additionalFactors), ...base.primaryFactors],
      confidence,
    }
  }

  private deriveFromTrace(trace: TraceData): ClinicalExplanation {
    const firedRules = trace.rulesFired.filter((r) => r.passed)
    const snapshot = trace.patientSnapshotAtDecision

    const primaryFactors: string[] = firedRules.map((r) => {
      const value = r.patientValue != null ? String(r.patientValue) : 'N/A'
      const threshold = r.threshold != null ? String(r.threshold) : 'N/A'
      const opText = this.operatorToText(r.operator)
      return `${r.ruleName}: patient value ${value} ${opText} threshold ${threshold}`
    })

    const cautionFactors: string[] = []
    if (snapshot.latestHdlMgDl !== null && snapshot.latestHdlMgDl >= 60) {
      cautionFactors.push(`HDL-C ${snapshot.latestHdlMgDl} mg/dL — protective range (≥60 mg/dL reduces cardiovascular risk)`)
    }
    if (snapshot.hasDiabetes === false) {
      cautionFactors.push('No diabetes documented — favorable for cardiovascular risk profile')
    }
    if (snapshot.isSmoker === false) {
      cautionFactors.push('Non-smoker — favorable for cardiovascular risk profile')
    }

    const missingData: string[] = []
    if (snapshot.isSmoker === null) missingData.push('Smoking status not recorded')
    if (snapshot.hasDiabetes === null) missingData.push('Diabetes status not recorded')
    if (snapshot.latestFastingGlucose === null) missingData.push('Fasting glucose not available')

    const summary = firedRules.length === 1
      ? `${firedRules[0].ruleName} — threshold exceeded, clinical action indicated.`
      : `${firedRules.length} clinical rules triggered — see primary factors for detail.`

    return {
      summary,
      primaryFactors,
      cautionFactors,
      missingData,
      confidence: this.computeConfidence(trace),
    }
  }

  private computeConfidence(trace: TraceData): 'high' | 'medium' | 'low' {
    const snapshot = trace.patientSnapshotAtDecision
    const issues: string[] = []

    // Data currency check
    if (snapshot.lastObservationAt) {
      const daysSince = (Date.now() - new Date(snapshot.lastObservationAt).getTime()) / 86400000
      if (daysSince > 180) issues.push('stale_data_>180d')
      else if (daysSince > 90) issues.push('aging_data_>90d')
    } else {
      issues.push('no_observation_date')
    }

    // Completeness check
    const criticalFields = ['latestLdlMgDl', 'latestHdlMgDl', 'latestSystolicBp', 'latestFastingGlucose'] as const
    const missingCount = criticalFields.filter((f) => snapshot[f] === null).length
    if (missingCount >= 3) issues.push('critical_fields_missing')
    else if (missingCount >= 1) issues.push('some_fields_missing')

    if (issues.includes('stale_data_>180d') || issues.includes('critical_fields_missing')) return 'low'
    if (issues.includes('aging_data_>90d') || issues.includes('some_fields_missing')) return 'medium'
    return 'high'
  }

  private operatorToText(operator: string): string {
    const map: Record<string, string> = {
      gt: 'exceeds',
      gte: 'meets or exceeds',
      lt: 'is below',
      lte: 'is at or below',
      eq: 'equals',
      between: 'falls within range',
      hardened_rule: 'triggers',
    }
    return map[operator] ?? operator
  }
}
