// =============================================================================
// src/security/hardening.middleware.ts
// Production security hardening for all API routes.
//
// Includes:
//   1. Tier-based rate limiter (Redis sliding window)
//   2. Request size guard
//   3. Sensitive field scrubber (prevents PII leaking into logs)
//   4. HMAC webhook signature verifier (for inbound webhooks)
//   5. Security headers (extends helmet defaults)
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { getRedisClient } from '../../platform/redis'
import { logger } from '../../platform/logger'

// ── Rate Limiting — Sliding Window (Redis) ────────────────────────

const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  STANDARD:     { windowMs: 60_000, max: 100  },
  PROFESSIONAL: { windowMs: 60_000, max: 1000 },
  ENTERPRISE:   { windowMs: 60_000, max: 99999 },
}

/**
 * Sliding window rate limiter based on API key tier.
 * Falls back to STANDARD limits for unauthenticated requests.
 * Returns 429 with Retry-After header when limit exceeded.
 */
export function rateLimiter() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tier      = req.apiKeyCtx?.rateLimitTier ?? 'STANDARD'
    const keyId     = req.apiKeyCtx?.keyId ?? `ip:${req.ip}`
    const limitConf = RATE_LIMITS[tier]

    const windowKey  = `ratelimit:${keyId}:${Math.floor(Date.now() / limitConf.windowMs)}`

    try {
      const redis = getRedisClient()
      const count = await redis
        .multi()
        .incr(windowKey)
        .pexpire(windowKey, limitConf.windowMs)
        .exec()

      const current = count?.[0]?.[1] as number ?? 0

      res.setHeader('X-RateLimit-Limit',     limitConf.max)
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limitConf.max - current))
      res.setHeader('X-RateLimit-Reset',     Math.ceil((Date.now() + limitConf.windowMs) / 1000))

      if (current > limitConf.max) {
        res.setHeader('Retry-After', Math.ceil(limitConf.windowMs / 1000))
        res.status(429).json({
          type:   'https://api.vytalix.health/errors/429',
          title:  'Too Many Requests',
          status: 429,
          detail: `Rate limit exceeded for tier ${tier}. Limit: ${limitConf.max} req/min.`,
          correlationId: req.correlationId,
        })
        return
      }
    } catch (_) {
      // Redis unavailable — fail open (log, continue)
      logger.warn({ keyId }, 'Rate limiter Redis error — failing open')
    }

    next()
  }
}

// ── Request size guard ────────────────────────────────────────────

/**
 * Rejects requests whose body exceeds maxBytes.
 * Express body-parser already has a limit, but this adds explicit error.
 */
export function requestSizeGuard(maxBytes = 2 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10)
    if (contentLength > maxBytes) {
      res.status(413).json({
        type:   'https://api.vytalix.health/errors/413',
        title:  'Payload Too Large',
        status: 413,
        detail: `Request body exceeds maximum size of ${maxBytes / 1024}KB.`,
        correlationId: req.correlationId,
      })
      return
    }
    next()
  }
}

// ── PII scrubber for structured logs ─────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'key', 'authorization',
  'x-api-key', 'ssn', 'dob', 'dateofbirth', 'email',
  'phone', 'address', 'creditcard', 'cvv',
])

/**
 * Deep-clones an object, replacing sensitive field values with [REDACTED].
 * Safe to pass to logger.info() / logger.error() for request logging.
 */
export function scrubSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitive(item, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = scrubSensitive(value, depth + 1)
    }
  }
  return result
}

// ── Structured request logger ─────────────────────────────────────

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now()

    res.on('finish', () => {
      logger.info({
        method:        req.method,
        path:          req.path,
        status:        res.statusCode,
        durationMs:    Date.now() - start,
        correlationId: req.correlationId,
        tenantId:      req.apiKeyCtx?.tenantId,
        keyId:         req.apiKeyCtx?.keyId,
        ip:            req.ip,
        // Never log body — it contains clinical data
      }, 'HTTP')
    })

    next()
  }
}

// ── HMAC Webhook Signature Verifier ──────────────────────────────

/**
 * Verifies inbound webhooks signed with HMAC-SHA256.
 * Used when Vytalix receives webhooks from external systems.
 *
 * Expected headers:
 *   X-Vytalix-Timestamp:  Unix ms timestamp
 *   X-Vytalix-Signature:  sha256=<hex>
 *
 * Signed payload: `${timestamp}.${rawBody}`
 */
export function verifyWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timestamp = req.headers['x-vytalix-timestamp'] as string | undefined
    const signature = req.headers['x-vytalix-signature'] as string | undefined
    const rawBody   = (req as any).rawBody as Buffer | undefined

    if (!timestamp || !signature || !rawBody) {
      res.status(401).json({ error: 'Missing webhook signature headers' })
      return
    }

    // Replay attack prevention: reject if timestamp > 5 minutes old
    const age = Date.now() - parseInt(timestamp, 10)
    if (Math.abs(age) > 5 * 60_000) {
      res.status(401).json({ error: 'Webhook timestamp too old (replay attack prevention)' })
      return
    }

    const expected = `sha256=${
      crypto.createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody.toString('utf8')}`)
        .digest('hex')
    }`

    // Constant-time comparison
    const sigBuffer  = Buffer.from(signature)
    const expBuffer  = Buffer.from(expected)

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      logger.warn({ ip: req.ip }, 'Webhook signature mismatch')
      res.status(401).json({ error: 'Invalid webhook signature' })
      return
    }

    next()
  }
}

// ── Security headers (augments helmet) ───────────────────────────

export function additionalSecurityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Prevent caching of clinical API responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    // API responses should never be framed
    res.setHeader('X-Frame-Options', 'DENY')
    // Strict referrer for PHI protection
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  }
}
