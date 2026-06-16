// =============================================================================
// src/shared/types/domain.ts — Shared domain primitive types
//
// The dental repositories, engines, and routers import:
//   import type { TenantId, Money, ApiResponse } from '../../shared/types/domain'
//
// These are lightweight primitives. No business logic.
// =============================================================================

/** Opaque type for tenant UUIDs. */
export type TenantId = string;

/** A monetary value expressed in minor currency units (e.g. centavos, cents). */
export interface Money {
  amount: number;   // integer, minor units
  currency: string; // ISO 4217 (e.g. 'MXN', 'USD')
}

/**
 * Standard response envelope for all dental service operations.
 * Uses optional fields (rather than a strict discriminated union) to match
 * the access patterns in the certified dental routers which use result.data?.x
 * and result.error?.code on the same result object without narrowing.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

