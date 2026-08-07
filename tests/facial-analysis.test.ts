// =============================================================================
// Tests — src/longevity/facial-analysis.service.ts
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the platform logger (logger.debug / logger.warn called by AWS provider)
vi.mock('../src/platform/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

// Controllable mock of the AWS Rekognition SDK (intercepts the lazy dynamic import).
let mockSend: (cmd: unknown) => Promise<unknown>
vi.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: class { send(cmd: unknown) { return mockSend(cmd) } },
  DetectFacesCommand: class { constructor(public input: unknown) {} },
}))

import { analyzeFace } from '../src/longevity/facial-analysis.service'

// ── Mock provider ──────────────────────────────────────────────────

describe('facial-analysis — mock provider (VISION_PROVIDER=mock)', () => {
  beforeEach(() => { process.env.VISION_PROVIDER = 'mock' })

  it('returns a result with expected shape', async () => {
    const result = await analyzeFace({ imageBase64: 'abc123', correlationId: 'test-corr' })
    expect(result).toMatchObject({
      estimatedAge: expect.any(Number), confidence: expect.any(Number),
      analysisPoints: 24, provider: 'mock',
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
    expect(r1.estimatedAge).toBe(r2.estimatedAge)
    expect(r1.confidence).toBe(r2.confidence)
  })

  it('different inputs produce different results', async () => {
    const r1 = await analyzeFace({ imageBase64: 'AAAAaaaa' })
    const r2 = await analyzeFace({ imageBase64: 'ZZZZzzzz' })
    expect(r1.estimatedAge === r2.estimatedAge && r1.confidence === r2.confidence).toBe(false)
  })

  it('only hashes the first 120 chars — long input matches truncated', async () => {
    const base = 'A'.repeat(120)
    const short = await analyzeFace({ imageBase64: base })
    const long  = await analyzeFace({ imageBase64: base + 'EXTRA_IGNORED_DATA' })
    expect(short.estimatedAge).toBe(long.estimatedAge)
  })
})

// ── Unknown provider ───────────────────────────────────────────────

describe('facial-analysis — unknown provider', () => {
  beforeEach(() => { process.env.VISION_PROVIDER = 'unknown-provider' })

  it('throws with statusCode 501', async () => {
    await expect(analyzeFace({ imageBase64: 'abc' })).rejects.toMatchObject({ statusCode: 501 })
  })
  it('error message includes provider name', async () => {
    await expect(analyzeFace({ imageBase64: 'abc' })).rejects.toThrow('unknown-provider')
  })
})

// ── AWS Rekognition provider (SDK mocked) ─────────────────────────

describe('facial-analysis — aws provider (VISION_PROVIDER=aws)', () => {
  beforeEach(() => {
    process.env.VISION_PROVIDER = 'aws'
    delete process.env.FACIAL_FALLBACK_MOCK
  })
  afterEach(() => { vi.clearAllMocks() })

  it('returns estimatedAge from the AWS AgeRange midpoint', async () => {
    mockSend = vi.fn().mockResolvedValue({ FaceDetails: [{ AgeRange: { Low: 30, High: 40 }, Confidence: 95 }] })
    const r = await analyzeFace({ imageBase64: Buffer.from('img').toString('base64'), correlationId: 'c1' })
    expect(r.provider).toBe('aws')
    expect(r.estimatedAge).toBe(35)          // (30+40)/2
    expect(r.confidence).toBe(0.95)
    expect(r.analysisPoints).toBeGreaterThan(0)
  })

  it('throws 422 when no face is detected', async () => {
    mockSend = vi.fn().mockResolvedValue({ FaceDetails: [] })
    await expect(analyzeFace({ imageBase64: 'x', correlationId: 'c2' })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('maps an AWS error to a controlled 502 (no internal leak)', async () => {
    mockSend = vi.fn().mockRejectedValue(Object.assign(new Error('AccessDenied: creds'), { name: 'AccessDeniedException' }))
    await expect(analyzeFace({ imageBase64: 'x', correlationId: 'c3' }))
      .rejects.toMatchObject({ statusCode: 502, message: 'Facial analysis provider unavailable' })
  })

  it('throws 504 when AWS exceeds REKOGNITION_TIMEOUT_MS', async () => {
    process.env.REKOGNITION_TIMEOUT_MS = '20'
    mockSend = vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ }))
    await expect(analyzeFace({ imageBase64: 'x', correlationId: 'c5' }))
      .rejects.toMatchObject({ statusCode: 504 })
    delete process.env.REKOGNITION_TIMEOUT_MS
  })

  it('falls back to mock when FACIAL_FALLBACK_MOCK=true and the provider fails', async () => {
    process.env.FACIAL_FALLBACK_MOCK = 'true'
    mockSend = vi.fn().mockRejectedValue(new Error('boom'))
    const r = await analyzeFace({ imageBase64: 'fallbackImg', correlationId: 'c4' })
    expect(r.provider).toBe('mock')
  })
})
