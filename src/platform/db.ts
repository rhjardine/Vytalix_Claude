// =============================================================================
// src/lib/db.ts — CANONICAL tenant-aware DB client
// Wraps pg Pool. Sets app.current_tenant_id for RLS on every query.
// withTenant() is the ONLY way services should access the DB.
// =============================================================================

import { Pool, PoolClient } from 'pg'
import { logger } from './logger'

// ── Types ─────────────────────────────────────────────────────────

export interface TenantClient {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  queryMany<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<void>
}

interface RawDb {
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  rawQueryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  pool: Pool
}

// ── Singleton pool ────────────────────────────────────────────────

let _pool: Pool | null = null

export function getDb(): RawDb {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    _pool.on('error', (err) => logger.error({ err }, 'PG pool error'))
  }

  return {
    pool: _pool,

    async rawQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const client = await _pool!.connect()
      try {
        const res = await client.query(sql, params)
        return res.rows as T[]
      } finally {
        client.release()
      }
    },

    async rawQueryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      // `this` is untyped here (strict:false → implicit any), so the type
      // argument is applied via cast rather than `this.rawQuery<T>` (TS2347).
      const rows = (await this.rawQuery(sql, params)) as T[]
      return rows[0] ?? null
    },
  }
}

// ── withTenant — CANONICAL entry point for all tenant-scoped queries ──────────

export async function withTenant<T>(
  tenantId: string,
  fn: (tc: TenantClient) => Promise<T>
): Promise<T> {
  const pool   = getDb().pool
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    // Enable RLS context for this connection securely using set_config
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId])

    const tc: TenantClient = {
      async queryOne<R = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R | null> {
        const res = await client.query(sql, params)
        return (res.rows[0] as R) ?? null
      },
      async queryMany<R = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<R[]> {
        const res = await client.query(sql, params)
        return res.rows as R[]
      },
      async execute(sql: string, params: unknown[] = []): Promise<void> {
        await client.query(sql, params)
      },
    }

    const result = await fn(tc)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// ── Audit log writer (used by security layer) ─────────────────────

export async function writeAuditLog(
  tc: TenantClient,
  p: {
    tenantId: string; actorId?: string; actorRole?: string
    resourceType: string; resourceId: string; action: string
    diff?: object; ipAddress?: string; userAgent?: string
  }
): Promise<void> {
  await tc.execute(
    `INSERT INTO audit_logs (
       id,"tenantId","actorId","actorRole",
       "resourceType","resourceId",
       action,diff,"ipAddress","userAgent","createdAt"
     ) VALUES (
       gen_random_uuid(),$1::uuid,$2,$3,
       $4,$5,$6,$7::jsonb,$8,$9,NOW()
     )`,
    [
      p.tenantId, p.actorId ?? null, p.actorRole ?? null,
      p.resourceType, p.resourceId, p.action,
      JSON.stringify(p.diff ?? {}), p.ipAddress ?? null,
      p.userAgent?.slice(0, 500) ?? null,
    ]
  )
}

// ── Health check ─────────────────────────────────────────────────

export async function checkDbHealth(): Promise<boolean> {
  try {
    const db = getDb()
    await db.rawQuery('SELECT 1')
    return true
  } catch {
    return false
  }
}
