// =============================================================================
// Tenant Middleware — RLS Context Injection
//
// Every /v1/* request runs through:
//   1. authMiddleware  → validates JWT, sets req.user
//   2. tenantMiddleware → validates tenant_id matches JWT, injects RLS context
//
// The RLS context (app.current_tenant) is set per-query in getTenantDb().
// This middleware just validates consistency between the JWT tenant_id and
// any explicit X-Tenant-ID header (they must match or the request is rejected).
//
// Why validate the header against the JWT?
//   - Prevents a valid token from being used against a different tenant's data
//   - The JWT tenant_id is the authoritative source of truth
//   - The header is convenience for client routing, not a security boundary
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger'

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const jwtTenantId = req.user?.tenant_id
  const headerTenantId = req.headers['x-tenant-id'] as string | undefined

  if (!jwtTenantId) {
    return res.status(401).json({
      type: 'https://api.vytalix.health/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Token missing tenant_id claim',
      instance: req.path,
      correlationId: req.correlationId,
    })
  }

  // If X-Tenant-ID header is provided, it must match the JWT
  if (headerTenantId && headerTenantId !== jwtTenantId) {
    logger.warn(
      { jwtTenantId, headerTenantId, correlationId: req.correlationId },
      'Tenant ID mismatch — header does not match JWT'
    )
    return res.status(403).json({
      type: 'https://api.vytalix.health/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'X-Tenant-ID header does not match token tenant_id',
      instance: req.path,
      correlationId: req.correlationId,
    })
  }

  // Tenant context is available via req.user.tenant_id in all handlers
  // getTenantDb(req.user.tenant_id) uses this to set app.current_tenant
  next()
}
