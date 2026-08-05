# Integration Flow — Phase 1

**Case:** a user buys a digital assessment through the Marketplace Vita App.

Eight steps. Every HTTP code below was observed against a running server, not
inferred from the specification.

---

## Sequence

```
 DISGLOBAL                          VYTALIX
     │                                 │
 1   │ user starts flow                │        (no call — your UI)
     │                                 │
 2   │ collects 8 measurements         │        (no call — your UI)
     │                                 │
 3   │──── POST /vitality/assess ─────▶│  computes + persists
     │◀─────────── 200 ────────────────│  assessmentId, biologicalAge, ageStatus
     │                                 │
 4   │──── GET /vitality/{ref} ───────▶│  reads back
     │◀─────────── 200 ────────────────│  same assessmentId
     │──── GET /referral/{ref} ───────▶│  evaluates eligibility
     │◀─────────── 200 ────────────────│  {"eligible": true|false}
     │                                 │
 5   │ user pays — YOUR rails          │        (no call — your PSP)
     │                                 │
 6   │──── POST /webhooks/payment ────▶│  BEGIN → INSERT → COMMIT
     │◀─────────── 200 ────────────────│  only after commit succeeds
     │                                 │
 7   │                                 │  PaymentConfirmed → activation
     │                                 │  (post-commit, idempotent)
     │                                 │
 8   │ booking + consultation          │        (out of Phase 1 scope)
     │                                 │
```

---

## Step by step

### 1 — Disglobal starts the flow
Your surface. No Vytalix call. Decide here the `subjectRef` you will use for this
user: a pseudonymous reference **you** control. Never a name, document number or
contact detail — that is a hard boundary, not a convention.

### 2 — The user completes the assessment
Your UI captures the eight measurements. Two of them (`digitalReflexes`,
`staticBalance`) are three-dimension objects reduced to a product — see
`API_QUICK_REFERENCE.md` before designing the form, because the expected order of
magnitude is not obvious.

### 3 — Vytalix processes
```
POST /api/v2/vitality/assess     X-API-Key + optional X-Idempotency-Key
```
| Result | Meaning |
|---|---|
| **`200`** | Computed and stored. Keep `assessmentId` |
| `422` | A measurement is invalid — `errors[]` names the field |
| `404` | `subjectRef` unknown in your tenant — ask us to provision it |
| `403` / `401` | Scope missing / key problem |

The assessment is persisted before the `200`. There is no asynchronous
"processing" state to poll for.

### 4 — The result is available
```
GET /api/v2/vitality/{subjectRef}      → 200, same assessmentId
GET /api/v2/referral/{subjectRef}      → 200
```
The read-back returns the **same `assessmentId`** as step 3. That equality is your
own integration test: if it holds, persistence worked.

`referral` answers `{"eligible": false}` or a CTA payload with `referralType`,
`urgency` and `triggerReason`. **Both are `200`** — branch on `eligible`, never on
the status code.

Optionally call `POST /api/v2/preventive/score` here. It returns `200` with a
score, or **`202` `Insufficient data for score`** when the subject lacks the
biomarkers for at least two of four components. The `202` is a correct answer, not
a failure, and retrying it with the same data returns `202` again.

### 5 — Payment confirmed
Disglobal charges the user on Disglobal's rails. Vytalix is not in this path and
holds no card data. See `PAYMENT_AND_NOTIFICATION_FLOW.md` for what is settled and
what still needs a commercial decision.

### 6 — Webhook received
```
POST /api/v2/webhooks/payment          HMAC-SHA256 signature — no API Key
```
The signature is the hex HMAC of the **canonical** body: exactly these keys, in
this order, compact JSON, `signature` excluded:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

| Result | Meaning | Your action |
|---|---|---|
| **`200`** `replayed:false` | Committed and durable | Continue |
| **`200`** `replayed:true` | Same `intentId` already known | Nothing — safe |
| `401` | Signature mismatch | Compare against `examples/send-payment-webhook.sh` |
| `500` | **Nothing was recorded** | **Retry the same request** |
| timeout | Unknown whether it committed | Resend the same `intentId`; the `replayed` flag tells you which happened |

We answer `200` **only after the database transaction commits**. That is why a
`500` is safe to retry and why a `200` is a durable promise rather than an
acknowledgement of receipt.

### 7 — Service activated
Post-commit, Vytalix publishes `PaymentConfirmed`, which drives activation and
notification. Two consequences for you:

- Activation is **idempotent** — deduplication is on `intentId` in the database, so
  a replay never activates twice.
- Activation is **not** a condition of your `200`. If a downstream side effect
  fails, the payment record stands and a reconciliation sweep re-publishes it. You
  do not need to compensate.

### 8 — Booking and consultation
In person or online. **Outside Phase 1 scope** — no Vytalix endpoint in this
release covers scheduling. Whether Disglobal books directly or hands off is a
commercial decision still open.

---

## What to build first

In this order — each step only depends on the previous one working:

1. Auth: get a `401` without a key, then a `200` with it on
   `GET /api/v2/insights/cohort` (needs no seeded data).
2. Assessment: step 3, then step 4's read-back. Assert the `assessmentId` matches.
3. Webhook signing: run `examples/send-payment-webhook.sh` before writing your own
   signer, then reproduce its digest.
4. Retry logic: send the same webhook twice and assert `replayed:true` on the
   second. Build your retry policy on that guarantee.

Everything else is refinement.

---

## Idempotency — the two mechanisms are separate

| Mechanism | Scope | Behaviour |
|---|---|---|
| `X-Idempotency-Key` header | `POST` on `/api/v2/*` | Replays the stored response for 24h. Optional |
| `intentId` field | payment webhook only | Database-level deduplication. Always on, not optional |

Do not use one expecting the other's guarantee.
