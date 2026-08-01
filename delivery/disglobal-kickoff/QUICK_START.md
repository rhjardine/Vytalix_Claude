# Vytalix × Disglobal — Integration Quick Start

Target: your first successful call in under 15 minutes.
Everything here runs against the sandbox. No SDK required.

---

## 1. What you receive

Vytalix sends these five values out of band (never in a repository or a ticket):

| Value | Used as | Example shape |
|---|---|---|
| `VYTALIX_API_KEY` | `X-API-Key` header on `/api/v2/*` | `vyx_dis_…` |
| `DISGLOBAL_WEBHOOK_SECRET` | HMAC key for the payment webhook | `dg_whsec_…` |
| Sandbox base URL | every request below | `https://sandbox.api.vytalix.health` |
| `subjectRef` | a patient reference seeded for you | `DISG-8c1e5a` |
| Scopes | what your key is allowed to do | see §5 |

```bash
export VYTALIX_BASE_URL=https://sandbox.api.vytalix.health
export VYTALIX_API_KEY=<the key we send you>
export DISGLOBAL_WEBHOOK_SECRET=<the secret we send you>
```

---

## 2. Minute 1 — prove the key works

This endpoint needs no seeded data, so it is the fastest way to confirm the key
and the base URL are right.

```bash
curl -s "$VYTALIX_BASE_URL/api/v2/insights/cohort" \
  -H "X-API-Key: $VYTALIX_API_KEY"
```

`200` means you are connected. On a sandbox with few patients the body is
`{"cohortTooSmall":true,"minimumRequired":50,…}` — that is a correct answer, not
an error: cohort data is withheld below 50 subjects for privacy.

**If you get `401`,** the key is missing, wrong, or revoked — the body is the same
for all three on purpose. Check the header name is exactly `X-API-Key`.

---

## 3. Minute 5 — run a biological age assessment

The core call. `subjectRef` is your pseudonymous user reference; we resolve it to
a patient on our side. Send `patientId` instead if you already hold one.

```bash
curl -s -X POST "$VYTALIX_BASE_URL/api/v2/vitality/assess" \
  -H "X-API-Key: $VYTALIX_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "subjectRef": "DISG-8c1e5a",
    "chronologicalAge": 45,
    "biologicalSex": "MALE",
    "isAthlete": false,
    "measurements": {
      "fatPercentage": 24.5,
      "bmi": 26.1,
      "digitalReflexes":     { "high": 12, "long": 11, "width": 13 },
      "visualAccommodation": 14,
      "staticBalance":       { "high": 9, "long": 8, "width": 10 },
      "skinHydration": 62,
      "systolicPressure": 128,
      "diastolicPressure": 82
    }
  }'
```

Every measurement field is required. `digitalReflexes` and `staticBalance` are
objects with three positive numbers (`high`, `long`, `width`) — three attempts,
not a single value.

`422` returns the exact failing fields under `errors[]`. `404` means the
`subjectRef` does not exist in this tenant yet — ask us to seed it.

`X-Idempotency-Key` is optional but recommended: a repeat with the same key
replays the stored response for 24h instead of recomputing.

---

## 4. Minute 10 — send a signed payment webhook

This is the only endpoint where **you** call **us** with HMAC instead of an API key.

The signature is the hex HMAC-SHA256 of the *canonical* body: exactly these keys,
in this order, with no extra whitespace, and **excluding** `signature`:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

Any reordering or reformatting changes the digest and returns `401`.

A runnable reference implementation ships with the package:

```bash
BASE_URL=$VYTALIX_BASE_URL \
DISGLOBAL_WEBHOOK_SECRET=$DISGLOBAL_WEBHOOK_SECRET \
./examples/send-payment-webhook.sh      # curl + openssl
node ./examples/send-payment-webhook.js # Node.js
```

Behaviour you can rely on:

- **`200`** — the payment is committed and durable. We only answer `200` after the
  database transaction commits.
- **`200` with `"replayed": true`** — we already had this `intentId`. Safe.
- **`500`** — nothing was recorded. **Retry the same request**; duplicates are
  impossible because deduplication is keyed on `intentId` in the database.
- Only `payment.confirmed` performs work. `payment.failed` and `payment.refunded`
  are acknowledged with no side effects.

---

## 5. Scopes on your key

Your key carries only what Phase 1 needs. A call outside these returns `403`.

| Endpoint | Method | Scope |
|---|---|---|
| `/api/v2/vitality/assess` | POST | `vitality:write` |
| `/api/v2/vitality/{subjectRef}` | GET | `vitality:read` |
| `/api/v2/preventive/score` | POST | `preventive:write` |
| `/api/v2/referral/{subjectRef}` | GET | `referral:read` |
| `/api/v2/engagement/events` | POST | `engagement:write` |
| `/api/v2/insights/cohort` | GET | `insights:read` |
| `/api/v2/webhooks/payment` | POST | *(none — HMAC signed)* |

---

## 6. Error codes — same across `/api/v2`

| Code | Meaning | What to do |
|---|---|---|
| `401` | Key missing, invalid, expired or revoked | Stop and contact us — do not retry in a loop |
| `403` | Key is valid but lacks the scope | Stop; ask us to widen the scope |
| `422` | Validation failed — see `errors[]` | Fix the payload |
| `429` | Rate limit or monthly quota | Back off and retry |
| `4xx/5xx` | RFC 7807 body: `type,title,status,detail,correlationId` | Log `correlationId` and send it to us |

Every response echoes `X-Correlation-ID`. Log it — it is how we trace an incident
on our side.

---

## 7. Where to go next

- `openapi/vytalix-platform-v2.yaml` — the full contract; import it into your codegen.
- `postman/vytalix_postman_collection.json` — every call above, ready to run.
- `FAQ.md` — the questions that come up in the first week.
- `KNOWN_LIMITATIONS.md` — what is intentionally not in Phase 1.
