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
// Transactional guarantee (Sprint P1-J — Financial Trust Shield):
//   The DB is the single source of truth. Persistence is synchronous inside
//   withTenant(): HTTP 200 is emitted ONLY after a successful COMMIT; a DB/commit
//   failure returns HTTP 500 (Disglobal retries). Idempotency is DB-authoritative
//   via UNIQUE("intentId") + ON CONFLICT DO NOTHING RETURNING id (a replay yields
//   no row → 200 without re-processing). The EventBus is strictly post-commit,
//   best-effort: publishing (→ pipeline activation/notification) happens after the
//   200 and can never condition the financial result.
// =============================================================================

import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { withTenant } from '../../platform/db'
import { logger } from '../../platform/logger'
import { publish } from '../../platform/event-bus'

// ── Webhook secret ─────────────────────────────────────────────────

// The sandbox fallback exists so `make demo` and the example scripts work out
// of the box. It is published in this repository, so it must never authenticate
// a real payment: outside development/test the secret has to be provisioned.
// server.ts already refuses to boot without it; this is the second barrier for
// any process that reaches here another way.
function getWebhookSecret(): string {
  const configured = process.env.DISGLOBAL_WEBHOOK_SECRET
  if (configured && configured.trim() !== '') return configured

  const env = process.env.NODE_ENV ?? 'development'
  if (env !== 'development' && env !== 'test') {
    throw Object.assign(
      new Error('DISGLOBAL_WEBHOOK_SECRET is not configured'),
      { statusCode: 500 },
    )
  }
  return 'sandbox-webhook-secret-v1'
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

// Idempotency is DB-authoritative: UNIQUE("intentId") + ON CONFLICT DO NOTHING
// RETURNING id (see handler). Redis is intentionally NOT on the correctness path.

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

export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  const correlationId = (req as any).correlationId as string

  // 1. Parse and validate
  const parsed = WebhookPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    res.status(400).json(problemDetail(400, msg, correlationId))
    return
  }

  const body = parsed.data

  // 2. Verify HMAC signature. A misconfigured secret must fail closed with a
  //    controlled 500 — never an unhandled rejection, and never a 200.
  let signatureValid: boolean
  try {
    signatureValid = verifySignature(req.body as Record<string, unknown>, body.signature)
  } catch (err) {
    logger.error(
      { correlationId, intentId: body.intentId, errName: (err as any)?.name },
      'CRITICAL: webhook secret is not configured — rejecting payment notification',
    )
    res.status(500).json(problemDetail(500, 'Webhook verification unavailable; please retry', correlationId))
    return
  }

  if (!signatureValid) {
    logger.warn({ correlationId, intentId: body.intentId }, 'Webhook signature verification failed')
    res.status(401).json(problemDetail(401, 'Invalid webhook signature', correlationId))
    return
  }

  // 3. Non-confirmed events carry no financial state — acknowledge, no persistence.
  if (body.event !== 'payment.confirmed') {
    logger.info({ correlationId, intentId: body.intentId, event: body.event }, 'Webhook received (no action)')
    res.status(200).json({ received: true, replayed: false })
    return
  }

  // Resolve tenantId — webhooks are scoped to the API key tenant (middleware).
  const tenantId = (req as any).apiKeyCtx?.tenantId
    ?? process.env.DEFAULT_FUNNEL_TENANT_ID
    ?? 'a1b2c3d4-0000-4000-8000-000000000001'

  // 4. Durable, ACID persistence INSIDE withTenant — the COMMIT is the single
  //    source of truth for a confirmed payment. Idempotency is DB-authoritative:
  //    UNIQUE("intentId") + ON CONFLICT DO NOTHING RETURNING id. A replayed webhook
  //    hits the conflict → no row returned → acknowledged without re-processing.
  let inserted: { id: string } | null
  try {
    inserted = await withTenant(tenantId, (tc) => tc.queryOne<{ id: string }>(
      `INSERT INTO payment_transactions
         ("tenantId", "intentId", "subjectRef", amount, currency, product, status, "correlationId", metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT ("intentId") DO NOTHING
       RETURNING id`,
      [tenantId, body.intentId, body.subjectRef, body.amount, body.currency,
       body.metadata['product'] ?? 'UNKNOWN', 'CONFIRMED', correlationId, JSON.stringify(body.metadata)],
    ))
  } catch (err) {
    // DB/commit failed → payment is NOT recorded. Never ack success, never publish.
    // Respond 500 so Disglobal retries. Log critically WITHOUT leaking DB internals
    // or stack traces into the HTTP response body.
    logger.error(
      { correlationId, intentId: body.intentId, errName: (err as any)?.name },
      'CRITICAL: payment persistence failed — returning 500 for Disglobal retry',
    )
    res.status(500).json(problemDetail(500, 'Payment could not be recorded; please retry', correlationId))
    return
  }

  // 5. COMMIT succeeded → the row is the financial truth. Acknowledge FIRST.
  res.status(200).json({ received: true, replayed: inserted === null })

  // 6. Post-commit, best-effort. Publish ONLY for a newly-inserted row so a replay
  //    can never double-activate/notify. A publish failure never affects the
  //    financial result (already committed and acknowledged).
  if (inserted) {
    try {
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
        'Payment committed → PaymentConfirmed published (post-commit)',
      )
    } catch (err) {
      logger.error(
        { correlationId, intentId: body.intentId, errName: (err as any)?.name },
        'Post-commit publish failed — payment is recorded; activation deferred to reconciliation',
      )
    }
  }
}

// ── Router ─────────────────────────────────────────────────────────

export function createPaymentWebhookRouter(): Router {
  const router = Router()
  router.post('/webhooks/payment', handlePaymentWebhook)
  return router
}
