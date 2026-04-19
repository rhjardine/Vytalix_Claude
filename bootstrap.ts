// @ts-nocheck
// Bootstrap: hash passwords for demo users using pg direct
import bcrypt from 'bcryptjs'
import { getDb } from '../lib/db'
import { DEMO } from '../demo/demo-dataset'

const DEMO_PASSWORD  = 'Demo2024!'
const ADMIN_PASSWORD = 'Admin2024!'
const BCRYPT_ROUNDS  = 12

async function bootstrap() {
  console.log('\n  Bootstrapping auth credentials...\n')
  const db = getDb()

  const physicianHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS)
  const adminHash     = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS)

  // Update physician
  const r1 = await db.rawQuery(
    `UPDATE users SET "passwordHash" = $1 WHERE id = $2::uuid`,
    [physicianHash, DEMO.PHYSICIAN.ID]
  )
  if (r1.rowCount === 0) {
    console.log('  ⚠  Physician not found — run seed-demo.ts first')
  } else {
    console.log(`  ✓ Physician: ${DEMO.PHYSICIAN.EMAIL} / ${DEMO_PASSWORD}`)
  }

  // Upsert admin user
  await db.rawQuery(
    `INSERT INTO users (id, "tenantId", "organizationId", email, "passwordHash", role, "firstName", "lastName", "isActive")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'ORG_ADMIN', 'Admin', 'Vytalix', true)
     ON CONFLICT (id) DO UPDATE SET "passwordHash" = $5`,
    ['a1b2c3d4-0000-4000-8000-000000000099', DEMO.TENANT.ID, DEMO.ORGANIZATION.ID, 'admin@grupo919.health', adminHash]
  )
  console.log(`  ✓ Admin:     admin@grupo919.health / ${ADMIN_PASSWORD}`)

  // Upsert partner user (PARTNER role — read-only)
  const partnerHash = await bcrypt.hash('Partner2024!', BCRYPT_ROUNDS)
  await db.rawQuery(
    `INSERT INTO users (id, "tenantId", "organizationId", email, "passwordHash", role, "firstName", "lastName", "isActive")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'VIEWER', 'Partner', 'NueveOnce', true)
     ON CONFLICT (id) DO UPDATE SET "passwordHash" = $5`,
    ['a1b2c3d4-0000-4000-8000-000000000098', DEMO.TENANT.ID, DEMO.ORGANIZATION.ID, 'partner@nueve.once', partnerHash]
  )
  console.log(`  ✓ Partner:   partner@nueve.once / Partner2024!  (VIEWER role — read-only)`)

  console.log('\n  Bootstrap complete.\n')
  process.exit(0)
}

bootstrap().catch(e => { console.error(e.message); process.exit(1) })
