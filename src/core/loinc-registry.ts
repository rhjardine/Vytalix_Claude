// =============================================================================
// LOINC Registry — canonical unit definitions and physiological bounds
// All clinical values must pass through this registry before persistence.
// Source of truth for unit conversions and validation thresholds.
// =============================================================================

export interface LoincEntry {
  code: string
  displayName: string
  canonicalUnit: string
  category: LoincCategory
  snapshotField?: string
  bounds: {
    physiologicalMin: number
    physiologicalMax: number
    clinicalAlertLow?: number
    clinicalAlertHigh?: number
  }
  unitConversions: UnitConversion[]
}

export interface UnitConversion {
  fromUnit: string
  toCanonical: (value: number) => number
  toCanonicalFormula: string
}

export type LoincCategory =
  | 'LIPIDS'
  | 'BLOOD_PRESSURE'
  | 'GLUCOSE'
  | 'BODY_METRICS'
  | 'RENAL'
  | 'THYROID'
  | 'INFLAMMATORY'

// ─────────────────────────────────────────────────────────────────
// Registry — 9 canonical codes for MVP cardiovascular domain
// ─────────────────────────────────────────────────────────────────
const registry: Record<string, LoincEntry> = {

  '2089-1': {
    code: '2089-1', displayName: 'LDL Cholesterol',
    canonicalUnit: 'mg/dL', category: 'LIPIDS', snapshotField: 'latestLdlMgDl',
    bounds: { physiologicalMin: 10, physiologicalMax: 800, clinicalAlertLow: 40, clinicalAlertHigh: 300 },
    unitConversions: [{
      fromUnit: 'mmol/L',
      toCanonical: (v) => parseFloat((v * 38.67).toFixed(1)),
      toCanonicalFormula: 'mg/dL = mmol/L × 38.67',
    }],
  },

  '2085-9': {
    code: '2085-9', displayName: 'HDL Cholesterol',
    canonicalUnit: 'mg/dL', category: 'LIPIDS', snapshotField: 'latestHdlMgDl',
    bounds: { physiologicalMin: 10, physiologicalMax: 200, clinicalAlertLow: 30, clinicalAlertHigh: 120 },
    unitConversions: [{
      fromUnit: 'mmol/L',
      toCanonical: (v) => parseFloat((v * 38.67).toFixed(1)),
      toCanonicalFormula: 'mg/dL = mmol/L × 38.67',
    }],
  },

  '2093-3': {
    code: '2093-3', displayName: 'Total Cholesterol',
    canonicalUnit: 'mg/dL', category: 'LIPIDS', snapshotField: 'latestTotalCholesterol',
    bounds: { physiologicalMin: 50, physiologicalMax: 1000, clinicalAlertLow: 100, clinicalAlertHigh: 400 },
    unitConversions: [{
      fromUnit: 'mmol/L',
      toCanonical: (v) => parseFloat((v * 38.67).toFixed(1)),
      toCanonicalFormula: 'mg/dL = mmol/L × 38.67',
    }],
  },

  '8480-6': {
    code: '8480-6', displayName: 'Systolic Blood Pressure',
    canonicalUnit: 'mmHg', category: 'BLOOD_PRESSURE', snapshotField: 'latestSystolicBp',
    bounds: { physiologicalMin: 50, physiologicalMax: 280, clinicalAlertLow: 80, clinicalAlertHigh: 200 },
    unitConversions: [{
      fromUnit: 'kPa',
      toCanonical: (v) => parseFloat((v * 7.50062).toFixed(1)),
      toCanonicalFormula: 'mmHg = kPa × 7.50062',
    }],
  },

  '8462-4': {
    code: '8462-4', displayName: 'Diastolic Blood Pressure',
    canonicalUnit: 'mmHg', category: 'BLOOD_PRESSURE', snapshotField: 'latestDiastolicBp',
    bounds: { physiologicalMin: 30, physiologicalMax: 160, clinicalAlertLow: 50, clinicalAlertHigh: 130 },
    unitConversions: [{
      fromUnit: 'kPa',
      toCanonical: (v) => parseFloat((v * 7.50062).toFixed(1)),
      toCanonicalFormula: 'mmHg = kPa × 7.50062',
    }],
  },

  '2345-7': {
    code: '2345-7', displayName: 'Fasting Glucose',
    canonicalUnit: 'mg/dL', category: 'GLUCOSE', snapshotField: 'latestFastingGlucose',
    bounds: { physiologicalMin: 20, physiologicalMax: 1200, clinicalAlertLow: 60, clinicalAlertHigh: 500 },
    unitConversions: [{
      fromUnit: 'mmol/L',
      toCanonical: (v) => parseFloat((v * 18.0182).toFixed(1)),
      toCanonicalFormula: 'mg/dL = mmol/L × 18.0182',
    }],
  },

  '4548-4': {
    code: '4548-4', displayName: 'Hemoglobin A1c',
    canonicalUnit: '%', category: 'GLUCOSE',
    bounds: { physiologicalMin: 2, physiologicalMax: 20, clinicalAlertLow: 4, clinicalAlertHigh: 14 },
    unitConversions: [{
      fromUnit: 'mmol/mol',
      toCanonical: (v) => parseFloat(((v / 10.929) + 2.15).toFixed(1)),
      toCanonicalFormula: '% = (mmol/mol / 10.929) + 2.15',
    }],
  },

  '39156-5': {
    code: '39156-5', displayName: 'Body Mass Index',
    canonicalUnit: 'kg/m2', category: 'BODY_METRICS',
    bounds: { physiologicalMin: 10, physiologicalMax: 100, clinicalAlertLow: 15, clinicalAlertHigh: 55 },
    unitConversions: [],
  },

  '2160-0': {
    code: '2160-0', displayName: 'Creatinine',
    canonicalUnit: 'mg/dL', category: 'RENAL',
    bounds: { physiologicalMin: 0.1, physiologicalMax: 30, clinicalAlertLow: 0.4, clinicalAlertHigh: 10 },
    unitConversions: [
      {
        fromUnit: 'μmol/L',
        toCanonical: (v) => parseFloat((v * 0.011312).toFixed(3)),
        toCanonicalFormula: 'mg/dL = μmol/L × 0.011312',
      },
      {
        fromUnit: 'umol/L',
        toCanonical: (v) => parseFloat((v * 0.011312).toFixed(3)),
        toCanonicalFormula: 'mg/dL = umol/L × 0.011312',
      },
    ],
  },

  '30522-7': {
    code: '30522-7', displayName: 'C-Reactive Protein (high sensitivity)',
    canonicalUnit: 'mg/L', category: 'INFLAMMATORY',
    bounds: { physiologicalMin: 0.01, physiologicalMax: 500, clinicalAlertHigh: 100 },
    unitConversions: [{
      fromUnit: 'mg/dL',
      toCanonical: (v) => parseFloat((v * 10).toFixed(2)),
      toCanonicalFormula: 'mg/L = mg/dL × 10',
    }],
  },
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function getLoincEntry(code: string): LoincEntry | null {
  return registry[code] ?? null
}

export function isSupportedLoinc(code: string): boolean {
  return code in registry
}

export function normalizeUnit(
  loincCode: string,
  value: number,
  inputUnit: string
): { normalizedValue: number; normalizedUnit: string; conversionApplied: boolean; formula?: string } {
  const entry = registry[loincCode]
  if (!entry) {
    return { normalizedValue: value, normalizedUnit: inputUnit, conversionApplied: false }
  }

  if (inputUnit === entry.canonicalUnit) {
    return { normalizedValue: value, normalizedUnit: entry.canonicalUnit, conversionApplied: false }
  }

  const conversion = entry.unitConversions.find(
    (c) => c.fromUnit.toLowerCase() === inputUnit.toLowerCase()
  )

  if (!conversion) {
    return { normalizedValue: value, normalizedUnit: inputUnit, conversionApplied: false }
  }

  return {
    normalizedValue: conversion.toCanonical(value),
    normalizedUnit: entry.canonicalUnit,
    conversionApplied: true,
    formula: conversion.toCanonicalFormula,
  }
}

export type ValidationResult =
  | { valid: true; warnings: string[] }
  | { valid: false; reason: string; code: string }

export function validateObservationValue(
  loincCode: string,
  value: number,
  unit: string
): ValidationResult {
  const entry = registry[loincCode]
  if (!entry) {
    return { valid: true, warnings: [`LOINC ${loincCode} not in registry — no bounds validation applied`] }
  }

  const warnings: string[] = []
  const { normalizedValue, conversionApplied } = normalizeUnit(loincCode, value, unit)

  if (normalizedValue < entry.bounds.physiologicalMin) {
    return {
      valid: false,
      reason: `Value ${normalizedValue} ${entry.canonicalUnit} is below physiological minimum (${entry.bounds.physiologicalMin} ${entry.canonicalUnit}) for ${entry.displayName}`,
      code: 'BELOW_PHYSIOLOGICAL_MIN',
    }
  }

  if (normalizedValue > entry.bounds.physiologicalMax) {
    return {
      valid: false,
      reason: `Value ${normalizedValue} ${entry.canonicalUnit} exceeds physiological maximum (${entry.bounds.physiologicalMax} ${entry.canonicalUnit}) for ${entry.displayName}`,
      code: 'ABOVE_PHYSIOLOGICAL_MAX',
    }
  }

  if (entry.bounds.clinicalAlertLow !== undefined && normalizedValue < entry.bounds.clinicalAlertLow) {
    warnings.push(`VALUE_NEAR_CLINICAL_LOW: ${normalizedValue} ${entry.canonicalUnit} for ${entry.displayName}`)
  }

  if (entry.bounds.clinicalAlertHigh !== undefined && normalizedValue > entry.bounds.clinicalAlertHigh) {
    warnings.push(`VALUE_NEAR_CLINICAL_HIGH: ${normalizedValue} ${entry.canonicalUnit} for ${entry.displayName}`)
  }

  if (conversionApplied) {
    warnings.push(`UNIT_CONVERTED: ${unit} → ${entry.canonicalUnit}`)
  }

  return { valid: true, warnings }
}
