import crypto from 'node:crypto'
import type { CheckoutRequest, CheckoutResponse, SandboxResult } from '../../types'

export function handleCheckout(req: CheckoutRequest): SandboxResult<CheckoutResponse> {
  if (!req.sessionId || !req.subjectRef) {
    return { ok: false, error: 'sessionId and subjectRef are required', code: 400 }
  }
  if (req.amount <= 0) {
    return { ok: false, error: 'amount must be positive', code: 422 }
  }
  if (!req.idempotencyKey) {
    return { ok: false, error: 'Idempotency-Key is required', code: 422 }
  }

  const checkoutId = `chk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  const paymentIntentId = `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  return {
    ok: true,
    data: {
      checkoutId,
      status: 'CREATED',
      paymentIntentId,
      redirectUrl: `https://sandbox.disglobal.com/pay/${checkoutId}`,
    },
  }
}
