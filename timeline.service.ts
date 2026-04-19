// @ts-nocheck
// Uses raw SQL via withTenant — no Prisma generate required
import { withTenant } from '../lib/db'
import { logger } from '../lib/logger'
import { buildTimeline } from '../contracts/compat/mappers'

export interface TimelineQuery {
  patientId: string; from?: Date; to?: Date; limit?: number
  types?: Array<'observations' | 'risk_scores' | 'recommendations'>
}

export class TimelineService {
  async getPatientTimeline(tenantId: string, query: TimelineQuery, correlationId: string) {
    const log = logger.child({ correlationId, tenantId, patientId: query.patientId, fn: 'Timeline' })
    const to    = query.to   ?? new Date()
    const from  = query.from ?? new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000)
    const limit = Math.min(query.limit ?? 500, 2000)
    const types = query.types ?? ['observations', 'risk_scores', 'recommendations']
    const start = Date.now()

    const [observations, riskScores, recommendations] = await Promise.all([
      types.includes('observations')
        ? withTenant(tenantId, (tc) => tc.queryMany(
            `SELECT * FROM clinical_observations
             WHERE "patientId"=$1::uuid AND "observedAt" BETWEEN $2 AND $3 AND "isCorrection"=false
             ORDER BY "observedAt" DESC LIMIT $4`,
            [query.patientId, from, to, limit]))
        : Promise.resolve([]),
      types.includes('risk_scores')
        ? withTenant(tenantId, (tc) => tc.queryMany(
            `SELECT * FROM risk_scores
             WHERE "patientId"=$1::uuid AND "computedAt" BETWEEN $2 AND $3
             ORDER BY "computedAt" DESC LIMIT 50`,
            [query.patientId, from, to]))
        : Promise.resolve([]),
      types.includes('recommendations')
        ? withTenant(tenantId, (tc) => tc.queryMany(
            `SELECT r.*, rs."scoreType", rs."valuePercent"::float AS rs_pct, rs."riskCategory" AS rs_cat, rs."computedAt" AS rs_at
             FROM recommendations r
             LEFT JOIN risk_scores rs ON rs.id = r."riskScoreId"
             WHERE r."patientId"=$1::uuid AND r."createdAt" BETWEEN $2 AND $3
             ORDER BY r."createdAt" DESC LIMIT 100`,
            [query.patientId, from, to]))
        : Promise.resolve([]),
    ])

    log.info({ observations: observations.length, riskScores: riskScores.length, recommendations: recommendations.length, ms: Date.now()-start }, 'Timeline queries complete')

    const scoreVals = [...riskScores].reverse().map((s: any) => Number(s.valuePercent))
    const riskTrend = scoreVals.length < 2 ? 'INSUFFICIENT_DATA'
      : ((scoreVals[scoreVals.length-1]-scoreVals[0])/scoreVals[0]*100) > 5 ? 'RISING'
      : ((scoreVals[scoreVals.length-1]-scoreVals[0])/scoreVals[0]*100) < -5 ? 'FALLING' : 'STABLE'

    const base = buildTimeline(query.patientId, from, to, observations, riskScores, recommendations, riskTrend)

    const ldlVals = observations.filter((o:any) => o.loincCode==='2089-1').reverse().map((o:any)=>Number(o.valueNumeric))
    const sbpVals = observations.filter((o:any) => o.loincCode==='8480-6').reverse().map((o:any)=>Number(o.valueNumeric))
    const trend   = (v: number[]) => v.length<2 ? 'INSUFFICIENT_DATA' : ((v[v.length-1]-v[0])/v[0]*100)>5 ? 'RISING' : ((v[v.length-1]-v[0])/v[0]*100)<-5 ? 'FALLING' : 'STABLE'

    return {
      ...base,
      summary: { ...base.summary, ldlTrend: trend(ldlVals), systolicTrend: trend(sbpVals) },
    }
  }
}
