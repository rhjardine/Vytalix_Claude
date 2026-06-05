import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { getDb, withTenant } from '../src/platform/db'

describe('Tenant Isolation (RLS)', () => {
  const db = getDb()
  const tenantA = '00000000-0000-0000-0000-000000000001'
  const tenantB = '00000000-0000-0000-0000-000000000002'

  beforeAll(async () => {
    // Ensure table exists and RLS is enabled
    await db.rawQuery('ALTER TABLE patients ENABLE ROW LEVEL SECURITY;')
  })

  beforeEach(async () => {
    // Disable FORCE to allow rawQuery bypass
    await db.rawQuery('ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;')
    await db.rawQuery('DELETE FROM patients WHERE "tenantId" IN ($1::uuid, $2::uuid)', [tenantA, tenantB])
  })

  afterEach(async () => {
    await db.rawQuery('ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;')
    await db.rawQuery('DELETE FROM patients WHERE "tenantId" IN ($1::uuid, $2::uuid)', [tenantA, tenantB])
  })

  afterAll(async () => {
    // Revert to default
    await db.rawQuery('ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;')
  })

  it('should only allow reading records from the current tenant', async () => {
    // Insert bypassing RLS
    await db.rawQuery('ALTER TABLE patients NO FORCE ROW LEVEL SECURITY;')
    await db.rawQuery(
      `INSERT INTO patients (id, "tenantId", "firstName", "biologicalSex", "dateOfBirth", "createdAt", "updatedAt") 
       VALUES 
       (gen_random_uuid(), $1::uuid, 'Alice', 'FEMALE', '1980-01-01', NOW(), NOW()),
       (gen_random_uuid(), $2::uuid, 'Bob', 'MALE', '1990-01-01', NOW(), NOW())`,
      [tenantA, tenantB]
    )
    
    // Enable FORCE RLS so withTenant queries are properly scoped even for owner
    await db.rawQuery('ALTER TABLE patients FORCE ROW LEVEL SECURITY;')

    // Query as tenant A
    const patientsA = await withTenant(tenantA, tc => tc.queryMany<{firstName: string}>('SELECT * FROM patients'))
    expect(patientsA.length).toBe(1)
    expect(patientsA[0].firstName).toBe('Alice')

    // Query as tenant B
    const patientsB = await withTenant(tenantB, tc => tc.queryMany<{firstName: string}>('SELECT * FROM patients'))
    expect(patientsB.length).toBe(1)
    expect(patientsB[0].firstName).toBe('Bob')
  })

  it('should prevent inserting records for another tenant', async () => {
    await db.rawQuery('ALTER TABLE patients FORCE ROW LEVEL SECURITY;')
    await expect(
      withTenant(tenantA, tc => 
        tc.execute(
          `INSERT INTO patients (id, "tenantId", "firstName", "biologicalSex", "dateOfBirth", "createdAt", "updatedAt") 
           VALUES (gen_random_uuid(), $1::uuid, 'Charlie', 'MALE', '1985-01-01', NOW(), NOW())`,
          [tenantB]
        )
      )
    ).rejects.toThrow(/new row violates row-level security policy/)
  })

  it('should ensure withTenant sets SET LOCAL app.current_tenant_id inside a transaction', async () => {
    // We check that app.current_tenant_id is isolated and cleared after withTenant
    await withTenant(tenantA, async tc => {
      const res = await tc.queryOne<{current_tenant: string}>('SELECT current_setting(\'app.current_tenant_id\') as current_tenant')
      expect(res?.current_tenant).toBe(tenantA)
    })

    // Raw query outside withTenant should have no app.current_tenant_id or it should fail if we try to access it
    await expect(db.rawQueryOne('SELECT current_setting(\'app.current_tenant_id\')'))
      .rejects.toThrow(/unrecognized configuration parameter/)
  })
})
