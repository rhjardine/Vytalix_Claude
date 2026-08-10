#!/usr/bin/env node
/**
 * Runnable example — POST /api/v2/webhooks/payment
 *
 *   node scripts/examples/send-payment-webhook.js
 *   BASE_URL=https://staging.vytalix.health \
 *   DISGLOBAL_WEBHOOK_SECRET=your-secret \
 *   node scripts/examples/send-payment-webhook.js
 *
 * The signature is the hex HMAC-SHA256 of the CANONICAL body: a JSON object
 * with exactly these keys, in this order, excluding `signature`:
 *   event, intentId, amount, currency, timestamp, subjectRef, metadata
 * Key order matters — JSON.stringify preserves insertion order, so build the
 * object exactly as below.
 *
 * Re-running with the same intentId is safe: deduplication is database
 * authoritative, so the replay returns 200 with { replayed: true } and does
 * not re-activate the service.
 */
'use strict'

const crypto = require('node:crypto')

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'
const SECRET   = process.env.DISGLOBAL_WEBHOOK_SECRET ?? 'sandbox-webhook-secret-v1'

// 1. Build the payload (without `signature`).
const payload = {
  event:      'payment.confirmed',
  intentId:   process.env.INTENT_ID ?? `intent-${Date.now()}`,
  amount:     4900,                 // minor units (cents) → USD 49.00
  currency:   'USD',
  timestamp:  new Date().toISOString(),
  subjectRef: 'DISG-8c1e5a',        // pseudonymised buyer reference
  metadata:   { product: 'FACIAL_SCAN' },
}

// 2. Canonical body — same key order the server reconstructs.
const canonical = JSON.stringify({
  event:      payload.event,
  intentId:   payload.intentId,
  amount:     payload.amount,
  currency:   payload.currency,
  timestamp:  payload.timestamp,
  subjectRef: payload.subjectRef,
  metadata:   payload.metadata,
})

// 3. Sign.
const signature = crypto.createHmac('sha256', SECRET).update(canonical).digest('hex')

// 4. Send.
;(async () => {
  const res = await fetch(`${BASE_URL}/api/v2/webhooks/payment`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...payload, signature }),
  })

  const body = await res.json().catch(() => ({}))
  console.log(`HTTP ${res.status}`, body)

  // 200 → recorded (or already known). 401 → signature mismatch, check the
  // secret and the canonical key order. 500 → not recorded, retry as-is.
  process.exit(res.ok ? 0 : 1)
})()
