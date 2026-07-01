// =============================================================================
// disglobal-emulator.ts — In-process Disglobal server emulator
//
// Exposes the three Disglobal-facing endpoints as pure functions.
// No port binding, no network I/O — runs entirely in-memory.
// Tests call these methods directly; no HTTP client needed.
// =============================================================================

import { handleCheckout } from './handlers/checkout.handler'
import { handlePaymentIntent } from './handlers/payment-intent.handler'
import { handleWebhookTrigger } from './handlers/webhook-trigger.handler'
import type {
  CheckoutRequest, CheckoutResponse,
  PaymentIntentRequest, PaymentIntentResponse,
  WebhookTriggerRequest, WebhookTriggerResponse,
  SandboxResult,
} from '../types'

export class DisgglobalEmulator {
  checkout(req: CheckoutRequest): SandboxResult<CheckoutResponse> {
    return handleCheckout(req)
  }

  paymentIntent(req: PaymentIntentRequest): SandboxResult<PaymentIntentResponse> {
    return handlePaymentIntent(req)
  }

  triggerWebhook(req: WebhookTriggerRequest): SandboxResult<WebhookTriggerResponse> {
    return handleWebhookTrigger(req)
  }
}
