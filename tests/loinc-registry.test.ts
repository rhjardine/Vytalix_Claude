// =============================================================================
// Unit Tests — LOINC Registry + Observation Validation
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  getLoincEntry,
  isSupportedLoinc,
  normalizeUnit,
  validateObservationValue,
} from '../src/core/loinc-registry'

describe('LOINC Registry', () => {
  describe('isSupportedLoinc', () => {
    it('returns true for known LOINC codes', () => {
      expect(isSupportedLoinc('2089-1')).toBe(true)  // LDL
      expect(isSupportedLoinc('8480-6')).toBe(true)  // Systolic BP
      expect(isSupportedLoinc('2345-7')).toBe(true)  // Fasting Glucose
    })

    it('returns false for unknown codes', () => {
      expect(isSupportedLoinc('9999-9')).toBe(false)
      expect(isSupportedLoinc('')).toBe(false)
    })
  })

  describe('normalizeUnit', () => {
    it('converts LDL mmol/L to mg/dL', () => {
      const result = normalizeUnit('2089-1', 5.51, 'mmol/L')
      expect(result.normalizedValue).toBeCloseTo(213.0, 0)
      expect(result.normalizedUnit).toBe('mg/dL')
      expect(result.conversionApplied).toBe(true)
    })

    it('does not convert when already in canonical unit', () => {
      const result = normalizeUnit('2089-1', 213.0, 'mg/dL')
      expect(result.normalizedValue).toBe(213.0)
      expect(result.conversionApplied).toBe(false)
    })

    it('converts glucose mmol/L to mg/dL correctly', () => {
      const result = normalizeUnit('2345-7', 5.55, 'mmol/L')
      expect(result.normalizedValue).toBeCloseTo(100.0, 0)
      expect(result.normalizedUnit).toBe('mg/dL')
    })

    it('converts creatinine μmol/L to mg/dL', () => {
      const result = normalizeUnit('2160-0', 88.4, 'μmol/L')
      expect(result.normalizedValue).toBeCloseTo(1.0, 1)
    })

    it('handles unknown unit gracefully — returns value unchanged', () => {
      const result = normalizeUnit('2089-1', 213.0, 'unknown_unit')
      expect(result.normalizedValue).toBe(213.0)
      expect(result.conversionApplied).toBe(false)
    })

    it('returns unchanged for unknown LOINC code', () => {
      const result = normalizeUnit('9999-9', 100.0, 'mg/dL')
      expect(result.normalizedValue).toBe(100.0)
      expect(result.conversionApplied).toBe(false)
    })
  })

  describe('validateObservationValue', () => {
    // ── LDL (2089-1): physiological range 10–800 mg/dL ──
    it('accepts normal LDL value', () => {
      const result = validateObservationValue('2089-1', 130, 'mg/dL')
      expect(result.valid).toBe(true)
    })

    it('rejects LDL below physiological minimum', () => {
      const result = validateObservationValue('2089-1', 5, 'mg/dL')
      expect(result.valid).toBe(false)
      expect(result.valid === false && result.code).toBe('BELOW_PHYSIOLOGICAL_MIN')
    })

    it('rejects LDL above physiological maximum', () => {
      const result = validateObservationValue('2089-1', 850, 'mg/dL')
      expect(result.valid).toBe(false)
      expect(result.valid === false && result.code).toBe('ABOVE_PHYSIOLOGICAL_MAX')
    })

    it('produces warning for clinically high LDL (>300)', () => {
      const result = validateObservationValue('2089-1', 320, 'mg/dL')
      expect(result.valid).toBe(true)
      expect(result.valid && result.warnings.some((w) => w.includes('VALUE_NEAR_CLINICAL_HIGH'))).toBe(true)
    })

    // ── Blood pressure ──
    it('accepts normal systolic BP', () => {
      const result = validateObservationValue('8480-6', 120, 'mmHg')
      expect(result.valid).toBe(true)
    })

    it('rejects impossibly high systolic BP', () => {
      const result = validateObservationValue('8480-6', 300, 'mmHg')
      expect(result.valid).toBe(false)
    })

    it('rejects impossibly low systolic BP', () => {
      const result = validateObservationValue('8480-6', 20, 'mmHg')
      expect(result.valid).toBe(false)
    })

    // ── Fasting glucose ──
    it('accepts prediabetic glucose range', () => {
      const result = validateObservationValue('2345-7', 110, 'mg/dL')
      expect(result.valid).toBe(true)
    })

    // ── Unit conversion in validation ──
    it('validates mmol/L by converting to mg/dL first', () => {
      // 5.51 mmol/L = ~213 mg/dL — within bounds
      const result = validateObservationValue('2089-1', 5.51, 'mmol/L')
      expect(result.valid).toBe(true)
    })

    it('rejects physiologically impossible value in mmol/L', () => {
      // 60 mmol/L LDL = ~2320 mg/dL — impossible
      const result = validateObservationValue('2089-1', 60, 'mmol/L')
      expect(result.valid).toBe(false)
    })

    // ── Unknown LOINC (passthrough) ──
    it('passes unknown LOINC codes with a warning', () => {
      const result = validateObservationValue('9999-9', 42, 'unit')
      expect(result.valid).toBe(true)
      expect(result.valid && result.warnings.length).toBeGreaterThan(0)
    })
  })
})
