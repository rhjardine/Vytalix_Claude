# Facial Analysis — Current Status

Stated plainly because it is the component most likely to be misread as working
when it is not. Nothing below is a promise about future availability.

---

## Current state

| Aspect | State | Evidence |
|---|---|---|
| Endpoint | **Live** — `POST /api/funnel/facial-analysis` | `server.ts:175`, `funnel.handler.ts:436` |
| Authentication | **None** today | no `requireApiKey` on the funnel router |
| Providers implemented | **two** — `mock` and `aws` (Rekognition) | `facial-analysis.service.ts:70`, `:80` |
| **Provider active** | **`mock`** | default in `facial-analysis.service.ts:146`; `.env.example:50` `VISION_PROVIDER=mock` |
| AWS SDK | Declared and installed | `package.json:40`; present in `node_modules` |
| AWS credentials | **Not configured** | commented out in `.env.example`; resolved via the SDK default chain |

**Classification: code implemented, AWS not deployed.** The integration is written
and its dependency is installed; what is missing is configuration and credentials,
not code.

---

## What the mock returns

The mock is **deterministic**: it hashes the first 120 characters of the image and
derives its numbers from that hash (`facial-analysis.service.ts:55-68`).

```json
{
  "estimatedAge":   "35 + (hash % 30)   →  35–64",
  "confidence":     "0.72 – 0.91",
  "analysisPoints": 24,
  "provider":       "mock"
}
```

Three consequences you must design around:

1. **The number is not an age estimate.** It is a hash of the bytes you sent. A
   photo of a wall produces a number in the same range as a photo of a face.
2. **The same image always yields the same result** — which makes it excellent for
   testing your wiring, and useless for validating clinical plausibility.
3. **The response identifies itself.** `provider: "mock"` is in every payload.
   **Check that field** before showing any result to an end user, and treat
   `"mock"` as "not for display".

---

## What real AWS Rekognition would require

Not enabled here. Listed so the gap is explicit, not as a commitment:

| Requirement | Detail |
|---|---|
| `VISION_PROVIDER=aws` | Switches the active provider |
| AWS credentials | IAM role or key pair resolved by the SDK default chain |
| IAM permission | **`rekognition:DetectFaces` only** — least privilege, per `docs/AWS_REKOGNITION_STAGING.md` |
| `AWS_REGION` | Defaults to `us-east-1` |
| `REKOGNITION_TIMEOUT_MS` | Defaults to 5000 |
| Optional | `FACIAL_FALLBACK_MOCK=true` falls back to mock if the real provider fails — **avoid in production**: it silently degrades real analysis into hashed noise |

A staging runbook exists (`docs/AWS_REKOGNITION_STAGING.md`) with the IAM policy
and a real-image test procedure. It is an operator procedure — **its existence is
not evidence that AWS has been enabled anywhere.**

---

## Limitations to carry into your planning

- **Sandbox results are not clinically meaningful.** Do not use the sandbox to
  validate accuracy, age ranges, or user-facing copy.
- **No image is retained beyond the analysis.** Only derived values are stored:
  `estimatedAge`, `confidence`, `analysisPoints`, `provider`, `status`,
  `analyzedAt` and identifiers. Raw images are not persisted.
- **Image limits:** base64, minimum 100 characters, maximum ~2 MB encoded
  (`funnel.handler.ts` `FacialSchema`). Larger payloads are rejected with `422`.
- **When AWS is enabled the response shape stays the same** — only `provider`
  changes to `aws` and the values become real. Your client should not need changes,
  provided it already reads `provider`.

---

## Question to settle with Vytalix

Will AWS Rekognition be enabled for Phase 1, and in which environment first?

The answer changes what Disglobal can show the end user. Until it is enabled, the
facial step is functional as **plumbing** — the call succeeds, the value persists,
the journey continues — but the number it returns must not be presented as a
finding.
