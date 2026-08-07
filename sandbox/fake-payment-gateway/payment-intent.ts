// =============================================================================
// payment-intent.ts — In-memory fake payment gateway
//
// Supports the create → confirm / fail lifecycle.
// Webhook handlers are registered before confirmation and called synchronously
// on state transition — no async, no network, fully deterministic.
// =============================================================================

import crypto from 'node:crypto'
import type { PaymentIntent } from '../types'

export class FakePaymentGateway {
  private readonly store = new Map<string, PaymentIntent>()
  private readonly webhookHandlers: Array<(intent: PaymentIntent) => void> = []

  create(params: {
    amount: number
    currency: string
    subjectRef: string
    metadata: Record<string, string>
  }): PaymentIntent {
    const intentId = `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    const intent: PaymentIntent = {
      intentId,
      amount: params.amount,
      currency: params.currency,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      subjectRef: params.subjectRef,
      metadata: params.metadata,
    }
    this.store.set(intentId, intent)
    return intent
  }

  confirm(intentId: string): PaymentIntent {
    const intent = this.getOrThrow(intentId)
    if (intent.status !== 'PENDING' && intent.status !== 'PROCESSING') {
      throw new Error(`Cannot confirm intent in status: ${intent.status}`)
    }
    const confirmed: PaymentIntent = {
      ...intent,
      status: 'CONFIRMED',
      confirmedAt: new Date().toISOString(),
    }
    this.store.set(intentId, confirmed)
    this.dispatchWebhooks(confirmed)
    return confirmed
  }

  fail(intentId: string): PaymentIntent {
    const intent = this.getOrThrow(intentId)
    const failed: PaymentIntent = { ...intent, status: 'FAILED' }
    this.store.set(intentId, failed)
    this.dispatchWebhooks(failed)
    return failed
  }

  get(intentId: string): PaymentIntent | undefined {
    return this.store.get(intentId)
  }

  onWebhook(handler: (intent: PaymentIntent) => void): void {
    this.webhookHandlers.push(handler)
  }

  private getOrThrow(intentId: string): PaymentIntent {
    const intent = this.store.get(intentId)
    if (!intent) throw new Error(`Payment intent not found: ${intentId}`)
    return intent
  }

  private dispatchWebhooks(intent: PaymentIntent): void {
    for (const handler of this.webhookHandlers) {
      handler(intent)
    }
  }
}
