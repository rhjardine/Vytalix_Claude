/**
 * types/dental.ts
 *
 * Espejo estricto de los tipos de dominio de src/dental/types.ts del backend.
 * SOLO tipos — sin lógica, sin imports del servidor.
 *
 * Regla: si el backend cambia un tipo, este archivo debe actualizarse en paralelo.
 */

// ── Status types ──────────────────────────────────────────────────────────────

export type TreatmentPlanStatus =
  | 'DRAFT'
  | 'PRESENTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type TreatmentCategory =
  | 'AESTHETIC'
  | 'RESTORATIVE'
  | 'SURGICAL'
  | 'ORTHODONTIC'
  | 'PREVENTIVE'
  | 'PROSTHETIC';

export type PricingRuleType =
  | 'FLAT_DISCOUNT'
  | 'PERCENT_DISCOUNT'
  | 'CORPORATE_RATE'
  | 'PACKAGE_BUNDLE';

export type InventoryUnit = 'UNIT' | 'ML' | 'GR' | 'TUBE' | 'PACK' | 'VIAL';

export type MovementReason =
  | 'PROCEDURE_CONSUMPTION'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'EXPIRY'
  | 'RETURN';
