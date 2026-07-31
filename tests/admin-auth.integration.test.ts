// =============================================================================
// Integration Test — Billing Admin authentication (RC-1 / condition C1)
//
// SEC-00C reproduced this chain end to end against a real database:
//   anonymous POST /admin/tenants/:tenantId/api-keys
//     → 201 + keyPlain → row in api_keys → X-API-Key works on /api/v2 → 200
//
// The first link is the one that has to break: if an anonymous caller can no
// longer reach the handler, no key is ever minted and the rest of the chain is
// unreachable. These tests pin that down — and, just as importantly, assert
// that the database is never touched on the rejected path.
//
// Mocks ONLY: platform/db (rawQuery spy — proves no write happens), platform/redis
// and platform/metering.service. No real Postgres, no Redis, no network.
// =============================================================================

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'

const h = vi.hoisted(() => ({ dbCalls: [] as unknown[] }))

// Call sites read the result of rawQuery in two different shapes: the CSV export
// maps over it directly, while other callers reach for `.rows`. The fake answers
// to both so the mock never decides the outcome of a test.
function emptyResult() {
  const result: any = []
  result.rows     = []
  result.rowCount = 0
  return result
}

vi.mock('../src/platform/db', () => ({
  getDb: () => ({
    rawQuery:    async (sql: string, params?: unknown[]) => { h.dbCalls.push({ sql, params }); return emptyResult() },
    rawQueryOne: async (sql: string, params?: unknown[]) => { h.dbCalls.push({ sql, params }); return null },
  }),
  withTenant: async (_t: string, fn: (tc: any) => any) => fn({
    queryOne: async () => null, queryMany: async () => [], execute: async () => {},
  }),
}))

vi.mock('../src/platform/redis', () => ({
  getRedisClient: () => { throw new Error('redis disabled in test') },
}))

vi.mock('../src/platform/metering.service', () => ({
  getMonthlyUsage:    async () => ({ TOTAL: 0 }),
  computeRevenueShare: async () => ({ platformShare: 0, tenantShare: 0 }),
  getUnitPriceCents:  () => 0,
}))

// JWT_SECRET has to exist before auth.middleware resolves it (>= 32 chars).
process.env.JWT_SECRET = 'rc1-integration-test-secret-value-0123456789'

import { createBillingAdminRouter } from '../src/api/handlers/billing-admin.handler'
import { signToken } from '../src/api/middlewares/auth.middleware'

const TENANT = 'a1b2c3d4-0000-4000-8000-000000000001'
const KEY_ID = 'b2070b28-9362-4a7c-8f63-a21e063865e3'

// The exact payload SEC-00C used to mint a permanent ENTERPRISE key anonymously.
const EXPLOIT_BODY = {
  name:          'pwned by anon',
  prefix:        'pwn',
  permissions:   { catalog: ['read'] },
  rateLimitTier: 'ENTERPRISE',
  createdBy:     '11111111-1111-4111-8111-111111111111',
}

// Every route the admin router exposes — the guard must cover all of them.
const ROUTES: Array<{ method: string; path: string; body?: unknown }> = [
  { method: 'POST',   path: `/admin/tenants/${TENANT}/api-keys`, body: EXPLOIT_BODY },
  { method: 'DELETE', path: `/admin/tenants/${TENANT}/api-keys/${KEY_ID}` },
  { method: 'GET',    path: `/admin/tenants/${TENANT}/usage` },
  { method: 'GET',    path: `/admin/tenants/${TENANT}/revenue-share` },
  { method: 'POST',   path: `/admin/tenants/${TENANT}/quota`, body: { monthlyApiLimit: 0 } },
  { method: 'GET',    path: `/admin/billing/export` },
]

function tokenFor(role: string): string {
  return signToken({
    sub:       'a1b2c3d4-0000-4000-8000-000000000099',
    tenant_id: TENANT,
    org_id:    'a1b2c3d4-0000-4000-8000-000000000002',
    role,
    email:     'admin@grupo919.health',
  })
}

let server: Server
let baseUrl: string

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/admin', createBillingAdminRouter())
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const addr = server.address()
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => { h.dbCalls = [] })

async function call(route: { method: string; path: string; body?: unknown }, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${route.path}`, {
    method:  route.method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    route.body === undefined ? undefined : JSON.stringify(route.body),
  })
}

describe('Billing admin — anonymous access is refused (SEC-00C regression)', () => {
  it('rejects the exact SEC-00C provisioning request with 401 and mints no key', async () => {
    const res = await call(ROUTES[0])

    expect(res.status).toBe(401)

    // The response must not carry a usable credential.
    const body = await res.json() as Record<string, unknown>
    expect(body.keyPlain).toBeUndefined()
    expect(body.keyId).toBeUndefined()
    expect(body.status).toBe(401)

    // Decisive assertion: the handler was never reached, so no row was written.
    expect(h.dbCalls).toHaveLength(0)
  })

  it.each(ROUTES)('rejects $method $path without a token', async (route) => {
    const res = await call(route)
    expect(res.status).toBe(401)
    expect(h.dbCalls).toHaveLength(0)
  })

  it('rejects a malformed Authorization header', async () => {
    const res = await call(ROUTES[0], { Authorization: 'vyx_pwn_MXe2tWG965UmoFZCrsmfWLU87tCDYZQb' })
    expect(res.status).toBe(401)
    expect(h.dbCalls).toHaveLength(0)
  })

  it('rejects a forged bearer token', async () => {
    const res = await call(ROUTES[0], { Authorization: 'Bearer not.a.real.token' })
    expect(res.status).toBe(401)
    expect(h.dbCalls).toHaveLength(0)
  })
})

describe('Billing admin — authenticated but under-privileged access is refused', () => {
  it.each(['PHYSICIAN', 'CARE_COORDINATOR', 'VIEWER', 'PARTNER'])(
    'rejects role %s with 403 and writes nothing',
    async (role) => {
      const res = await call(ROUTES[0], { Authorization: `Bearer ${tokenFor(role)}` })
      expect(res.status).toBe(403)
      expect(h.dbCalls).toHaveLength(0)
    },
  )
})

describe('Billing admin — legitimate administrators keep working', () => {
  it.each(['ORG_ADMIN', 'SUPER_ADMIN'])('allows role %s to provision a key', async (role) => {
    const res = await call(ROUTES[0], { Authorization: `Bearer ${tokenFor(role)}` })

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.keyPlain).toEqual(expect.stringContaining('vyx_pwn_'))

    // The guard must not have swallowed the write the handler is meant to do.
    expect(h.dbCalls).toHaveLength(1)
  })

  it('allows an administrator through every route of the router', async () => {
    const auth = { Authorization: `Bearer ${tokenFor('ORG_ADMIN')}` }
    for (const route of ROUTES) {
      const res = await call(route, auth)
      expect(res.status).toBeLessThan(400)
    }
  })
})
