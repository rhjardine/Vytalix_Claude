// =============================================================================
// src/security/consent.guard.ts
// Enforces informed consent before processing clinical health data.
//
// Compliance target:
//   - HIPAA: authorization required for PHI disclosure (45 CFR §164.508)
//   - GDPR: explicit consent for special category data (Art. 9)
//   - NOM-024-SSA3-2012: consentimiento informado en expediente clínico
//
// Design:
//   - Consent is checked per-operation type, not globally
//   - Cache: consent status cached 1h in Redis per (tenantId, patientId, consentType)
//   - Failure mode: DENY by default if consent record is missing or expired
//   - Disglobal subjects: consent required before first BioAge assessment
//   - Withdrawal: treated immediately (cache invalidation on withdraw)
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import { withTenant } from '../../platform/db'
import { logger } from '../../platform/logger'
import { getRedisClient } from '../../platform/redis'

// ── Consent types (maps 1:1 with ConsentType enum in schema) ──────

export type ConsentType =
  | 'DATA_PROCESSING'       // Required for ANY clinical data storage
  | 'BIOMETRIC_PROCESSING'  // Required for BioAge, biochemistry tests (special category)
  | 'THIRD_PARTY_SHARING'   // Required for Disglobal API data sharing
  | 'RESEARCH'              // Required for population insights aggregation
  | 'MARKETING'             // Required for referral CTA delivery

// ── Cache ─────────────────────────────────────────────────────────

const CONSENT_CACHE_TTL = 60 * 60 // 1h

function consentCacheKey(tenantId: string, patientId: string, type: ConsentType): string {
  return `consent:${tenantId}:${patientId}:${type}`
}

// ── Core check function ───────────────────────────────────────────

/**
 * Checks whether a patient has a valid (non-withdrawn, non-expired)
 * consent record for the given consent type.
 */
export async function hasValidConsent(
  tenantId: string,
  patientId: string,
  consentType: ConsentType
): Promise<boolean> {
  const cacheKey = consentCacheKey(tenantId, patientId, consentType)

  // Cache check
  try {
    const redis  = getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached !== null) return cached === '1'
  } catch (_) {}

  // DB check
  try {
    const record = await withTenant(tenantId, tc =>
      tc.queryOne(
        `SELECT id FROM consent_records
         WHERE "tenantId"    = $1::uuid
           AND "patientId"   = $2::uuid
           AND "consentType" = $3
           AND "withdrawnAt" IS NULL
           AND ("expiresAt"  IS NULL OR "expiresAt" > NOW())
         ORDER BY "consentedAt" DESC
         LIMIT 1`,
        [tenantId, patientId, consentType]
      )
    )

    const hasConsent = !!record

    // Cache result
    try {
      const redis = getRedisClient()
      await redis.setex(cacheKey, CONSENT_CACHE_TTL, hasConsent ? '1' : '0')
    } catch (_) {}

    return hasConsent
  } catch (err) {
    // DB error → deny by default (fail-safe)
    logger.error({ err, tenantId, patientId, consentType }, 'Consent check DB error — denying')
    return false
  }
}

/**
 * Invalidates the consent cache for a patient (call on consent grant/withdrawal).
 */
export async function invalidateConsentCache(
  tenantId: string,
  patientId: string,
  consentType?: ConsentType
): Promise<void> {
  try {
    const redis = getRedisClient()
    if (consentType) {
      await redis.del(consentCacheKey(tenantId, patientId, consentType))
    } else {
      // Invalidate all consent types for this patient
      const allTypes: ConsentType[] = [
        'DATA_PROCESSING', 'BIOMETRIC_PROCESSING',
        'THIRD_PARTY_SHARING', 'RESEARCH', 'MARKETING',
      ]
      await redis.del(...allTypes.map(t => consentCacheKey(tenantId, patientId, t)))
    }
  } catch (_) {}
}

// ── Express middleware factory ────────────────────────────────────

/**
 * Express middleware that enforces consent for an operation.
 * Requires req.apiKeyCtx (from requireApiKey) to be set first.
 *
 * Usage:
 *   router.post('/vitality/assess',
 *     requireApiKey('vitality:write'),
 *     requireConsent('BIOMETRIC_PROCESSING'),
 *     handler
 *   )
 *
 * The patientId is resolved from:
 *   1. req.body.patientId
 *   2. req.body.subjectRef (resolved dynamically)
 *   3. req.params.patientId
 */
export function requireConsent(consentType: ConsentType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.apiKeyCtx?.tenantId ?? (req as any).user?.tenantId
    if (!tenantId) {
      res.status(500).json({ error: 'Tenant context missing in consent guard' })
      return
    }

    // Try to resolve patientId from request context
    const patientId = req.body?.patientId ?? req.params?.patientId

    // If no patientId yet (e.g., subjectRef needs resolution), skip here.
    // The service layer is responsible for checking consent after resolving subjectRef.
    if (!patientId) {
      next()
      return
    }

    const consented = await hasValidConsent(tenantId, patientId, consentType)

    if (!consented) {
      logger.warn({ tenantId, patientId, consentType }, 'Consent missing — request denied')
      res.status(403).json({
        type:   'https://api.vytalix.health/errors/consent-required',
        title:  'Consent Required',
        status: 403,
        detail: `Patient has not provided consent for ${consentType}. ` +
                `Obtain consent via POST /v1/patients/${patientId}/consent before proceeding.`,
        consentType,
        correlationId: req.correlationId,
      })
      return
    }

    next()
  }
}

// ── Consent record management ─────────────────────────────────────

export interface ConsentGrantParams {
  tenantId:       string
  patientId:      string
  consentType:    ConsentType
  legalBasis:     string        // "HIPAA_authorization" | "GDPR_Art9_2a" | "NOM024"
  documentVersion: string       // e.g. "tos-v2.3"
  documentUrl:    string
  consentMethod:  string        // "explicit_checkbox" | "electronic_signature"
  ipAddress?:     string
  userAgent?:     string
  expiresAt?:     Date          // Null = perpetual until withdrawn
}

export async function grantConsent(params: ConsentGrantParams): Promise<string> {
  const id = await withTenant(params.tenantId, tc =>
    tc.queryOne<{ id: string }>(
      `INSERT INTO consent_records (
         id, "tenantId", "patientId",
         "consentType", "legalBasis",
         "documentVersion", "documentUrl", "consentMethod",
         "ipAddress", "userAgent", "expiresAt", "consentedAt"
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid,
         $3, $4, $5, $6, $7, $8, $9,
         $10, NOW()
       ) RETURNING id`,
      [
        params.tenantId, params.patientId,
        params.consentType, params.legalBasis,
        params.documentVersion, params.documentUrl, params.consentMethod,
        params.ipAddress ?? null, params.userAgent?.slice(0, 500) ?? null,
        params.expiresAt ?? null,
      ]
    )
  )

  // Invalidate cache so next check reads fresh
  await invalidateConsentCache(params.tenantId, params.patientId, params.consentType)

  logger.info({ tenantId: params.tenantId, patientId: params.patientId, consentType: params.consentType }, 'Consent granted')
  return id.id
}

export async function withdrawConsent(
  tenantId: string,
  patientId: string,
  consentType: ConsentType,
  withdrawnBy: string
): Promise<void> {
  await withTenant(tenantId, tc =>
    tc.execute(
      `UPDATE consent_records
       SET "withdrawnAt" = NOW(), "withdrawnBy" = $4::uuid
       WHERE "tenantId"    = $1::uuid
         AND "patientId"   = $2::uuid
         AND "consentType" = $3
         AND "withdrawnAt" IS NULL`,
      [tenantId, patientId, consentType, withdrawnBy]
    )
  )

  await invalidateConsentCache(tenantId, patientId, consentType)

  logger.info({ tenantId, patientId, consentType }, 'Consent withdrawn')
}

// ── Bulk consent check (for Disglobal onboarding) ─────────────────

/**
 * Returns the consent status for all required types in a single DB query.
 * Used during Disglobal subject onboarding to determine what's missing.
 */
export async function getConsentStatus(
  tenantId: string,
  patientId: string
): Promise<Record<ConsentType, boolean>> {
  const requiredTypes: ConsentType[] = [
    'DATA_PROCESSING',
    'BIOMETRIC_PROCESSING',
    'THIRD_PARTY_SHARING',
  ]

  const results = await Promise.all(
    requiredTypes.map(async t => [t, await hasValidConsent(tenantId, patientId, t)] as const)
  )

  return Object.fromEntries(results) as Record<ConsentType, boolean>
}
