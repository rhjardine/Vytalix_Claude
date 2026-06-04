// test-stubs/logger.stub.ts — Silent stub for pino logger in unit tests.
const noop = () => {}
const child = () => logger
export const logger = {
  info:  noop,
  warn:  noop,
  error: noop,
  debug: noop,
  child: child,
}
