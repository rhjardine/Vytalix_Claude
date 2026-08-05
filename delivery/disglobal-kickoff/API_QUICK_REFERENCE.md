# API Quick Reference — Phase 1

Seven endpoints. Base URL: `https://sandbox.api.vytalix.health`.
Six take `X-API-Key`; the payment webhook takes an HMAC signature instead.

Every response carries `X-Correlation-ID` — log it.

---

## The seven endpoints

| Endpoint | Method | Purpose | Request | Response | Common errors |
|---|---|---|---|---|---|
| `/api/v2/vitality/assess` | POST | Run a biological age assessment | `subjectRef` (or `patientId`), `chronologicalAge`, `biologicalSex`, `isAthlete`, `measurements` (8 fields) | `200` — `assessmentId`, `biologicalAge`, `differentialAge`, `ageStatus`, `partialAges`, `algorithmVersion`, `assessedAt` | `422` field invalid · `404` subject unknown · `403` scope · `401` key |
| `/api/v2/vitality/{subjectRef}` | GET | Read the latest assessment | path param only | `200` — same shape as above | `404` **`No assessment found`** = run an assessment first · `404` `Subject not found` = unknown ref |
| `/api/v2/preventive/score` | POST | Composite preventive score | `{"subjectRef": "…"}` | `200` — `scoreId`, `compositeScore`, `scoreTier`, `components`, `insufficientData` · **`202`** — not enough data | `202` is **not an error** and must not be retried |
| `/api/v2/referral/{subjectRef}` | GET | Should this user see a clinician? | path param only | `200` — `{"eligible": false}` or `eligible:true` + `referralType`, `urgency`, `triggerReason` | `200` with `eligible:false` is **normal** — branch on the field, not the status |
| `/api/v2/engagement/events` | POST | Record user activity | `subjectRef`, `events[{type, payload}]`, `source` | `202` — `{"accepted": n, "patientId": "…"}` | **`500` if `type` is not in the enum** — see below |
| `/api/v2/insights/cohort` | GET | Anonymised population metrics | optional `ageGroup`, `biologicalSex`, `period` | `200` — metrics, **or** `{"cohortTooSmall": true, "minimumRequired": 50}` | `cohortTooSmall` is a privacy floor, **not** an error |
| `/api/v2/webhooks/payment` | POST | Confirm a payment | canonical body + `signature` (HMAC-SHA256) | `200` — `{"received": true, "replayed": false\|true}` | `401` signature mismatch · `500` **not recorded, retry the same request** |

---

## Scopes

Your key carries exactly these. Anything else returns `403` with the missing scope
named in the body.

| Endpoint | Scope |
|---|---|
| `POST /vitality/assess` | `vitality:write` |
| `GET /vitality/{subjectRef}` | `vitality:read` |
| `POST /preventive/score` | `preventive:write` |
| `GET /referral/{subjectRef}` | `referral:read` |
| `POST /engagement/events` | `engagement:write` |
| `GET /insights/cohort` | `insights:read` |
| `POST /webhooks/payment` | *(none — HMAC)* |

---

## Two request details that cause most first-integration failures

### 1. `digitalReflexes` and `staticBalance` are reduced to a product

Each is an object of three dimensions, and the engine multiplies them before
looking the value up in its reference tables:

| Field | Reduction | Expected magnitude |
|---|---|---|
| `digitalReflexes` | `high × long × width` | **1 – 5** |
| `staticBalance` | `high × long × width` | **10 – 40** |

They are three dimensions of **one** measurement, not three repeated attempts.
Sending values an order of magnitude too large still returns `200` — with a
meaningless biological age. Start from the calibrated payload in
`QUICK_START.md` §3.

The other six measurements are plain numbers: `fatPercentage`, `bmi`,
`visualAccommodation`, `skinHydration`, `systolicPressure`, `diastolicPressure`.
All eight are required.

### 2. `engagement/events` — `type` must be one of these exactly

An unrecognised value currently surfaces as **`500`**, not `422`. Use only:

```
TEST_STARTED · TEST_COMPLETED · RECOMMENDATION_VIEWED
RECOMMENDATION_ACKNOWLEDGED · GOAL_SET · GOAL_ACHIEVED
REPORT_DOWNLOADED · REFERRAL_CTA_VIEWED · REFERRAL_CTA_CLICKED
SESSION_STARTED · EDUCATION_CONTENT_VIEWED
```

---

## Error contract — uniform across `/api/v2`

All errors use RFC 7807: `type`, `title`, `status`, `detail`, `correlationId`.

| Code | Meaning | What to do |
|---|---|---|
| `401` | Key missing, invalid, expired or revoked — deliberately indistinguishable | Stop, check the header. **Do not loop** — 20 failures/minute per IP trips a guard and returns `429` |
| `403` | Key valid, scope not granted | Stop; body names the scope |
| `404` | Read the body — two distinct meanings | See the table above |
| `422` | Validation failed; `errors[]` names each field | Fix the payload and retry |
| `429` | Too many authentication failures | Back off 60 seconds |
| `500` | On the webhook: nothing recorded → **retry**. Elsewhere: ours → send us the `correlationId` | Do not debug live |

**On `429`:** today it fires only for authentication brute force. Your key records
a `rateLimitTier`, but tier-based throttling and monthly quota enforcement are not
active in this environment — do not rely on receiving `429` as a volume signal.

---

## Optional headers

| Header | Effect |
|---|---|
| `X-Idempotency-Key` | On `POST` calls: an identical repeat replays the stored response for 24h instead of recomputing |
| `X-Correlation-ID` | Yours is echoed back; otherwise we generate one. Log it either way |

---

## Not available in Phase 1

`/api/funnel/*` · `/api/v2/dental/*` · `/api/v2/catalog` · `/api/exchange-rate` ·
`/admin/*` · facial analysis · outbound referral webhook.

They may appear in the OpenAPI file — the spec documents the whole platform. Your
key does not open them.
