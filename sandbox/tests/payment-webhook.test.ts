import { describe, it, expect } from 'vitest'
import { FakePaymentGateway } from '../fake-payment-gateway/payment-intent'
import { buildWebhookPayload, verifyWebhookSignature } from '../fake-payment-gateway/webhook-dispatcher'
import { DisgglobalEmulator } from '../mock-server/disglobal-emulator'

describe('Disglobal Integration Sandbox — Payment & Webhook', () => {
  describe('FakePaymentGateway', () => {
    it('creates an intent with PENDING status', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-gw-001', metadata: {} })

      expect(intent.status).toBe('PENDING')
      expect(intent.intentId).toMatch(/^pi_/)
      expect(intent.amount).toBe(149900)
      expect(intent.currency).toBe('MXN')
      expect(intent.createdAt).toBeTruthy()
    })

    it('confirms a PENDING intent and transitions to CONFIRMED', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-gw-002', metadata: {} })
      const confirmed = gw.confirm(intent.intentId)

      expect(confirmed.status).toBe('CONFIRMED')
      expect(confirmed.confirmedAt).toBeTruthy()
      expect(confirmed.intentId).toBe(intent.intentId)
    })

    it('fires webhook handler synchronously on confirm', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-gw-003', metadata: {} })

      let webhookFired = false
      let receivedStatus: string | undefined
      gw.onWebhook((i) => {
        webhookFired = true
        receivedStatus = i.status
      })

      gw.confirm(intent.intentId)
      expect(webhookFired).toBe(true)
      expect(receivedStatus).toBe('CONFIRMED')
    })

    it('fires webhook handler on fail', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 50000, currency: 'MXN', subjectRef: 'DISG-gw-004', metadata: {} })

      let receivedStatus: string | undefined
      gw.onWebhook((i) => { receivedStatus = i.status })

      gw.fail(intent.intentId)
      expect(receivedStatus).toBe('FAILED')
    })

    it('throws when confirming a non-existent intent', () => {
      const gw = new FakePaymentGateway()
      expect(() => gw.confirm('pi_does-not-exist')).toThrow('Payment intent not found')
    })

    it('throws when confirming an already-confirmed intent', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-gw-005', metadata: {} })
      gw.confirm(intent.intentId)

      expect(() => gw.confirm(intent.intentId)).toThrow('Cannot confirm intent in status: CONFIRMED')
    })

    it('can retrieve a stored intent by id', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-gw-006', metadata: {} })
      const stored = gw.get(intent.intentId)

      expect(stored).toBeDefined()
      expect(stored?.intentId).toBe(intent.intentId)
    })

    it('returns undefined for unknown intent id', () => {
      const gw = new FakePaymentGateway()
      expect(gw.get('pi_unknown')).toBeUndefined()
    })
  })

  describe('Webhook Payload', () => {
    it('builds a valid payload for a confirmed intent', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-wh-001', metadata: {} })
      const confirmed = gw.confirm(intent.intentId)

      const payload = buildWebhookPayload(confirmed)
      expect(payload.event).toBe('payment.confirmed')
      expect(payload.intentId).toBe(confirmed.intentId)
      expect(payload.amount).toBe(149900)
      expect(payload.signature).toBeTruthy()
    })

    it('builds a valid payload for a failed intent', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-wh-002', metadata: {} })
      const failed = gw.fail(intent.intentId)

      const payload = buildWebhookPayload(failed)
      expect(payload.event).toBe('payment.failed')
    })

    it('signature verification passes for untampered payload', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-wh-003', metadata: {} })
      const confirmed = gw.confirm(intent.intentId)

      const payload = buildWebhookPayload(confirmed)
      expect(verifyWebhookSignature(payload)).toBe(true)
    })

    it('signature verification fails when amount is tampered', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-wh-004', metadata: {} })
      const confirmed = gw.confirm(intent.intentId)

      const payload = buildWebhookPayload(confirmed)
      const tampered = { ...payload, amount: 1 }
      expect(verifyWebhookSignature(tampered)).toBe(false)
    })

    it('signature verification fails when event type is tampered', () => {
      const gw = new FakePaymentGateway()
      const intent = gw.create({ amount: 149900, currency: 'MXN', subjectRef: 'DISG-wh-005', metadata: {} })
      const confirmed = gw.confirm(intent.intentId)

      const payload = buildWebhookPayload(confirmed)
      const tampered = { ...payload, event: 'payment.refunded' as const }
      expect(verifyWebhookSignature(tampered)).toBe(false)
    })
  })

  describe('DisgglobalEmulator — Endpoints', () => {
    it('checkout creates a checkout session', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.checkout({
        sessionId: 'sess-em-001',
        subjectRef: 'DISG-em-001',
        tenantId: 'tenant-001',
        amount: 149900,
        currency: 'MXN',
        description: 'Test checkout',
        idempotencyKey: 'idem-em-001',
      })

      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.data.checkoutId).toMatch(/^chk_/)
        expect(res.data.paymentIntentId).toMatch(/^pi_/)
        expect(res.data.status).toBe('CREATED')
        expect(res.data.redirectUrl).toContain(res.data.checkoutId)
      }
    })

    it('checkout rejects missing sessionId', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.checkout({
        sessionId: '',
        subjectRef: 'DISG-em-001',
        tenantId: 'tenant-001',
        amount: 149900,
        currency: 'MXN',
        description: 'Test',
        idempotencyKey: 'idem-001',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe(400)
    })

    it('checkout rejects zero amount', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.checkout({
        sessionId: 'sess-001',
        subjectRef: 'DISG-em-001',
        tenantId: 'tenant-001',
        amount: 0,
        currency: 'MXN',
        description: 'Test',
        idempotencyKey: 'idem-001',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe(422)
    })

    it('checkout rejects missing idempotency key', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.checkout({
        sessionId: 'sess-001',
        subjectRef: 'DISG-em-001',
        tenantId: 'tenant-001',
        amount: 149900,
        currency: 'MXN',
        description: 'Test',
        idempotencyKey: '',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe(422)
    })

    it('payment-intent creates an intent', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.paymentIntent({
        checkoutId: 'chk_test',
        subjectRef: 'DISG-em-002',
        amount: 149900,
        currency: 'MXN',
        metadata: {},
      })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.data.intentId).toMatch(/^pi_/)
        expect(res.data.status).toBe('PENDING')
        expect(res.data.clientSecret).toContain(res.data.intentId)
      }
    })

    it('webhook trigger accepts payment.confirmed', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.triggerWebhook({ intentId: 'pi_001', eventType: 'payment.confirmed', metadata: {} })
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.data.delivered).toBe(true)
    })

    it('webhook trigger accepts payment.failed', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.triggerWebhook({ intentId: 'pi_002', eventType: 'payment.failed', metadata: {} })
      expect(res.ok).toBe(true)
    })

    it('webhook trigger rejects unknown event type', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.triggerWebhook({ intentId: 'pi_003', eventType: 'payment.unknown' as any, metadata: {} })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe(422)
    })

    it('webhook trigger rejects missing intentId', () => {
      const emulator = new DisgglobalEmulator()
      const res = emulator.triggerWebhook({ intentId: '', eventType: 'payment.confirmed', metadata: {} })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.code).toBe(400)
    })
  })
})
