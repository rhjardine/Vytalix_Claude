// =============================================================================
// src/security/index.ts — Security barrel export
// Single import point for all security middleware.
// Ordering matters: use in this sequence on every route.
// =============================================================================

export { requireApiKey, hasPermission, generateApiKey } from './api-key.middleware'
export type { ApiKeyContext }                           from './api-key.middleware'

export {
  requireConsent, grantConsent, withdrawConsent,
  getConsentStatus, hasValidConsent, invalidateConsentCache,
} from './consent.guard'
export type { ConsentType }                            from './consent.guard'

export {
  rateLimiter,
  requestSizeGuard,
  requestLogger,
  scrubSensitive,
  verifyWebhookSignature,
  additionalSecurityHeaders,
} from './hardening.middleware'

// ── Canonical security stack for /api/v2/* routes ─────────────────
// Import and apply in this order:
//
//   import { v2SecurityStack } from '@security'
//   router.use(v2SecurityStack)
//
// =============================================================================

import type { RequestHandler } from 'express'
import { rateLimiter, requestSizeGuard, requestLogger, additionalSecurityHeaders } from './hardening.middleware'

export const v2SecurityStack: RequestHandler[] = [
  additionalSecurityHeaders(),
  requestSizeGuard(2 * 1024 * 1024),  // 2MB
  requestLogger(),
  rateLimiter(),
]
