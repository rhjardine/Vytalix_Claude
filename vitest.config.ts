import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    globals: false,
    // Mock infrastructure modules so pure-logic tests don't need a live DB
    server: {
      deps: {
        // Treat these as external — they will be auto-mocked via __mocks__ or vi.mock()
        inline: ['vitest'],
      },
    },
  },
  resolve: {
    alias: {
      // Redirect infrastructure imports to no-op stubs for test isolation
      './db':         new URL('./test-stubs/db.stub.ts',         import.meta.url).pathname,
      './redis':      new URL('./test-stubs/redis.stub.ts',      import.meta.url).pathname,
      './event-bus':  new URL('./test-stubs/event-bus.stub.ts',  import.meta.url).pathname,
      './logger':     new URL('./test-stubs/logger.stub.ts',     import.meta.url).pathname,
    },
  },
})
