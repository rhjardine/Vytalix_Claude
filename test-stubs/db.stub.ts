// test-stubs/db.stub.ts — No-op stub for withTenant and getDb in unit tests.
export async function withTenant<T>(_tenantId: string, fn: (tc: any) => Promise<T>): Promise<T> {
  const noop = {
    queryOne:  async () => null,
    queryMany: async () => [],
    execute:   async () => {},
  }
  return fn(noop)
}

export function getDb() {
  return {
    pool: null,
    rawQuery:    async () => [],
    rawQueryOne: async () => null,
  }
}

export async function writeAuditLog() {}
export async function checkDbHealth() { return false }
