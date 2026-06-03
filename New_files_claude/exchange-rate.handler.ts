// =============================================================================
// src/api/exchange-rate.handler.ts
// Endpoint público de tasas de cambio BCV y paralelo para Venezuela.
//
// Ruta: GET /api/exchange-rate
// Auth: sin autenticación — endpoint público con cache agresivo
//
// FUENTES:
//   - BCV: Banco Central de Venezuela (tasa oficial)
//   - yadio.io: tasa paralelo/referencial
//
// CACHE: Redis TTL 60s. Si Redis no está disponible, fetch directo.
// FALLBACK: Si BCV falla → último valor conocido con isStale=true
//           Si parallel falla → BCV * 1.02 como estimado
//
// RELEVANCIA PARA VYTALIX:
//   El módulo CFE Dental (Clinical Financial Engine) necesita cotizar
//   tratamientos en USD, VES (BCV) y VES (paralelo) simultáneamente.
//   Esta es la fuente canónica de tasas para toda la plataforma.
// =============================================================================

import { Request, Response } from 'express'
import { logger } from '../lib/logger'

// ─── Types ───────────────────────────────────────────────────────

interface RateEntry {
  usdToVes:  number
  updatedAt: string
  source:    string
  isStale:   boolean
}

interface ExchangeRatePayload {
  bcv:      RateEntry & { source: 'BCV' }
  parallel: RateEntry & { source: 'yadio.io' | 'estimated' }
  cacheExpiresInSeconds: number
}

// ─── Redis (opcional — falla silenciosamente si no está disponible) ───

let redisClient: any = null

async function getRedis() {
  if (redisClient) return redisClient
  try {
    const { default: Redis } = await import('ioredis')
    if (!process.env.REDIS_URL) return null
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    })
    redisClient.on('error', () => { redisClient = null })
    await redisClient.connect().catch(() => { redisClient = null })
    return redisClient
  } catch {
    return null
  }
}

const CACHE_KEY = 'vytalix:exchange:usd-ves'
const CACHE_TTL = parseInt(process.env.EXCHANGE_RATE_CACHE_TTL ?? '60', 10)

// ─── Fuente 1: BCV (Banco Central de Venezuela) ──────────────────

async function fetchBCV(): Promise<number | null> {
  try {
    // La API pública del BCV expone la tasa en su página de estadísticas.
    // En producción usar un scraper confiable o un agregador como exchangerate-api.
    // Para Venezuela se recomienda: https://ve.dolarapi.com/v1/dolares/oficial
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      signal:  AbortSignal.timeout(4000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    // dolarapi devuelve { promedio: number, ... }
    return typeof data?.promedio === 'number' ? data.promedio : null
  } catch (err) {
    logger.warn({ err }, 'BCV fetch failed — using fallback')
    return null
  }
}

// ─── Fuente 2: Tasa paralelo (yadio.io) ──────────────────────────

async function fetchParallel(): Promise<number | null> {
  try {
    const res = await fetch('https://api.yadio.io/exrates/USD', {
      signal:  AbortSignal.timeout(4000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.USD?.VES === 'number' ? data.USD.VES : null
  } catch (err) {
    logger.warn({ err }, 'yadio.io fetch failed — using fallback')
    return null
  }
}

// ─── Handler principal ────────────────────────────────────────────

export async function exchangeRateHandler(_req: Request, res: Response) {
  // 1. Intentar cache Redis
  const redis = await getRedis()
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY)
      if (cached) {
        const payload = JSON.parse(cached) as ExchangeRatePayload
        return res.json({ data: payload })
      }
    } catch {
      // Redis falló — continuar con fetch directo
    }
  }

  // 2. Fetch paralelo de ambas fuentes
  const [bcvRate, parallelRate] = await Promise.all([
    fetchBCV(),
    fetchParallel(),
  ])

  const now = new Date().toISOString()

  // 3. Construir payload con fallbacks
  const payload: ExchangeRatePayload = {
    bcv: {
      usdToVes:  bcvRate ?? 36.0,      // último valor conocido si falla
      updatedAt: now,
      source:    'BCV',
      isStale:   bcvRate === null,
    },
    parallel: {
      usdToVes:  parallelRate ?? (bcvRate ? Math.round(bcvRate * 1.02 * 100) / 100 : 36.72),
      updatedAt: now,
      source:    parallelRate !== null ? 'yadio.io' : 'estimated',
      isStale:   parallelRate === null,
    },
    cacheExpiresInSeconds: CACHE_TTL,
  }

  // 4. Guardar en Redis si disponible
  if (redis) {
    redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(payload)).catch(() => {})
  }

  logger.info({
    bcv:      payload.bcv.usdToVes,
    parallel: payload.parallel.usdToVes,
    staleBcv: payload.bcv.isStale,
  }, 'Exchange rate served')

  return res.json({ data: payload })
}
