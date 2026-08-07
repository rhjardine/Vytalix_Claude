// =============================================================================
// tests/therapy-catalog.test.ts — commercial therapy/nutraceutical catalog
// Run: npx vitest run tests/therapy-catalog.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  THERAPY_CATALOG,
  NUTRACEUTICAL_CATALOG,
  listTherapies,
  getTherapy,
  listNutraceuticals,
  getNutraceutical,
  getCommercialCatalog,
  CATALOG_VERSION,
} from '../src/longevity/therapy-catalog'

describe('therapy-catalog', () => {
  // ── Contractual counts (Phase 1 scope) ──────────────────────────
  it('exposes the 10 contractual therapies', () => {
    expect(THERAPY_CATALOG.length).toBe(10)
    expect(listTherapies().length).toBe(10)
  })

  it('exposes the 3 contractual nutraceutical combos', () => {
    expect(NUTRACEUTICAL_CATALOG.length).toBe(3)
    expect(listNutraceuticals().length).toBe(3)
  })

  // ── Integrity ────────────────────────────────────────────────────
  it('has unique, non-empty therapy codes and names', () => {
    const codes = THERAPY_CATALOG.map(t => t.code)
    expect(new Set(codes).size).toBe(codes.length)
    THERAPY_CATALOG.forEach(t => {
      expect(t.code).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.kind).toBe('THERAPY')
    })
  })

  it('models nutraceutical combos with their component products', () => {
    const antiAging = getNutraceutical('ANTI_AGING_COMBO')
    expect(antiAging?.components).toEqual(['Megagh4 Plus', 'Stem Cell Enhancer'])
    const circulation = getNutraceutical('MAXIMUM_CIRCULATION_COMBO')
    expect(circulation?.components).toEqual(['Megagh4 Plus', 'Magnesium Chelated'])
    const antiInflammatory = getNutraceutical('ANTI_INFLAMMATORY_COMBO')
    expect(antiInflammatory?.components).toEqual(['Turmeric', 'Magnesium Chelated'])
  })

  it('does not fabricate prices (listPrice is unset until configured)', () => {
    THERAPY_CATALOG.forEach(t => expect(t.listPrice).toBeUndefined())
    NUTRACEUTICAL_CATALOG.forEach(n => expect(n.listPrice).toBeUndefined())
  })

  // ── Lookups ──────────────────────────────────────────────────────
  it('resolves a therapy by code and filters by category', () => {
    expect(getTherapy('ANTI_AGING')?.name).toBe('Anti Aging')
    expect(getTherapy('UNKNOWN_CODE')).toBeNull()
    const neuro = listTherapies('NEURO')
    expect(neuro.length).toBe(2)
    expect(neuro.every(t => t.category === 'NEURO')).toBe(true)
  })

  it('returns a versioned unified catalog snapshot', () => {
    const cat = getCommercialCatalog()
    expect(cat.version).toBe(CATALOG_VERSION)
    expect(cat.therapies.length).toBe(10)
    expect(cat.nutraceuticals.length).toBe(3)
  })
})
