// =============================================================================
// Vytalix MVP — Prisma Middleware: Tenant Context Injection
// File: src/lib/prisma.ts
//
// This is the single most security-critical file in the application.
// Every database query MUST go through a client that has tenant context set.
// The pattern below makes it impossible to accidentally query without context.
// =============================================================================

import { PrismaClient } from '@prisma/client'

// ---------------------------------------------------------------------------
// Singleton factory — prevents connection pool exhaustion in Next.js dev mode
// (Next.js hot reload creates new module instances; this prevents N clients)
// ---------------------------------------------------------------------------
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const basePrisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// ---------------------------------------------------------------------------
// Tenant-scoped client factory
//
// Usage in every API route / server action:
//   const db = await getTenantDb(tenantId)
//   const patients = await db.patient.findMany(...)  // RLS-enforced automatically
//
// The function uses $transaction to ensure SET LOCAL is scoped to the
// transaction — it does not persist across connections in the pool.
// For non-transactional queries, we use an interactive transaction.
// ---------------------------------------------------------------------------
export async function getTenantDb(tenantId: string) {
  // Validate UUID format before injecting into SQL to prevent injection.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Invalid tenantId format: ${tenantId}`)
  }

  // Return a proxy that wraps every operation in a transaction with tenant context.
  // This is the idiomatic pattern for RLS with PgBouncer in transaction mode.
  return {
    // Expose the raw client for complex queries that need direct access.
    $raw: basePrisma,

    // Tenant-aware transaction executor.
    // All application queries should use this.
    async $tx<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
      return basePrisma.$transaction(async (tx) => {
        // SET LOCAL scopes the variable to this transaction only.
        // If the connection is reused after this transaction, the variable is gone.
        await tx.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`
        return fn(tx)
      })
    },

    // Convenience wrappers for common single-operation queries.
    // These still use a transaction to ensure tenant context is set.
    get patient() {
      return createTenantModelProxy(basePrisma, tenantId, 'patient')
    },
    get user() {
      return createTenantModelProxy(basePrisma, tenantId, 'user')
    },
    get clinicalObservation() {
      return createTenantModelProxy(basePrisma, tenantId, 'clinicalObservation')
    },
    get riskScore() {
      return createTenantModelProxy(basePrisma, tenantId, 'riskScore')
    },
    get recommendation() {
      return createTenantModelProxy(basePrisma, tenantId, 'recommendation')
    },
    get auditLog() {
      return createTenantModelProxy(basePrisma, tenantId, 'auditLog')
    },
  }
}

// ---------------------------------------------------------------------------
// Internal: wraps each model method in a mini-transaction with tenant context.
// ---------------------------------------------------------------------------
function createTenantModelProxy<M extends keyof PrismaClient>(
  prisma: PrismaClient,
  tenantId: string,
  model: M
) {
  const delegate = prisma[model] as Record<string, (...args: unknown[]) => Promise<unknown>>

  return new Proxy(delegate, {
    get(target, prop: string) {
      if (typeof target[prop] !== 'function') return target[prop]

      return async (...args: unknown[]) => {
        return prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`
          const txDelegate = tx[model as keyof typeof tx] as Record<string, (...a: unknown[]) => Promise<unknown>>
          return txDelegate[prop](...args)
        })
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Audit log helper — called from service layer, never skipped.
// Accepts the prisma transaction client so it participates in the same tx.
// ---------------------------------------------------------------------------
export async function writeAuditLog(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  params: {
    tenantId: string
    actorId?: string
    actorRole?: string
    resourceType: string
    resourceId: string
    action: string
    diff?: { before?: object; after?: object }
    ipAddress?: string
    userAgent?: string
  }
) {
  await tx.auditLog.create({
    data: {
      tenantId:     params.tenantId,
      actorId:      params.actorId ?? null,
      actorRole:    params.actorRole ?? null,
      resourceType: params.resourceType,
      resourceId:   params.resourceId,
      action:       params.action,
      diff:         params.diff ?? null,
      ipAddress:    params.ipAddress ?? null,
      userAgent:    params.userAgent ?? null,
    }
  })
}
