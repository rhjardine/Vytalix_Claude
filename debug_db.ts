import { getDb, withTenant } from './db'

async function debug() {
  const db = getDb()
  const tenantA = '00000000-0000-0000-0000-000000000001'
  await db.rawQuery('DELETE FROM patients WHERE "tenantId" = $1::uuid', [tenantA])
  
  await db.rawQuery(`INSERT INTO patients (id, "tenantId", "firstName", "biologicalSex", "dateOfBirth", "createdAt", "updatedAt") 
       VALUES (gen_random_uuid(), $1::uuid, 'Alice', 'FEMALE', '1980-01-01', NOW(), NOW())`, [tenantA])
       
  const raw = await db.rawQuery('SELECT id, "tenantId", "firstName" FROM patients WHERE "tenantId" = $1::uuid', [tenantA])
  console.log('RAW query length:', raw.length)
  
  const scoped = await withTenant(tenantA, tc => tc.queryMany('SELECT id, "tenantId", "firstName" FROM patients WHERE "tenantId" = $1::uuid', [tenantA]))
  console.log('SCOPED query length:', scoped.length)
  
  const testSetting = await withTenant(tenantA, tc => tc.queryOne('SELECT current_setting(\'app.current_tenant_id\', true) as current_tenant'))
  console.log('SETTING:', testSetting)
  process.exit(0)
}
debug().catch(console.error)
