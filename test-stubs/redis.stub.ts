// test-stubs/redis.stub.ts — No-op stub for Redis in unit tests.
export function getRedisClient() {
  return {
    setex: async () => {},
    get:   async () => null,
    del:   async () => {},
  }
}
