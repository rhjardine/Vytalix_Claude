# Integration FAQ

Questions that come up while building. Each answer reflects how the platform
behaves today, not how it is intended to behave.

---

## Scope and architecture

### Which endpoints do I actually integrate?
Five, and they are the Phase 1 flow: `POST /api/funnel/leads`,
`/api/funnel/facial-analysis`, `/api/funnel/vitality-assessment`,
`/api/funnel/booking`, and `POST /api/v2/webhooks/payment`. That is Group A.

### Then what are the `/api/v2` clinical endpoints for?
Group B — a different integration model where **Vytalix computes** the clinical
result from eight measurements rather than receiving one you computed. Operational
and API-Key authenticated, but not part of the agreed flow. `PHASE_MATRIX.md` has
the breakdown.

### Why does the OpenAPI file show endpoints I am not supposed to use?
The specification documents the whole platform. Your Phase 1 surface is the five
above. Anything else — dental, catalog, admin — is out of scope.

### Do I need a VPN, an allow-list, or any infrastructure change?
No. Public HTTPS. The absence of infrastructure work is the main reason this can
move faster than a typical enterprise integration.

---

## Authentication

### How do I authenticate?
It depends on the endpoint, which is unusual and worth reading carefully:

| Surface | Mechanism |
|---|---|
| The four funnel endpoints | **None today** |
| Payment webhook | HMAC-SHA256 over the canonical body |
| Group B (`/api/v2/*`) | `X-API-Key` header |

### The funnel really has no authentication?
Correct, today. That is the current state, not a commitment — authentication is
intended before production, with the mechanism and date still open. Keep the base
URL and any future auth header in configuration so adding one is a config change.

### Can I mint my own API Key?
No. Keys are issued by Vytalix through an authenticated administrative endpoint.
Ask us; turnaround is minutes.

### What is the difference between `401` and `403`?
`401` means the credential failed — missing, invalid, expired or revoked, kept
deliberately indistinguishable. `403` means the credential is valid but lacks the
scope, and the body names it. Neither should be retried in a loop.

---

## The questionnaire

### Who calculates the score?
**You do.** The endpoint requires `score`, `category`, `yearsBiological` and five
`dimensions` already computed, persists them without recalculating, and returns
only an `id`.

### Can I send 45 questions?
Yes. `answersPayload` is a free-form map of booleans — no schema change needed.

### What does Vytalix return that I can show the user?
From this endpoint, nothing but the `id`. The result you display is the one you
computed. If you want Vytalix to compute a clinical result, that is Group B.

---

## Facial analysis

### Is it real?
The endpoint is real; the provider is not. `mock` is active and derives its number
from a hash of your image bytes. Every response carries `provider` — check it
before displaying anything.

### What changes when AWS is enabled?
Only `provider` flips from `mock` to `aws` and the values become real. The response
shape is identical, so a client that reads `provider` needs no rework.

### Are images stored?
No. Only derived values: `estimatedAge`, `confidence`, `analysisPoints`,
`provider`, `status`, `analyzedAt` and identifiers.

---

## Payments

### What does a `200` on the webhook actually guarantee?
That the payment is committed and durable. We answer `200` only after the database
transaction commits — it is not an acknowledgement of receipt.

### What do I do on a `500`?
Retry the same request unchanged. `500` means nothing was recorded, and
deduplication on `intentId` makes an identical resend safe.

### And on a timeout?
Resend the same `intentId`. `replayed:true` proves the first attempt committed;
`replayed:false` proves it did not. Either answer is definitive.

### My signature keeps returning `401`.
The digest is over the *canonical* body: keys `event, intentId, amount, currency,
timestamp, subjectRef, metadata`, in that order, compact JSON, `signature`
excluded. Run `examples/send-payment-webhook.sh` and reproduce its digest before
debugging your own signer.

### Will Vytalix call me back after activation?
No. There is no outbound webhook to Disglobal. If you need one, raise it — it is
new scope.

### What happens on a refund?
`payment.refunded` is acknowledged with `200` and **no side effects**. Service
access stays active. The business policy for refunds is still open.

---

## Errors and normal behaviour

### Which responses look like failures but are not?
`cohortTooSmall` (privacy floor under 50 subjects), `eligible:false` on referral
(the engine decided no), and `202 Insufficient data for score`. All are `200`/`202`
— branch on the field, not the status.

### Should I retry a `202`?
No. Retrying with the same data returns `202` again.

### Why did I get a `500` from the engagement endpoint?
Most likely an invalid `type`. Unrecognised enum values currently surface as `500`
rather than `422`. `COMMON_INTEGRATION_MISTAKES.md` §10 lists the valid values.

### Are there rate limits?
Your key records a tier, but **throttling and quota are not enforced**. The only
`429` comes from the authentication brute-force guard (20 failures per minute per
IP). Please do not load-test sandbox — nothing protects it.

---

## Data and privacy

### What goes in `subjectRef`?
A pseudonym you control. Never a name, document number, email or phone. Hard
boundary.

### Is sandbox data real?
No. Everything is synthetic, including the test subject. Results carry **no
clinical meaning** and must never be shown to a patient or stored as a health
record.

### Is this a medical diagnosis?
No. A digital assessment is not a diagnosis; determining biological age requires
in-person clinical evaluation. Results inform and route a user toward care.

---

## Tooling and support

### Is there an SDK?
Not published. Generate a client from `openapi/vytalix-platform-v2.yaml`, or call
REST directly — that is the supported Phase 1 path.

### Which environment variable name should I use for the key?
`VYTALIX_API_KEY`. You may see `VYX_API_KEY` in older material; same value, legacy
alias. Only the `X-API-Key` **header** name is contractual.

### What do I send when reporting a problem?
The `X-Correlation-ID` from the response headers, the endpoint, and the HTTP status.
That is all we need to find your exact request. **Never send credentials.**

### Where do I start?
`FIRST_DAY_WITH_VYTALIX.md`. Four calls, under an hour.
