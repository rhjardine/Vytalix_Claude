/**
 * shared/db/db.ts — Vytalix Vertical 2: Database Layer
 *
 * Re-exports the core `withTenant()` and `tenantQuery()` from the Sprint 1
 * hardened db layer. Vertical 2 engines NEVER bypass this — they receive
 * a scoped PoolClient already inside a SET LOCAL transaction.
 *
 * This file is the canonical import point for all V2 code:
 *   import { withTenant, tenantQuery } from '../shared/db/db';
 *
 * Rationale for the re-export pattern (not direct import from core):
 * - Keeps V2 boundary explicit — no accidental imports of internal DB primitives
 * - Allows V2 to add commerce-specific query helpers without touching Sprint 1 code
 * - Simplifies mocking in tests — one import path to stub
 */

// ── Re-export Sprint 1 primitives ────────────────────────────────────────────
// In the monorepo, the core layer is at ../../core/db/db.ts (Sprint 1).
// For V2 standalone development, we declare the contract locally.

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

// ── Connection pool ──────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`[Vytalix/v2/db] Missing required env var: ${name}`);
  return v.trim();
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? '',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  console.error('[Vytalix/v2/db] Pool error:', err.message);
});

// ── UUID guard (mirrors Sprint 1 implementation) ─────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`[Vytalix/v2/db] Invalid tenantId format: "${tenantId}". Must be a UUID.`);
  }
}

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) {
    throw new Error(`[Vytalix/v2/db] Invalid userId format: must be a UUID.`);
  }
}

// ── Context types ────────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

export type TenantCallback<T> = (client: PoolClient) => Promise<T>;

// ── withTenant — transactional, SET LOCAL, audit-logged ───────────────────────
/**
 * Executes `callback` inside a PostgreSQL transaction where:
 *  - `app.current_tenant_id` is set with SET LOCAL (transaction-scoped)
 *  - `app.current_user_id`   is set with SET LOCAL (if userId provided)
 *  - Audit record written atomically before callback runs
 *  - COMMIT and ROLLBACK both clear SET LOCAL variables automatically
 *
 * This is the ONLY entry point for DB access from V2 handlers.
 * Engine methods receive the scoped client — they never call pool.connect().
 */
export async function withTenant<T>(
  ctx: TenantContext,
  callback: TenantCallback<T>
): Promise<T> {
  validateTenantId(ctx.tenantId);

  const client = await pool.connect();
  const requestId = ctx.requestId ?? randomUUID();

  try {
    await client.query('BEGIN');

    // SET LOCAL — transaction-scoped, cleared on COMMIT or ROLLBACK
    await client.query(`SET LOCAL app.current_tenant_id = '${ctx.tenantId}'`);

    if (ctx.userId) {
      validateUserId(ctx.userId);
      await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
    }

    await client.query(`SET LOCAL app.request_id = '${requestId}'`);

    // Audit — written atomically with the transaction
    await client.query(
      `INSERT INTO tenant_access_log (tenant_id, user_id, request_id, accessed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [ctx.tenantId, ctx.userId ?? null, requestId]
    );

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Scoped query helper ──────────────────────────────────────────────────────

export async function tenantQuery<T = unknown>(
  client: PoolClient,
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const result = await client.query<T>(text, values);
  return result.rows;
}
