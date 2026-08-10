import crypto from 'node:crypto'
import type { PaymentIntentRequest, PaymentIntentResponse, SandboxResult } from '../../types'

export function handlePaymentIntent(req: PaymentIntentRequest): SandboxResult<PaymentIntentResponse> {
  if (!req.checkoutId || !req.subjectRef) {
    return { ok: false, error: 'checkoutId and subjectRef are required', code: 400 }
  }
  if (req.amount <= 0) {
    return { ok: false, error: 'amount must be positive', code: 422 }
  }

  const intentId = `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const clientSecret = `${intentId}_secret_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  return {
    ok: true,
    data: {
      intentId,
      status: 'PENDING',
      clientSecret,
    },
  }
}
