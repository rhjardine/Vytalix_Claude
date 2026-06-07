// =============================================================================
// src/dental/index.ts — CFE Dental Public API (Barrel)
//
// This is the ONLY file external code should import from.
// Enforces the isolation boundary of the dental domain.
//
// ✅ External code imports from: src/dental/index.ts
// ❌ External code does NOT import from individual engine files
// ❌ This barrel does NOT import from: src/core, src/longevity, src/preventive
// =============================================================================

// Domain types — always import these first
export type {
  TreatmentCode,
  TreatmentCategory,
  DentalProcedure,
  PricingRule,
  PricingRuleType,
  ExchangeRateSnapshot,
  InventoryItem,
  InventoryUnit,
  InventoryMovement,
  MovementReason,
  FinancialSnapshot,
  TreatmentVersion,
  TreatmentPlan,
  TreatmentPlanStatus,
  InventoryImpactEstimate,
} from './types'

export { CFE_DENTAL_DOMAIN_VERSION } from './types'

// Engines
export { DentalCostEngine, TREATMENT_CATALOG, DENTAL_COST_ENGINE_VERSION } from './dental-cost.engine'
export type { CostEstimateInput, CostEstimateResult, TreatmentDefinition } from './dental-cost.engine'

export { MarginEngine, MARGIN_ENGINE_VERSION } from './margin.engine'
export type { MarginEngineInput, MarginEngineResult } from './margin.engine'

export { ExchangeEngine, EXCHANGE_ENGINE_VERSION } from './exchange.engine'
export type { ExchangeConversionInput, ExchangeConversionResult } from './exchange.engine'

export { InventoryEngine, INVENTORY_ENGINE_VERSION, DEFAULT_CONSUMPTION_MAP, createEmptyInventoryState } from './inventory.engine'
export type { AddItemInput, RecordMovementInput, StockCheckResult, InventoryState } from './inventory.engine'

// Orchestrators & services
export { QuoteOrchestrator, QuoteRequestSchema, QUOTE_ORCHESTRATOR_VERSION } from './quote.orchestrator'
export type { QuoteRequest, QuoteResult } from './quote.orchestrator'

export { DentalPricingService, PriceQuoteSchema } from './dental-pricing.service'
export type { PriceQuoteInput, PriceQuoteResult, TreatmentLineItem, FinancingOption } from './dental-pricing.service'
