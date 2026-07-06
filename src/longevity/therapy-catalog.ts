// =============================================================================
// src/longevity/therapy-catalog.ts
// Commercial catalog of longevity therapies and nutraceutical combos.
//
// Design intent (Delivery Sprint D1):
//   - Data-driven registry: adding a new therapy / combo means adding one entry
//     to the arrays below. No business logic is hardcoded per-item, so the
//     catalog is open for future expansion without code changes.
//   - Pricing is modeled but NOT fabricated: `listPrice` is optional and is
//     expected to be configured per tenant / environment. The catalog ships the
//     product definitions; commercial prices are supplied by configuration.
//   - Pure module: no I/O, no DB, no tenant state — safe to unit-test and to
//     serve as a global (non-PHI) product listing.
// =============================================================================

/** Money value object (integer minor units, ISO-4217 currency). */
export interface Money {
  amountMinor: number
  currency: string
}

export type TherapyCategory =
  | 'PAIN_MANAGEMENT'
  | 'WELLNESS'
  | 'PERFORMANCE'
  | 'METABOLIC'
  | 'LONGEVITY'
  | 'VITALITY'
  | 'NEURO'
  | 'AESTHETIC'

export type TherapyCode =
  | 'PAIN_RELIEF'
  | 'ANTI_STRESS_REVITALIZATION'
  | 'MAXIMUM_PERFORMANCE'
  | 'FITNESS_WEIGHT_LOSS'
  | 'ANTI_AGING'
  | 'MALE_VITALITY'
  | 'FEMALE_FERTILITY_VITALITY'
  | 'NEURO_EMOTIONAL'
  | 'NEURO_COGNITIVE'
  | 'FACIAL_REJUVENATION'

export type NutraceuticalCode =
  | 'ANTI_AGING_COMBO'
  | 'MAXIMUM_CIRCULATION_COMBO'
  | 'ANTI_INFLAMMATORY_COMBO'

/** A single therapy offering (a commercial catalog entity). */
export interface Therapy {
  code: TherapyCode
  name: string
  category: TherapyCategory
  /** Product type discriminator for a unified catalog view. */
  kind: 'THERAPY'
  active: boolean
  /** Optional — configured per tenant/environment, never hardcoded here. */
  listPrice?: Money
}

/** A nutraceutical combo made of named component products. */
export interface NutraceuticalCombo {
  code: NutraceuticalCode
  name: string
  kind: 'NUTRACEUTICAL_COMBO'
  /** Component products that make up the combo (source: Phase 1 scope). */
  components: string[]
  active: boolean
  /** Optional — configured per tenant/environment, never hardcoded here. */
  listPrice?: Money
}

export type CatalogItem = Therapy | NutraceuticalCombo

/** Bumped whenever the catalog contents change (consumer cache key). */
export const CATALOG_VERSION = '1.0.0'

// ── Therapies (Phase 1 contractual scope: 10) ───────────────────────
export const THERAPY_CATALOG: readonly Therapy[] = [
  { code: 'PAIN_RELIEF',               name: 'Pain Relief',                  category: 'PAIN_MANAGEMENT', kind: 'THERAPY', active: true },
  { code: 'ANTI_STRESS_REVITALIZATION', name: 'Anti-Stress Revitalization',  category: 'WELLNESS',        kind: 'THERAPY', active: true },
  { code: 'MAXIMUM_PERFORMANCE',        name: 'Maximum Performance',          category: 'PERFORMANCE',     kind: 'THERAPY', active: true },
  { code: 'FITNESS_WEIGHT_LOSS',        name: 'Fitness Weight Loss',          category: 'METABOLIC',       kind: 'THERAPY', active: true },
  { code: 'ANTI_AGING',                 name: 'Anti Aging',                   category: 'LONGEVITY',       kind: 'THERAPY', active: true },
  { code: 'MALE_VITALITY',              name: 'Male Vitality',                category: 'VITALITY',        kind: 'THERAPY', active: true },
  { code: 'FEMALE_FERTILITY_VITALITY',  name: 'Female Fertility & Vitality',  category: 'VITALITY',        kind: 'THERAPY', active: true },
  { code: 'NEURO_EMOTIONAL',            name: 'Neuro Emotional',              category: 'NEURO',           kind: 'THERAPY', active: true },
  { code: 'NEURO_COGNITIVE',            name: 'Neuro Cognitive',              category: 'NEURO',           kind: 'THERAPY', active: true },
  { code: 'FACIAL_REJUVENATION',        name: 'Facial Rejuvenation',          category: 'AESTHETIC',       kind: 'THERAPY', active: true },
]

// ── Nutraceutical combos (Phase 1 contractual scope: 3) ─────────────
export const NUTRACEUTICAL_CATALOG: readonly NutraceuticalCombo[] = [
  { code: 'ANTI_AGING_COMBO',          name: 'Anti Aging Combo',          kind: 'NUTRACEUTICAL_COMBO', components: ['Megagh4 Plus', 'Stem Cell Enhancer'],   active: true },
  { code: 'MAXIMUM_CIRCULATION_COMBO', name: 'Maximum Circulation Combo', kind: 'NUTRACEUTICAL_COMBO', components: ['Megagh4 Plus', 'Magnesium Chelated'],   active: true },
  { code: 'ANTI_INFLAMMATORY_COMBO',   name: 'Anti-inflammatory Combo',   kind: 'NUTRACEUTICAL_COMBO', components: ['Turmeric', 'Magnesium Chelated'],       active: true },
]

// ── Lookups (pure) ──────────────────────────────────────────────────

/** All active therapies (optionally filtered by category). */
export function listTherapies(category?: TherapyCategory): Therapy[] {
  return THERAPY_CATALOG.filter(t => t.active && (!category || t.category === category))
}

/** Resolve a therapy by its stable code, or null if unknown/inactive. */
export function getTherapy(code: string): Therapy | null {
  const t = THERAPY_CATALOG.find(x => x.code === code)
  return t && t.active ? t : null
}

/** All active nutraceutical combos. */
export function listNutraceuticals(): NutraceuticalCombo[] {
  return NUTRACEUTICAL_CATALOG.filter(n => n.active)
}

/** Resolve a nutraceutical combo by its stable code, or null. */
export function getNutraceutical(code: string): NutraceuticalCombo | null {
  const n = NUTRACEUTICAL_CATALOG.find(x => x.code === code)
  return n && n.active ? n : null
}

/** Unified commercial catalog snapshot for API responses. */
export function getCommercialCatalog(): {
  version: string
  therapies: Therapy[]
  nutraceuticals: NutraceuticalCombo[]
} {
  return {
    version: CATALOG_VERSION,
    therapies: listTherapies(),
    nutraceuticals: listNutraceuticals(),
  }
}
