import { describe, it, expect } from 'vitest'
import { FlowRunner } from '../clinical-flow-tester/flow-runner'
import {
  assertFlowCompleted,
  assertServiceActivated,
  assertAppointmentBooked,
  assertNoFailedSteps,
  assertStepSucceeded,
} from '../clinical-flow-tester/assertions'
import type { ClinicalFlowInput } from '../types'

const BASE_INPUT: ClinicalFlowInput = {
  subjectRef: 'DISG-sandbox-test-001',
  sessionId: 'session-full-funnel-001',
  chronologicalAge: 42,
  biologicalSex: 'MALE',
  measurements: {
    fatPercentage: 18.5,
    bmi: 24.2,
    systolicPressure: 118,
    diastolicPressure: 76,
    skinHydration: 62.0,
    visualAccommodation: 8.5,
    digitalReflexes: { high: 1.2, long: 2.1, width: 0.8 },
    staticBalance: { high: 1.5, long: 2.3, width: 1.0 },
  },
}

describe('Disglobal Integration Sandbox — Full Funnel', () => {
  it('completes the full assessment-to-appointment funnel', async () => {
    const runner = new FlowRunner()
    const result = await runner.runFullFunnel(BASE_INPUT)

    assertFlowCompleted(result)
    assertServiceActivated(result)
    assertAppointmentBooked(result)
    assertNoFailedSteps(result)
  })

  it('produces all 7 required flow steps', async () => {
    const runner = new FlowRunner()
    const result = await runner.runFullFunnel(BASE_INPUT)

    const names = result.steps.map(s => s.name)
    expect(names).toContain('FUNNEL_SIMULATION')
    expect(names).toContain('CHECKOUT')
    expect(names).toContain('PAYMENT_INTENT')
    expect(names).toContain('PAYMENT_CONFIRMATION')
    expect(names).toContain('WEBHOOK_DELIVERY')
    expect(names).toContain('SERVICE_ACTIVATION')
    expect(names).toContain('APPOINTMENT_BOOKING')
    expect(names).toHaveLength(7)
  })

  it('service is activated only after payment confirmation', async () => {
    const runner = new FlowRunner()
    const result = await runner.runFullFunnel(BASE_INPUT)

    const paymentIdx = result.steps.findIndex(s => s.name === 'PAYMENT_CONFIRMATION')
    const activationIdx = result.steps.findIndex(s => s.name === 'SERVICE_ACTIVATION')

    expect(paymentIdx).toBeGreaterThan(-1)
    expect(activationIdx).toBeGreaterThan(paymentIdx)
    expect(result.serviceActivated).toBe(true)
  })

  it('webhook delivery step succeeds before service activation', async () => {
    const runner = new FlowRunner()
    const result = await runner.runFullFunnel(BASE_INPUT)

    const webhookIdx = result.steps.findIndex(s => s.name === 'WEBHOOK_DELIVERY')
    const activationIdx = result.steps.findIndex(s => s.name === 'SERVICE_ACTIVATION')

    assertStepSucceeded(result, 'WEBHOOK_DELIVERY')
    expect(activationIdx).toBeGreaterThan(webhookIdx)
  })

  it('is idempotent — same input produces same outcome across independent runners', async () => {
    const r1 = await new FlowRunner().runFullFunnel(BASE_INPUT)
    const r2 = await new FlowRunner().runFullFunnel(BASE_INPUT)

    expect(r1.finalStatus).toBe(r2.finalStatus)
    expect(r1.serviceActivated).toBe(r2.serviceActivated)
    expect(r1.steps.map(s => s.name)).toEqual(r2.steps.map(s => s.name))
    expect(r1.steps.map(s => s.status)).toEqual(r2.steps.map(s => s.status))
  })

  it('handles female subject through the full funnel', async () => {
    const input: ClinicalFlowInput = {
      ...BASE_INPUT,
      subjectRef: 'DISG-sandbox-test-002',
      sessionId: 'session-full-funnel-002',
      biologicalSex: 'FEMALE',
      chronologicalAge: 38,
      measurements: {
        ...BASE_INPUT.measurements,
        fatPercentage: 24.0,
        bmi: 22.1,
      },
    }

    const result = await new FlowRunner().runFullFunnel(input)

    assertFlowCompleted(result)
    assertServiceActivated(result)
    assertAppointmentBooked(result)
  })

  it('reports total duration in milliseconds', async () => {
    const result = await new FlowRunner().runFullFunnel(BASE_INPUT)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
  })

  it('each step reports its own duration', async () => {
    const result = await new FlowRunner().runFullFunnel(BASE_INPUT)
    for (const step of result.steps) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0)
    }
  })
})
