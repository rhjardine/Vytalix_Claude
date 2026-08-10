// =============================================================================
// event-chain.ts — Deterministic event chain builder
//
// Enforces the valid transition table for the Disglobal funnel.
// Any out-of-order emit marks the chain as aborted and subsequent emits are
// no-ops — the broken state propagates forward without throwing.
// =============================================================================

import crypto from 'node:crypto'
import type { FunnelEvent, FunnelEventType, FunnelState } from '../types'

const VALID_TRANSITIONS: Readonly<Record<FunnelEventType, FunnelEventType | null>> = {
  ASSESSMENT_STARTED:      'SCAN_COMPLETED',
  SCAN_COMPLETED:          'QUESTIONNAIRE_SUBMITTED',
  QUESTIONNAIRE_SUBMITTED: 'EVALUATION_COMPLETE',
  EVALUATION_COMPLETE:     'PAYMENT_INITIATED',
  PAYMENT_INITIATED:       'PAYMENT_CONFIRMED',
  PAYMENT_CONFIRMED:       'APPOINTMENT_BOOKED',
  APPOINTMENT_BOOKED:      'SERVICE_ACTIVATED',
  SERVICE_ACTIVATED:       null,
}

const FULL_SEQUENCE: readonly FunnelEventType[] = [
  'ASSESSMENT_STARTED',
  'SCAN_COMPLETED',
  'QUESTIONNAIRE_SUBMITTED',
  'EVALUATION_COMPLETE',
  'PAYMENT_INITIATED',
  'PAYMENT_CONFIRMED',
  'APPOINTMENT_BOOKED',
  'SERVICE_ACTIVATED',
]

export class EventChainBuilder {
  private readonly events: FunnelEvent[] = []
  private aborted = false
  private abortReason?: string

  constructor(
    private readonly sessionId: string,
    private readonly subjectRef: string,
  ) {}

  emit(type: FunnelEventType, payload: Record<string, unknown> = {}): this {
    if (this.aborted) return this

    const lastEvent = this.events[this.events.length - 1]

    if (!lastEvent) {
      if (type !== 'ASSESSMENT_STARTED') {
        this.aborted = true
        this.abortReason = `Chain must begin with ASSESSMENT_STARTED, got: ${type}`
        return this
      }
    } else {
      const expected = VALID_TRANSITIONS[lastEvent.type]
      if (expected !== type) {
        this.aborted = true
        this.abortReason = `Invalid transition: ${lastEvent.type} → ${type} (expected: ${expected ?? 'END'})`
        return this
      }
    }

    this.events.push({
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      subjectRef: this.subjectRef,
      payload,
    })

    return this
  }

  build(): FunnelState {
    const lastEvent = this.events[this.events.length - 1]
    const completed = !this.aborted && lastEvent?.type === 'SERVICE_ACTIVATED'

    return {
      sessionId: this.sessionId,
      subjectRef: this.subjectRef,
      events: [...this.events],
      completed,
      aborted: this.aborted,
      abortReason: this.abortReason,
    }
  }

  static validateTransition(from: FunnelEventType, to: FunnelEventType): boolean {
    return VALID_TRANSITIONS[from] === to
  }

  static fullSequence(): readonly FunnelEventType[] {
    return FULL_SEQUENCE
  }
}
