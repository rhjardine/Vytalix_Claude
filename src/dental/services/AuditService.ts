/**
 * AuditService.ts — Vytalix CFE Dental: Audit Log
 *
 * Writes immutable audit records for all mutable dental operations.
 * Table: dental_audit_logs — append-only, never updated, never deleted.
 *
 * Audit events covered:
 *   PLAN_CREATED       — new TreatmentPlan + first TreatmentVersion
 *   PLAN_STATUS_CHANGED — status transition on a plan
 *   VERSION_SEALED     — TreatmentVersion sealed → immutable
 *   VERSION_CREATED    — new TreatmentVersion (via sealAndAdvance)
 *   INVENTORY_MOVEMENT — any inventory movement recorded
 *   QUOTE_GENERATED    — quote produced by QuoteOrchestrator
 *   VOUCHER_ISSUED     — dental voucher issued
 *   VOUCHER_REDEEMED   — dental voucher redeemed (success or failure)
 *
 * Written inside the same withTenant() transaction as the business operation —
 * audit records are atomic with the operation they describe.
 */

import { PoolClient } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'PLAN_CREATED'
  | 'PLAN_STATUS_CHANGED'
  | 'VERSION_SEALED'
  | 'VERSION_CREATED'
  | 'INVENTORY_MOVEMENT'
  | 'QUOTE_GENERATED'
  | 'VOUCHER_ISSUED'
  | 'VOUCHER_REDEEMED';

export interface AuditEntry {
  tenantId: string;
  eventType: AuditEventType;
  entityId: string;       // The primary entity affected (planId, itemId, voucherId, etc.)
  entityType: string;     // 'TreatmentPlan' | 'InventoryItem' | 'DentalVoucher' etc.
  actorId: string;        // userId or systemId that triggered the event
  correlationId: string;
  before?: Record<string, unknown>;  // State before mutation (null for creates)
  after?: Record<string, unknown>;   // State after mutation
  metadata?: Record<string, unknown>;
}

// ─── AuditService ─────────────────────────────────────────────────────────────

export class AuditService {
  /**
   * Records an audit event.
   * Must be called with the same PoolClient as the business operation
   * so both are committed or rolled back atomically.
   */
  async record(client: PoolClient, entry: AuditEntry): Promise<void> {
    await client.query(
      `INSERT INTO dental_audit_logs
         (id, tenant_id, event_type, entity_id, entity_type,
          actor_id, correlation_id, before_state, after_state,
          metadata, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, NOW())`,
      [
        entry.tenantId,
        entry.eventType,
        entry.entityId,
        entry.entityType,
        entry.actorId,
        entry.correlationId,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after  ? JSON.stringify(entry.after)  : null,
        JSON.stringify(entry.metadata ?? {}),
      ]
    );
  }

  /** Convenience: log a plan creation */
  async planCreated(
    client: PoolClient,
    tenantId: string,
    planId: string,
    versionId: string,
    actorId: string,
    correlationId: string,
    planSnapshot: Record<string, unknown>
  ): Promise<void> {
    await this.record(client, {
      tenantId,
      eventType: 'PLAN_CREATED',
      entityId: planId,
      entityType: 'TreatmentPlan',
      actorId,
      correlationId,
      after: { planId, versionId, ...planSnapshot },
    });
  }

  /** Convenience: log a plan status change */
  async planStatusChanged(
    client: PoolClient,
    tenantId: string,
    planId: string,
    actorId: string,
    correlationId: string,
    fromStatus: string,
    toStatus: string
  ): Promise<void> {
    await this.record(client, {
      tenantId,
      eventType: 'PLAN_STATUS_CHANGED',
      entityId: planId,
      entityType: 'TreatmentPlan',
      actorId,
      correlationId,
      before: { status: fromStatus },
      after:  { status: toStatus },
    });
  }

  /** Convenience: log a version seal event */
  async versionSealed(
    client: PoolClient,
    tenantId: string,
    planId: string,
    versionId: string,
    versionNumber: number,
    actorId: string,
    correlationId: string,
    totalAmount: number,
    currency: string
  ): Promise<void> {
    await this.record(client, {
      tenantId,
      eventType: 'VERSION_SEALED',
      entityId: versionId,
      entityType: 'TreatmentVersion',
      actorId,
      correlationId,
      after: { planId, versionId, versionNumber, totalAmount, currency },
    });
  }

  /** Convenience: log an inventory movement */
  async inventoryMovement(
    client: PoolClient,
    tenantId: string,
    movementId: string,
    itemId: string,
    actorId: string,
    correlationId: string,
    movementType: string,
    quantity: number,
    stockBefore: number,
    stockAfter: number
  ): Promise<void> {
    await this.record(client, {
      tenantId,
      eventType: 'INVENTORY_MOVEMENT',
      entityId: movementId,
      entityType: 'InventoryMovement',
      actorId,
      correlationId,
      before: { itemId, stock: stockBefore },
      after:  { itemId, stock: stockAfter, movementType, quantity },
    });
  }
}

export const auditService = new AuditService();
