import type { ClinicalFlowResult, FunnelState } from '../types'

export function assertFlowCompleted(result: ClinicalFlowResult): void {
  if (result.finalStatus !== 'COMPLETED') {
    const failed = result.steps.filter(s => s.status === 'FAILED')
    const detail = failed.map(s => `${s.name}: ${s.error}`).join('; ')
    throw new Error(`Flow did not complete. Status: ${result.finalStatus}. ${detail}`)
  }
}

export function assertServiceActivated(result: ClinicalFlowResult): void {
  if (!result.serviceActivated) {
    throw new Error('Service was not activated after payment confirmation')
  }
}

export function assertAppointmentBooked(result: ClinicalFlowResult): void {
  if (!result.appointmentId) {
    throw new Error('No appointment was booked as part of the flow')
  }
}

export function assertNoFailedSteps(result: ClinicalFlowResult): void {
  const failed = result.steps.filter(s => s.status === 'FAILED')
  if (failed.length > 0) {
    const names = failed.map(s => `${s.name}: ${s.error}`).join('; ')
    throw new Error(`Failed steps: ${names}`)
  }
}

export function assertFunnelCompleted(state: FunnelState): void {
  if (state.aborted) {
    throw new Error(`Funnel aborted: ${state.abortReason}`)
  }
  if (!state.completed) {
    const last = state.events[state.events.length - 1]
    throw new Error(`Funnel incomplete. Last event: ${last?.type ?? 'none'}`)
  }
}

export function assertStepSucceeded(result: ClinicalFlowResult, stepName: string): void {
  const step = result.steps.find(s => s.name === stepName)
  if (!step) throw new Error(`Step not found: ${stepName}`)
  if (step.status !== 'SUCCESS') {
    throw new Error(`Step ${stepName} did not succeed: ${step.status}. ${step.error ?? ''}`)
  }
}
