// =============================================================================
// tests/funnel-rls.test.ts — Funnel RLS runtime enforcement (P1-C)
//
// Proves that the funnel now runs under withTenant() and PostgreSQL RLS is a
// REAL runtime defense (not just declarative). Uses FORCE ROW LEVEL SECURITY so
// even the table owner is subject to the tenant_isolation policy — the same
// pattern as tests/tenant-isolation.test.ts.
//
// DB-dependent (Postgres): runs green in the CI "full suite" only when a
// Postgres service is provisioned (advisory stage). Executed against a real
// PostgreSQL 16 for P1-C evidence.
// =============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { getDb, withTenant } from '../src/platform/db'

describe('Funnel RLS runtime enforcement (funnel_leads)', () => {
  const db = getDb()
  const tenantA = '00000000-0000-0000-0000-0000000000a1'
  const tenantB = '00000000-0000-0000-0000-0000000000b2'
  const emailA  = 'a@rls.test'

  const insertLeadA = (tc: any) => tc.execute(
    `INSERT INTO funnel_leads ("tenantId", email, source, status) VALUES ($1::uuid,$2,$3,'NEW')`,
    [tenantA, emailA, 'CTA_FORM'],
  )

  beforeAll(async () => {
    await db.rawQuery('ALTER TABLE funnel_leads ENABLE ROW LEVEL SECURITY;')
    // Ensure the tenant_isolation policy exists (same shape as migration_rls.sql);
    // an RLS-enabled table with no policy is deny-all, which would mask enforcement.
    await db.rawQuery('DROP POLICY IF EXISTS tenant_isolation ON funnel_leads;')
    await db.rawQuery(
      `CREATE POLICY tenant_isolation ON funnel_leads
         USING ("tenantId"::text = current_setting('app.current_tenant_id', true));`,
    )
  })
  beforeEach(async () => {
    await db.rawQuery('ALTER TABLE funnel_leads NO FORCE ROW LEVEL SECURITY;')
    await db.rawQuery('DELETE FROM funnel_leads WHERE "tenantId" IN ($1::uuid,$2::uuid)', [tenantA, tenantB])
  })
  afterAll(async () => {
    await db.rawQuery('ALTER TABLE funnel_leads NO FORCE ROW LEVEL SECURITY;')
    await db.rawQuery('DELETE FROM funnel_leads WHERE "tenantId" IN ($1::uuid,$2::uuid)', [tenantA, tenantB])
  })

  // Case 1 — tenant A creates a lead → allowed, visible in A's context.
  it('Case 1: tenant A creates a lead — allowed and visible in A context', async () => {
    await db.rawQuery('ALTER TABLE funnel_leads FORCE ROW LEVEL SECURITY;')
    const inserted = await withTenant(tenantA, tc => tc.queryOne<{ id: string }>(
      `INSERT INTO funnel_leads ("tenantId", email, source, status) VALUES ($1::uuid,$2,$3,'NEW') RETURNING id`,
      [tenantA, emailA, 'CTA_FORM'],
    ))
    expect(inserted?.id).toBeTruthy()
    const seenByA = await withTenant(tenantA, tc => tc.queryMany('SELECT id FROM funnel_leads WHERE email=$1', [emailA]))
    expect(seenByA.length).toBe(1)
  })

  // Case 2 — tenant B cannot read or modify tenant A's data → blocked by RLS.
  it('Case 2: tenant B cannot read or modify tenant A data', async () => {
    await db.rawQuery('ALTER TABLE funnel_leads FORCE ROW LEVEL SECURITY;')
    await withTenant(tenantA, insertLeadA)

    const seenByB = await withTenant(tenantB, tc => tc.queryMany('SELECT id FROM funnel_leads WHERE email=$1', [emailA]))
    expect(seenByB.length).toBe(0)                       // cannot READ across tenant

    const updatedByB = await withTenant(tenantB, tc =>
      tc.queryMany('UPDATE funnel_leads SET name=$1 WHERE email=$2 RETURNING id', ['tampered', emailA]))
    expect(updatedByB.length).toBe(0)                    // cannot MODIFY across tenant

    const aRow = await withTenant(tenantA, tc =>
      tc.queryOne<{ name: string | null }>('SELECT name FROM funnel_leads WHERE email=$1', [emailA]))
    expect(aRow?.name ?? null).toBeNull()                // A's row intact
  })

  // Case 3 — no tenant context → FORCE RLS blocks all access.
  it('Case 3: request without a tenant context is denied access (no GUC)', async () => {
    await db.rawQuery('ALTER TABLE funnel_leads FORCE ROW LEVEL SECURITY;')
    await withTenant(tenantA, insertLeadA)

    // Raw connection with NO app.current_tenant_id set → RLS yields 0 rows.
    const raw = await db.rawQuery('SELECT id FROM funnel_leads WHERE email=$1', [emailA])
    expect(raw.length).toBe(0)
  })
})
