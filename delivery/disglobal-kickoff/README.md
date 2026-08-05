# Vytalix × Disglobal — Integration Kickoff Package

Everything Disglobal needs to start building the Phase 1 consumer. Self-contained:
no repository access required.

Start with **`DISGLOBAL_PHASE1_INTEGRATION_OVERVIEW.md`** — it defines the scope
and the flow. Everything else expands one part of it.

All sandbox data is synthetic and carries no clinical meaning — see
`KNOWN_SANDBOX_BEHAVIOR.md`.

---

## Reading order

| # | Document | Answers |
|---|---|---|
| **1** | **`DISGLOBAL_PHASE1_INTEGRATION_OVERVIEW.md`** | **Read first.** Scope, flow, which APIs, who owns what |
| 2 | `FIRST_SUCCESSFUL_CALL_GUIDE.md` | How do I make my first call work? |
| 3 | `QUICK_START.md` | What exactly do I send and receive? |
| 4 | `API_QUICK_REFERENCE.md` | Every endpoint at a glance, Group A and Group B |
| 5 | `KNOWN_SANDBOX_BEHAVIOR.md` | Which responses are *not* errors? |
| 6 | `INTEGRATION_FLOW_FASE1.md` | The full sequence, hop by hop |
| 7 | `PAYMENT_AND_NOTIFICATION_FLOW.md` | Who does what around payment |
| 8 | `PARTNER_SECURITY_HANDOFF.md` | How credentials reach me |
| 9 | `HUMAN_VALIDATION_RUNBOOK.md` | *(Vytalix-internal)* environment check before a demo |

## Reference

| Path | What it is |
|---|---|
| `PHASE_MATRIX.md` | Available now · planned · roadmap · out of scope |
| `FACIAL_ANALYSIS_STATUS.md` | Exact state of the facial component |
| `KNOWN_LIMITATIONS.md` | What is deliberately absent, and what to do instead |
| `FAQ.md` | The questions that come up in the first week |
| `SESSION_RUNBOOK.md` | *(Vytalix-internal)* conducting the first live session |
| `DG_INTEGRATION_CHECKLIST.md` | Pre-kickoff verification for both sides |
| `openapi/vytalix-platform-v2.yaml` | Full API contract — import into your codegen |
| `postman/vytalix_postman_collection.json` | Runnable collection |
| `examples/send-payment-webhook.sh` · `.js` | Webhook HMAC signing references |

---

## Endpoints in scope for Phase 1 — Group A

The flow: scan → questionnaire → booking → payment → activation.

| Endpoint | Method | Auth |
|---|---|---|
| `/api/funnel/leads` | POST | none |
| `/api/funnel/facial-analysis` | POST | none |
| `/api/funnel/vitality-assessment` | POST | none |
| `/api/funnel/booking` | POST | none |
| `/api/v2/webhooks/payment` | POST | HMAC-SHA256 |

## Group B — operational, outside the Phase 1 flow

Available with an API Key if scope expands. These **compute** clinical results
rather than receiving them.

| Endpoint | Method | Scope |
|---|---|---|
| `/api/v2/vitality/assess` | POST | `vitality:write` |
| `/api/v2/vitality/{subjectRef}` | GET | `vitality:read` |
| `/api/v2/preventive/score` | POST | `preventive:write` |
| `/api/v2/referral/{subjectRef}` | GET | `referral:read` |
| `/api/v2/engagement/events` | POST | `engagement:write` |
| `/api/v2/insights/cohort` | GET | `insights:read` |

Out of scope entirely: `/api/v2/dental/*`, `/api/exchange-rate`, `/admin/*`, and
the asynchronous referral webhook. Full breakdown in `PHASE_MATRIX.md`.

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
