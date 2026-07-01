// =============================================================================
// src/longevity/facial-analysis.service.ts
// Facial analysis provider abstraction.
//
// Activated by VISION_PROVIDER env var:
//   mock  — deterministic hash-based estimation (default, no external deps)
//   aws   — AWS Rekognition DetectFaces (requires @aws-sdk/client-rekognition)
//
// The service returns only the numeric result — images are NEVER stored.
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

// ── Mock provider — deterministic, no external deps ────────────────

function mockAnalysis(imageBase64: string): FacialAnalysisResult {
  // Deterministic hash of the first 120 chars — same input → same output
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

// ── AWS Rekognition provider ────────────────────────────────────────
// Requires: pnpm add @aws-sdk/client-rekognition
// Region:   AWS_REGION env var (default: us-east-1)

async function awsRekognitionAnalysis(imageBase64: string, correlationId: string): Promise<FacialAnalysisResult> {
  let RekognitionClient: any, DetectFacesCommand: any

  try {
    // Dynamic import — avoids hard dep when VISION_PROVIDER != 'aws'
    const sdk = await import('@aws-sdk/client-rekognition' as string)
    RekognitionClient = sdk.RekognitionClient
    DetectFacesCommand = sdk.DetectFacesCommand
  } catch {
    throw Object.assign(
      new Error('@aws-sdk/client-rekognition is not installed. Run: pnpm add @aws-sdk/client-rekognition'),
      { statusCode: 501 },
    )
  }

  const client = new RekognitionClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

  const command = new DetectFacesCommand({
    Image: { Bytes: Buffer.from(imageBase64, 'base64') },
    Attributes: ['AGE_RANGE'],
  })

  const response = await client.send(command)
  const face = response.FaceDetails?.[0]

  if (!face || !face.AgeRange) {
    throw Object.assign(
      new Error('No face detected in image'),
      { statusCode: 422 },
    )
  }

  const { Low = 0, High = 0 } = face.AgeRange
  const estimatedAge = Math.round((Low + High) / 2)
  const confidence   = Math.round((face.Confidence ?? 90) / 100 * 100) / 100

  logger.debug(
    { correlationId, estimatedAge, ageRange: { Low, High }, confidence },
    'AWS Rekognition face detected',
  )

  return {
    estimatedAge,
    confidence,
    analysisPoints: Object.keys(face).length,
    provider: 'aws',
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function analyzeFace(input: FacialAnalysisInput): Promise<FacialAnalysisResult> {
  const provider = process.env.VISION_PROVIDER ?? 'mock'
  const correlationId = input.correlationId ?? 'unknown'

  if (provider === 'mock') {
    return mockAnalysis(input.imageBase64)
  }

  if (provider === 'aws') {
    return awsRekognitionAnalysis(input.imageBase64, correlationId)
  }

  throw Object.assign(
    new Error(`Vision provider '${provider}' is not supported. Set VISION_PROVIDER=mock or VISION_PROVIDER=aws`),
    { statusCode: 501 },
  )
}
