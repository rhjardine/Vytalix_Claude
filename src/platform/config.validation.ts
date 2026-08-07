// =============================================================================
// src/platform/config.validation.ts
// Startup configuration guard.
//
// Development and test keep the convenient defaults that make `make demo` work
// out of the box. Staging and production must supply every critical value
// explicitly: the process refuses to start otherwise, rather than silently
// falling back to a value that is published in this repository.
//
// Called once from server.ts before the HTTP listener is opened.
// =============================================================================

import { logger } from './logger'

/** Values that exist in the repo (README, .env.example, Postman, examples) and
 *  must therefore never authenticate anything outside local development. */
const PUBLISHED_DEFAULTS: Record<string, string[]> = {
  DISGLOBAL_WEBHOOK_SECRET: ['sandbox-webhook-secret-v1'],
  WEBHOOK_SECRET:           ['demo_webhook_secret'],
  JWT_SECRET:               ['change-me-in-production'],
  DEFAULT_FUNNEL_TENANT_ID: ['a1b2c3d4-0000-4000-8000-000000000001'],
}

/** Required once the deployment is not local. Each entry explains *why*, so a
 *  failed boot tells an operator what to provision instead of just what broke. */
const REQUIRED_OUTSIDE_DEV: Array<{ name: string; why: string }> = [
  { name: 'DATABASE_URL',             why: 'PostgreSQL connection — payments and clinical data are persisted here' },
  { name: 'REDIS_URL',                why: 'idempotency guards, rate limiting and service activation flags' },
  { name: 'JWT_SECRET',               why: 'signs physician/admin sessions' },
  { name: 'DISGLOBAL_WEBHOOK_SECRET', why: 'HMAC secret that authenticates Disglobal payment webhooks' },
  { name: 'DEFAULT_FUNNEL_TENANT_ID', why: 'tenant attributed to public funnel traffic and webhook payments' },
]

export interface ConfigValidationResult {
  environment: string
  errors:      string[]
  warnings:    string[]
}

/**
 * Inspects the environment without touching it. Returns findings instead of
 * throwing so callers (and tests) decide what to do.
 */
export function inspectConfig(env: NodeJS.ProcessEnv = process.env): ConfigValidationResult {
  const environment = env.NODE_ENV ?? 'development'
  const isLocal     = environment === 'development' || environment === 'test'
  const errors:   string[] = []
  const warnings: string[] = []

  for (const { name, why } of REQUIRED_OUTSIDE_DEV) {
    const value = env[name]
    if (!value || value.trim() === '') {
      const message = `${name} is not set — ${why}`
      isLocal ? warnings.push(message) : errors.push(message)
      continue
    }

    if (PUBLISHED_DEFAULTS[name]?.includes(value)) {
      const message = `${name} still uses a value published in this repository — ${why}`
      isLocal ? warnings.push(message) : errors.push(message)
    }
  }

  // JWT_SECRET length is already enforced where it is consumed
  // (auth.middleware.ts); surface it at boot so it fails before traffic, not on
  // the first authenticated request.
  const jwt = env.JWT_SECRET
  if (jwt && jwt.length < 32) {
    const message = 'JWT_SECRET must be at least 32 characters'
    isLocal ? warnings.push(message) : errors.push(message)
  }

  return { environment, errors, warnings }
}

/**
 * Fails fast on misconfiguration outside development/test.
 * Logs findings; never logs the values themselves.
 */
export function validateConfigOrExit(env: NodeJS.ProcessEnv = process.env): void {
  const { environment, errors, warnings } = inspectConfig(env)

  for (const warning of warnings) {
    logger.warn({ environment }, `Config (development default in use): ${warning}`)
  }

  if (errors.length > 0) {
    logger.fatal(
      { environment, problems: errors },
      `Refusing to start in "${environment}": ${errors.length} critical configuration problem(s). ` +
      'Provision the listed variables — see .env.example.',
    )
    process.exit(1)
  }

  logger.info({ environment }, 'Configuration validated')
}
