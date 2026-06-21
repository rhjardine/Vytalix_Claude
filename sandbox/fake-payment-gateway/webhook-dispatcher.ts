// =============================================================================
// webhook-dispatcher.ts — Webhook payload builder and signature verification
//
// Uses HMAC-SHA256 over a canonical JSON body (field order is stable).
// verifyWebhookSignature mirrors what a real Vytalix receiver would do.
// =============================================================================

import crypto from 'node:crypto'
import type { PaymentIntent, WebhookEventType, WebhookPayload } from '../types'

const SANDBOX_WEBHOOK_SECRET = 'sandbox-webhook-secret-v1'

export function buildWebhookPayload(intent: PaymentIntent): WebhookPayload {
  const event = resolveEventType(intent.status)
  const timestamp = new Date().toISOString()

  // Canonical body: field order must match verifyWebhookSignature
  const canonicalBody = JSON.stringify({
    event,
    intentId: intent.intentId,
    amount: intent.amount,
    currency: intent.currency,
    timestamp,
    subjectRef: intent.subjectRef,
    metadata: intent.metadata,
  })

  const signature = crypto
    .createHmac('sha256', SANDBOX_WEBHOOK_SECRET)
    .update(canonicalBody)
    .digest('hex')

  return {
    event,
    intentId: intent.intentId,
    amount: intent.amount,
    currency: intent.currency,
    timestamp,
    subjectRef: intent.subjectRef,
    metadata: intent.metadata,
    signature,
  }
}

export function verifyWebhookSignature(payload: WebhookPayload): boolean {
  const { signature, ...rest } = payload

  // Reconstruct canonical body using same field order as buildWebhookPayload
  const canonicalBody = JSON.stringify({
    event: rest.event,
    intentId: rest.intentId,
    amount: rest.amount,
    currency: rest.currency,
    timestamp: rest.timestamp,
    subjectRef: rest.subjectRef,
    metadata: rest.metadata,
  })

  const expected = crypto
    .createHmac('sha256', SANDBOX_WEBHOOK_SECRET)
    .update(canonicalBody)
    .digest('hex')

  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  )
}

function resolveEventType(status: PaymentIntent['status']): WebhookEventType {
  if (status === 'CONFIRMED') return 'payment.confirmed'
  if (status === 'FAILED') return 'payment.failed'
  throw new Error(`No webhook event mapping for status: ${status}`)
}
