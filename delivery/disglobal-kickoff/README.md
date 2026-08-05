# Vytalix × Disglobal — Integration Kickoff Package

Everything Disglobal needs to start building the Phase 1 consumer. Self-contained:
no repository access required.

Start with **`FIRST_SUCCESSFUL_CALL_GUIDE.md`** — one page, first verified call.
Then **`QUICK_START.md`** for the full assessment and webhook flows.

All sandbox data is synthetic and carries no clinical meaning — see
`KNOWN_SANDBOX_BEHAVIOR.md`.

---

## Contents

| Path | What it is |
|---|---|
| `PARTNER_INTEGRATION_OVERVIEW.md` | **Read first.** What Vytalix is, what you consume, the combined flow |
| `FIRST_SUCCESSFUL_CALL_GUIDE.md` | Six steps to a verified first call |
| `API_QUICK_REFERENCE.md` | All seven endpoints in one table: request, response, common errors |
| `INTEGRATION_FLOW_FASE1.md` | The eight-step sequence, with the real HTTP code at each hop |
| `PAYMENT_AND_NOTIFICATION_FLOW.md` | Payment responsibilities — what is settled and what is still open |
| `QUICK_START.md` | Full request/response detail, signed webhook, error codes |
| `KNOWN_SANDBOX_BEHAVIOR.md` | Responses that look like failures and are not — read before reporting a bug |
| `KNOWN_LIMITATIONS.md` | What is intentionally not in Phase 1, and what to do instead |
| `FAQ.md` | The questions that come up in the first week |
| `PARTNER_SECURITY_HANDOFF.md` | How credentials are delivered, rotated and revoked |
| `HUMAN_VALIDATION_RUNBOOK.md` | *(Vytalix-internal)* environment check before a demo |
| `SESSION_RUNBOOK.md` | *(Vytalix-internal)* conducting the first live session |
| `DG_INTEGRATION_CHECKLIST.md` | Pre-kickoff verification for both sides |
| `openapi/vytalix-platform-v2.yaml` | Full API contract — import into your codegen |
| `postman/vytalix_postman_collection.json` | Every Phase 1 call, ready to run |
| `examples/send-payment-webhook.sh` | Webhook HMAC signing — curl + openssl |
| `examples/send-payment-webhook.js` | Webhook HMAC signing — Node.js |

---

## Endpoints in scope for Phase 1

| Endpoint | Method | Scope required |
|---|---|---|
| `/api/v2/vitality/assess` | POST | `vitality:write` |
| `/api/v2/vitality/{subjectRef}` | GET | `vitality:read` |
| `/api/v2/preventive/score` | POST | `preventive:write` |
| `/api/v2/referral/{subjectRef}` | GET | `referral:read` |
| `/api/v2/engagement/events` | POST | `engagement:write` |
| `/api/v2/insights/cohort` | GET | `insights:read` |
| `/api/v2/webhooks/payment` | POST | *(none — HMAC signed)* |

Not available to partner keys in Phase 1: `/api/funnel/*`, `/api/v2/dental/*`,
`/api/exchange-rate`, `/admin/*`, and the asynchronous referral webhook.

---

## Environments

| Environment | Base URL |
|---|---|
| Sandbox (integration testing) | `https://sandbox.api.vytalix.health` |
| Production | `https://api.vytalix.health` |

Production credentials are issued separately, after sandbox sign-off.

---

## Credentials — delivered separately

The five values below are **not** in this package by design. They are sent out of
band and must go straight into your secret manager; never commit them.

```bash
VYTALIX_BASE_URL=https://sandbox.api.vytalix.health
VYTALIX_API_KEY=<sent separately>          # X-API-Key header on /api/v2/*
DISGLOBAL_WEBHOOK_SECRET=<sent separately> # HMAC key for the payment webhook
VYTALIX_TEST_SUBJECT_REF=<sent separately> # seeded sandbox subject
# scope list for your key: see the accompanying message
```

---

## Two directions of traffic

```
Disglobal ──X-API-Key──────────────▶ /api/v2/*            (you call us)
Disglobal ──HMAC-signed body───────▶ /api/v2/webhooks/payment
Vytalix   ──200 only after COMMIT──▶ Disglobal            (durable acknowledgement)
```

Authentication differs by direction: an API key for the read/write APIs, an
HMAC signature over the canonical body for the payment webhook. Details in
`QUICK_START.md` §4.

---

## Support

Quote the `X-Correlation-ID` response header (or `correlationId` in an error body)
in any support request — that is how we locate your exact call.
