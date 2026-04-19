#!/usr/bin/env ts-node
// =============================================================================
// make check / npm run demo:check
// GO / NO-GO validator for partner demo
// Exit 0 = SYSTEM STATUS: READY FOR PARTNER DEMO
// Exit 1 = one or more critical checks failed
// =============================================================================
import * as http from 'http'
import * as path from 'path'

// Import DEMO dataset
const DEMO = require(path.join(__dirname, '../src/demo/demo-dataset')).DEMO

// Check if Prisma client is initialized
let prismaReady = false
let prisma: any
try {
  const { PrismaClient: PC } = require('@prisma/client')
  prisma = new PC({ log: [] })
  prismaReady = true
} catch {
  // Prisma not generated yet
}
const API_URL = `http://localhost:${process.env.API_PORT ?? 3001}`

interface CheckResult { name: string; passed: boolean; detail: string; critical: boolean }
const results: CheckResult[] = []
let criticalFails = 0

function check(name: string, passed: boolean, detail: string, critical = true) {
  results.push({ name, passed, detail, critical })
  if (!passed && critical) criticalFails++
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.get(url, { timeout: 3000 }, (res) => {
      let body = ''
      res.on('data', (d: Buffer) => body += d)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    r.on('error', reject)
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')) })
  })
}

async function run() {
  console.log('\n\x1b[1m  Vytalix — Pre-Demo Validation\x1b[0m')
  console.log('  ' + '─'.repeat(58))

  // ── DB connectivity ──────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`
    check('DB connection', true, 'PostgreSQL reachable')
  } catch (e) {
    check('DB connection', false, `Cannot connect: ${(e as Error).message}`)
    printResults(); process.exit(1)
  }

  // ── Tenant ───────────────────────────────────────────────────
  const tenant = await prisma.$queryRaw<any[]>`SELECT id, name FROM tenants WHERE id = ${DEMO.TENANT.ID}::uuid LIMIT 1`
  check('Tenant exists', tenant.length > 0, tenant[0]?.name ?? 'NOT FOUND')

  // ── RLS active ───────────────────────────────────────────────
  const rlsCheck = await prisma.$queryRaw<any[]>`
    SELECT tablename, rowsecurity, forcerowsecurity
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname = 'public' AND t.tablename = 'patients'
  `
  const rlsActive = rlsCheck[0]?.rowsecurity === true
  const rlsForced = rlsCheck[0]?.forcerowsecurity === true
  check('RLS enabled on patients', rlsActive, rlsActive ? 'rowsecurity=true' : 'NOT ENABLED — run migration_rls.sql')
  check('RLS forced on patients', rlsForced, rlsForced ? 'forcerowsecurity=true' : 'NOT FORCED — run migration_rls.sql', false)

  // ── Patients ─────────────────────────────────────────────────
  // Bypass RLS for check (uses raw query without tenant context)
  await prisma.$executeRaw`SET app.current_tenant = ${DEMO.TENANT.ID}::uuid`
  const p1 = await prisma.$queryRaw<any[]>`SELECT id, mrn FROM patients WHERE id = ${DEMO.PATIENT_1.ID}::uuid`
  const p2 = await prisma.$queryRaw<any[]>`SELECT id, mrn FROM patients WHERE id = ${DEMO.PATIENT_2.ID}::uuid`
  check('Patient 1 — Roberto Vargas', p1.length > 0, p1[0]?.mrn ?? 'NOT FOUND')
  check('Patient 2 — Ana Restrepo',   p2.length > 0, p2[0]?.mrn ?? 'NOT FOUND')

  // ── Observations count ────────────────────────────────────────
  const obsP1 = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS n FROM clinical_observations WHERE "patientId" = ${DEMO.PATIENT_1.ID}::uuid`
  const obsP2 = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS n FROM clinical_observations WHERE "patientId" = ${DEMO.PATIENT_2.ID}::uuid`
  const nP1 = Number(obsP1[0]?.n ?? 0)
  const nP2 = Number(obsP2[0]?.n ?? 0)
  check('Observations P1', nP1 === DEMO.PATIENT_1.EXPECTED.OBSERVATIONS, `${nP1}/${DEMO.PATIENT_1.EXPECTED.OBSERVATIONS}`)
  check('Observations P2', nP2 === DEMO.PATIENT_2.EXPECTED.OBSERVATIONS, `${nP2}/${DEMO.PATIENT_2.EXPECTED.OBSERVATIONS}`)

  // ── Snapshot values ───────────────────────────────────────────
  const snap = await prisma.$queryRaw<any[]>`
    SELECT "latestLdlMgDl"::float AS ldl, "latestSystolicBp"::float AS sbp, "latestFastingGlucose"::float AS glu
    FROM patient_health_snapshots WHERE "patientId" = ${DEMO.PATIENT_1.ID}::uuid
  `
  const ldl = snap[0]?.ldl; const sbp = snap[0]?.sbp; const glu = snap[0]?.glu
  check('Snapshot LDL',      Number(ldl) === DEMO.PATIENT_1.EXPECTED.LDL_LATEST,      `${ldl} / ${DEMO.PATIENT_1.EXPECTED.LDL_LATEST} expected`)
  check('Snapshot SBP',      Number(sbp) === DEMO.PATIENT_1.EXPECTED.SYSTOLIC_LATEST,  `${sbp} / ${DEMO.PATIENT_1.EXPECTED.SYSTOLIC_LATEST} expected`)
  check('Snapshot glucose',  Number(glu) === DEMO.PATIENT_1.EXPECTED.GLUCOSE_LATEST,   `${glu} / ${DEMO.PATIENT_1.EXPECTED.GLUCOSE_LATEST} expected`)

  // ── Risk score ────────────────────────────────────────────────
  const score = await prisma.$queryRaw<any[]>`
    SELECT "riskCategory", "valuePercent"::float AS pct FROM risk_scores
    WHERE "patientId" = ${DEMO.PATIENT_1.ID}::uuid ORDER BY "computedAt" DESC LIMIT 1
  `
  check('Risk score exists',    score.length > 0,                                   score[0] ? `${Number(score[0].pct).toFixed(1)}%` : 'NOT FOUND')
  check('Risk category = HIGH', score[0]?.riskCategory === DEMO.PATIENT_1.EXPECTED.RISK_CATEGORY, score[0]?.riskCategory ?? 'MISSING')

  // ── Recommendations ───────────────────────────────────────────
  const recs = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS n, COUNT(CASE WHEN urgency='SOON' THEN 1 END)::int AS urgent
    FROM recommendations WHERE "patientId" = ${DEMO.PATIENT_1.ID}::uuid AND status = 'PENDING'
  `
  const nRecs = Number(recs[0]?.n ?? 0)
  const nUrgent = Number(recs[0]?.urgent ?? 0)
  check('Decisions total',   nRecs   === DEMO.VALIDATION.TOTAL_DECISIONS,   `${nRecs}/${DEMO.VALIDATION.TOTAL_DECISIONS}`)
  check('Decisions SOON',    nUrgent === DEMO.VALIDATION.URGENT_DECISIONS,   `${nUrgent}/${DEMO.VALIDATION.URGENT_DECISIONS}`)

  // ── Decision traces ───────────────────────────────────────────
  const traces = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS n FROM decision_traces dt
    JOIN recommendations r ON r.id = dt."recommendationId"
    WHERE r."patientId" = ${DEMO.PATIENT_1.ID}::uuid
  `
  const nTraces = Number(traces[0]?.n ?? 0)
  check('Decision traces', nTraces === nRecs, `${nTraces}/${nRecs} recommendations traced`)

  // ── Auth ──────────────────────────────────────────────────────
  const physician = await prisma.$queryRaw<any[]>`SELECT id, "passwordHash" FROM users WHERE id = ${DEMO.PHYSICIAN.ID}::uuid`
  const hasRealHash = physician[0]?.passwordHash?.startsWith('$2') && !physician[0]?.passwordHash?.includes('DEMO_ONLY')
  check('Auth credentials bootstrapped', hasRealHash, hasRealHash ? 'bcrypt hash present' : 'Run: npm run auth:bootstrap')

  // ── API health ────────────────────────────────────────────────
  try {
    const { status, body } = await httpGet(`${API_URL}/health`)
    const data = JSON.parse(body)
    check('API health endpoint', status === 200, `HTTP ${status} · db=${data.checks?.db?.status ?? 'unknown'}`, false)
  } catch {
    check('API health endpoint', false, 'Not reachable — start with: make demo', false)
  }

  // ── TypeScript (no compilation errors) ───────────────────────
  try {
    const { execSync } = require('child_process')
    const result = execSync('npx tsc --project tsconfig.server.json --noEmit 2>&1', { encoding: 'utf8', cwd: process.cwd() })
    const errCount = (result.match(/error TS/g) || []).length
    check('TypeScript compilation', errCount === 0, errCount === 0 ? '0 errors' : `${errCount} errors — run: npm run typecheck`)
  } catch (e: any) {
    const errCount = (e.stdout?.match(/error TS/g) || []).length
    check('TypeScript compilation', errCount === 0, `${errCount} errors — run: npm run typecheck`)
  }

  printResults()
}

function printResults() {
  console.log('')
  for (const r of results) {
    const icon  = r.passed ? '\x1b[32m✓\x1b[0m' : r.critical ? '\x1b[31m✗\x1b[0m' : '\x1b[33m~\x1b[0m'
    const label = r.passed ? '' : r.critical ? ' \x1b[31m[FAIL]\x1b[0m' : ' \x1b[33m[WARN]\x1b[0m'
    console.log(`  ${icon} ${r.name.padEnd(38)} ${r.detail}${label}`)
  }
  console.log('\n  ' + '─'.repeat(58))

  if (criticalFails === 0) {
    const warns = results.filter(r => !r.passed && !r.critical).length
    console.log(`\n  \x1b[42m\x1b[30m  SYSTEM STATUS: READY FOR PARTNER DEMO  \x1b[0m${warns > 0 ? ` (${warns} warning)` : ''}`)
    console.log('  All critical checks passed.\n')
  } else {
    console.log(`\n  \x1b[41m\x1b[37m  SYSTEM STATUS: NOT READY — ${criticalFails} critical check(s) failed  \x1b[0m`)
    console.log('  Run \x1b[36mmake reset\x1b[0m to restore demo data.\n')
  }
}

run()
  .catch(e => { console.error('\n  Check error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
  .then(() => { if (criticalFails > 0) process.exit(1) })
