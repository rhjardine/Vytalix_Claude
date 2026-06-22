// =============================================================================
// src/api/pipelines/payment-pipeline.ts
// PaymentConfirmed event subscriber — activates service access and notifies.
//
// Triggered by: POST /api/v2/webhooks/payment (payment-webhook.handler.ts)
// Listens to:   PaymentConfirmed (event-bus.ts)
//
// Steps executed on each confirmed payment:
//   1. Idempotency guard (Redis key prevents duplicate activations)
//   2. Service activation record (Redis flag, TTL 365 days)
//   3. Patient notification (non-blocking — failure never blocks activation)
//   4. Appointment booking notification (non-blocking)
//
// Register once at startup via registerPaymentPipeline().
// =============================================================================

import { eventBus } from '../../platform/event-bus'
import type { PaymentConfirmedEvent } from '../../platform/event-bus'
import { notificationService } from '../../platform/notification.service'
import { getRedisClient } from '../../platform/redis'
import { logger } from '../../platform/logger'

// ── Constants ──────────────────────────────────────────────────────

const SERVICE_ACTIVATION_TTL = 365 * 24 * 60 * 60 // 1 year in seconds
const ACTIVATION_GUARD_TTL   = 24 * 60 * 60        // 24h idempotency window

// ── Service activation ─────────────────────────────────────────────

async function activateServiceAccess(
  subjectRef: string,
  tenantId: string,
  intentId: string,
  product: string,
  correlationId: string,
): Promise<boolean> {
  const redis = getRedisClient()
  const guardKey      = `payment:activation:guard:${intentId}`
  const activationKey = `service:active:${tenantId}:${subjectRef}`

  // Idempotency guard — prevent double-activation on replayed events
  const alreadyProcessed = await redis.get(guardKey).catch(() => null)
  if (alreadyProcessed) {
    logger.info({ correlationId, intentId, subjectRef }, 'Payment activation already processed — skipping')
    return false
  }

  await redis.setex(guardKey, ACTIVATION_GUARD_TTL, new Date().toISOString()).catch(() => {})

  // Write activation record (key existence = service is active)
  const activationRecord = JSON.stringify({
    intentId,
    product,
    tenantId,
    activatedAt: new Date().toISOString(),
    correlationId,
  })
  await redis.setex(activationKey, SERVICE_ACTIVATION_TTL, activationRecord).catch((err) => {
    logger.warn({ err, correlationId, subjectRef }, 'Redis activation write failed — service may not reflect active state')
  })

  logger.info(
    { correlationId, intentId, subjectRef, tenantId, product },
    'Service access activated',
  )
  return true
}

// ── Pipeline handler ───────────────────────────────────────────────

async function handlePaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
  const { correlationId, tenantId, payload } = event
  const { intentId, subjectRef, amount, currency, product } = payload

  logger.info(
    { correlationId, intentId, subjectRef, tenantId, amount, product },
    'PaymentConfirmed → payment pipeline started',
  )

  // Step 1: Activate service access
  const activated = await activateServiceAccess(subjectRef, tenantId, intentId, product, correlationId)

  // Step 2: Notify patient of payment confirmation (fire-and-forget)
  notificationService.paymentConfirmed({
    subjectRef,
    tenantId,
    amount,
    currency,
    product,
    correlationId,
  })

  // Step 3: Notify patient that their appointment booking flow is ready (fire-and-forget)
  if (activated) {
    notificationService.serviceActivated({
      subjectRef,
      tenantId,
      plan: product,
      correlationId,
    })
  }

  logger.info(
    { correlationId, intentId, subjectRef, activated },
    'PaymentConfirmed pipeline complete',
  )
}

// ── Registration ───────────────────────────────────────────────────

let registered = false

export function registerPaymentPipeline(): void {
  if (registered) return
  registered = true

  eventBus.subscribe<PaymentConfirmedEvent>('PaymentConfirmed', handlePaymentConfirmed)

  logger.info('Payment pipeline registered (PaymentConfirmed → activation + notification)')
}
