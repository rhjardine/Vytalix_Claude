// =============================================================================
// flow-runner.ts — End-to-end clinical flow orchestrator
//
// Connects all sandbox components in sequence:
//   FUNNEL_SIMULATION → CHECKOUT → PAYMENT_INTENT → PAYMENT_CONFIRMATION
//   → WEBHOOK_DELIVERY → SERVICE_ACTIVATION → APPOINTMENT_BOOKING
//
// Every step is pure in-process — no HTTP, no DB, no external I/O.
// A failed step sets result to ABORTED and short-circuits remaining steps.
// =============================================================================

import { DisgglobalEmulator } from '../mock-server/disglobal-emulator'
import { FunnelSimulator } from '../event-simulator/funnel-simulator'
import { FakePaymentGateway } from '../fake-payment-gateway/payment-intent'
import { buildWebhookPayload, verifyWebhookSignature } from '../fake-payment-gateway/webhook-dispatcher'
import type { ClinicalFlowInput, ClinicalFlowResult, FlowStep } from '../types'

const CHECKOUT_AMOUNT = 149900
const CHECKOUT_CURRENCY = 'MXN'
const SANDBOX_TENANT = 'tenant-sandbox-001'

export class FlowRunner {
  private readonly emulator = new DisgglobalEmulator()
  private readonly funnelSimulator = new FunnelSimulator()
  private readonly gateway = new FakePaymentGateway()

  async runFullFunnel(input: ClinicalFlowInput): Promise<ClinicalFlowResult> {
    const startMs = Date.now()
    const steps: FlowStep[] = []
    let serviceActivated = false
    let appointmentId: string | undefined

    // Step 1 — Funnel simulation (assessment → evaluation)
    const funnelState = await this.step(steps, 'FUNNEL_SIMULATION', () => {
      const state = this.funnelSimulator.simulate(input)
      if (state.aborted) throw new Error(state.abortReason)
      return { eventCount: state.events.length, completed: state.completed }
    })
    if (!funnelState) return this.result(input, steps, 'ABORTED', serviceActivated, appointmentId, startMs)

    // Step 2 — Checkout
    const checkout = await this.step(steps, 'CHECKOUT', () => {
      const res = this.emulator.checkout({
        sessionId: input.sessionId,
        subjectRef: input.subjectRef,
        tenantId: SANDBOX_TENANT,
        amount: CHECKOUT_AMOUNT,
        currency: CHECKOUT_CURRENCY,
        description: 'Longevity Checkup — Disglobal Marketplace',
        idempotencyKey: `idem-${input.sessionId}`,
      })
      if (!res.ok) throw new Error(res.error)
      return res.data
    })
    if (!checkout) return this.result(input, steps, 'ABORTED', serviceActivated, appointmentId, startMs)

    // Step 3 — Payment intent
    const intentResult = await this.step(steps, 'PAYMENT_INTENT', () => {
      const res = this.emulator.paymentIntent({
        checkoutId: checkout.checkoutId,
        subjectRef: input.subjectRef,
        amount: CHECKOUT_AMOUNT,
        currency: CHECKOUT_CURRENCY,
        metadata: { sessionId: input.sessionId, product: 'LONGEVITY_CHECKUP' },
      })
      if (!res.ok) throw new Error(res.error)
      return res.data
    })
    if (!intentResult) return this.result(input, steps, 'ABORTED', serviceActivated, appointmentId, startMs)

    // Step 4 — Gateway: create + confirm (fires webhook synchronously)
    let webhookDelivered = false
    let webhookSignatureValid = false

    const gatewayIntent = await this.step(steps, 'PAYMENT_CONFIRMATION', () => {
      const created = this.gateway.create({
        amount: CHECKOUT_AMOUNT,
        currency: CHECKOUT_CURRENCY,
        subjectRef: input.subjectRef,
        metadata: { sessionId: input.sessionId },
      })

      this.gateway.onWebhook((confirmed) => {
        const payload = buildWebhookPayload(confirmed)
        webhookDelivered = true
        webhookSignatureValid = verifyWebhookSignature(payload)
      })

      const confirmed = this.gateway.confirm(created.intentId)
      return { intentId: confirmed.intentId, status: confirmed.status }
    })
    if (!gatewayIntent) return this.result(input, steps, 'ABORTED', serviceActivated, appointmentId, startMs)

    // Step 5 — Webhook delivery validation
    await this.step(steps, 'WEBHOOK_DELIVERY', () => {
      if (!webhookDelivered) throw new Error('Webhook was not delivered after payment confirmation')
      if (!webhookSignatureValid) throw new Error('Webhook HMAC signature verification failed')
      return { delivered: true, signatureValid: true }
    })

    // Step 6 — Service activation
    await this.step(steps, 'SERVICE_ACTIVATION', () => {
      serviceActivated = true
      return { activatedAt: new Date().toISOString(), plan: 'LONGEVITY_BASIC' }
    })

    // Step 7 — Appointment booking
    await this.step(steps, 'APPOINTMENT_BOOKING', () => {
      appointmentId = `appt_${input.sessionId.slice(-8)}_sandbox`
      return { appointmentId, specialty: 'PREVENTIVE' }
    })

    const allSucceeded = steps.every(s => s.status === 'SUCCESS')
    return this.result(
      input, steps,
      allSucceeded ? 'COMPLETED' : 'PARTIAL',
      serviceActivated, appointmentId, startMs,
    )
  }

  private async step<T>(
    steps: FlowStep[],
    name: string,
    fn: () => T | Promise<T>,
  ): Promise<T | null> {
    const t0 = Date.now()
    try {
      const output = await fn()
      steps.push({ name, status: 'SUCCESS', durationMs: Date.now() - t0, output: output as Record<string, unknown> })
      return output
    } catch (err) {
      steps.push({ name, status: 'FAILED', durationMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  private result(
    input: ClinicalFlowInput,
    steps: FlowStep[],
    finalStatus: ClinicalFlowResult['finalStatus'],
    serviceActivated: boolean,
    appointmentId: string | undefined,
    startMs: number,
  ): ClinicalFlowResult {
    return {
      sessionId: input.sessionId,
      subjectRef: input.subjectRef,
      steps,
      finalStatus,
      serviceActivated,
      appointmentId,
      totalDurationMs: Date.now() - startMs,
    }
  }
}
