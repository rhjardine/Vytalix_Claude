// =============================================================================
// src/dental/types.ts
// CFE Dental — Canonical Domain Types
//
// This is the SINGLE SOURCE OF TRUTH for all CFE Dental domain entities.
// All engines and services import from here — never the reverse.
//
// Isolation contract: No imports from src/core, src/longevity, src/preventive.
// Only imports from src/shared via explicit contracts.
// =============================================================================

export const CFE_DENTAL_DOMAIN_VERSION = '2.0.0'

// ── Treatment Codes ───────────────────────────────────────────────

export type TreatmentCode =
  | 'BLANQUEAMIENTO_LASER'
  | 'CARILLA_PORCELANA'
  | 'CORONA_METAL_PORCELANA'
  | 'CORONA_ZIRCONIA'
  | 'IMPLANTE_TITANIO'
  | 'ORTODONCIA_TRADICIONAL'
  | 'ORTODONCIA_INVISIBLE'
  | 'ENDODONCIA_ANTERIOR'
  | 'ENDODONCIA_PREMOLAR'
  | 'ENDODONCIA_MOLAR'
  | 'EXTRACCION_SIMPLE'
  | 'EXTRACCION_QUIRURGICA'
  | 'LIMPIEZA_PROFILAXIS'
  | 'RESTAURACION_RESINA'
  | 'PROTESIS_PARCIAL'
  | 'PROTESIS_TOTAL'
  | 'INJERTO_OSEO'
  | 'CIRUGIA_PERIODONTAL'

export type TreatmentCategory =
  | 'AESTHETIC'
  | 'RESTORATIVE'
  | 'SURGICAL'
  | 'ORTHODONTIC'
  | 'PREVENTIVE'
  | 'PROSTHETIC'

// ── DentalProcedure ───────────────────────────────────────────────
// Atomic billable unit in a treatment plan.

export interface DentalProcedure {
  code:      TreatmentCode
  quantity:  number        // e.g., 4 veneers
  toothRef?: string        // optional: "14", "21-24" (FDI notation)
  notes?:    string        // clinical or commercial notes
}

// ── PricingRule ───────────────────────────────────────────────────
// Defines overrides or discounts applied to base pricing.
// Not persisted in this sprint; used for in-memory calculation.

export type PricingRuleType =
  | 'FLAT_DISCOUNT'        // Fixed USD reduction
  | 'PERCENT_DISCOUNT'     // Percentage reduction on subtotal
  | 'CORPORATE_RATE'       // Custom unit price for a specific code
  | 'PACKAGE_BUNDLE'       // Price for a bundle of codes together

export interface PricingRule {
  ruleId:      string
  type:        PricingRuleType
  description: string
  // For FLAT_DISCOUNT
  flatAmountUsd?:   number
  // For PERCENT_DISCOUNT
  discountPct?:     number           // 0.0 – 1.0
  // For CORPORATE_RATE
  treatmentCode?:   TreatmentCode
  corporatePriceUsd?: number
  // Validity
  validFrom:   string                // ISO date
  validUntil:  string                // ISO date
}

// ── ExchangeRateSnapshot ──────────────────────────────────────────
// Immutable record of an exchange rate locked at a point in time.
// Used to ensure quotes remain reproducible even after rate changes.

export interface ExchangeRateSnapshot {
  snapshotId:     string
  baseCurrency:   string
  targetCurrency: string
  rate:           number
  lockedAt:       string   // ISO 8601
  validUntil:     string   // ISO 8601
  provider:       string   // e.g., 'BCV', 'STATIC_FALLBACK_v1', 'YADIO'
}

// ── InventoryItem ─────────────────────────────────────────────────
// A consumable material tracked in the clinic's inventory.

export type InventoryUnit = 'UNIT' | 'ML' | 'GR' | 'TUBE' | 'PACK' | 'VIAL'

export interface InventoryItem {
  itemId:        string
  tenantId:      string
  name:          string
  nameEs?:       string
  sku?:          string
  unit:          InventoryUnit
  unitCostUsd:   number
  currentStock:  number
  minimumStock:  number        // threshold for low-stock alert
  linkedTreatmentCodes?: TreatmentCode[]  // which treatments consume this
  createdAt:     string
  updatedAt:     string
}

// ── InventoryMovement ─────────────────────────────────────────────
// Every stock-in or stock-out event. Immutable audit log.

export type MovementReason =
  | 'PROCEDURE_CONSUMPTION'   // consumed during treatment
  | 'PURCHASE'                // restocked from supplier
  | 'ADJUSTMENT'              // manual correction
  | 'EXPIRY'                  // expired stock removed
  | 'RETURN'                  // returned to supplier

export interface InventoryMovement {
  movementId:   string
  tenantId:     string
  itemId:       string
  quantity:     number         // positive = in, negative = out
  reason:       MovementReason
  treatmentRef?: string        // planId or quoteId that triggered consumption
  patientRef?:  string
  performedBy:  string         // doctor/operator UUID or 'SYSTEM'
  unitCostAtTime: number       // USD — cost per unit at moment of movement
  notes?:       string
  performedAt:  string         // ISO 8601
}

// ── FinancialSnapshot ─────────────────────────────────────────────
// Immutable freeze of financial conditions for a treatment plan version.
// Once created, NEVER modified. Append-only.

export interface FinancialSnapshot {
  snapshotId:          string
  // Cost breakdown
  totalMaterialsCostUsd: number
  totalLabWorkUsd:       number
  totalLaborUsd:         number
  totalOverheadUsd:      number
  totalBaseCostUsd:      number
  // Pricing
  appliedMarginPct:      number
  suggestedPriceUsd:     number
  discountAppliedUsd:    number
  finalPriceUsd:         number
  netProfitUsd:          number
  // Currency
  currency:              string
  exchangeRate:          number
  exchangeSnapshotId:    string
  totalInCurrency:       number
  // Financing
  financingMonths?:      number
  financingMonthlyPayment?: number
  financingTotalAmount?:    number
  financingInterestUsd?:    number
  // Metadata
  algorithmVersion:      string
  frozenAt:              string  // ISO — when this snapshot was sealed
}

// ── TreatmentVersion ──────────────────────────────────────────────
// An immutable version of a treatment plan proposal.
// A new version is created on every patient-facing change.

export interface TreatmentVersion {
  versionNumber:     number
  procedures:        DentalProcedure[]
  appliedRules:      PricingRule[]        // rules applied at this version
  financials:        FinancialSnapshot
  exchangeSnapshot:  ExchangeRateSnapshot
  inventoryImpact:   InventoryImpactEstimate[]
  createdAt:         string
  createdBy:         string               // doctor/operator UUID or 'SYSTEM'
  modificationsNote?: string
}

// ── InventoryImpactEstimate ───────────────────────────────────────
// Projected material consumption for a given treatment plan version.
// Not a movement — a forecast.

export interface InventoryImpactEstimate {
  itemId:         string
  itemName:       string
  quantityNeeded: number
  unit:           InventoryUnit
  unitCostUsd:    number
  totalCostUsd:   number
  stockAvailable: number
  isStockSufficient: boolean
}

// ── TreatmentPlan ─────────────────────────────────────────────────
// Master container for all versions of a treatment proposal.

export type TreatmentPlanStatus =
  | 'DRAFT'      // being built
  | 'PRESENTED'  // shown to patient
  | 'ACCEPTED'   // patient accepted
  | 'REJECTED'   // patient rejected
  | 'EXPIRED'    // validity period passed

export interface TreatmentPlan {
  planId:         string
  tenantId:       string
  patientRef:     string           // pseudonym or internal ID
  doctorRef:      string           // doctor UUID
  status:         TreatmentPlanStatus
  currentVersion: number
  versions:       TreatmentVersion[]
  tags?:          string[]         // for filtering/grouping
  createdAt:      string
  updatedAt:      string
}
