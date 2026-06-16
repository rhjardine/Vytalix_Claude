// =============================================================================
// src/shared/db/db.ts — Adapter shim for dental routers + repositories
//
// The dental repositories take a raw pg PoolClient and call client.query().
// The dental routers call: withTenant({ tenantId, userId, requestId }, fn)
//
// This shim provides:
//   - withTenant(ctx, fn): sets RLS context, passes raw PoolClient to fn
//   - getDb(): re-exported from platform/db for health checks
//
// DO NOT add business logic here. Pure infrastructure adapter.
// =============================================================================

import { Pool, PoolClient } from 'pg';
import { getDb } from '../../platform/db';

export { getDb };

/** Context object accepted by dental routers */
export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

/**
 * Provides a raw PoolClient with RLS context set.
 * The dental repositories call client.query() directly (not TenantClient),
 * so we must expose the raw pg PoolClient, not the TenantClient wrapper.
 *
 * Sets: app.current_tenant_id → tenantId (enables PostgreSQL RLS policies)
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool: Pool = getDb().pool;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', ctx.tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
