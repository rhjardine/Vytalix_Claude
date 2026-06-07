// =============================================================================
// tests/inventory-engine.test.ts — InventoryEngine unit tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  InventoryEngine,
  createEmptyInventoryState,
  InventoryState,
} from '../src/dental/inventory.engine'

describe('InventoryEngine', () => {
  let engine: InventoryEngine
  let state:  InventoryState
  const TENANT = '123e4567-e89b-12d3-a456-426614174000'

  beforeEach(() => {
    engine = new InventoryEngine()
    state  = createEmptyInventoryState()
  })

  // ── addItem ──────────────────────────────────────────────────────

  describe('addItem()', () => {
    it('creates an item with correct initial stock', () => {
      const { item, newState } = engine.addItem(state, {
        tenantId:     TENANT,
        name:         'Composite A2',
        unit:         'UNIT',
        unitCostUsd:  12.50,
        initialStock: 50,
        minimumStock: 10,
      })

      expect(item.currentStock).toBe(50)
      expect(item.minimumStock).toBe(10)
      expect(item.tenantId).toBe(TENANT)
      // Initial movement recorded
      expect(newState.movements.length).toBe(1)
      expect(newState.movements[0].reason).toBe('PURCHASE')
      expect(newState.movements[0].quantity).toBe(50)
    })

    it('generates unique item IDs', () => {
      const r1 = engine.addItem(state, { tenantId: TENANT, name: 'A', unit: 'UNIT', unitCostUsd: 1, initialStock: 10, minimumStock: 2 })
      const r2 = engine.addItem(r1.newState, { tenantId: TENANT, name: 'B', unit: 'ML', unitCostUsd: 2, initialStock: 20, minimumStock: 5 })
      expect(r1.item.itemId).not.toBe(r2.item.itemId)
    })
  })

  // ── recordMovement ────────────────────────────────────────────────

  describe('recordMovement()', () => {
    let stateWithItem: InventoryState
    let itemId: string

    beforeEach(() => {
      const r = engine.addItem(state, {
        tenantId: TENANT, name: 'Lidocaine', unit: 'VIAL', unitCostUsd: 3.5, initialStock: 100, minimumStock: 20,
      })
      stateWithItem = r.newState
      itemId = r.item.itemId
    })

    it('decrements stock on OUT movement', () => {
      const { newState } = engine.recordMovement(stateWithItem, {
        tenantId: TENANT, itemId, quantity: -10, reason: 'PROCEDURE_CONSUMPTION', performedBy: 'dr-001',
      })
      expect(newState.items.get(itemId)!.currentStock).toBe(90)
    })

    it('increments stock on IN movement', () => {
      const { newState } = engine.recordMovement(stateWithItem, {
        tenantId: TENANT, itemId, quantity: 50, reason: 'PURCHASE', performedBy: 'dr-001',
      })
      expect(newState.items.get(itemId)!.currentStock).toBe(150)
    })

    it('throws 422 when stock would go negative', () => {
      expect(() =>
        engine.recordMovement(stateWithItem, {
          tenantId: TENANT, itemId, quantity: -200, reason: 'PROCEDURE_CONSUMPTION', performedBy: 'dr-001',
        })
      ).toThrow(/Insufficient stock/)
    })

    it('throws 404 when itemId does not exist', () => {
      expect(() =>
        engine.recordMovement(stateWithItem, {
          tenantId: TENANT, itemId: 'NONEXISTENT', quantity: -1, reason: 'ADJUSTMENT', performedBy: 'dr-001',
        })
      ).toThrow(/not found/)
    })

    it('is immutable — original state is unchanged', () => {
      const originalStock = stateWithItem.items.get(itemId)!.currentStock
      engine.recordMovement(stateWithItem, {
        tenantId: TENANT, itemId, quantity: -5, reason: 'PROCEDURE_CONSUMPTION', performedBy: 'dr-001',
      })
      // Original state should be unmodified
      expect(stateWithItem.items.get(itemId)!.currentStock).toBe(originalStock)
    })
  })

  // ── estimateImpact ────────────────────────────────────────────────

  describe('estimateImpact()', () => {
    it('returns impact for known consumption map', () => {
      const impacts = engine.estimateImpact(state, TENANT, [{ code: 'LIMPIEZA_PROFILAXIS', quantity: 2 }])
      // Should have entries for prophylaxis-paste and fluoride-varnish (x2)
      expect(impacts.length).toBeGreaterThan(0)
      const paste = impacts.find(i => i.itemId === 'prophylaxis-paste')
      expect(paste).toBeDefined()
      expect(paste!.quantityNeeded).toBe(2) // 1 per unit × 2 quantity
    })

    it('flags isStockSufficient = false when no stock registered', () => {
      // No items in state means stock = 0
      const impacts = engine.estimateImpact(state, TENANT, [{ code: 'EXTRACCION_SIMPLE', quantity: 1 }])
      impacts.forEach(impact => {
        expect(impact.isStockSufficient).toBe(false)
      })
    })

    it('aggregates consumption for same item across multiple procedures', () => {
      // Both EXTRACCION_SIMPLE and EXTRACCION_QUIRURGICA use lidocaine
      const impacts = engine.estimateImpact(state, TENANT, [
        { code: 'EXTRACCION_SIMPLE',     quantity: 1 },
        { code: 'EXTRACCION_QUIRURGICA', quantity: 1 },
      ])
      const lidocaine = impacts.find(i => i.itemId === 'lidocaine-2pct-1.8ml')
      expect(lidocaine).toBeDefined()
      // SIMPLE: 2 per unit × 1 = 2; QUIRURGICA: 3 per unit × 1 = 3; total = 5
      expect(lidocaine!.quantityNeeded).toBe(5)
    })

    it('returns empty array for treatment with no mapped materials', () => {
      // ORTODONCIA_TRADICIONAL has no default consumption map entry
      const impacts = engine.estimateImpact(state, TENANT, [{ code: 'ORTODONCIA_TRADICIONAL', quantity: 1 }])
      expect(impacts).toEqual([])
    })
  })

  // ── checkStock ────────────────────────────────────────────────────

  describe('checkStock()', () => {
    it('correctly identifies low stock items', () => {
      const { newState: s1, item: i1 } = engine.addItem(state, {
        tenantId: TENANT, name: 'Gel 35%', unit: 'TUBE', unitCostUsd: 8, initialStock: 3, minimumStock: 5,
      })
      const checks = engine.checkStock(s1, TENANT)
      const check  = checks.find(c => c.itemId === i1.itemId)!
      expect(check.isLowStock).toBe(true)
      expect(check.isOutOfStock).toBe(false)
    })

    it('correctly identifies out-of-stock items', () => {
      const { newState: s1, item: i1 } = engine.addItem(state, {
        tenantId: TENANT, name: 'Suture 3-0', unit: 'PACK', unitCostUsd: 5, initialStock: 0, minimumStock: 2,
      })
      const checks = engine.checkStock(s1, TENANT)
      const check  = checks.find(c => c.itemId === i1.itemId)!
      expect(check.isOutOfStock).toBe(true)
    })
  })

  // ── computeCOGS ──────────────────────────────────────────────────

  describe('computeCOGS()', () => {
    it('computes total cost of goods sold for consumption movements', () => {
      const { newState: s1, item } = engine.addItem(state, {
        tenantId: TENANT, name: 'Composite', unit: 'UNIT', unitCostUsd: 10, initialStock: 100, minimumStock: 10,
      })

      const { newState: s2 } = engine.recordMovement(s1, {
        tenantId: TENANT, itemId: item.itemId, quantity: -5, reason: 'PROCEDURE_CONSUMPTION', performedBy: 'dr-001',
      })
      const { newState: s3 } = engine.recordMovement(s2, {
        tenantId: TENANT, itemId: item.itemId, quantity: -3, reason: 'PROCEDURE_CONSUMPTION', performedBy: 'dr-002',
      })

      const cogs = engine.computeCOGS(s3, TENANT)
      expect(cogs.movementsCount).toBe(2)
      expect(cogs.totalCogs).toBe(80) // (5+3) × $10
    })
  })
})
