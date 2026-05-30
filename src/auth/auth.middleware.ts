// @ts-nocheck - Uses pg directly (no Prisma generate needed)
// =============================================================================
// Auth Module — JWT-based authentication + RBAC
// Uses src/lib/db.ts (pg direct) — no Prisma binary required
// =============================================================================

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { getDb, writeAuditLog, withTenant } from '../lib/db'
import { logger } from '../lib/logger'
import { randomUUID } from 'crypto'

export interface JWTPayload {
  sub:       string   // userId
  tenant_id: string   // tenantId — critical for RLS
  org_id:    string   // organizationId
  role:      string   // UserRole
  email:     string
  iat?:      number
  exp?:      number
}

declare global {
  namespace Express {
    interface Request {
      user: JWTPayload
      correlationId: string
    }
  }
}

// ── JWT helpers ───────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
  return secret
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any,
    issuer:    'vytalix-api',
    audience:  'vytalix-client',
  })
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSecret(), {
    issuer:   'vytalix-api',
    audience: 'vytalix-client',
  }) as JWTPayload
}

// ── Auth middleware ───────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      type: 'https://api.vytalix.health/errors/unauthorized',
      title: 'Unauthorized', status: 401,
      detail: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      instance: req.path, correlationId: req.correlationId ?? randomUUID(),
    })
  }

  const token = authHeader.slice(7)
  try {
    const payload = verifyToken(token)
    if (!payload.sub || !payload.tenant_id || !payload.role) throw new Error('Token missing required fields')
    if (!UUID_RE.test(payload.tenant_id)) throw new Error('Invalid tenant_id format in token')
    req.user = payload
    logger.debug({ userId: payload.sub, tenantId: payload.tenant_id, role: payload.role }, 'Auth OK')
    next()
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError ? 'Token expired — please re-authenticate'
                  : err instanceof jwt.JsonWebTokenError ? 'Invalid token'
                  : 'Authentication failed'
    return res.status(401).json({
      type: 'https://api.vytalix.health/errors/unauthorized',
      title: 'Unauthorized', status: 401, detail: message,
      instance: req.path, correlationId: req.correlationId ?? randomUUID(),
    })
  }
}

// ── RBAC guard ────────────────────────────────────────────────────

// Role hierarchy: SUPER_ADMIN > ORG_ADMIN > PHYSICIAN > CARE_COORDINATOR > VIEWER
// Partner role maps to VIEWER for read-only demo access
const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN:      100,
  ORG_ADMIN:         80,
  PHYSICIAN:         60,
  CARE_COORDINATOR:  40,
  VIEWER:            20,
  PARTNER:           15,   // read-only external partner access
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      // Log unauthorized access attempt
      logger.warn({
        correlationId: req.correlationId,
        userId: req.user.sub,
        tenantId: req.user.tenant_id,
        role: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      }, 'RBAC: access denied')

      return res.status(403).json({
        type: 'https://api.vytalix.health/errors/forbidden',
        title: 'Forbidden', status: 403,
        detail: `Role '${req.user.role}' is not authorized. Required: ${roles.join(' or ')}`,
        instance: req.path, correlationId: req.correlationId,
      })
    }
    next()
  }
}

// Minimum role guard — user must have AT LEAST this level
export function requireMinRole(minRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userLevel  = ROLE_HIERARCHY[req.user.role]  ?? 0
    const minLevel   = ROLE_HIERARCHY[minRole]         ?? 0
    if (userLevel < minLevel) {
      logger.warn({ userId: req.user.sub, role: req.user.role, minRole, path: req.path }, 'RBAC: insufficient role level')
      return res.status(403).json({
        type: 'https://api.vytalix.health/errors/forbidden',
        title: 'Forbidden', status: 403,
        detail: `Minimum role required: ${minRole}`,
        instance: req.path, correlationId: req.correlationId,
      })
    }
    next()
  }
}

// ── Login handler ─────────────────────────────────────────────────

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body ?? {}
  const correlationId = req.correlationId ?? randomUUID()

  if (!email || !password) {
    return res.status(422).json({
      type: 'https://api.vytalix.health/errors/validation-failed',
      title: 'Validation Failed', status: 422,
      detail: 'email and password are required',
      instance: req.path, correlationId,
    })
  }

  const db = getDb()
  // Raw query — no tenant context at login time (pre-auth)
  const users = await db.rawQuery<any>(
    `SELECT id, "tenantId", "organizationId", role, email, "passwordHash", "isActive"
     FROM users WHERE email = $1 LIMIT 1`,
    [email]
  )
  const user = users.rows[0]

  // Constant-time comparison to prevent timing attacks
  const validPassword = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, '$2b$12$placeholder_to_prevent_timing_attack_aaaa')

  if (!user || !validPassword || !user.isActive) {
    logger.warn({ email, correlationId }, 'Login failed — invalid credentials')
    return res.status(401).json({
      type: 'https://api.vytalix.health/errors/unauthorized',
      title: 'Unauthorized', status: 401, detail: 'Invalid credentials',
      instance: req.path, correlationId,
    })
  }

  const token = signToken({
    sub:       user.id,
    tenant_id: user.tenantId,
    org_id:    user.organizationId,
    role:      user.role,
    email:     user.email,
  })

  // Update lastLoginAt + write audit (in tenant context)
  await withTenant(user.tenantId, async (tc) => {
    await tc.execute(
      `UPDATE users SET "lastLoginAt" = NOW() WHERE id = $1::uuid`,
      [user.id]
    )
    await writeAuditLog(tc, {
      actorId:      user.id,
      actorRole:    user.role,
      resourceType: 'User',
      resourceId:   user.id,
      action:       'LOGIN',
      ipAddress:    req.ip,
      userAgent:    req.headers['user-agent'],
    })
  })

  logger.info({ userId: user.id, tenantId: user.tenantId, role: user.role, correlationId }, 'Login successful')

  res.json({
    token,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    user: { id: user.id, email: user.email, role: user.role },
  })
}

// ── Me handler ────────────────────────────────────────────────────

export function meHandler(req: Request, res: Response) {
  res.json({
    id:       req.user.sub,
    tenantId: req.user.tenant_id,
    orgId:    req.user.org_id,
    role:     req.user.role,
    email:    req.user.email,
  })
}
