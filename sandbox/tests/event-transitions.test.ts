import { describe, it, expect } from 'vitest'
import { EventChainBuilder } from '../event-simulator/event-chain'
import { FunnelSimulator } from '../event-simulator/funnel-simulator'
import type { ClinicalFlowInput } from '../types'

const STANDARD_INPUT: ClinicalFlowInput = {
  subjectRef: 'DISG-transition-001',
  sessionId: 'session-transition-001',
  chronologicalAge: 45,
  biologicalSex: 'MALE',
  measurements: {
    fatPercentage: 22.0,
    bmi: 26.0,
    systolicPressure: 125,
    diastolicPressure: 80,
    skinHydration: 58.0,
    visualAccommodation: 7.5,
    digitalReflexes: { high: 1.1, long: 2.0, width: 0.9 },
    staticBalance: { high: 1.4, long: 2.2, width: 1.1 },
  },
}

describe('Disglobal Integration Sandbox — Event Transitions', () => {
  describe('EventChainBuilder', () => {
    it('builds a complete valid chain through all 8 events', () => {
      const state = new EventChainBuilder('sess-001', 'DISG-001')
        .emit('ASSESSMENT_STARTED')
        .emit('SCAN_COMPLETED')
        .emit('QUESTIONNAIRE_SUBMITTED')
        .emit('EVALUATION_COMPLETE')
        .emit('PAYMENT_INITIATED')
        .emit('PAYMENT_CONFIRMED')
        .emit('APPOINTMENT_BOOKED')
        .emit('SERVICE_ACTIVATED')
        .build()

      expect(state.completed).toBe(true)
      expect(state.aborted).toBe(false)
      expect(state.events).toHaveLength(8)
    })

    it('rejects a chain that skips events', () => {
      const state = new EventChainBuilder('sess-002', 'DISG-002')
        .emit('ASSESSMENT_STARTED')
        .emit('PAYMENT_INITIATED') // skips SCAN_COMPLETED, etc.
        .build()

      expect(state.aborted).toBe(true)
      expect(state.abortReason).toContain('Invalid transition')
      expect(state.completed).toBe(false)
    })

    it('rejects chains not starting with ASSESSMENT_STARTED', () => {
      const state = new EventChainBuilder('sess-003', 'DISG-003')
        .emit('SCAN_COMPLETED')
        .build()

      expect(state.aborted).toBe(true)
      expect(state.abortReason).toContain('ASSESSMENT_STARTED')
      expect(state.completed).toBe(false)
    })

    it('no-ops all emits after an abort', () => {
      const state = new EventChainBuilder('sess-004', 'DISG-004')
        .emit('ASSESSMENT_STARTED')
        .emit('PAYMENT_INITIATED') // abort here
        .emit('PAYMENT_CONFIRMED') // no-op
        .emit('SERVICE_ACTIVATED') // no-op
        .build()

      expect(state.aborted).toBe(true)
      expect(state.events).toHaveLength(1) // only ASSESSMENT_STARTED committed
    })

    it('is incomplete without SERVICE_ACTIVATED', () => {
      const state = new EventChainBuilder('sess-005', 'DISG-005')
        .emit('ASSESSMENT_STARTED')
        .emit('SCAN_COMPLETED')
        .build()

      expect(state.completed).toBe(false)
      expect(state.aborted).toBe(false) // not aborted, just incomplete
    })

    it('payload is stored on each emitted event', () => {
      const state = new EventChainBuilder('sess-006', 'DISG-006')
        .emit('ASSESSMENT_STARTED', { chronologicalAge: 42, biologicalSex: 'FEMALE' })
        .build()

      expect(state.events[0]?.payload.chronologicalAge).toBe(42)
      expect(state.events[0]?.payload.biologicalSex).toBe('FEMALE')
    })

    it('each event has a unique id and a timestamp', () => {
      const state = new EventChainBuilder('sess-007', 'DISG-007')
        .emit('ASSESSMENT_STARTED')
        .emit('SCAN_COMPLETED')
        .build()

      const ids = new Set(state.events.map(e => e.id))
      expect(ids.size).toBe(state.events.length)
      for (const e of state.events) {
        expect(e.timestamp).toBeTruthy()
      }
    })

    it('static validateTransition approves all sequential pairs', () => {
      const seq = EventChainBuilder.fullSequence()
      for (let i = 0; i < seq.length - 1; i++) {
        expect(EventChainBuilder.validateTransition(seq[i]!, seq[i + 1]!)).toBe(true)
      }
    })

    it('static validateTransition rejects skip-one transitions', () => {
      const seq = EventChainBuilder.fullSequence()
      for (let i = 0; i < seq.length - 2; i++) {
        expect(EventChainBuilder.validateTransition(seq[i]!, seq[i + 2]!)).toBe(false)
      }
    })

    it('fullSequence has 8 events in correct order', () => {
      const seq = EventChainBuilder.fullSequence()
      expect(seq).toHaveLength(8)
      expect(seq[0]).toBe('ASSESSMENT_STARTED')
      expect(seq[seq.length - 1]).toBe('SERVICE_ACTIVATED')
    })
  })

  describe('FunnelSimulator', () => {
    it('produces a completed state for valid input', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)

      expect(state.completed).toBe(true)
      expect(state.aborted).toBe(false)
      expect(state.events).toHaveLength(8)
    })

    it('produces events in the canonical order', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const types = state.events.map(e => e.type)
      expect(types).toEqual(EventChainBuilder.fullSequence())
    })

    it('every event carries the correct sessionId and subjectRef', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      for (const event of state.events) {
        expect(event.sessionId).toBe(STANDARD_INPUT.sessionId)
        expect(event.subjectRef).toBe(STANDARD_INPUT.subjectRef)
      }
    })

    it('ASSESSMENT_STARTED payload contains chronologicalAge and biologicalSex', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const event = state.events.find(e => e.type === 'ASSESSMENT_STARTED')!
      expect(event.payload.chronologicalAge).toBe(45)
      expect(event.payload.biologicalSex).toBe('MALE')
    })

    it('SCAN_COMPLETED payload contains measurements', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const event = state.events.find(e => e.type === 'SCAN_COMPLETED')!
      expect(event.payload.measurements).toBeDefined()
    })

    it('EVALUATION_COMPLETE payload contains biologicalAge as a number', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const event = state.events.find(e => e.type === 'EVALUATION_COMPLETE')!
      expect(typeof event.payload.biologicalAge).toBe('number')
      expect(event.payload.biologicalAge).toBeGreaterThan(0)
    })

    it('PAYMENT_INITIATED payload has positive amount', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const event = state.events.find(e => e.type === 'PAYMENT_INITIATED')!
      expect(event.payload.amount).toBeGreaterThan(0)
      expect(event.payload.currency).toBe('MXN')
    })

    it('SERVICE_ACTIVATED payload contains plan field', () => {
      const state = new FunnelSimulator().simulate(STANDARD_INPUT)
      const event = state.events.find(e => e.type === 'SERVICE_ACTIVATED')!
      expect(event.payload.plan).toBeTruthy()
    })

    it('is deterministic — same input produces same event types and payloads', () => {
      const s1 = new FunnelSimulator().simulate(STANDARD_INPUT)
      const s2 = new FunnelSimulator().simulate(STANDARD_INPUT)

      expect(s1.completed).toBe(s2.completed)
      expect(s1.events.map(e => e.type)).toEqual(s2.events.map(e => e.type))
      expect(s1.events.map(e => e.payload)).toEqual(s2.events.map(e => e.payload))
    })
  })
})
