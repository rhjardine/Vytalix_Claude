# First Day with Vytalix

**Goal: a working integration in under an hour.** Four calls, in order, each one
building on the last. No SDK, no VPN, no infrastructure work.

If you only read one document, read this one.

---

## 0 · What you need (5 min)

| What | Where it comes from |
|---|---|
| Sandbox base URL | `https://sandbox.api.vytalix.health` |
| Test subject reference | `DISG-8c1e5a` — pre-provisioned for you |
| Webhook secret | Delivered out of band (see `PARTNER_SECURITY_HANDOFF.md`) |

```bash
export VYX=https://sandbox.api.vytalix.health
export SUBJ=DISG-8c1e5a
export WH_SECRET=<sent to you separately>
```

**The four endpoints of the Phase 1 flow currently require no authentication.**
Only the payment webhook is authenticated, and it uses an HMAC signature rather
than a key. This will change before production — keep the base URL and any future
auth header in configuration, not hard-coded.

---

## 1 · Prove connectivity (2 min)

```bash
curl -s -o /dev/null -w '%{http_code}\n' $VYX/liveness
```

`200` and you are through. There is no VPN, no tunnel, no IP allow-list.

---

## 2 · Facial scan (10 min)

```bash
curl -s -X POST $VYX/api/funnel/facial-analysis \
  -H 'Content-Type: application/json' \
  -d '{"imageBase64":"<base64 of a JPEG, 100 chars – 2 MB>","sessionId":"demo-001"}'
```

```json
{ "data": { "id": "04a66eb7-8318-4611-b66d-e4dbbf7dd007", "estimatedAge": 51,
            "confidence": 0.88, "analysisPoints": 24, "status": "COMPLETED",
            "provider": "mock", "analyzedAt": "2026-08-06T13:57:33.703Z" },
  "meta": { "correlationId": "ea3497cf-…", "timestamp": "2026-08-06T13:57:33.703Z" } }
```

> **Read `provider` before you display anything.** `"mock"` means the number is
> derived from a hash of your image bytes, not from a face. It is correct plumbing
> and meaningless data. See `FACIAL_ANALYSIS_STATUS.md`.

**`422`** means the image is under 100 characters or over ~2 MB encoded.

---

## 3 · Preventive questionnaire (20 min — the part that needs design)

**You compute the score. Vytalix stores it.** The endpoint does not calculate
anything: it persists the values you send and returns an id.

```bash
curl -s -X POST $VYX/api/funnel/vitality-assessment \
  -H 'Content-Type: application/json' \
  -d '{
    "score": 72,
    "category": "BUENO",
    "yearsBiological": 47,
    "chronologicalAgeGroup": "45",
    "dimensions": {
      "energiaEstadoMental": 70, "suenoCognicion": 65,
      "composicionCorporal": 80, "signosEnvejecimiento": 75, "rangoEdad": 70
    },
    "answersPayload": { "q1": true, "q2": false, "q3": true },
    "completedAt": "2026-08-05T10:00:00.000Z",
    "durationSeconds": 480,
    "deviceType": "mobile"
  }'
```

```json
{ "data": { "id": "6d90ff53-1222-4dac-9813-59db0b473c88" },
  "meta": { "correlationId": "6c3d8198-…", "timestamp": "2026-08-05T10:00:01.000Z" } }
```

**Three things to plan for:**

1. `answersPayload` is a free-form map of booleans — **45 questions fit with no
   schema change**. Send `q1…q45` or your own keys.
2. `score` (0–100), `category` (`EXCELENTE` `BUENO` `REGULAR` `CRITICO`),
   `yearsBiological` and the five `dimensions` are **all required and all computed
   by you**.
3. `chronologicalAgeGroup` is an enum: `"45"`, `"59"`, `"69"`, `"78"` — an age
   bracket, not a count.

**`422`** returns a single `detail` message — the first validation failure, not a
list. Fix one field, resend, see the next.

---

## 4 · Booking — consultation request (5 min)

```bash
curl -s -X POST $VYX/api/funnel/booking \
  -H 'Content-Type: application/json' \
  -d '{"name":"Kevin Perdomo","email":"kevin@disglobal.test","consultationType":"EXPLORATORIA_LONGEVIDAD"}'
```

Returns `201` with `status: WHATSAPP_ONLY`, a `confirmationCode` and a
`whatsappFallbackUrl`. This endpoint records the request and hands off to WhatsApp
— it does not reserve a slot. Show the code and the link, or the journey stops.

Note: no field currently distinguishes online from in-person. See
`FUNNEL_API_REFERENCE.md` §4.

---

## 5 · Payment webhook (15 min — the only signed call)

This is you telling us the user paid, so we activate the service. Do not write
your own signer first — run ours, then reproduce it.

```bash
BASE_URL=$VYX DISGLOBAL_WEBHOOK_SECRET=$WH_SECRET ./examples/send-payment-webhook.sh
```

```json
{ "received": true, "replayed": false }
```

The signature is the hex HMAC-SHA256 of the **canonical** body — exactly these
keys, in this order, compact JSON, `signature` excluded:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

**Now run it a second time, unchanged:**

```json
{ "received": true, "replayed": true }
```

That flip from `false` to `true` is the guarantee your retry policy rests on.
Deduplication is on `intentId`, in the database. We answer `200` only after the
transaction commits — so a `500` means nothing was recorded and the same request
is safe to resend.

---

## You are done when

- [ ] `/liveness` returns `200`
- [ ] Facial scan returns a payload and you read `provider` from it
- [ ] Questionnaire returns an `id` — and your scoring produced the values you sent
- [ ] Booking returns `WHATSAPP_ONLY` with a `confirmationCode`
- [ ] Webhook returns `replayed:false`, then `replayed:true` on the repeat
- [ ] A tampered signature returns `401`

Six checks. If all pass, your integration path is proven end to end.

---

## Next

| Question | Document |
|---|---|
| What is this platform, exactly? | `DISGLOBAL_PHASE1_INTEGRATION_OVERVIEW.md` |
| Full field-by-field detail | `API_QUICK_REFERENCE.md` |
| Which responses are *not* errors? | `KNOWN_SANDBOX_BEHAVIOR.md` |
| What will I get wrong? | `COMMON_INTEGRATION_MISTAKES.md` |
| How long will this take my team? | `IMPLEMENTATION_ESTIMATION_GUIDE.md` |
| What is missing before production? | `PRODUCTION_READINESS.md` |
