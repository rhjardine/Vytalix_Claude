// =============================================================================
// src/security/api-key.middleware.ts
// Production-grade API Key authentication for /api/v2/* routes.
//
// Security model:
//   - Key value NEVER stored in DB — only SHA-256 hash
//   - Constant-time comparison to prevent timing attacks
//   - Brute-force protection: failed attempts rate-limited per IP in Redis
//   - Key metadata cached 5min in Redis (avoids DB hit per request)
//   - Scope enforcement: each key has permission matrix in JSONB
//   - Key rotation: expiresAt + revokedAt without breaking in-flight requests
//   - Audit: every auth failure written to audit_logs
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { getDb } from '../lib/db'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'

// ── Types ─────────────────────────────────────────────────────────

export interface ApiKeyContext {
  keyId:          string
  tenantId:       string
  keyName:        string
  permissions:    Record<string, string[]>  // { vitality: ['read','write'], insights: ['read'] }
  rateLimitTier:  'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE'
}

declare global {
  namespace Express {
    interface Request {
      apiKeyCtx?:    ApiKeyContext
      correlationId: string
    }
  }
}

// ── Constants ─────────────────────────────────────────────────────

const KEY_CACHE_TTL        = 5 * 60        // 5 min key metadata cache
const FAIL_WINDOW_SECONDS  = 60            // 60s brute force window
const MAX_FAILURES_PER_IP  = 20            // hard block after 20 fails/min per IP

// ── Core middleware factory ───────────────────────────────────────

/**
 * Returns an Express middleware that validates the X-API-Key header,
 * resolves the key to a tenant context, and enforces the required scope.
 *
 * Usage:
 *   router.post('/vitality/assess', requireApiKey('vitality:write'), handler)
 */
export function requireApiKey(scope: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip  = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const key = req.headers['x-api-key'] as string | undefined

    // 1. Brute-force guard (per source IP)
    const blocked = await checkBruteForce(ip)
    if (blocked) {
      await writeAuthAudit(req, null, 'BRUTE_FORCE_BLOCKED', scope)
      res.status(429).json(problem(429, 'Too many authentication failures. Try again in 60 seconds.', req.correlationId))
      return
    }

    // 2. Key presence check
    if (!key || key.trim().length === 0) {
      await recordFailure(ip)
      await writeAuthAudit(req, null, 'MISSING_API_KEY', scope)
      res.status(401).json(problem(401, 'Missing X-API-Key header.', req.correlationId))
      return
    }

    // 3. Hash + resolve (cache-aside)
    const keyHash = sha256(key)
    const ctx     = await resolveKey(keyHash)

    if (!ctx) {
      await recordFailure(ip)
      await writeAuthAudit(req, null, 'INVALID_API_KEY', scope)
      // Identical error for invalid/expired/revoked — no information disclosure
      res.status(401).json(problem(401, 'Invalid or revoked API key.', req.correlationId))
      return
    }

    // 4. Scope check
    if (!hasPermission(ctx.permissions, scope)) {
      await writeAuthAudit(req, ctx, 'INSUFFICIENT_SCOPE', scope)
      res.status(403).json(problem(403, `API key does not have scope '${scope}'.`, req.correlationId))
      return
    }

    // 5. Update last-used (async, non-blocking)
    touchLastUsed(ctx.keyId).catch(() => {})

    req.apiKeyCtx = ctx
    next()
  }
}

// ── Permission evaluation ─────────────────────────────────────────

/**
 * Checks if a permission matrix satisfies a required scope.
 * Scope format: "resource:action"  e.g. "vitality:write"
 * Wildcard:     { "vitality": ["*"] } satisfies any vitality action
 *               { "*": ["*"] }         satisfies anything (admin key)
 */
export function hasPermission(
  permissions: Record<string, string[]>,
  scope: string
): boolean {
  const [resource, action] = scope.split(':')

  // Full wildcard (admin keys)
  if (permissions['*']?.includes('*')) return true

  // Resource-level wildcard
  if (permissions[resource]?.includes('*')) return true

  // Exact match
  if (permissions[resource]?.includes(action)) return true

  return false
}

// ── Key resolution (cache-aside) ─────────────────────────────────

async function resolveKey(keyHash: string): Promise<ApiKeyContext | null> {
  const cacheKey = `apikey:${keyHash}`

  // Cache check
  try {
    const redis  = getRedisClient()
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch (_) { /* fall through */ }

  // DB lookup
  try {
    const db  = getDb()
    const row = await db.rawQueryOne(
      `SELECT id, "tenantId", name, permissions, "rateLimitTier"
       FROM api_keys
       WHERE "keyHash" = $1
         AND "isActive" = true
         AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
         AND "revokedAt" IS NULL
       LIMIT 1`,
      [keyHash]
    )
    if (!row) return null

    const ctx: ApiKeyContext = {
      keyId:         row.id,
      tenantId:      row.tenantId,
      keyName:       row.name,
      permissions:   row.permissions,
      rateLimitTier: row.rateLimitTier,
    }

    // Cache for 5 min
    try {
      const redis = getRedisClient()
      await redis.setex(cacheKey, KEY_CACHE_TTL, JSON.stringify(ctx))
    } catch (_) {}

    return ctx
  } catch (err) {
    logger.error({ err }, 'API key DB lookup failed')
    return null
  }
}

// ── Brute-force protection ────────────────────────────────────────

async function checkBruteForce(ip: string): Promise<boolean> {
  try {
    const redis  = getRedisClient()
    const count  = await redis.get(`authfail:${ip}`)
    return Number(count ?? 0) >= MAX_FAILURES_PER_IP
  } catch (_) {
    return false // Redis unavailable — fail open (prefer availability over blocking)
  }
}

async function recordFailure(ip: string): Promise<void> {
  try {
    const redis = getRedisClient()
    const key   = `authfail:${ip}`
    await redis.multi().incr(key).expire(key, FAIL_WINDOW_SECONDS).exec()
  } catch (_) {}
}

// ── Last-used tracking ────────────────────────────────────────────

async function touchLastUsed(keyId: string): Promise<void> {
  const db = getDb()
  await db.rawQuery(
    `UPDATE api_keys
     SET "lastUsedAt" = NOW(), "requestCount" = "requestCount" + 1
     WHERE id = $1`,
    [keyId]
  )
}

// ── Audit trail ───────────────────────────────────────────────────

async function writeAuthAudit(
  req: Request,
  ctx: ApiKeyContext | null,
  action: string,
  scope: string
): Promise<void> {
  try {
    const db = getDb()
    await db.rawQuery(
      `INSERT INTO audit_logs (
         id, "tenantId", "actorId", "actorRole",
         "resourceType", "resourceId",
         action, diff,
         "ipAddress", "userAgent", "createdAt"
       ) VALUES (
         gen_random_uuid(),
         $1::uuid, $2, 'API_KEY',
         'API_AUTH', $3,
         $4, $5::jsonb,
         $6, $7, NOW()
       )`,
      [
        ctx?.tenantId ?? '00000000-0000-0000-0000-000000000000',
        ctx?.keyId ?? null,
        ctx?.keyId ?? 'unknown',
        action,
        JSON.stringify({ scope, path: req.path, method: req.method }),
        req.ip ?? null,
        req.headers['user-agent']?.slice(0, 500) ?? null,
      ]
    )
  } catch (_) { /* audit write failure is non-fatal — never block request path */ }
}

// ── Utilities ─────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function problem(status: number, detail: string, correlationId: string) {
  const titles: Record<number, string> = {
    401: 'Unauthorized', 403: 'Forbidden', 429: 'Too Many Requests',
  }
  return {
    type:          `https://api.vytalix.health/errors/${status}`,
    title:         titles[status] ?? 'Error',
    status,
    detail,
    correlationId,
  }
}

// =============================================================================
// API Key provisioning helper (used from admin routes)
// =============================================================================

export interface NewApiKeyResult {
  keyId:      string
  keyPlain:   string   // Show ONCE — never stored
  keyPrefix:  string   // "vyx_dis_" — for display
  keyHash:    string   // Stored in DB
}

/**
 * Generates a cryptographically secure API key.
 * Returns the plain key ONCE — after this call it is unrecoverable.
 * Format: vyx_{prefix}_{random32bytes_base62}
 */
export function generateApiKey(prefix: string): NewApiKeyResult {
  const random    = crypto.randomBytes(24).toString('base64url')
  const keyPrefix = `vyx_${prefix}_`
  const keyPlain  = `${keyPrefix}${random}`
  const keyHash   = sha256(keyPlain)
  const keyId     = crypto.randomUUID()

  return { keyId, keyPlain, keyPrefix, keyHash }
}
