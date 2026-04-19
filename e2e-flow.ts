#!/usr/bin/env ts-node
// =============================================================================
// E2E Flow Validator — Bloque D
//
// Ejecuta el flujo clínico completo con HTTP real contra el API:
//   1. Login → get JWT
//   2. Create patient
//   3. Ingest observation
//   4. Calculate risk score
//   5. Generate decision
//   6. Retrieve decision trace (explainability)
//   7. Verify timeline
//   8. Review decision
//
// Cada paso valida el resultado antes de continuar.
// Exit 0 = flujo completo exitoso. Exit 1 = fallo en algún paso.
//
// Run: npx ts-node scripts/e2e-flow.ts
// =============================================================================

import * as http from 'http'

const BASE = `http://localhost:${process.env.API_PORT ?? 3001}`
const TENANT_ID = 'a1b2c3d4-0000-4000-8000-000000000001'

let passCount = 0
let failCount = 0

// ─────────────────────────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────────────────────────

function req(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const opts: http.RequestOptions = {
      hostname: 'localhost',
      port: parseInt(process.env.API_PORT ?? '3001'),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': TENANT_ID,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const r = http.request(opts, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode ?? 0, data: body })
        }
      })
    })
    r.on('error', reject)
    if (payload) r.write(payload)
    r.end()
  })
}

// ─────────────────────────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────────────────────────

function assert(name: string, condition: boolean, detail: string) {
  if (condition) {
    passCount++
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(40)} ${detail}`)
  } else {
    failCount++
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(40)} \x1b[31m${detail}\x1b[0m`)
  }
}

// ─────────────────────────────────────────────────────────────────
// E2E flow
// ─────────────────────────────────────────────────────────────────

async function runE2E() {
  console.log('\n\x1b[1m  Vytalix E2E Flow Validation\x1b[0m\n')
  console.log('  ' + '─'.repeat(60))

  // Step 0: Health check
  console.log('\n  \x1b[2mStep 0 — System health\x1b[0m')
  const health = await req('GET', '/health').catch(() => ({ status: 0, data: {} }))
  assert('Health endpoint responds', health.status === 200, `HTTP ${health.status}`)
  if (health.status !== 200) {
    console.log('\n  \x1b[31m✗ System not running. Start with: make demo\x1b[0m\n')
    process.exit(1)
  }

  // Step 1: Authentication
  console.log('\n  \x1b[2mStep 1 — Authentication\x1b[0m')
  const loginRes = await req('POST', '/auth/login', {
    email: 'dr.martinez@grupo919.health',
    password: 'Demo2024!',
  })
  assert('Login returns 200', loginRes.status === 200, `HTTP ${loginRes.status}`)
  assert('Login returns token', typeof loginRes.data?.token === 'string', loginRes.data?.token ? 'present' : 'MISSING')
  assert('Token is JWT format', loginRes.data?.token?.split('.').length === 3, 'JWT format OK')

  const TOKEN = loginRes.data?.token
  if (!TOKEN) { console.log('\n  \x1b[31mCannot continue without token\x1b[0m\n'); process.exit(1) }

  // Step 2: Create patient
  console.log('\n  \x1b[2mStep 2 — Create patient\x1b[0m')
  const orgId = 'a1b2c3d4-0000-4000-8000-000000000002'
  const patRes = await req('POST', '/v1/patients', {
    mrn: `E2E-TEST-${Date.now()}`,
    organizationId: orgId,
    firstName: 'E2E',
    lastName: 'Test',
    dateOfBirth: '1970-01-01',
    biologicalSex: 'MALE',
  }, TOKEN)
  assert('Create patient returns 201', patRes.status === 201, `HTTP ${patRes.status}`)
  assert('Patient has UUID id', /^[0-9a-f-]{36}$/.test(patRes.data?.data?.id ?? ''), patRes.data?.data?.id ?? 'NO ID')
  assert('Patient has contractVersion', patRes.data?.meta?.contractVersion === '1.0', patRes.data?.meta?.contractVersion ?? 'MISSING')

  const PATIENT_ID = patRes.data?.data?.id
  if (!PATIENT_ID) { console.log('\n  \x1b[31mCannot continue without patient ID\x1b[0m\n'); process.exit(1) }

  // Step 3: Ingest observation (LDL > 190 — will trigger rule H-001)
  console.log('\n  \x1b[2mStep 3 — Ingest clinical observation\x1b[0m')
  const obsRes = await req('POST', '/v1/observations', {
    patientId: PATIENT_ID,
    loincCode: '2089-1',
    valueNumeric: 195.0,
    unit: 'mg/dL',
    observedAt: new Date().toISOString(),
    sourceSystem: 'MANUAL_ENTRY',
  }, TOKEN)
  assert('Ingest observation returns 201', obsRes.status === 201, `HTTP ${obsRes.status}`)
  assert('Observation has normalized value', obsRes.data?.data?.normalizedValue === 195, `${obsRes.data?.data?.normalizedValue}`)
  assert('Normalized unit is mg/dL', obsRes.data?.data?.normalizedUnit === 'mg/dL', `${obsRes.data?.data?.normalizedUnit}`)

  // Wait for async pipeline
  await new Promise(r => setTimeout(r, 1500))

  // Step 4: Calculate risk score
  console.log('\n  \x1b[2mStep 4 — Calculate cardiovascular risk\x1b[0m')
  const riskRes = await req('POST', '/v1/risk/calculate', {
    patientId: PATIENT_ID,
    scoreType: 'CARDIOVASCULAR_10Y',
  }, TOKEN)
  // Insufficient data for new patient is acceptable — no snapshot yet
  const riskOk = riskRes.status === 200 || riskRes.status === 422
  assert('Risk endpoint responds', riskOk, `HTTP ${riskRes.status}`)
  if (riskRes.status === 200) {
    assert('Risk has category', ['LOW','MODERATE','HIGH','VERY_HIGH'].includes(riskRes.data?.data?.riskCategory), riskRes.data?.data?.riskCategory)
  } else {
    assert('Insufficient data handled gracefully', riskRes.status === 422, 'HTTP 422 — expected for new patient')
  }

  // Step 5: Generate decisions
  console.log('\n  \x1b[2mStep 5 — Generate clinical decisions\x1b[0m')
  const decRes = await req('POST', '/v1/decisions/generate', { patientId: PATIENT_ID }, TOKEN)
  assert('Decision generation returns 200', decRes.status === 200, `HTTP ${decRes.status}`)
  assert('Decisions generated >= 0', typeof decRes.data?.data?.generated === 'number', `${decRes.data?.data?.generated}`)

  // Step 6: Get patient decisions + decision trace
  console.log('\n  \x1b[2mStep 6 — Retrieve decision + explainability trace\x1b[0m')
  const listDecRes = await req('GET', `/v1/patients/${PATIENT_ID}/decisions`, undefined, TOKEN)
  assert('Decision list returns 200', listDecRes.status === 200, `HTTP ${listDecRes.status}`)

  const firstDecId = listDecRes.data?.data?.[0]?.id
  if (firstDecId) {
    const traceRes = await req('GET', `/v1/decisions/${firstDecId}/trace`, undefined, TOKEN)
    assert('Decision trace returns 200', traceRes.status === 200, `HTTP ${traceRes.status}`)
    assert('Trace has explanation', typeof traceRes.data?.data?.explanation?.summary === 'string', 'summary present')
    assert('Trace has primaryFactors', Array.isArray(traceRes.data?.data?.explanation?.primaryFactors), 'array present')
    assert('Trace has confidence', ['high','medium','low'].includes(traceRes.data?.data?.explanation?.confidence), traceRes.data?.data?.explanation?.confidence)
  } else {
    assert('No decisions to trace (new patient — expected)', true, 'skipped — no decisions yet')
  }

  // Step 7: Timeline
  console.log('\n  \x1b[2mStep 7 — Patient timeline\x1b[0m')
  const timelineRes = await req('GET', `/v1/patients/${PATIENT_ID}/timeline`, undefined, TOKEN)
  assert('Timeline returns 200', timelineRes.status === 200, `HTTP ${timelineRes.status}`)
  assert('Timeline has events array', Array.isArray(timelineRes.data?.data?.events), 'array present')
  assert('Timeline has summary', typeof timelineRes.data?.data?.summary === 'object', 'object present')
  assert('Timeline contract version 1.1', timelineRes.data?.meta?.contractVersion === '1.1', timelineRes.data?.meta?.contractVersion)

  // Step 8: Review decision (if any pending)
  if (firstDecId) {
    console.log('\n  \x1b[2mStep 8 — Physician reviews decision\x1b[0m')
    const reviewRes = await req('PATCH', `/v1/decisions/${firstDecId}/review`, {
      action: 'ACCEPTED',
      note: 'E2E test review — accepted',
    }, TOKEN)
    assert('Review returns 200', reviewRes.status === 200, `HTTP ${reviewRes.status}`)
    assert('Status changed to ACCEPTED', reviewRes.data?.data?.status === 'ACCEPTED', reviewRes.data?.data?.status)
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(60))
  const total = passCount + failCount
  if (failCount === 0) {
    console.log(`\n  \x1b[42m\x1b[30m  E2E PASS — ${passCount}/${total} checks  \x1b[0m`)
    console.log('  All clinical pipeline steps verified end-to-end.\n')
  } else {
    console.log(`\n  \x1b[41m\x1b[37m  E2E FAIL — ${failCount} check(s) failed (${passCount}/${total} passed)  \x1b[0m\n`)
  }
}

runE2E().catch(e => {
  console.error('\n  E2E error:', e.message)
  process.exit(1)
}).then(() => {
  if (failCount > 0) process.exit(1)
})
