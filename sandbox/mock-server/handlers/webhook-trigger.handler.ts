import type { WebhookTriggerRequest, WebhookTriggerResponse, SandboxResult } from '../../types'

const VALID_EVENT_TYPES = new Set(['payment.confirmed', 'payment.failed', 'payment.refunded'])

export function handleWebhookTrigger(req: WebhookTriggerRequest): SandboxResult<WebhookTriggerResponse> {
  if (!req.intentId || !req.eventType) {
    return { ok: false, error: 'intentId and eventType are required', code: 400 }
  }
  if (!VALID_EVENT_TYPES.has(req.eventType)) {
    return { ok: false, error: `Unknown event type: ${req.eventType}`, code: 422 }
  }

  return {
    ok: true,
    data: {
      delivered: true,
      deliveredAt: new Date().toISOString(),
    },
  }
}
