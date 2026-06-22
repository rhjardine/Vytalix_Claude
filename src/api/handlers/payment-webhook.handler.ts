// =============================================================================
// src/api/handlers/payment-webhook.handler.ts
// Disglobal → Vytalix payment confirmation webhook receiver.
//
// Route:
//   POST /api/v2/webhooks/payment
//
// Auth: HMAC-SHA256 signature over canonical JSON body
//   Header: X-Disglobal-Signature (hex-encoded HMAC)
//   Secret: DISGLOBAL_WEBHOOK_SECRET env var
//
// Idempotency: Redis key `webhook:idempotency:{intentId}` — TTL 24h
//   Replayed webhooks return 200 without re-processing.
//
// On success → publishes PaymentConfirmed event → payment pipeline activates.
// =============================================================================

import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { getRedisClient } from '../../platform/redis'
import { logger } from '../../platform/logger'
import { publish } from '../../platform/event-bus'

// ── Webhook secret ─────────────────────────────────────────────────

function getWebhookSecret(): string {
  return process.env.DISGLOBAL_WEBHOOK_SECRET ?? 'sandbox-webhook-secret-v1'
}

// ── Canonical body reconstruction (same field order as sandbox) ───

function canonicalBody(payload: Record<string, unknown>): string {
  return JSON.stringify({
    event:      payload['event'],
    intentId:   payload['intentId'],
    amount:     payload['amount'],
    currency:   payload['currency'],
    timestamp:  payload['timestamp'],
    subjectRef: payload['subjectRef'],
    metadata:   payload['metadata'],
  })
}

// ── Signature verification ─────────────────────────────────────────

function verifySignature(payload: Record<string, unknown>, incomingSignature: string): boolean {
  const expected = crypto
    .createHmac('sha256', getWebhookSecret())
    .update(canonicalBody(payload))
    .digest('hex')

  if (incomingSignature.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(incomingSignature, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  } catch {
    return false
  }
}

// ── Idempotency via Redis ──────────────────────────────────────────

const IDEMPOTENCY_TTL_SECONDS = 86_400 // 24h

async function checkAndMarkIdempotent(intentId: string): Promise<boolean> {
  const redis = getRedisClient()
  const key = `webhook:idempotency:${intentId}`
  const existing = await redis.get(key).catch(() => null)
  if (existing) return false
  await redis.setex(key, IDEMPOTENCY_TTL_SECONDS, new Date().toISOString()).catch(() => {})
  return true
}

// ── Request schema ─────────────────────────────────────────────────

const WebhookPayloadSchema = z.object({
  event:      z.enum(['payment.confirmed', 'payment.failed', 'payment.refunded']),
  intentId:   z.string().min(1).max(128),
  amount:     z.number().int().positive(),
  currency:   z.string().length(3),
  timestamp:  z.string().datetime(),
  subjectRef: z.string().min(1).max(128),
  metadata:   z.record(z.string()).default({}),
  signature:  z.string().min(1),
})

// ── Handler ────────────────────────────────────────────────────────

function problemDetail(status: number, detail: string, correlationId: string) {
  return {
    type:          `https://api.vytalix.health/errors/${status}`,
    title:         status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : 'Error',
    status,
    detail,
    correlationId,
  }
}

async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  const correlationId = (req as any).correlationId as string

  // 1. Parse and validate
  const parsed = WebhookPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    res.status(400).json(problemDetail(400, msg, correlationId))
    return
  }

  const body = parsed.data

  // 2. Verify HMAC signature
  if (!verifySignature(req.body as Record<string, unknown>, body.signature)) {
    logger.warn({ correlationId, intentId: body.intentId }, 'Webhook signature verification failed')
    res.status(401).json(problemDetail(401, 'Invalid webhook signature', correlationId))
    return
  }

  // 3. Idempotency check
  const isNew = await checkAndMarkIdempotent(body.intentId)
  if (!isNew) {
    logger.info({ correlationId, intentId: body.intentId }, 'Webhook replayed — skipping')
    res.status(200).json({ received: true, replayed: true })
    return
  }

  // 4. Route by event type
  if (body.event === 'payment.confirmed') {
    // Resolve tenantId — webhooks are scoped to the API key tenant
    // In production this comes from the API key resolution middleware
    const tenantId = (req as any).apiKeyCtx?.tenantId
      ?? process.env.DEFAULT_FUNNEL_TENANT_ID
      ?? 'a1b2c3d4-0000-4000-8000-000000000001'

    publish.paymentConfirmed(
      { tenantId, correlationId },
      {
        intentId:   body.intentId,
        subjectRef: body.subjectRef,
        amount:     body.amount,
        currency:   body.currency,
        product:    body.metadata['product'] ?? 'UNKNOWN',
        metadata:   body.metadata,
      },
    )

    logger.info(
      { correlationId, intentId: body.intentId, subjectRef: body.subjectRef, amount: body.amount },
      'PaymentConfirmed event published',
    )
  } else {
    logger.info({ correlationId, intentId: body.intentId, event: body.event }, 'Webhook received (no action)')
  }

  res.status(200).json({ received: true, replayed: false })
}

// ── Router ─────────────────────────────────────────────────────────

export function createPaymentWebhookRouter(): Router {
  const router = Router()
  router.post('/webhooks/payment', handlePaymentWebhook)
  return router
}
