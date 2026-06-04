import { describe, it, expect } from 'vitest'
import { withTenant, getDb } from './db'
import { DisgglobalVytalixClient } from './disglobal-client'

describe('Security & Isolation Regression Tests', () => {
  describe('Tenant Isolation (RLS)', () => {
    const tenantA = '00000000-0000-0000-0000-000000000001'
    const tenantB = '00000000-0000-0000-0000-000000000002'

    it('should isolate queries to the specific tenant and not leak across contexts', async () => {
      // 1. We create a mock record or select from tenants to ensure it's restricted.
      const resA = await withTenant(tenantA, async (tc) => {
        return tc.queryMany('SELECT id FROM tenants')
      })
      
      const resB = await withTenant(tenantB, async (tc) => {
        return tc.queryMany('SELECT id FROM tenants')
      })

      // Since these are tenant-isolated, A should only see A (if at all), and never B.
      const idsA = resA.map((r: any) => r.id)
      const idsB = resB.map((r: any) => r.id)

      expect(idsA).not.toContain(tenantB)
      expect(idsB).not.toContain(tenantA)
    })

    it('should wrap queries in a full transaction preventing RLS leakage', async () => {
      // If an error is thrown, the transaction rolls back and doesn't pollute the pool.
      await expect(
        withTenant(tenantA, async (tc) => {
          await tc.execute('SELECT 1')
          throw new Error('Simulated failure')
        })
      ).rejects.toThrow('Simulated failure')

      // Verify that after failure, a direct pool query doesn't retain the tenant context
      const pool = getDb().pool
      const client = await pool.connect()
      try {
        const res = await client.query("SELECT current_setting('app.current_tenant_id', TRUE) as tid")
        // En Postgres current_setting(..., TRUE) returns '' (empty string) or null if not set
        expect(!res.rows[0].tid || res.rows[0].tid === '').toBeTruthy()
      } finally {
        client.release()
      }
    })
  })

  describe('Pseudonymization Continuity', () => {
    it('should generate consistent subjectRefs regardless of apiKey when tenantSecret is persistent', () => {
      const client1 = new DisgglobalVytalixClient({
        apiKey: 'vyx_dis_key_1',
        tenantSecret: 'persistent_secret_123'
      })

      const client2 = new DisgglobalVytalixClient({
        apiKey: 'vyx_dis_key_2', // API key changed
        tenantSecret: 'persistent_secret_123' // Secret remains same
      })

      const subjectRef1 = (client1 as any).pseudonymize('user_999')
      const subjectRef2 = (client2 as any).pseudonymize('user_999')

      expect(subjectRef1).toBe(subjectRef2)
      expect(subjectRef1).toMatch(/^DISG-/)
    })

    it('should fallback to apiKey if tenantSecret is not provided (deprecation phase)', () => {
      const client = new DisgglobalVytalixClient({
        apiKey: 'vyx_dis_key_fallback'
      })

      const subjectRef = (client as any).pseudonymize('user_999')
      
      const clientExplicit = new DisgglobalVytalixClient({
        apiKey: 'vyx_dis_key_fallback',
        tenantSecret: 'vyx_dis_key_fallback'
      })
      const subjectRefExplicit = (clientExplicit as any).pseudonymize('user_999')
      
      expect(subjectRef).toBe(subjectRefExplicit)
    })
  })
})
