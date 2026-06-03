// =============================================================================
// EngagementService
// Records behavioral health events and computes engagement scores.
//
// Engagement score model:
//   - Base score from event frequency (last 30 days)
//   - Bonus for streak (consecutive active days)
//   - Weighted by event value (test completion > recommendation view > login)
//   - Tier classification: CHAMPION | ENGAGED | PASSIVE | AT_RISK | DORMANT
//
// Score updated asynchronously after event insertion.
// TimescaleDB hypertable handles the event volume.
// =============================================================================

import { withTenant } from '../lib/db'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'

// ── Event value weights ────────────────────────────────────────────
// Higher weight = more meaningful health engagement signal
const EVENT_WEIGHTS: Record<string, number> = {
  TEST_COMPLETED:               10,
  TEST_STARTED:                  3,
  RECOMMENDATION_VIEWED:         4,
  RECOMMENDATION_ACKNOWLEDGED:   6,
  GOAL_SET:                      5,
  GOAL_ACHIEVED:                 8,
  REPORT_DOWNLOADED:             3,
  REFERRAL_CTA_VIEWED:           2,
  REFERRAL_CTA_CLICKED:          5,
  SESSION_STARTED:               1,
  EDUCATION_CONTENT_VIEWED:      2,
}

const MAX_DAILY_SCORE    = 20   // Caps per-day contribution (prevents gaming)
const SCORE_WINDOW_DAYS  = 30   // Rolling window for score computation
const SCORE_CACHE_TTL    = 15 * 60 // 15 min (updates frequently)

export interface EngagementEvent {
  type: string
  payload: Record<string, unknown>
  occurredAt?: string
}

export interface EngagementScoreSnapshot {
  score: number
  tier: string
  streak: number
  lastEventAt: Date | null
  totalEvents: number
  testCompletionRate: number | null
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────

export class EngagementService {

  // ── Public: record batch of events ───────────────────────────────

  async recordEvents(
    tenantId: string,
    patientId: string,
    events: EngagementEvent[],
    source: string
  ): Promise<void> {
    const log = logger.child({ fn: 'EngagementSvc.recordEvents', tenantId, patientId })

    // Persist all events (bulk insert)
    await withTenant(tenantId, async (tc) => {
      for (const evt of events) {
        await tc.execute(
          `INSERT INTO engagement_events (
             id, "tenantId", "patientId",
             "eventType", payload, source, "occurredAt"
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::uuid,
             $3, $4::jsonb, $5,
             COALESCE($6::timestamptz, NOW())
           )`,
          [
            tenantId, patientId,
            evt.type.toUpperCase(),
            JSON.stringify(evt.payload),
            source,
            evt.occurredAt ?? null,
          ]
        )
      }
    })

    log.debug({ count: events.length }, 'Engagement events recorded')

    // Async score recompute (non-blocking)
    this.recomputeScore(tenantId, patientId)
      .catch(err => log.warn({ err }, 'Score recompute failed (non-fatal)'))
  }

  // ── Public: get current engagement score ─────────────────────────

  async getScore(tenantId: string, patientId: string): Promise<EngagementScoreSnapshot | null> {
    // Try cache
    try {
      const redis = getRedisClient()
      const cached = await redis.get(this.scoreCacheKey(tenantId, patientId))
      if (cached) return JSON.parse(cached)
    } catch (_) {}

    // DB fallback
    const row = await withTenant(tenantId, tc =>
      tc.queryOne(
        `SELECT score, tier, streak, "lastEventAt", "totalEvents",
                "testCompletionRate"::float, "updatedAt"
         FROM engagement_scores
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
        [tenantId, patientId]
      )
    )
    return row ?? null
  }

  // ── Public: recent event history ─────────────────────────────────

  async getRecentEvents(
    tenantId: string,
    patientId: string,
    days = 30
  ): Promise<Array<{ eventType: string; payload: unknown; occurredAt: Date }>> {
    return withTenant(tenantId, tc =>
      tc.queryMany(
        `SELECT "eventType", payload, "occurredAt"
         FROM engagement_events
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
           AND "occurredAt" >= NOW() - ($3 || ' days')::interval
         ORDER BY "occurredAt" DESC`,
        [tenantId, patientId, days]
      )
    )
  }

  // ── Private: score computation ────────────────────────────────────

  private async recomputeScore(tenantId: string, patientId: string): Promise<void> {
    // Load events from the rolling window
    const events = await withTenant(tenantId, tc =>
      tc.queryMany(
        `SELECT "eventType", "occurredAt"::date AS "eventDate"
         FROM engagement_events
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid
           AND "occurredAt" >= NOW() - '${SCORE_WINDOW_DAYS} days'::interval
         ORDER BY "occurredAt" ASC`,
        [tenantId, patientId]
      )
    )

    if (events.length === 0) {
      await this.persistScore(tenantId, patientId, 0, 'DORMANT', 0, null, 0, null)
      return
    }

    // Group by day to cap daily contribution
    const byDay = new Map<string, number>()
    for (const evt of events) {
      const day = evt.eventDate.toString()
      const weight = EVENT_WEIGHTS[evt.eventType] ?? 1
      byDay.set(day, Math.min(MAX_DAILY_SCORE, (byDay.get(day) ?? 0) + weight))
    }

    // Raw score = sum of capped daily scores, normalized to 0-100
    const rawScore = Array.from(byDay.values()).reduce((a, b) => a + b, 0)
    const maxPossible = SCORE_WINDOW_DAYS * MAX_DAILY_SCORE
    const score = Math.min(100, Math.round((rawScore / maxPossible) * 100))

    // Streak = consecutive days with any activity (from today backwards)
    const streak = this.computeStreak(Array.from(byDay.keys()))

    // Total events count
    const totalEvents = await withTenant(tenantId, tc =>
      tc.queryOne(
        `SELECT COUNT(*)::int AS total FROM engagement_events
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
        [tenantId, patientId]
      ).then(r => r?.total ?? 0)
    )

    // Test completion rate
    const testStats = await withTenant(tenantId, tc =>
      tc.queryOne(
        `SELECT
           SUM(CASE WHEN "eventType"='TEST_COMPLETED' THEN 1 ELSE 0 END)::int AS completed,
           SUM(CASE WHEN "eventType" IN ('TEST_COMPLETED','TEST_STARTED') THEN 1 ELSE 0 END)::int AS started
         FROM engagement_events
         WHERE "tenantId"=$1::uuid AND "patientId"=$2::uuid`,
        [tenantId, patientId]
      )
    )
    const completionRate = testStats?.started > 0
      ? parseFloat(((testStats.completed / testStats.started) * 100).toFixed(1))
      : null

    const lastEventAt = events[events.length - 1]?.eventDate
      ? new Date(events[events.length - 1].eventDate)
      : null

    const tier = this.classifyTier(score, streak, lastEventAt)

    await this.persistScore(tenantId, patientId, score, tier, streak, lastEventAt, totalEvents, completionRate)
  }

  private computeStreak(activeDays: string[]): number {
    if (activeDays.length === 0) return 0

    const sorted = [...activeDays].sort().reverse()
    const today = new Date().toISOString().split('T')[0]

    let streak = 0
    let expectedDate = today

    for (const day of sorted) {
      if (day === expectedDate) {
        streak++
        const d = new Date(expectedDate)
        d.setDate(d.getDate() - 1)
        expectedDate = d.toISOString().split('T')[0]
      } else {
        break
      }
    }

    return streak
  }

  private classifyTier(score: number, streak: number, lastEvent: Date | null): string {
    const daysSinceActivity = lastEvent
      ? Math.floor((Date.now() - lastEvent.getTime()) / 86400000)
      : 999

    if (daysSinceActivity > 30)  return 'DORMANT'
    if (score >= 80 || streak >= 14) return 'CHAMPION'
    if (score >= 60 || streak >= 7)  return 'ENGAGED'
    if (score >= 40)                  return 'PASSIVE'
    if (daysSinceActivity > 14)       return 'AT_RISK'
    return 'PASSIVE'
  }

  private async persistScore(
    tenantId: string,
    patientId: string,
    score: number,
    tier: string,
    streak: number,
    lastEventAt: Date | null,
    totalEvents: number,
    completionRate: number | null
  ): Promise<void> {
    await withTenant(tenantId, tc =>
      tc.execute(
        `INSERT INTO engagement_scores (
           id, "tenantId", "patientId",
           score, tier, streak, "lastEventAt",
           "totalEvents", "testCompletionRate", "updatedAt"
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid,
           $3, $4, $5, $6, $7, $8, NOW()
         )
         ON CONFLICT ("patientId") DO UPDATE SET
           score=$3, tier=$4, streak=$5,
           "lastEventAt"=$6, "totalEvents"=$7,
           "testCompletionRate"=$8, "updatedAt"=NOW()`,
        [tenantId, patientId, score, tier, streak, lastEventAt, totalEvents, completionRate]
      )
    )

    // Cache the result
    try {
      const redis = getRedisClient()
      const snapshot: EngagementScoreSnapshot = {
        score, tier, streak, lastEventAt, totalEvents,
        testCompletionRate: completionRate,
        updatedAt: new Date(),
      }
      await redis.setex(
        this.scoreCacheKey(tenantId, patientId),
        SCORE_CACHE_TTL,
        JSON.stringify(snapshot)
      )
    } catch (_) {}
  }

  private scoreCacheKey(tenantId: string, patientId: string): string {
    return `engagement:${tenantId}:${patientId}:score`
  }
}
