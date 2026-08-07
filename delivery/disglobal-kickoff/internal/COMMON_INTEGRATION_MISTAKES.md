# Common Integration Mistakes

Each item below describes behaviour reproduced against a running service, with the
request shape that triggers it. None is hypothetical.

## 1 · Treating a `200` as proof the data is sensible

**The mistake.** The assessment endpoints validate ranges, not plausibility. A
payload with the right shape and wrong units returns `200` with a nonsense result.

**Example.** `digitalReflexes: {high:12, long:10, width:8}` reduces to **960**
against an expected range of **1–5**, and returns a biological age of **163** for a
45-year-old subject — with HTTP `200` throughout.

**Avoid it.** Assert on the *value*, not the status. If `biologicalAge` is more
than ~20 years from `chronologicalAge`, treat it as a bug in your payload until
proven otherwise.

## 2 · Sending three attempts instead of three dimensions

**The mistake.** `digitalReflexes` and `staticBalance` look like they hold repeated
measurements. They do not: each is **one** measurement expressed in three
dimensions, and the engine multiplies them.

| Field | Reduction | Expected magnitude |
|---|---|---|
| `digitalReflexes` | `high × long × width` | **1 – 5** |
| `staticBalance` | `high × long × width` | **10 – 40** |

**Avoid it.** Compute the product yourself before sending and check the magnitude.

## 3 · Assuming Vytalix scores the questionnaire

**The mistake.** Expecting to POST 45 raw answers and receive a score.

**Reality.** `POST /api/funnel/vitality-assessment` **requires** `score`,
`category`, `yearsBiological` and five `dimensions` already computed, persists them
without recalculating, and returns only `{ id }`. No interpretation comes back.

**Avoid it.** Budget for the scoring logic on your side. `answersPayload` carries
the raw answers for the record; it is not an input to any calculation.

## 4 · Reading `mock` results as real

**The mistake.** Showing `estimatedAge` from the facial endpoint to a user.

**Reality.** The active provider is `mock`, which derives its number from a hash of
your image bytes. A photo of a wall scores like a photo of a face. Every response
carries `provider`.

**Avoid it.** Branch on `provider !== "mock"` before displaying. Treat `mock` as
"plumbing verified, no finding".

## 5 · Treating `202` as a failure

**The mistake.** Retrying `POST /api/v2/preventive/score` after a `202`, or
surfacing it as an error.

**Reality.** `202 Insufficient data for score` means fewer than two of four score
components could be computed. Retrying with the same data returns `202` again,
forever.

**Avoid it.** Model it as a first-class state: "not enough data yet".

## 6 · Treating `cohortTooSmall` or `eligible:false` as failures

Both are `200`. `cohortTooSmall` is a privacy floor below 50 subjects.
`eligible:false` means the referral engine ran and decided no. **Branch on the
field, never on the status code.**

## 7 · Confusing the two meanings of `404`

| Body | Meaning |
|---|---|
| `Subject '…' not found` | The `subjectRef` does not exist — ask Vytalix to provision it |
| `No assessment found` | The subject exists, but has no assessment yet — run one first |

**Avoid it.** Read `detail`, not just the status.

## 8 · Getting the canonical body wrong when signing

**The mistake.** Signing the JSON you are about to send, including `signature`,
pretty-printed, or with keys in a different order.

**Reality.** The digest is computed over exactly these keys, in this order, compact,
with `signature` excluded:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

Any deviation → `401`. This is the single most common webhook failure.

**Avoid it.** Run `examples/send-payment-webhook.sh` first and reproduce its digest
before writing your own signer. Both shipped examples were verified to produce
identical output for identical input.

## 9 · Not retrying a `500` on the webhook

**The mistake.** Treating `500` as terminal and dropping the payment.

**Reality.** On the webhook, `500` means **nothing was recorded**. `200` is returned
only after the database commit. Deduplication on `intentId` makes an identical
resend safe — it cannot double-charge or double-activate.

**Avoid it.** Retry the same request unchanged. On a timeout, resend the same
`intentId`: `replayed:true` proves the first attempt committed, `replayed:false`
proves it did not.

## 10 · Using an invalid engagement event type

**The mistake.** Inventing a `type` value like `VIEWED_RESULT`.

**Reality.** An unrecognised value currently surfaces as **`500`**, not `422`. Valid
values only:

```
TEST_STARTED · TEST_COMPLETED · RECOMMENDATION_VIEWED
RECOMMENDATION_ACKNOWLEDGED · GOAL_SET · GOAL_ACHIEVED
REPORT_DOWNLOADED · REFERRAL_CTA_VIEWED · REFERRAL_CTA_CLICKED
SESSION_STARTED · EDUCATION_CONTENT_VIEWED
```

## 11 · Retrying a `401` in a loop

Twenty failed authentications from one IP in a minute trips a brute-force guard and
you start receiving `429`. A `401` is never transient — stop and check the
credential.

## 12 · Expecting `429` to signal your rate limit

Your key records a `rateLimitTier`, but **tier throttling and monthly quota are not
enforced**. The only `429` today comes from the brute-force guard above. Do not
build backpressure on a signal that will not arrive — and please do not load-test
sandbox, which has no throttle protecting it.

## 13 · Sending real identity in `subjectRef`

`subjectRef` is a **pseudonym you control**. Never a name, document number, email
or phone. This is a hard boundary, not a convention.

## 14 · Expecting a callback after activation

There is **no outbound webhook from Vytalix to Disglobal**. After your payment
webhook returns `200`, activation happens on our side with no notification back to
you. If you need one, it is new scope — raise it before you design around it.

---

## Quick reference

| Symptom | Most likely cause |
|---|---|
| `biologicalAge` in the hundreds | #1 / #2 — units |
| Webhook always `401` | #8 — canonical body |
| `500` from engagement | #10 — invalid enum |
| `202` that never resolves | #5 — insufficient data, by design |
| `404` you did not expect | #7 — read `detail` |
| Facial ages that make no sense | #4 — `provider: mock` |
| Waiting for a confirmation that never arrives | #14 — no callback exists |
