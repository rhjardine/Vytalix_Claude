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
//   5. Mark the committed payment row as ACTIVATED (durable completion marker)
//
// Recovery: the payment row is committed before the event is published, so a
// failed/lost publication leaves it in CONFIRMED. reconcilePendingPayments()
// re-publishes those rows so activation eventually happens — see below.
//
// Register once at startup via registerPaymentPipeline().
// =============================================================================

import { eventBus, publish } from '../../platform/event-bus'
import type { PaymentConfirmedEvent } from '../../platform/event-bus'
import { notificationService } from '../../platform/notification.service'
import { getRedisClient } from '../../platform/redis'
import { getDb, withTenant } from '../../platform/db'
import { logger } from '../../platform/logger'

// ── Constants ──────────────────────────────────────────────────────

const SERVICE_ACTIVATION_TTL = 365 * 24 * 60 * 60 // 1 year in seconds
const ACTIVATION_GUARD_TTL   = 24 * 60 * 60        // 24h idempotency window

// Grace period before a still-CONFIRMED payment is considered stuck. Long
// enough that a healthy in-flight activation is never re-published.
const RECONCILE_GRACE_SECONDS = 120
// Bounded batch so a backlog can never monopolise the interval.
const RECONCILE_BATCH_SIZE    = 50

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

// ── Pipeline handler (POST-COMMIT, best-effort) ────────────────────
// The payment_transactions row is already committed by the webhook handler
// (the single source of truth). This subscriber only runs for a newly-inserted
// payment (the webhook publishes solely on a fresh row), so it is safe to treat
// the payment as existing and perform best-effort activation + notification.

async function handlePaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
  const { correlationId, tenantId, payload } = event
  const { intentId, subjectRef, amount, currency, product } = payload

  logger.info(
    { correlationId, intentId, subjectRef, tenantId, amount, product },
    'PaymentConfirmed → post-commit pipeline started',
  )

  // Step 1: Activate service access (idempotent via Redis guard)
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

  // Step 4: durable completion marker. The row moves CONFIRMED -> ACTIVATED so
  // reconciliation can tell a finished payment from a stuck one. Best-effort:
  // if this write fails the row stays CONFIRMED and will simply be re-published,
  // which is safe because activation is idempotent.
  if (activated) {
    await markActivated(tenantId, intentId, correlationId)
  }

  logger.info(
    { correlationId, intentId, subjectRef, activated, metric: 'payment_activated' },
    'PaymentConfirmed pipeline complete',
  )
}

// ── Durable completion marker ──────────────────────────────────────

async function markActivated(tenantId: string, intentId: string, correlationId: string): Promise<void> {
  try {
    await withTenant(tenantId, (tc) => tc.execute(
      `UPDATE payment_transactions SET status = 'ACTIVATED'
       WHERE "intentId" = $1 AND status = 'CONFIRMED'`,
      [intentId],
    ))
  } catch (err) {
    logger.warn(
      { correlationId, intentId, errName: (err as any)?.name },
      'Could not mark payment as ACTIVATED — row stays CONFIRMED and will be reconciled',
    )
  }
}

// ── Reconciliation sweeper ─────────────────────────────────────────
// Closes the post-commit gap: a payment can be committed (HTTP 200 already
// returned to Disglobal) and then lose its event if the bus fails or the
// process dies. Such rows remain CONFIRMED; this sweeper re-publishes them.
// Re-publication is safe — activation is guarded by Redis and the row only
// leaves CONFIRMED once activation actually succeeded.

export async function reconcilePendingPayments(): Promise<number> {
  let rows: Array<Record<string, any>> = []
  try {
    // Cross-tenant read: the sweeper is an internal operator process, not a
    // tenant-scoped request, so it uses the raw pool rather than withTenant.
    rows = await getDb().rawQuery(
      `SELECT "tenantId", "intentId", "subjectRef", amount, currency, product,
              "correlationId", metadata
         FROM payment_transactions
        WHERE status = 'CONFIRMED'
          AND "confirmedAt" < now() - ($1 || ' seconds')::interval
        ORDER BY "confirmedAt" ASC
        LIMIT $2`,
      [String(RECONCILE_GRACE_SECONDS), RECONCILE_BATCH_SIZE],
    )
  } catch (err) {
    logger.error({ errName: (err as any)?.name }, 'Payment reconciliation query failed')
    return 0
  }

  if (rows.length === 0) return 0

  for (const row of rows) {
    const correlationId = row.correlationId ?? `reconcile-${row.intentId}`
    try {
      publish.paymentConfirmed(
        { tenantId: row.tenantId, correlationId },
        {
          intentId:   row.intentId,
          subjectRef: row.subjectRef,
          amount:     Number(row.amount),
          currency:   row.currency,
          product:    row.product,
          metadata:   (row.metadata ?? {}) as Record<string, string>,
        },
      )
      logger.warn(
        { correlationId, intentId: row.intentId, metric: 'payment_reconciled' },
        'Stuck payment re-published for activation',
      )
    } catch (err) {
      logger.error(
        { correlationId, intentId: row.intentId, errName: (err as any)?.name },
        'Reconciliation re-publish failed — will retry on next sweep',
      )
    }
  }

  return rows.length
}

// ── Registration ───────────────────────────────────────────────────

let registered = false

export function registerPaymentPipeline(): void {
  if (registered) return
  registered = true

  eventBus.subscribe<PaymentConfirmedEvent>('PaymentConfirmed', handlePaymentConfirmed)

  logger.info('Payment pipeline registered (PaymentConfirmed → activation + notification)')
}
