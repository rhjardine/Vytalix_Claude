// =============================================================================
// src/dental/inventory.engine.ts
// CFE Dental — Inventory & Material Consumption Engine
//
// Responsibilities:
//   - Track stock levels for dental consumables.
//   - Record consumption movements during treatments.
//   - Forecast material needs for a treatment plan.
//   - Detect insufficient stock before a procedure.
//   - Provide COGS (Cost of Goods Sold) per treatment.
//
// Design:
//   - Pure engine with in-memory state (no DB in this sprint).
//   - All mutations produce new state — original is never modified.
//   - Every movement is immutable and timestamped.
// =============================================================================

import crypto from 'node:crypto'
import {
  InventoryItem,
  InventoryMovement,
  InventoryImpactEstimate,
  MovementReason,
  InventoryUnit,
  TreatmentCode,
} from './types'

export const INVENTORY_ENGINE_VERSION = '1.0.0'

// ── Default material consumption map ─────────────────────────────
// How much of each material is consumed per treatment unit.
// Structure: treatmentCode → [{ itemId, qty }]
// This is a catalog-level default; can be overridden per tenant.

export interface MaterialConsumption {
  itemId:         string     // matches InventoryItem.itemId
  quantityPerUnit: number    // per treatment unit
}

export const DEFAULT_CONSUMPTION_MAP: Partial<Record<TreatmentCode, MaterialConsumption[]>> = {
  BLANQUEAMIENTO_LASER:   [{ itemId: 'whitening-gel-35pct', quantityPerUnit: 2 }],
  LIMPIEZA_PROFILAXIS:    [{ itemId: 'prophylaxis-paste',   quantityPerUnit: 1 },
                           { itemId: 'fluoride-varnish',    quantityPerUnit: 1 }],
  RESTAURACION_RESINA:    [{ itemId: 'composite-a2-syringe', quantityPerUnit: 1 },
                           { itemId: 'bonding-agent',        quantityPerUnit: 0.5 }],
  EXTRACCION_SIMPLE:      [{ itemId: 'lidocaine-2pct-1.8ml', quantityPerUnit: 2 },
                           { itemId: 'suture-3-0',           quantityPerUnit: 0.5 }],
  EXTRACCION_QUIRURGICA:  [{ itemId: 'lidocaine-2pct-1.8ml', quantityPerUnit: 3 },
                           { itemId: 'suture-3-0',           quantityPerUnit: 1 }],
  ENDODONCIA_ANTERIOR:    [{ itemId: 'gutta-percha-fine',    quantityPerUnit: 2 },
                           { itemId: 'sealer-ah-plus',       quantityPerUnit: 0.5 }],
  ENDODONCIA_MOLAR:       [{ itemId: 'gutta-percha-fine',    quantityPerUnit: 4 },
                           { itemId: 'sealer-ah-plus',       quantityPerUnit: 1 }],
  IMPLANTE_TITANIO:       [{ itemId: 'implant-system-kit',   quantityPerUnit: 1 },
                           { itemId: 'healing-abutment',     quantityPerUnit: 1 }],
}

// ── Inventory state (in-memory for this sprint) ───────────────────
// In production this would be persisted. The engine operates on
// a snapshot of state passed in — pure functional design.

export interface InventoryState {
  items:     Map<string, InventoryItem>
  movements: InventoryMovement[]
}

export function createEmptyInventoryState(): InventoryState {
  return { items: new Map(), movements: [] }
}

// ── Input / Output types ──────────────────────────────────────────

export interface AddItemInput {
  tenantId:    string
  name:        string
  nameEs?:     string
  sku?:        string
  unit:        InventoryUnit
  unitCostUsd: number
  initialStock: number
  minimumStock: number
  linkedTreatmentCodes?: TreatmentCode[]
}

export interface RecordMovementInput {
  tenantId:     string
  itemId:       string
  quantity:     number        // positive = IN, negative = OUT
  reason:       MovementReason
  treatmentRef?: string
  patientRef?:  string
  performedBy:  string
  notes?:       string
}

export interface StockCheckResult {
  itemId:          string
  itemName:        string
  currentStock:    number
  minimumStock:    number
  isLowStock:      boolean
  isOutOfStock:    boolean
}

// ── Engine ────────────────────────────────────────────────────────

export class InventoryEngine {
  private readonly version = INVENTORY_ENGINE_VERSION

  // ── Catalog management ──────────────────────────────────────────

  addItem(state: InventoryState, input: AddItemInput): { newState: InventoryState; item: InventoryItem } {
    const itemId = `INV-${crypto.randomUUID().split('-')[0].toUpperCase()}`
    const now    = new Date().toISOString()

    const item: InventoryItem = {
      itemId,
      tenantId:     input.tenantId,
      name:         input.name,
      nameEs:       input.nameEs,
      sku:          input.sku,
      unit:         input.unit,
      unitCostUsd:  input.unitCostUsd,
      currentStock: input.initialStock,
      minimumStock: input.minimumStock,
      linkedTreatmentCodes: input.linkedTreatmentCodes,
      createdAt:    now,
      updatedAt:    now,
    }

    // Record initial stock movement
    const initialMovement: InventoryMovement = {
      movementId:      `MOV-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      tenantId:        input.tenantId,
      itemId,
      quantity:        input.initialStock,
      reason:          'PURCHASE',
      performedBy:     'SYSTEM',
      unitCostAtTime:  input.unitCostUsd,
      notes:           'Initial stock load',
      performedAt:     now,
    }

    const newItems = new Map(state.items)
    newItems.set(itemId, item)

    return {
      newState: { items: newItems, movements: [...state.movements, initialMovement] },
      item,
    }
  }

  // ── Movement recording ──────────────────────────────────────────

  recordMovement(state: InventoryState, input: RecordMovementInput): { newState: InventoryState; movement: InventoryMovement } {
    const item = state.items.get(input.itemId)
    if (!item) throw Object.assign(new Error(`Item '${input.itemId}' not found in inventory`), { statusCode: 404 })
    if (item.tenantId !== input.tenantId) throw Object.assign(new Error('Tenant isolation violation'), { statusCode: 403 })

    const newStock = item.currentStock + input.quantity
    if (newStock < 0) {
      throw Object.assign(
        new Error(`Insufficient stock for '${item.name}': available=${item.currentStock}, requested=${Math.abs(input.quantity)}`),
        { statusCode: 422 }
      )
    }

    const movement: InventoryMovement = {
      movementId:      `MOV-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      tenantId:        input.tenantId,
      itemId:          input.itemId,
      quantity:        input.quantity,
      reason:          input.reason,
      treatmentRef:    input.treatmentRef,
      patientRef:      input.patientRef,
      performedBy:     input.performedBy,
      unitCostAtTime:  item.unitCostUsd,
      notes:           input.notes,
      performedAt:     new Date().toISOString(),
    }

    const updatedItem: InventoryItem = {
      ...item,
      currentStock: newStock,
      updatedAt:    movement.performedAt,
    }

    const newItems = new Map(state.items)
    newItems.set(input.itemId, updatedItem)

    return {
      newState: { items: newItems, movements: [...state.movements, movement] },
      movement,
    }
  }

  // ── Treatment impact estimation ─────────────────────────────────
  // Forecast how much material a treatment plan will consume,
  // and whether current stock is sufficient.

  estimateImpact(
    state: InventoryState,
    tenantId: string,
    procedures: Array<{ code: TreatmentCode; quantity: number }>
  ): InventoryImpactEstimate[] {
    const impacts: Map<string, InventoryImpactEstimate> = new Map()

    for (const proc of procedures) {
      const consumptions = DEFAULT_CONSUMPTION_MAP[proc.code] ?? []
      for (const consumption of consumptions) {
        const item = state.items.get(consumption.itemId)
        const quantityNeeded = consumption.quantityPerUnit * proc.quantity

        if (impacts.has(consumption.itemId)) {
          // Accumulate
          const existing = impacts.get(consumption.itemId)!
          const newQty   = existing.quantityNeeded + quantityNeeded
          impacts.set(consumption.itemId, {
            ...existing,
            quantityNeeded:    round2(newQty),
            totalCostUsd:      round2(newQty * existing.unitCostUsd),
            isStockSufficient: existing.stockAvailable >= newQty,
          })
        } else {
          const estimate: InventoryImpactEstimate = {
            itemId:          consumption.itemId,
            itemName:        item?.name ?? consumption.itemId,
            quantityNeeded:  round2(quantityNeeded),
            unit:            item?.unit ?? 'UNIT',
            unitCostUsd:     item?.unitCostUsd ?? 0,
            totalCostUsd:    round2(quantityNeeded * (item?.unitCostUsd ?? 0)),
            stockAvailable:  item?.currentStock ?? 0,
            isStockSufficient: (item?.currentStock ?? 0) >= quantityNeeded,
          }
          impacts.set(consumption.itemId, estimate)
        }
      }
    }

    return Array.from(impacts.values())
  }

  // ── Stock check ─────────────────────────────────────────────────

  checkStock(state: InventoryState, tenantId: string): StockCheckResult[] {
    return Array.from(state.items.values())
      .filter(item => item.tenantId === tenantId)
      .map(item => ({
        itemId:       item.itemId,
        itemName:     item.name,
        currentStock: item.currentStock,
        minimumStock: item.minimumStock,
        isLowStock:   item.currentStock <= item.minimumStock && item.currentStock > 0,
        isOutOfStock: item.currentStock === 0,
      }))
  }

  // ── Consumption history ─────────────────────────────────────────

  getMovementsForItem(state: InventoryState, itemId: string): InventoryMovement[] {
    return state.movements.filter(m => m.itemId === itemId)
  }

  getMovementsForTreatment(state: InventoryState, treatmentRef: string): InventoryMovement[] {
    return state.movements.filter(m => m.treatmentRef === treatmentRef)
  }

  // ── COGS Calculation ────────────────────────────────────────────
  // Total cost of goods sold for all consumption movements in period.

  computeCOGS(state: InventoryState, tenantId: string, fromIso?: string, toIso?: string): {
    totalCogs: number
    movementsCount: number
    breakdown: Array<{ itemId: string; itemName: string; totalConsumedUnits: number; totalCostUsd: number }>
  } {
    const from = fromIso ? new Date(fromIso).getTime() : 0
    const to   = toIso   ? new Date(toIso).getTime()   : Date.now()

    const consumptions = state.movements.filter(m =>
      m.tenantId === tenantId &&
      m.quantity < 0 &&
      m.reason === 'PROCEDURE_CONSUMPTION' &&
      new Date(m.performedAt).getTime() >= from &&
      new Date(m.performedAt).getTime() <= to
    )

    const byItem: Map<string, { itemName: string; units: number; cost: number }> = new Map()
    for (const m of consumptions) {
      const item    = state.items.get(m.itemId)
      const units   = Math.abs(m.quantity)
      const cost    = round2(units * m.unitCostAtTime)
      const current = byItem.get(m.itemId)
      if (current) {
        byItem.set(m.itemId, { itemName: current.itemName, units: current.units + units, cost: round2(current.cost + cost) })
      } else {
        byItem.set(m.itemId, { itemName: item?.name ?? m.itemId, units, cost })
      }
    }

    const breakdown = Array.from(byItem.entries()).map(([itemId, d]) => ({
      itemId,
      itemName:           d.itemName,
      totalConsumedUnits: d.units,
      totalCostUsd:       d.cost,
    }))

    const totalCogs = round2(breakdown.reduce((acc, b) => acc + b.totalCostUsd, 0))

    return { totalCogs, movementsCount: consumptions.length, breakdown }
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
