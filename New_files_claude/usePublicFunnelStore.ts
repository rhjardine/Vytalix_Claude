// =============================================================================
// src/store/usePublicFunnelStore.ts
// Estado global del funnel de captación público.
//
// DECISIONES DE DISEÑO:
//   - sessionStorage (no localStorage): datos de una sesión, no permanentes
//   - partialize: solo persisten resultados, no estado transitorio de UI
//   - setVitalityResult auto-avanza el step a 'results'
//   - setBookingResult auto-avanza el step a 'confirmed'
//   - reset() limpia resultados pero NO el exchangeRate (costoso de refetch)
// =============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  VitalityAssessmentResult,
  FacialAnalysisResult,
  BookingResponse,
  ExchangeRateData,
  FunnelStep,
} from '@/types/funnel'

// ─── State shape ─────────────────────────────────────────────────

interface FunnelState {
  // Resultados de tests
  vitalityResult: VitalityAssessmentResult | null
  facialResult:   FacialAnalysisResult | null

  // IDs del servidor (para correlación cruzada lead↔assessment)
  leadId:        string | null
  assessmentId:  string | null
  bookingResult: BookingResponse | null

  // Paso actual del journey
  step: FunnelStep

  // Cache de tasa de cambio (no se persiste — refetch on mount)
  exchangeRate: ExchangeRateData | null

  // Loading flags por operación
  isSubmittingLead:       boolean
  isSubmittingAssessment: boolean
  isAnalyzingFacial:      boolean
  isBooking:              boolean

  // ─── Actions ───────────────────────────────────────────────────

  setVitalityResult:  (r: VitalityAssessmentResult) => void
  setFacialResult:    (r: FacialAnalysisResult)     => void
  setLeadId:          (id: string)                  => void
  setAssessmentId:    (id: string)                  => void
  setBookingResult:   (r: BookingResponse)          => void
  setStep:            (s: FunnelStep)               => void
  setExchangeRate:    (r: ExchangeRateData)         => void

  setIsSubmittingLead:       (v: boolean) => void
  setIsSubmittingAssessment: (v: boolean) => void
  setIsAnalyzingFacial:      (v: boolean) => void
  setIsBooking:              (v: boolean) => void

  // Reset limpia resultados y step, pero preserva exchangeRate
  reset: () => void
}

// ─── Default state (extracted for reset) ─────────────────────────

const DEFAULT_STATE = {
  vitalityResult: null,
  facialResult:   null,
  leadId:         null,
  assessmentId:   null,
  bookingResult:  null,
  step:           'landing' as FunnelStep,
  isSubmittingLead:       false,
  isSubmittingAssessment: false,
  isAnalyzingFacial:      false,
  isBooking:              false,
}

// ─── Store ───────────────────────────────────────────────────────

export const usePublicFunnelStore = create<FunnelState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      exchangeRate: null,

      // setVitalityResult: guarda resultado Y avanza el step
      setVitalityResult: (r) => set({
        vitalityResult: r,
        step: 'results',
        isSubmittingAssessment: false,
      }),

      setFacialResult: (r) => set({
        facialResult: r,
        isAnalyzingFacial: false,
      }),

      setLeadId:       (id) => set({ leadId: id }),
      setAssessmentId: (id) => set({ assessmentId: id }),

      // setBookingResult: guarda resultado Y avanza al paso final
      setBookingResult: (r) => set({
        bookingResult: r,
        step: 'confirmed',
        isBooking: false,
      }),

      setStep:         (s) => set({ step: s }),
      setExchangeRate: (r) => set({ exchangeRate: r }),

      setIsSubmittingLead:       (v) => set({ isSubmittingLead: v }),
      setIsSubmittingAssessment: (v) => set({ isSubmittingAssessment: v }),
      setIsAnalyzingFacial:      (v) => set({ isAnalyzingFacial: v }),
      setIsBooking:              (v) => set({ isBooking: v }),

      // reset: limpia resultados, preserva exchangeRate (no re-fetch)
      reset: () => set({
        ...DEFAULT_STATE,
        exchangeRate: get().exchangeRate,
      }),
    }),
    {
      name:    'vytalix-funnel-v1',
      storage: createJSONStorage(() => sessionStorage),
      // SOLO persistir resultados clínicos y IDs de servidor
      // NO persistir: loading flags, step, exchangeRate
      partialize: (s) => ({
        vitalityResult: s.vitalityResult,
        facialResult:   s.facialResult,
        leadId:         s.leadId,
        assessmentId:   s.assessmentId,
      }),
    }
  )
)

// ─── Selectors derivados (usar en componentes) ────────────────────

/** true si el usuario completó el test celular en esta sesión */
export const selectHasVitalityResult = (s: FunnelState) =>
  s.vitalityResult !== null

/** true si el usuario tiene un score suficientemente bajo para mostrar urgencia */
export const selectIsHighRisk = (s: FunnelState) =>
  s.vitalityResult !== null &&
  (s.vitalityResult.category === 'CRITICO' || s.vitalityResult.category === 'REGULAR')

/** Años de diferencia entre edad biológica y cronológica (positivo = envejecimiento acelerado) */
export const selectBioAgeDelta = (s: FunnelState): number | null => {
  if (!s.vitalityResult) return null
  const groupMap: Record<string, number> = { '45': 45, '59': 59, '69': 69, '78': 78 }
  const chrono = groupMap[s.vitalityResult.chronologicalAgeGroup] ?? 55
  return s.vitalityResult.yearsBiological - chrono
}
