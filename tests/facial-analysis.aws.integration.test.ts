// =============================================================================
// tests/facial-analysis.aws.integration.test.ts
// REAL AWS Rekognition integration — opt-in, staging only.
//
// Separated from the unit suite (facial-analysis.test.ts, which mocks the SDK).
// This suite hits AWS Rekognition DetectFaces for real and is SKIPPED unless
// explicitly enabled with credentials present.
//
// Run in staging (least-privilege IAM: rekognition:DetectFaces only):
//   RUN_AWS_INTEGRATION=true \
//   AWS_REGION=us-east-1 \
//   AWS_ACCESS_KEY_ID=<staging-only> AWS_SECRET_ACCESS_KEY=<staging-only> \
//   AWS_TEST_FACE_IMAGE_B64=<base64 of a photo WITH a face> \
//   AWS_TEST_NOFACE_IMAGE_B64=<base64 of a photo WITHOUT a face> \
//   npx vitest run tests/facial-analysis.aws.integration.test.ts
//
// Never commit real images or credentials. Images are supplied via env.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { analyzeFace } from '../src/longevity/facial-analysis.service'

const ENABLED = process.env.RUN_AWS_INTEGRATION === 'true' && !!process.env.AWS_ACCESS_KEY_ID
const suite = ENABLED ? describe : describe.skip

// Performance budget (Fase E): < 5000ms acceptable; < 2000ms good.
const LATENCY_BUDGET_MS = 5000

suite('facial-analysis — AWS Rekognition REAL integration (staging)', () => {
  beforeAll(() => { process.env.VISION_PROVIDER = 'aws' })

  // Case 1 — valid face image → normalized Vytalix result (provider=aws).
  it('Case 1: valid face image returns estimatedAge + confidence', async () => {
    const img = process.env.AWS_TEST_FACE_IMAGE_B64
    if (!img) { console.warn('[AWS integration] AWS_TEST_FACE_IMAGE_B64 not set — skipping Case 1'); return }

    const t0 = Date.now()
    const r = await analyzeFace({ imageBase64: img, correlationId: 'aws-int-1' })
    const latencyMs = Date.now() - t0

    expect(r.provider).toBe('aws')
    expect(typeof r.estimatedAge).toBe('number')
    expect(r.confidence).toBeGreaterThan(0)
    expect(r.confidence).toBeLessThanOrEqual(1)
    // eslint-disable-next-line no-console
    console.log(`[AWS integration] Case1 latencyMs=${latencyMs} estimatedAge=${r.estimatedAge} confidence=${r.confidence} points=${r.analysisPoints}`)
    expect(latencyMs).toBeLessThan(LATENCY_BUDGET_MS)
  })

  // Case 2 — image without a face → controlled 422 (no crash, no leak).
  it('Case 2: image without a face → 422', async () => {
    const noFace = process.env.AWS_TEST_NOFACE_IMAGE_B64
    if (!noFace) { console.warn('[AWS integration] AWS_TEST_NOFACE_IMAGE_B64 not set — skipping Case 2'); return }
    await expect(analyzeFace({ imageBase64: noFace, correlationId: 'aws-int-2' }))
      .rejects.toMatchObject({ statusCode: 422 })
  })

  // Case 3 — invalid/corrupt image → controlled error, never a raw AWS leak.
  it('Case 3: corrupt image → controlled error without AWS internals leak', async () => {
    const corrupt = 'bm90LWFuLWltYWdl' // "not-an-image"
    try {
      await analyzeFace({ imageBase64: corrupt, correlationId: 'aws-int-3' })
      throw new Error('expected a controlled error for a corrupt image')
    } catch (err: any) {
      expect([422, 502, 504]).toContain(err.statusCode)
      expect(/secret|accesskey|token|arn:/i.test(err.message ?? '')).toBe(false)
    }
  })
})
