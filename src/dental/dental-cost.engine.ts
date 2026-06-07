// =============================================================================
// src/dental/dental-cost.engine.ts
// CFE Dental — Treatment Cost Engine
//
// Computes base cost of dental procedures from:
//   1. Materials catalog (consumables + lab work)
//   2. Labor matrix (time × chair rate)
//   3. Overhead allocation (clinic fixed costs)
//   4. Location adjustment factor (city/country)
//
// Design contracts (mirrors clinical engine principles):
//   - All computations are deterministic and versionable
//   - Input snapshot is stored with every cost estimate
//   - No external API calls — fully offline capable
//   - Clinician in the loop: cost is "estimate", not binding quote
// =============================================================================

import { TreatmentCode, TreatmentCategory } from './types'
export type { TreatmentCode }  // re-export for backward compat

export const DENTAL_COST_ENGINE_VERSION = '1.0.0'

// ── Treatment catalog ─────────────────────────────────────────────

export interface TreatmentDefinition {
  code:              TreatmentCode
  name:              string
  nameEs:            string
  category:          TreatmentCategory
  avgDurationMinutes: number
  materialsCostUsd:  number   // base materials cost in USD
  labWorkUsd:        number   // external lab fees (if any)
  requiresSessions:  number   // minimum sessions
  complexityFactor:  number   // 1.0 = standard; >1.0 = complex
}

export const TREATMENT_CATALOG: Record<TreatmentCode, TreatmentDefinition> = {
  BLANQUEAMIENTO_LASER:    { code: 'BLANQUEAMIENTO_LASER',    name: 'Laser Whitening',          nameEs: 'Blanqueamiento Láser',       category: 'AESTHETIC',    avgDurationMinutes: 90,  materialsCostUsd: 45,  labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.0 },
  CARILLA_PORCELANA:       { code: 'CARILLA_PORCELANA',       name: 'Porcelain Veneer',          nameEs: 'Carilla de Porcelana',       category: 'AESTHETIC',    avgDurationMinutes: 120, materialsCostUsd: 120, labWorkUsd: 180, requiresSessions: 2, complexityFactor: 1.2 },
  CORONA_METAL_PORCELANA:  { code: 'CORONA_METAL_PORCELANA',  name: 'Metal-Porcelain Crown',     nameEs: 'Corona Metal-Porcelana',     category: 'RESTORATIVE',  avgDurationMinutes: 90,  materialsCostUsd: 80,  labWorkUsd: 120, requiresSessions: 2, complexityFactor: 1.0 },
  CORONA_ZIRCONIA:         { code: 'CORONA_ZIRCONIA',         name: 'Zirconia Crown',            nameEs: 'Corona de Zirconia',         category: 'RESTORATIVE',  avgDurationMinutes: 90,  materialsCostUsd: 150, labWorkUsd: 250, requiresSessions: 2, complexityFactor: 1.1 },
  IMPLANTE_TITANIO:        { code: 'IMPLANTE_TITANIO',        name: 'Titanium Implant',          nameEs: 'Implante de Titanio',        category: 'SURGICAL',     avgDurationMinutes: 120, materialsCostUsd: 350, labWorkUsd: 200, requiresSessions: 3, complexityFactor: 1.5 },
  ORTODONCIA_TRADICIONAL:  { code: 'ORTODONCIA_TRADICIONAL',  name: 'Traditional Braces',        nameEs: 'Ortodoncia Tradicional',     category: 'ORTHODONTIC',  avgDurationMinutes: 60,  materialsCostUsd: 200, labWorkUsd: 0,   requiresSessions: 24, complexityFactor: 1.0 },
  ORTODONCIA_INVISIBLE:    { code: 'ORTODONCIA_INVISIBLE',    name: 'Clear Aligners',            nameEs: 'Alineadores Invisibles',     category: 'ORTHODONTIC',  avgDurationMinutes: 60,  materialsCostUsd: 800, labWorkUsd: 400, requiresSessions: 12, complexityFactor: 1.2 },
  ENDODONCIA_ANTERIOR:     { code: 'ENDODONCIA_ANTERIOR',     name: 'Anterior Root Canal',       nameEs: 'Endodoncia Anterior',        category: 'RESTORATIVE',  avgDurationMinutes: 75,  materialsCostUsd: 30,  labWorkUsd: 0,   requiresSessions: 2, complexityFactor: 1.0 },
  ENDODONCIA_PREMOLAR:     { code: 'ENDODONCIA_PREMOLAR',     name: 'Premolar Root Canal',       nameEs: 'Endodoncia Premolar',        category: 'RESTORATIVE',  avgDurationMinutes: 90,  materialsCostUsd: 35,  labWorkUsd: 0,   requiresSessions: 2, complexityFactor: 1.1 },
  ENDODONCIA_MOLAR:        { code: 'ENDODONCIA_MOLAR',        name: 'Molar Root Canal',          nameEs: 'Endodoncia Molar',           category: 'RESTORATIVE',  avgDurationMinutes: 120, materialsCostUsd: 45,  labWorkUsd: 0,   requiresSessions: 3, complexityFactor: 1.3 },
  EXTRACCION_SIMPLE:       { code: 'EXTRACCION_SIMPLE',       name: 'Simple Extraction',         nameEs: 'Extracción Simple',          category: 'SURGICAL',     avgDurationMinutes: 30,  materialsCostUsd: 8,   labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.0 },
  EXTRACCION_QUIRURGICA:   { code: 'EXTRACCION_QUIRURGICA',   name: 'Surgical Extraction',       nameEs: 'Extracción Quirúrgica',      category: 'SURGICAL',     avgDurationMinutes: 60,  materialsCostUsd: 20,  labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.4 },
  LIMPIEZA_PROFILAXIS:     { code: 'LIMPIEZA_PROFILAXIS',     name: 'Prophylaxis Cleaning',      nameEs: 'Limpieza y Profilaxis',      category: 'PREVENTIVE',   avgDurationMinutes: 45,  materialsCostUsd: 12,  labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.0 },
  RESTAURACION_RESINA:     { code: 'RESTAURACION_RESINA',     name: 'Composite Restoration',     nameEs: 'Restauración en Resina',     category: 'RESTORATIVE',  avgDurationMinutes: 45,  materialsCostUsd: 15,  labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.0 },
  PROTESIS_PARCIAL:        { code: 'PROTESIS_PARCIAL',        name: 'Partial Denture',           nameEs: 'Prótesis Parcial',           category: 'PROSTHETIC',   avgDurationMinutes: 60,  materialsCostUsd: 80,  labWorkUsd: 200, requiresSessions: 3, complexityFactor: 1.1 },
  PROTESIS_TOTAL:          { code: 'PROTESIS_TOTAL',          name: 'Complete Denture',          nameEs: 'Prótesis Total',             category: 'PROSTHETIC',   avgDurationMinutes: 60,  materialsCostUsd: 120, labWorkUsd: 300, requiresSessions: 4, complexityFactor: 1.2 },
  INJERTO_OSEO:            { code: 'INJERTO_OSEO',            name: 'Bone Graft',                nameEs: 'Injerto Óseo',               category: 'SURGICAL',     avgDurationMinutes: 90,  materialsCostUsd: 200, labWorkUsd: 0,   requiresSessions: 1, complexityFactor: 1.8 },
  CIRUGIA_PERIODONTAL:     { code: 'CIRUGIA_PERIODONTAL',     name: 'Periodontal Surgery',       nameEs: 'Cirugía Periodontal',        category: 'SURGICAL',     avgDurationMinutes: 120, materialsCostUsd: 60,  labWorkUsd: 0,   requiresSessions: 2, complexityFactor: 1.6 },
}

// ── Location adjustment factors ───────────────────────────────────
// Normalizes costs across geographies. 1.0 = Mexico City baseline.

const LOCATION_FACTORS: Record<string, number> = {
  'MX-CDMX':  1.00,  'MX-MTY': 0.95,  'MX-GDL': 0.90,  'MX-TIJ': 1.05,
  'US-BORDER': 1.20,  'US-MAIN': 1.80,  'CO-BOG': 0.75,  'CO-MED': 0.70,
  'AR-BUE':   0.60,  'CL-SCL': 0.85,  'PE-LIM': 0.65,  'ES-MAD': 1.30,
  'DEFAULT':  1.00,
}

// ── Cost computation ──────────────────────────────────────────────

export interface CostEstimateInput {
  treatmentCode:    TreatmentCode
  quantity:         number           // e.g., 4 veneers
  locationCode?:    string           // "MX-CDMX" etc.
  chairRatePerHour: number           // USD — clinic's chair rate
  overheadPct:      number           // e.g., 0.35 = 35% overhead
  teethCount?:      number           // relevant for ortho/implants
}

export interface CostEstimateResult {
  treatmentCode:      TreatmentCode
  treatmentName:      string
  quantity:           number
  breakdown: {
    materialsUsd:   number
    labWorkUsd:     number
    laborUsd:       number
    overheadUsd:    number
  }
  subtotalUsd:        number
  locationFactor:     number
  adjustedTotalUsd:   number
  estimatedSessions:  number
  durationMinutes:    number
  complexityLabel:    string
  algorithmVersion:   string
  computedAt:         string
  inputSnapshot:      CostEstimateInput
}

export class DentalCostEngine {
  private readonly version = DENTAL_COST_ENGINE_VERSION

  compute(input: CostEstimateInput): CostEstimateResult {
    const treatment = TREATMENT_CATALOG[input.treatmentCode]
    if (!treatment) throw Object.assign(new Error(`Unknown treatment code: ${input.treatmentCode}`), { statusCode: 422 })

    const qty         = Math.max(1, input.quantity)
    const locationFx  = LOCATION_FACTORS[input.locationCode ?? 'DEFAULT'] ?? 1.0
    const hourlyRate  = Math.max(0, input.chairRatePerHour)
    const overheadPct = Math.max(0, Math.min(1, input.overheadPct))

    // Materials + lab per unit × quantity
    const materialsUsd = treatment.materialsCostUsd * qty
    const labWorkUsd   = treatment.labWorkUsd * qty

    // Labor: (duration × sessions) / 60 × hourly rate × qty
    const totalMinutes = treatment.avgDurationMinutes * treatment.requiresSessions * treatment.complexityFactor
    const laborUsd     = (totalMinutes / 60) * hourlyRate * qty

    // Overhead on (materials + labor)
    const subtotalBeforeOverhead = materialsUsd + labWorkUsd + laborUsd
    const overheadUsd = subtotalBeforeOverhead * overheadPct

    const subtotalUsd     = round2(subtotalBeforeOverhead + overheadUsd)
    const adjustedTotalUsd = round2(subtotalUsd * locationFx)

    return {
      treatmentCode:     input.treatmentCode,
      treatmentName:     treatment.nameEs,
      quantity:          qty,
      breakdown: {
        materialsUsd: round2(materialsUsd),
        labWorkUsd:   round2(labWorkUsd),
        laborUsd:     round2(laborUsd),
        overheadUsd:  round2(overheadUsd),
      },
      subtotalUsd,
      locationFactor:    locationFx,
      adjustedTotalUsd,
      estimatedSessions: treatment.requiresSessions,
      durationMinutes:   Math.round(totalMinutes),
      complexityLabel:   complexityLabel(treatment.complexityFactor),
      algorithmVersion:  this.version,
      computedAt:        new Date().toISOString(),
      inputSnapshot:     input,
    }
  }

  getCatalog(category?: TreatmentDefinition['category']): TreatmentDefinition[] {
    const all = Object.values(TREATMENT_CATALOG)
    return category ? all.filter(t => t.category === category) : all
  }
}

function complexityLabel(factor: number): string {
  if (factor <= 1.0)  return 'Estándar'
  if (factor <= 1.2)  return 'Moderada'
  if (factor <= 1.5)  return 'Compleja'
  return 'Muy compleja'
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
