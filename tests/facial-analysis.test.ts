// =============================================================================
// Tests — src/longevity/facial-analysis.service.ts
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the platform logger (logger.debug / logger.warn called by AWS provider)
vi.mock('../src/platform/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { analyzeFace } from '../src/longevity/facial-analysis.service'

// ── Mock provider ──────────────────────────────────────────────────

describe('facial-analysis — mock provider (VISION_PROVIDER=mock)', () => {
  beforeEach(() => {
    process.env.VISION_PROVIDER = 'mock'
  })

  it('returns a result with expected shape', async () => {
    const result = await analyzeFace({ imageBase64: 'abc123', correlationId: 'test-corr' })
    expect(result).toMatchObject({
      estimatedAge:   expect.any(Number),
      confidence:     expect.any(Number),
      analysisPoints: 24,
      provider:       'mock',
    })
  })

  it('estimatedAge is between 35 and 64 (hash range)', async () => {
    const result = await analyzeFace({ imageBase64: 'someBase64Image==' })
    expect(result.estimatedAge).toBeGreaterThanOrEqual(35)
    expect(result.estimatedAge).toBeLessThanOrEqual(64)
  })

  it('confidence is between 0 and 1', async () => {
    const result = await analyzeFace({ imageBase64: 'imageData' })
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('is deterministic — same input always yields same output', async () => {
    const input = { imageBase64: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
    const r1 = await analyzeFace(input)
    const r2 = await analyzeFace(input)
    const r3 = await analyzeFace(input)
    expect(r1.estimatedAge).toBe(r2.estimatedAge)
    expect(r2.estimatedAge).toBe(r3.estimatedAge)
    expect(r1.confidence).toBe(r2.confidence)
  })

  it('different inputs produce different results', async () => {
    const r1 = await analyzeFace({ imageBase64: 'AAAAaaaa' })
    const r2 = await analyzeFace({ imageBase64: 'ZZZZzzzz' })
    // With high probability the hash differs (collision is astronomically unlikely)
    const sameResult = r1.estimatedAge === r2.estimatedAge && r1.confidence === r2.confidence
    expect(sameResult).toBe(false)
  })

  it('works with no correlationId (optional field)', async () => {
    const result = await analyzeFace({ imageBase64: 'test' })
    expect(result.provider).toBe('mock')
  })

  it('only hashes the first 120 chars — long input matches truncated', async () => {
    const base = 'A'.repeat(120)
    const short = await analyzeFace({ imageBase64: base })
    const long  = await analyzeFace({ imageBase64: base + 'EXTRA_IGNORED_DATA' })
    expect(short.estimatedAge).toBe(long.estimatedAge)
    expect(short.confidence).toBe(long.confidence)
  })
})

// ── Unknown provider ───────────────────────────────────────────────

describe('facial-analysis — unknown provider', () => {
  beforeEach(() => {
    process.env.VISION_PROVIDER = 'unknown-provider'
  })

  it('throws with statusCode 501', async () => {
    await expect(analyzeFace({ imageBase64: 'abc' })).rejects.toMatchObject({
      statusCode: 501,
    })
  })

  it('error message includes provider name', async () => {
    await expect(analyzeFace({ imageBase64: 'abc' })).rejects.toThrow('unknown-provider')
  })
})

// ── AWS provider (SDK not installed) ──────────────────────────────

describe('facial-analysis — aws provider without SDK', () => {
  beforeEach(() => {
    process.env.VISION_PROVIDER = 'aws'
  })

  it('throws 501 when @aws-sdk/client-rekognition is not installed', async () => {
    await expect(analyzeFace({ imageBase64: 'abc', correlationId: 'c1' })).rejects.toMatchObject({
      statusCode: 501,
    })
  })
})
