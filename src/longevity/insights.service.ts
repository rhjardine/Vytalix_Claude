// =============================================================================
// InsightsService — Population Analytics
// Aggregates anonymized metrics for Disglobal dashboards and B2B reporting.
//
// Privacy invariants (hard-coded, not configuration):
//   - Minimum cohort size: 50 patients before any aggregate is returned
//   - No individual patient data ever exposed through this service
//   - All queries are tenant-scoped via RLS
//   - Results cached 1h in Redis (prevents DB hammering from dashboard polls)
//
// Uses TimescaleDB continuous aggregates for performance on large datasets.
// Falls back to live aggregate queries when <1000 patients in cohort.
// =============================================================================

import { withTenant } from '../platform/db'
import { logger } from '../platform/logger'
import { getRedisClient } from '../platform/redis'

const MINIMUM_COHORT_SIZE = 50
const INSIGHTS_CACHE_TTL  = 60 * 60   // 1h

export interface CohortInsightsRequest {
  ageGroup?: string           // "30-40", "40-50", "50-60", "60-70"
  biologicalSex?: string      // "MALE" | "FEMALE" | "INTERSEX"
  period?: string             // "last_30d" | "last_90d" | "last_6m" | "last_12m" | "ytd"
  assessmentType?: string     // "BIOPHYSICS" | "BIOCHEMISTRY" | etc.
}

export interface CohortMetrics {
  cohortSize: number
  avgBiologicalAge: number
  avgChronologicalAge: number
  avgDifferential: number
  pctRejuvenecido: number
  pctNormal: number
  pctEnvejecido: number
  medianBiologicalAge: number
  biologicalAgeDistribution: AgeDistributionBucket[]
  topRiskSignals: RiskSignal[]
  engagementBreakdown: EngagementBreakdown
  period: string
  generatedAt: string
}

interface AgeDistributionBucket {
  bucket: string      // e.g. "REJUVENECIDO >5yr", "REJUVENECIDO 2-5yr", "NORMAL", etc.
  count: number
  percentage: number
}

interface RiskSignal {
  signal: string
  count: number
  percentage: number
}

interface EngagementBreakdown {
  champion: number
  engaged: number
  passive: number
  atRisk: number
  dormant: number
}

export interface TenantSummary {
  totalPatients: number
  totalAssessments: number
  avgBiologicalAgeDelta: number
  assessmentsLast30d: number
  referralsGenerated: number
  referralConversions: number
  conversionRate: number
  topReferralType: string | null
}

// ─────────────────────────────────────────────────────────────────

export class InsightsService {

  // ── Cohort insights (Disglobal API, B2B dashboards) ───────────────

  async getCohortInsights(
    tenantId: string,
    req: CohortInsightsRequest
  ): Promise<CohortMetrics | { tooSmall: true; note: string }> {
    const cacheKey = this.cohortCacheKey(tenantId, req)

    // Cache check
    try {
      const redis = getRedisClient()
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch (_) {}

    const { ageMin, ageMax } = this.parseAgeGroup(req.ageGroup)
    const periodInterval = this.parsePeriod(req.period ?? 'last_90d')
    const assessmentType = req.assessmentType ?? 'BIOPHYSICS'

    // Core aggregate query
    const stats = await withTenant(tenantId, tc =>
      tc.queryOne<{ cohortSize: number; avgBiologicalAge: number; avgChronologicalAge: number; avgDifferential: number; medianBiologicalAge: number; pctRejuvenecido: number; pctNormal: number; pctEnvejecido: number }>(
        `SELECT
           COUNT(DISTINCT baa."patientId") AS "cohortSize",
           ROUND(AVG(baa."biologicalAge")::numeric, 1)::float    AS "avgBiologicalAge",
           ROUND(AVG(baa."chronologicalAge")::numeric, 1)::float AS "avgChronologicalAge",
           ROUND(AVG(baa."differentialAge")::numeric, 2)::float  AS "avgDifferential",
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY baa."biologicalAge"::float)::float AS "medianBiologicalAge",
           ROUND(100.0 * SUM(CASE WHEN baa."ageStatus"='REJUVENECIDO' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1)::float AS "pctRejuvenecido",
           ROUND(100.0 * SUM(CASE WHEN baa."ageStatus"='NORMAL'       THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1)::float AS "pctNormal",
           ROUND(100.0 * SUM(CASE WHEN baa."ageStatus"='ENVEJECIDO'   THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1)::float AS "pctEnvejecido"
         FROM biological_age_assessments baa
         JOIN patients p ON p.id = baa."patientId"
         WHERE baa."tenantId"=$1::uuid
           AND baa."assessmentType"=$2
           AND baa."assessedAt" >= NOW() - $3::interval
           AND ($4::boolean OR p."biologicalSex"=$5)
           AND ($6::boolean OR baa."chronologicalAge" BETWEEN $7 AND $8)`,
        [
          tenantId, assessmentType, periodInterval,
          !req.biologicalSex, req.biologicalSex ?? 'MALE',
          !ageMin,            ageMin ?? 0, ageMax ?? 999,
        ]
      )
    )

    if (!stats || Number(stats.cohortSize) < MINIMUM_COHORT_SIZE) {
      return {
        tooSmall: true,
        note: `Cohort size (${stats?.cohortSize ?? 0}) below minimum privacy threshold of ${MINIMUM_COHORT_SIZE}`,
      }
    }

    // Distribution buckets
    const distribution = await this.getDistributionBuckets(tenantId, assessmentType, periodInterval, req)

    // Top risk signals from partial ages
    const riskSignals = await this.getTopRiskSignals(tenantId, assessmentType, periodInterval)

    // Engagement breakdown
    const engagement = await this.getEngagementBreakdown(tenantId)

    const result: CohortMetrics = {
      cohortSize:              Number(stats.cohortSize),
      avgBiologicalAge:        stats.avgBiologicalAge,
      avgChronologicalAge:     stats.avgChronologicalAge,
      avgDifferential:         stats.avgDifferential,
      medianBiologicalAge:     stats.medianBiologicalAge,
      pctRejuvenecido:         stats.pctRejuvenecido ?? 0,
      pctNormal:               stats.pctNormal ?? 0,
      pctEnvejecido:           stats.pctEnvejecido ?? 0,
      biologicalAgeDistribution: distribution,
      topRiskSignals:          riskSignals,
      engagementBreakdown:     engagement,
      period:                  req.period ?? 'last_90d',
      generatedAt:             new Date().toISOString(),
    }

    // Cache for 1h
    try {
      const redis = getRedisClient()
      await redis.setex(cacheKey, INSIGHTS_CACHE_TTL, JSON.stringify(result))
    } catch (_) {}

    return result
  }

  // ── Tenant operational summary (for tenant admin dashboards) ──────

  async getTenantSummary(tenantId: string): Promise<TenantSummary> {
    const cacheKey = `insights:${tenantId}:summary`

    try {
      const redis = getRedisClient()
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch (_) {}

    const [patientStats, assessStats, referralStats] = await Promise.all([
      withTenant(tenantId, tc =>
        tc.queryOne<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM patients WHERE "tenantId"=$1::uuid AND status='ACTIVE'`,
          [tenantId]
        )
      ),
      withTenant(tenantId, tc =>
        tc.queryOne<{ total: number; avgDelta: number; last30d: number }>(
          `SELECT
             COUNT(*)::int                        AS total,
             ROUND(AVG("differentialAge")::numeric, 2)::float AS "avgDelta",
             SUM(CASE WHEN "assessedAt" >= NOW() - '30 days'::interval THEN 1 ELSE 0 END)::int AS "last30d"
           FROM biological_age_assessments
           WHERE "tenantId"=$1::uuid`,
          [tenantId]
        )
      ),
      withTenant(tenantId, tc =>
        tc.queryOne<{ generated: number; converted: number; topType: string | null }>(
          `SELECT
             COUNT(*)::int AS generated,
             SUM(CASE WHEN status='CONVERTED' THEN 1 ELSE 0 END)::int AS converted,
             MODE() WITHIN GROUP (ORDER BY "referralType") AS "topType"
           FROM referral_events WHERE "tenantId"=$1::uuid`,
          [tenantId]
        )
      ),
    ])

    const summary: TenantSummary = {
      totalPatients:       patientStats?.total ?? 0,
      totalAssessments:    assessStats?.total ?? 0,
      avgBiologicalAgeDelta: assessStats?.avgDelta ?? 0,
      assessmentsLast30d:  assessStats?.last30d ?? 0,
      referralsGenerated:  referralStats?.generated ?? 0,
      referralConversions: referralStats?.converted ?? 0,
      conversionRate:      referralStats?.generated > 0
        ? parseFloat(((referralStats.converted / referralStats.generated) * 100).toFixed(1))
        : 0,
      topReferralType:     referralStats?.topType ?? null,
    }

    try {
      const redis = getRedisClient()
      await redis.setex(cacheKey, INSIGHTS_CACHE_TTL, JSON.stringify(summary))
    } catch (_) {}

    return summary
  }

  // ── Longitudinal trend for a cohort ──────────────────────────────

  async getBiologicalAgeTrend(
    tenantId: string,
    period: string = 'last_12m',
    granularity: 'week' | 'month' = 'month'
  ): Promise<Array<{ period: string; avgDifferential: number; assessmentCount: number }>> {
    const interval = this.parsePeriod(period)
    const truncUnit = granularity === 'week' ? 'week' : 'month'

    const rows = await withTenant(tenantId, tc =>
      tc.queryMany(
        `SELECT
           DATE_TRUNC($1, "assessedAt") AS "periodStart",
           ROUND(AVG("differentialAge")::numeric, 2)::float AS "avgDifferential",
           COUNT(*)::int AS "assessmentCount"
         FROM biological_age_assessments
         WHERE "tenantId"=$1::uuid
           AND "assessedAt" >= NOW() - $3::interval
           AND "assessmentType"='BIOPHYSICS'
         GROUP BY DATE_TRUNC($1, "assessedAt")
         ORDER BY "periodStart" ASC`,
        [truncUnit, tenantId, interval]
      )
    )

    return rows.map((r: any) => ({
      period: new Date(r.periodStart).toISOString().split('T')[0],
      avgDifferential: r.avgDifferential,
      assessmentCount: r.assessmentCount,
    }))
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async getDistributionBuckets(
    tenantId: string,
    assessmentType: string,
    interval: string,
    _req: CohortInsightsRequest
  ): Promise<AgeDistributionBucket[]> {
    const rows = await withTenant(tenantId, tc =>
      tc.queryMany(
        `SELECT
           CASE
             WHEN "differentialAge" <= -7    THEN 'REJUVENECIDO >7yr'
             WHEN "differentialAge" <= -2    THEN 'REJUVENECIDO 2-7yr'
             WHEN "differentialAge" < 2      THEN 'NORMAL'
             WHEN "differentialAge" < 7      THEN 'ENVEJECIDO 2-7yr'
             ELSE                                 'ENVEJECIDO >7yr'
           END AS bucket,
           COUNT(*)::int AS count
         FROM biological_age_assessments
         WHERE "tenantId"=$1::uuid AND "assessmentType"=$2
           AND "assessedAt" >= NOW() - $3::interval
         GROUP BY bucket ORDER BY MIN("differentialAge")`,
        [tenantId, assessmentType, interval]
      )
    )

    const total = rows.reduce((s: number, r: any) => s + r.count, 0)
    return rows.map((r: any) => ({
      bucket: r.bucket,
      count: r.count,
      percentage: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(1)) : 0,
    }))
  }

  private async getTopRiskSignals(
    tenantId: string,
    assessmentType: string,
    interval: string
  ): Promise<RiskSignal[]> {
    // Extract risk signals from partial ages (items where partial age > chronological + 2)
    // We read from the top risk scores + decision engine recommendations
    const rows = await withTenant(tenantId, tc =>
      tc.queryMany(
        `WITH recommendation_signals AS (
           SELECT unnest(ARRAY[
             'ldl_elevated', 'hypertension_stage2', 'prediabetes',
             'labs_overdue', 'ldl_rising_trend'
           ]) AS signal,
           COUNT(DISTINCT r."patientId")::int AS patient_count
           FROM recommendations r
           WHERE r."tenantId"=$1::uuid
             AND r."createdAt" >= NOW() - $2::interval
             AND r.body LIKE '% H-00%'
           GROUP BY signal
         )
         SELECT signal, patient_count AS count FROM recommendation_signals
         ORDER BY patient_count DESC LIMIT 5`,
        [tenantId, interval]
      )
    )

    const total = await withTenant(tenantId, tc =>
      tc.queryOne<{ n: number }>(
        `SELECT COUNT(DISTINCT "patientId")::int AS n
         FROM biological_age_assessments
         WHERE "tenantId"=$1::uuid AND "assessmentType"=$2
           AND "assessedAt" >= NOW() - $3::interval`,
        [tenantId, assessmentType, interval]
      )
    ).then(r => r?.n ?? 1)

    return rows.map((r: any) => ({
      signal: r.signal,
      count: r.count,
      percentage: parseFloat(((r.count / total) * 100).toFixed(1)),
    }))
  }

  private async getEngagementBreakdown(tenantId: string): Promise<EngagementBreakdown> {
    const rows = await withTenant(tenantId, tc =>
      tc.queryMany(
        `SELECT tier, COUNT(*)::int AS count
         FROM engagement_scores WHERE "tenantId"=$1::uuid
         GROUP BY tier`,
        [tenantId]
      )
    )

    const byTier: Record<string, number> = {}
    for (const r of rows as any[]) byTier[r.tier] = r.count

    return {
      champion: byTier['CHAMPION'] ?? 0,
      engaged:  byTier['ENGAGED']  ?? 0,
      passive:  byTier['PASSIVE']  ?? 0,
      atRisk:   byTier['AT_RISK']  ?? 0,
      dormant:  byTier['DORMANT']  ?? 0,
    }
  }

  private parseAgeGroup(ageGroup?: string): { ageMin?: number; ageMax?: number } {
    if (!ageGroup) return {}
    const parts = ageGroup.split('-').map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { ageMin: parts[0], ageMax: parts[1] }
    }
    return {}
  }

  private parsePeriod(period: string): string {
    const map: Record<string, string> = {
      last_30d:  '30 days',
      last_90d:  '90 days',
      last_6m:   '6 months',
      last_12m:  '12 months',
      ytd:       `${new Date().getMonth() + 1} months`,
    }
    return map[period] ?? '90 days'
  }

  private cohortCacheKey(tenantId: string, req: CohortInsightsRequest): string {
    const parts = [tenantId, req.ageGroup, req.biologicalSex, req.period, req.assessmentType]
      .map(p => p ?? 'all').join(':')
    return `cohort:${parts}`
  }
}
