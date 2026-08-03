# First Successful Call — Vytalix Sandbox

Six steps, one page. Everything below was executed against the sandbox; the
responses are what you will actually see.

---

## 1. Credentials

Vytalix sends these out of band — never in a ticket, an email body, or a repo:

| Value | Used as |
|---|---|
| API Key | `X-API-Key` header on every `/api/v2/*` call |
| Webhook Secret | HMAC key you sign the payment webhook with |
| `subjectRef` | the sandbox subject seeded for you (`DISG-8c1e5a`) |

Scopes on your key: `vitality:read` `vitality:write` `preventive:write`
`referral:read` `engagement:write` `insights:read`. A call outside them returns
`403`, not `401`.

## 2. Environment

```bash
export VYTALIX_BASE_URL=https://sandbox.api.vytalix.health
export VYTALIX_API_KEY=<sent separately>
export DISGLOBAL_WEBHOOK_SECRET=<sent separately>
```

Required headers: `X-API-Key` and, for POSTs, `Content-Type: application/json`.
Optional: `X-Correlation-ID` (we echo it back) and `X-Idempotency-Key`.

## 3. First call

This one needs no seeded data, so it isolates "are my credentials right?" from
everything else:

```bash
curl -s -i "$VYTALIX_BASE_URL/api/v2/insights/cohort" \
  -H "X-API-Key: $VYTALIX_API_KEY"
```

## 4. What success looks like

```
HTTP/1.1 200 OK
X-Correlation-ID: 6c3d8198-b84f-4d85-b703-618d2585e225

{"cohortTooSmall":true,"minimumRequired":50,"note":"Privacy threshold not met"}
```

`200` means you are connected. `cohortTooSmall` is the **correct** answer on a
sandbox with few subjects — population metrics are withheld below 50 people. Log
`X-Correlation-ID`: it is how we trace your exact request.

Negative control — run it once so you recognise the failure shape:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$VYTALIX_BASE_URL/api/v2/insights/cohort"   # → 401
```

## 5. Read a subject

Run an assessment (full payload in `QUICK_START.md` §3), then read it back:

```bash
curl -s "$VYTALIX_BASE_URL/api/v2/vitality/DISG-8c1e5a" \
  -H "X-API-Key: $VYTALIX_API_KEY"
```

```json
{"assessmentId":"6d90ff53-…","biologicalAge":35.9,"differentialAge":-9.1,
 "ageStatus":"REJUVENECIDO","algorithmVersion":"daaa-biophysics-v2.1.0", …}
```

`assessmentId` matches the one the assessment returned. `404 No assessment found`
means the subject has no assessment yet — not that the subject is missing.

## 6. Validate the webhook

This is the one call where **you** authenticate to **us** with HMAC instead of an
API key. Use the shipped reference implementation rather than writing your own
first:

```bash
BASE_URL=$VYTALIX_BASE_URL \
DISGLOBAL_WEBHOOK_SECRET=$DISGLOBAL_WEBHOOK_SECRET \
./examples/send-payment-webhook.sh
```

| Result | Meaning |
|---|---|
| `200 {"received":true,"replayed":false}` | Committed and durable. We answer `200` only after the database commit |
| `200 {"received":true,"replayed":true}` | Same `intentId` seen before — deduplicated, nothing re-activated |
| `401` | Signature mismatch. Check the canonical key order: `event, intentId, amount, currency, timestamp, subjectRef, metadata`, compact JSON, `signature` excluded |
| `500` | Nothing was recorded — **retry the same request** |

Send the same request twice: the second must return `replayed: true`. That
confirms retries are safe before you build your retry policy on top of them.

---

**Stuck?** Send us the `X-Correlation-ID` and the HTTP status. See
`KNOWN_SANDBOX_BEHAVIOR.md` before reporting a bug — several responses that look
like failures are the sandbox behaving correctly.
