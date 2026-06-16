// =============================================================================
// src/shared/middleware/tenantMiddleware.ts — Shim for dental routers
//
// The dental routers import: { TenantRequest } from '../../shared/middleware/tenantMiddleware'
// This file provides that type, derived from what the dental routers destructure:
//   const { tenantId, userId, requestId } = tr(req)
//
// TenantRequest extends Express.Request with dental-specific context fields.
// In production this would be populated by the auth + tenant middleware chain.
// =============================================================================

import { Request } from 'express';

export interface TenantRequest extends Request {
  /** UUID of the authenticated tenant — used for RLS */
  tenantId: string;
  /** UUID of the authenticated user/operator */
  userId: string;
  /** Correlation ID for distributed tracing — forwarded from X-Correlation-ID header */
  requestId: string;
}
