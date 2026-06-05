// =============================================================================
// src/lib/prisma.ts — Compatibility shim
// Re-exports withTenant/writeAuditLog from db.ts under the old Prisma API names
// so existing code continues to work. No Prisma binaries required.
// =============================================================================

import { withTenant, writeAuditLog as _writeAuditLog, TenantClient, getDb } from './db'

// ── getTenantDb compat ────────────────────────────────────────────
// Old call: const db = await getTenantDb(tenantId)
//           await db.$tx(tx => tx.patient.findMany(...))
// New behaviour: db.$tx runs withTenant internally
export async function getTenantDb(tenantId: string) {
  return {
    $raw: getDb().pool,
    $tx: <T>(fn: (tc: TenantClient) => Promise<T>) => withTenant(tenantId, fn),
  }
}

// ── writeAuditLog compat ──────────────────────────────────────────
export async function writeAuditLog(
  tc: TenantClient,
  params: {
    tenantId:     string
    actorId?:     string
    actorRole?:   string
    resourceType: string
    resourceId:   string
    action:       string
    diff?:        object
    ipAddress?:   string
    userAgent?:   string
  }
): Promise<void> {
  return _writeAuditLog(tc, params)
}

// Re-export for direct use
export { withTenant, getDb } from './db'
export type { TenantClient } from './db'

// ── Singleton prisma alias (for observability/health checks) ──────
export const prisma = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
    getDb().rawQuery(strings.join('$?'), values),
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
    getDb().rawQuery(strings.join('$?'), values),
}
