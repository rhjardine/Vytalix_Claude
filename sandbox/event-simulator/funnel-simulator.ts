// =============================================================================
// funnel-simulator.ts — Deterministic full funnel simulation
//
// Given the same ClinicalFlowInput, always produces the same event sequence
// and the same transition outcomes. No randomness in the flow logic.
// =============================================================================

import { EventChainBuilder } from './event-chain'
import type { BiometricMeasurements, ClinicalFlowInput, FunnelState } from '../types'

export class FunnelSimulator {
  simulate(input: ClinicalFlowInput): FunnelState {
    const builder = new EventChainBuilder(input.sessionId, input.subjectRef)

    const bioAge = estimateBioAge(input.chronologicalAge, input.measurements)

    builder
      .emit('ASSESSMENT_STARTED', {
        chronologicalAge: input.chronologicalAge,
        biologicalSex: input.biologicalSex,
      })
      .emit('SCAN_COMPLETED', {
        measurements: input.measurements,
        scanQuality: 'HIGH',
      })
      .emit('QUESTIONNAIRE_SUBMITTED', {
        isSmoker: false,
        hasDiabetes: false,
        isOnMedication: false,
      })
      .emit('EVALUATION_COMPLETE', {
        biologicalAge: bioAge,
        ageDifferential: bioAge - input.chronologicalAge,
        ageStatus: ageStatus(bioAge, input.chronologicalAge),
        preventiveScore: 72,
      })
      .emit('PAYMENT_INITIATED', {
        amount: 149900,
        currency: 'MXN',
        product: 'LONGEVITY_CHECKUP',
      })
      .emit('PAYMENT_CONFIRMED', {
        transactionId: `txn_${input.sessionId.slice(-8)}`,
        paidAt: new Date().toISOString(),
      })
      .emit('APPOINTMENT_BOOKED', {
        appointmentId: `appt_${input.sessionId.slice(-8)}`,
        specialty: 'PREVENTIVE',
      })
      .emit('SERVICE_ACTIVATED', {
        activatedAt: new Date().toISOString(),
        plan: 'LONGEVITY_BASIC',
      })

    return builder.build()
  }
}

function estimateBioAge(chronologicalAge: number, m: BiometricMeasurements): number {
  const delta =
    (m.bmi - 22) * 0.3 +
    (m.fatPercentage - 20) * 0.2 +
    (m.systolicPressure - 120) * 0.05
  return Math.round(chronologicalAge + delta)
}

function ageStatus(bioAge: number, chronologicalAge: number): 'REJUVENATED' | 'NORMAL' | 'AGED' {
  const delta = bioAge - chronologicalAge
  if (delta < -2) return 'REJUVENATED'
  if (delta > 2) return 'AGED'
  return 'NORMAL'
}
