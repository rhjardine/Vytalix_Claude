// =============================================================================
// Disglobal Integration Sandbox — Core Contracts
//
// These types mirror openapi/vytalix-platform-v2.yaml and openapi/dental-api-v2.yaml
// without importing any production implementation. Zero coupling to src/.
// =============================================================================

export type FunnelEventType =
  | 'ASSESSMENT_STARTED'
  | 'SCAN_COMPLETED'
  | 'QUESTIONNAIRE_SUBMITTED'
  | 'EVALUATION_COMPLETE'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_CONFIRMED'
  | 'APPOINTMENT_BOOKED'
  | 'SERVICE_ACTIVATED'

export interface FunnelEvent {
  readonly id: string
  readonly type: FunnelEventType
  readonly timestamp: string
  readonly sessionId: string
  readonly subjectRef: string
  readonly payload: Record<string, unknown>
}

export interface FunnelState {
  readonly sessionId: string
  readonly subjectRef: string
  readonly events: readonly FunnelEvent[]
  readonly completed: boolean
  readonly aborted: boolean
  readonly abortReason?: string
}

// ── Disglobal → Vytalix request contracts (from OpenAPI spec) ─────────────────

export interface CheckoutRequest {
  readonly sessionId: string
  readonly subjectRef: string
  readonly tenantId: string
  readonly amount: number     // minor units (centavos)
  readonly currency: string
  readonly description: string
  readonly idempotencyKey: string
}

export interface CheckoutResponse {
  readonly checkoutId: string
  readonly status: 'CREATED' | 'FAILED'
  readonly paymentIntentId: string
  readonly redirectUrl: string
}

export interface PaymentIntentRequest {
  readonly checkoutId: string
  readonly subjectRef: string
  readonly amount: number
  readonly currency: string
  readonly metadata: Record<string, string>
}

export interface PaymentIntentResponse {
  readonly intentId: string
  readonly status: PaymentStatus
  readonly clientSecret: string
}

export interface WebhookTriggerRequest {
  readonly intentId: string
  readonly eventType: WebhookEventType
  readonly metadata: Record<string, string>
}

export interface WebhookTriggerResponse {
  readonly delivered: boolean
  readonly deliveredAt: string
}

// ── Payment types ──────────────────────────────────────────────────────────────

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED'
export type WebhookEventType = 'payment.confirmed' | 'payment.failed' | 'payment.refunded'

export interface PaymentIntent {
  readonly intentId: string
  readonly amount: number
  readonly currency: string
  readonly status: PaymentStatus
  readonly createdAt: string
  readonly confirmedAt?: string
  readonly subjectRef: string
  readonly metadata: Record<string, string>
}

export interface WebhookPayload {
  readonly event: WebhookEventType
  readonly intentId: string
  readonly amount: number
  readonly currency: string
  readonly timestamp: string
  readonly subjectRef: string
  readonly metadata: Record<string, string>
  readonly signature: string
}

// ── Clinical flow types ────────────────────────────────────────────────────────

export interface ClinicalFlowInput {
  readonly subjectRef: string
  readonly sessionId: string
  readonly chronologicalAge: number
  readonly biologicalSex: 'MALE' | 'FEMALE'
  readonly measurements: BiometricMeasurements
}

export interface BiometricMeasurements {
  readonly fatPercentage: number
  readonly bmi: number
  readonly systolicPressure: number
  readonly diastolicPressure: number
  readonly skinHydration: number
  readonly visualAccommodation: number
  readonly digitalReflexes: Dimensional
  readonly staticBalance: Dimensional
}

export interface Dimensional {
  readonly high: number
  readonly long: number
  readonly width: number
}

export interface ClinicalFlowResult {
  readonly sessionId: string
  readonly subjectRef: string
  readonly steps: readonly FlowStep[]
  readonly finalStatus: 'COMPLETED' | 'ABORTED' | 'PARTIAL'
  readonly serviceActivated: boolean
  readonly appointmentId?: string
  readonly totalDurationMs: number
}

export interface FlowStep {
  readonly name: string
  readonly status: 'SUCCESS' | 'SKIPPED' | 'FAILED'
  readonly durationMs: number
  readonly output?: Record<string, unknown>
  readonly error?: string
}

export type SandboxResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code: number }
