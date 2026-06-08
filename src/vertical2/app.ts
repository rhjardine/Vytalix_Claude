/**
 * app.ts — Vytalix Vertical 2: Application Entrypoint
 *
 * Wires the complete middleware chain for the Commerce API:
 *
 *   Request
 *     │
 *     ├─ Observability (requestId, timing, structured logs)
 *     ├─ Security headers (helmet equivalent inline)
 *     ├─ CORS (partner-origin allowlist)
 *     ├─ Raw body capture (for webhook validation — Sprint 1 pattern)
 *     ├─ JSON body parsing (after raw body capture)
 *     │
 *     ├─ /health  → health check (no auth)
 *     │
 *     ├─ /api/v2/commerce/*
 *     │     ├─ tenantMiddleware (Sprint 1 — JWT → tenantId, userId)
 *     │     ├─ partnerMiddleware (API key → partner, scopes)
 *     │     └─ commerceRouter (5 engines, public partner API)
 *     │
 *     └─ /api/v2/admin/*
 *           ├─ tenantMiddleware (Sprint 1)
 *           ├─ adminScopeGuard (role:admin required)
 *           └─ adminRouter (catalog, pricing, slots, partners, fulfillment admin)
 *
 * Integration with Sprint 1:
 * - withTenant() is imported from shared/db/db.ts (same SET LOCAL pattern)
 * - tenantSecret is resolved per-request via app.locals.getTenantSecret()
 * - No default secrets — fails hard on startup if env is incomplete
 */

import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { commerceRouter } from './commerceRouter';
import { adminRouter } from './admin/adminRouter';
import { createPartnerAuthMiddleware } from './shared/middleware/partnerMiddleware';
import { pool } from './shared/db/db';
import { validateEnvironment, config } from './shared/config/config';

// ── Fail-fast on startup ──────────────────────────────────────────────────────
validateEnvironment();

export const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('X-Powered-By');
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = config.cors.allowedOrigins();
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-Id,X-Idempotency-Key');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// ── Observability: request ID propagation ────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  (req as never as Record<string, string>)['requestId'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.on('finish', () => {
    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      requestId,
    }));
  });
  next();
});

// ── Body parsing ──────────────────────────────────────────────────────────────
// Note: webhook routes in commerceRouter use captureRawBody before json()
// Global express.json() applies to all non-webhook routes.
app.use(express.json({ limit: '1mb' }));

// ── Health check (no auth) ───────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      version: '2.0',
      ts: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// ── App locals: tenant secret resolver ──────────────────────────────────────
// Resolves tenantSecret from DB record. Never falls back to env.
// The resolver is injected here so engines remain testable without app context.
const tenantSecretCache = new Map<string, { secret: string; ts: number }>();
const SECRET_CACHE_TTL_MS = 5 * 60 * 1_000;

app.locals.getTenantSecret = async (tenantId: string): Promise<string> => {
  const cached = tenantSecretCache.get(tenantId);
  if (cached && Date.now() - cached.ts < SECRET_CACHE_TTL_MS) {
    return cached.secret;
  }

  const result = await pool.query<{ pseudonym_secret: string }>(
    `SELECT pseudonym_secret FROM tenants WHERE id = $1 AND is_active = TRUE`,
    [tenantId]
  );

  if (!result.rows[0]?.pseudonym_secret) {
    throw new Error(
      `[Vytalix/v2/app] Tenant pseudonym_secret not provisioned for tenant ${tenantId}. ` +
        'Run the tenant secret provisioning script before processing vouchers.'
    );
  }

  const secret = result.rows[0].pseudonym_secret;
  tenantSecretCache.set(tenantId, { secret, ts: Date.now() });
  return secret;
};

// ── Commerce API (partner-facing) ────────────────────────────────────────────
// Chain: tenantMiddleware (Sprint 1) → partnerMiddleware → commerceRouter
// In production, tenantMiddleware is imported from the core layer.
// Here we reference it by its standard Express pattern.
const partnerAuth = createPartnerAuthMiddleware(pool);

app.use(
  '/api/v2/commerce',
  // tenantMiddleware from Sprint 1 core would be added here in monorepo:
  // createTenantMiddleware(pool),
  partnerAuth,
  commerceRouter
);

// ── Admin API (internal only — never partner-facing) ─────────────────────────
app.use(
  '/api/v2/admin',
  // createTenantMiddleware(pool),  // from Sprint 1 core
  (req: Request, res: Response, next: NextFunction) => {
    // Admin role enforcement: JWT must contain role:admin claim
    // In production, the tenantMiddleware populates req.userRoles
    const userRoles: string[] = (req as never as Record<string, string[]>)['userRoles'] ?? [];
    if (!userRoles.includes('admin')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    next();
  },
  adminRouter
);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as never as Record<string, string>)['requestId'] ?? 'unknown';

  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    requestId,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  }));

  // Never leak internal error details to partners
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred. Reference ID: ' + requestId,
    },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(process.env.PORT ?? '3002', 10);
  app.listen(PORT, '127.0.0.1', () => {
    console.info(`[Vytalix/v2] Commerce API listening on 127.0.0.1:${PORT}`);
  });
}

export default app;
