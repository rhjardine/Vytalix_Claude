// =============================================================================
// src/lib/redis.ts — Redis singleton with health check
// Wraps ioredis. Lazy connect — no crash on startup if Redis is unavailable.
// =============================================================================

import Redis from 'ioredis'
import { logger } from './logger'

let client: Redis | null = null

export function getRedisClient(): Redis {
  if (client && client.status === 'ready') return client

  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'

  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
    commandTimeout: 2000,
  })

  client.on('error', (err) => logger.warn({ err }, 'Redis error'))
  client.on('connect', () => logger.info('Redis connected'))

  return client
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const r = getRedisClient()
    await r.ping()
    return true
  } catch {
    return false
  }
}
