// =============================================================================
// Integration Test — Payment Webhook Financial Trust Shield (Sprint P1-J)
//   HMAC → validate → withTenant(INSERT ... ON CONFLICT RETURNING id) → COMMIT
//   → HTTP 200 → post-commit publish (best-effort)
//
// Proves: 200 only after a successful COMMIT; DB failure → 500 + NO publish;
// duplicate (ON CONFLICT, no row) → 200 + NO re-publish; EventBus failure never
// changes the financial result. The DB is the single source of truth.
//
// Mocks ONLY: platform/db (no real Postgres) and platform/event-bus (publish spy).
// No AWS. No Redis. No real database.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

const h = vi.hoisted(() => ({
  withTenantResult: null as null | { id: string } | 'throw',
  withTenantCalls: 0,
  publishCalls: [] as unknown[],
  publishThrows: false,
}))

vi.mock('../src/platform/db', () => ({
  withTenant: async (_tenantId: string, fn: (tc: any) => any) => {
    h.withTenantCalls++
    if (h.withTenantResult === 'throw') throw new Error('DB connection lost')
    return fn({
      queryOne: async () => h.withTenantResult,
      queryMany: async () => [],
      execute: async () => {},
    })
  },
}))

vi.mock('../src/platform/event-bus', () => ({
  publish: {
    paymentConfirmed: (base: unknown, payload: unknown) => {
      if (h.publishThrows) throw new Error('event bus unavailable')
      h.publishCalls.push({ base, payload })
    },
  },
}))

import { handlePaymentWebhook } from '../src/api/handlers/payment-webhook.handler'

const SECRET = 'sandbox-webhook-secret-v1'
const TENANT = 'a1b2c3d4-0000-4000-8000-000000000001'

function signedBody(overrides: Record<string, unknown> = {}) {
  const payload: any = {
    event:      'payment.confirmed',
    intentId:   'intent-1',
    amount:     4900,
    currency:   'USD',
    timestamp:  '2026-01-01T00:00:00.000Z',
    subjectRef: 'DISG-1',
    metadata:   { product: 'FACIAL_SCAN' },
    ...overrides,
  }
  // Must match canonicalBody() field order in the handler exactly.
  const canonical = JSON.stringify({
    event: payload.event, intentId: payload.intentId, amount: payload.amount,
    currency: payload.currency, timestamp: payload.timestamp,
    subjectRef: payload.subjectRef, metadata: payload.metadata,
  })
  payload.signature = crypto.createHmac('sha256', SECRET).update(canonical).digest('hex')
  return payload
}

function mockRes() {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((c: number) => { res.statusCode = c; return res })
  res.json = vi.fn((b: any) => { res.body = b; return res })
  return res
}
const mockReq = (body: any) => ({ body, correlationId: 'cid-1', apiKeyCtx: { tenantId: TENANT } } as any)

describe('Payment webhook — financial trust shield', () => {
  beforeEach(() => {
    process.env.DISGLOBAL_WEBHOOK_SECRET = SECRET
    h.withTenantResult = null
    h.withTenantCalls = 0
    h.publishCalls.length = 0
    h.publishThrows = false
  })

  it('responds 200 only after a successful COMMIT, then publishes post-commit', async () => {
    h.withTenantResult = { id: 'row-1' }          // new row inserted (RETURNING id)
    const res = mockRes()
    await handlePaymentWebhook(mockReq(signedBody()), res)
    expect(h.withTenantCalls).toBe(1)              // persistence ran
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ received: true, replayed: false })
    expect(h.publishCalls).toHaveLength(1)         // published only after commit
  })

  it('DB failure → HTTP 500 and NO publish (Disglobal will retry)', async () => {
    h.withTenantResult = 'throw'
    const res = mockRes()
    await handlePaymentWebhook(mockReq(signedBody()), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toHaveProperty('stack')   // no internals leaked
    expect(h.publishCalls).toHaveLength(0)         // never published on failure
  })

  it('duplicate webhook (ON CONFLICT → no row) → 200, no re-publish, no double-activation', async () => {
    h.withTenantResult = null                      // conflict: RETURNING yields nothing
    const res = mockRes()
    await handlePaymentWebhook(mockReq(signedBody()), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ received: true, replayed: true })
    expect(h.publishCalls).toHaveLength(0)         // no publish → no double activation/notification
  })

  it('invalid HMAC → 401, no persistence, no publish', async () => {
    const res = mockRes()
    await handlePaymentWebhook(mockReq({ ...signedBody(), signature: 'deadbeef' }), res)
    expect(res.statusCode).toBe(401)
    expect(h.withTenantCalls).toBe(0)
    expect(h.publishCalls).toHaveLength(0)
  })

  it('EventBus failure is post-commit and inert: the 200 (financial result) still stands', async () => {
    h.withTenantResult = { id: 'row-2' }
    h.publishThrows = true                         // bus down after commit
    const res = mockRes()
    await handlePaymentWebhook(mockReq(signedBody()), res)
    expect(res.statusCode).toBe(200)               // committed payment acknowledged despite bus failure
    expect(h.publishCalls).toHaveLength(0)
  })
})
