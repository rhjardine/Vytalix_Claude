// =============================================================================
// src/longevity/facial-analysis.service.ts
// Facial analysis service — provider abstraction.
//
//   funnel handler → analyzeFace() → FacialAnalysisProvider
//                                        ├── mockProvider   (deterministic)
//                                        └── awsRekognitionProvider (AWS Rekognition)
//
// The handler NEVER imports the AWS SDK — it depends only on analyzeFace().
// Selection via VISION_PROVIDER (mock | aws). Optional resilience:
// FACIAL_FALLBACK_MOCK=true falls back to mock if the real provider fails.
//
// Privacy: the raw image is NEVER stored or logged. Providers return only the
// numeric analytical result (estimatedAge, confidence, analysisPoints).
// =============================================================================

import { logger } from '../platform/logger'

export interface FacialAnalysisInput {
  imageBase64: string
  correlationId?: string
}

export interface FacialAnalysisResult {
  estimatedAge: number
  confidence: number   // 0.0 – 1.0
  analysisPoints: number
  provider: string
}

export interface FacialAnalysisProvider {
  readonly name: string
  analyze(input: FacialAnalysisInput): Promise<FacialAnalysisResult>
}

// Controlled error with an HTTP status the handler maps to RFC 7807.
function providerError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

// Reject a promise if it does not settle within `ms` (no extra dependency).
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(providerError(`${label} timed out after ${ms}ms`, 504)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

// ── Mock provider — deterministic, no external deps ────────────────
function mockAnalysis(imageBase64: string): FacialAnalysisResult {
  // Deterministic hash of the first 120 chars — same input → same output.
  let hash = 0
  const sample = imageBase64.slice(0, 120)
  for (let i = 0; i < sample.length; i++) {
    hash = (hash * 31 + sample.charCodeAt(i)) & 0x7fffffff
  }
  return {
    estimatedAge:   35 + (hash % 30),
    confidence:     Math.round((0.72 + (hash % 20) / 100) * 100) / 100,
    analysisPoints: 24,
    provider:       'mock',
  }
}

export const mockProvider: FacialAnalysisProvider = {
  name: 'mock',
  analyze: async (input) => mockAnalysis(input.imageBase64),
}

// ── AWS Rekognition provider ────────────────────────────────────────
// Config (env): AWS_REGION (default us-east-1); credentials resolved by the
// AWS SDK default chain (env / IAM role) — never hardcoded. Timeout via
// REKOGNITION_TIMEOUT_MS (default 5000). The SDK is imported lazily so mock
// deployments never load it.
export const awsRekognitionProvider: FacialAnalysisProvider = {
  name: 'aws',
  analyze: async (input) => {
    const correlationId = input.correlationId ?? 'unknown'
    const timeoutMs = Number(process.env.REKOGNITION_TIMEOUT_MS ?? 5000)

    let RekognitionClient: any, DetectFacesCommand: any
    try {
      const sdk = await import('@aws-sdk/client-rekognition' as string)
      RekognitionClient = sdk.RekognitionClient
      DetectFacesCommand = sdk.DetectFacesCommand
    } catch {
      throw providerError('AWS Rekognition SDK is not available', 501)
    }

    const client = new RekognitionClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      maxAttempts: 2,
    })

    const command = new DetectFacesCommand({
      Image: { Bytes: Buffer.from(input.imageBase64, 'base64') },
      Attributes: ['AGE_RANGE'],
    })

    let response: any
    try {
      response = await withTimeout(client.send(command), timeoutMs, 'AWS Rekognition')
    } catch (err: any) {
      if (err?.statusCode === 504) {
        logger.warn({ correlationId, provider: 'aws' }, 'AWS Rekognition timed out')
        throw err
      }
      // Do NOT leak AWS internals or the image — log only the error name.
      logger.warn({ correlationId, provider: 'aws', errName: err?.name }, 'AWS Rekognition request failed')
      throw providerError('Facial analysis provider unavailable', 502)
    }

    const face = response.FaceDetails?.[0]
    if (!face || !face.AgeRange) {
      throw providerError('No face detected in image', 422)
    }

    const { Low = 0, High = 0 } = face.AgeRange
    const estimatedAge = Math.round((Low + High) / 2)
    const confidence   = Math.round((face.Confidence ?? 90) / 100 * 100) / 100

    // Log the analytical result only — never the image or raw biometric bytes.
    logger.debug({ correlationId, provider: 'aws', estimatedAge, confidence }, 'AWS Rekognition face analyzed')

    return { estimatedAge, confidence, analysisPoints: Object.keys(face).length, provider: 'aws' }
  },
}

// ── Selector ────────────────────────────────────────────────────────
const PROVIDERS: Record<string, FacialAnalysisProvider> = {
  mock: mockProvider,
  aws:  awsRekognitionProvider,
}

export async function analyzeFace(input: FacialAnalysisInput): Promise<FacialAnalysisResult> {
  const providerName = process.env.VISION_PROVIDER ?? 'mock'
  const provider = PROVIDERS[providerName]

  if (!provider) {
    throw providerError(
      `Vision provider '${providerName}' is not supported. Set VISION_PROVIDER=mock or VISION_PROVIDER=aws`,
      501,
    )
  }

  try {
    return await provider.analyze(input)
  } catch (err) {
    // Opt-in resilience: fall back to mock so the funnel never hard-fails on a
    // transient provider outage (only when explicitly enabled and not already mock).
    if (process.env.FACIAL_FALLBACK_MOCK === 'true' && provider.name !== 'mock') {
      logger.warn(
        { correlationId: input.correlationId ?? 'unknown', provider: provider.name },
        'Facial provider failed — falling back to mock (FACIAL_FALLBACK_MOCK=true)',
      )
      return mockProvider.analyze(input)
    }
    throw err
  }
}
