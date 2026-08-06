# Vytalix — Partner Integration Kit

**For Disglobal · Phase 1**

Everything needed to evaluate, plan and build the integration. Self-contained: no
repository access, no SDK, no VPN.

> **New here? → [`FIRST_DAY_WITH_VYTALIX.md`](FIRST_DAY_WITH_VYTALIX.md)**
> Four calls, under an hour, working integration.

---

## What this platform does

Vytalix is a clinical intelligence engine behind a preventive-health journey:
facial scan → preventive questionnaire → initial result → consultation booking
(online or in person) → payment → service activation.

**Disglobal owns** the user, the interface, questionnaire scoring and payment.
**Vytalix owns** persistence, activation, notifications and the clinical engine.

---

## Read in this order

| # | Document | The one question it answers |
|---|---|---|
| 1 | [`FIRST_DAY_WITH_VYTALIX.md`](FIRST_DAY_WITH_VYTALIX.md) | How do I get something working today? |
| 2 | [`DISGLOBAL_PHASE1_INTEGRATION_OVERVIEW.md`](DISGLOBAL_PHASE1_INTEGRATION_OVERVIEW.md) | What am I integrating, and who owns what? |
| 3 | [`API_QUICK_REFERENCE.md`](API_QUICK_REFERENCE.md) | What do I send and what comes back? |
| 4 | [`INTEGRATION_FLOW_FASE1.md`](INTEGRATION_FLOW_FASE1.md) | In what order do the calls happen? |
| 5 | [`PAYMENT_AND_NOTIFICATION_FLOW.md`](PAYMENT_AND_NOTIFICATION_FLOW.md) | How does payment and activation work? |
| 6 | [`KNOWN_SANDBOX_BEHAVIOR.md`](KNOWN_SANDBOX_BEHAVIOR.md) | Which responses are *not* errors? |
| 7 | [`COMMON_INTEGRATION_MISTAKES.md`](COMMON_INTEGRATION_MISTAKES.md) | What will I get wrong? |
| 8 | [`IMPLEMENTATION_ESTIMATION_GUIDE.md`](IMPLEMENTATION_ESTIMATION_GUIDE.md) | How much work is this, and who does it? |
| 9 | [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) | What is missing before real users? |

## Reference

| Document | Use it for |
|---|---|
| [`QUICK_START.md`](QUICK_START.md) | Full field-by-field detail on the clinical endpoints |
| [`PHASE_MATRIX.md`](PHASE_MATRIX.md) | Available now · planned · roadmap · out of scope |
| [`FACIAL_ANALYSIS_STATUS.md`](FACIAL_ANALYSIS_STATUS.md) | Exact state of the facial component |
| [`INTEGRATION_FAQ.md`](INTEGRATION_FAQ.md) | Specific questions during the build |
| [`INTEGRATION_CHECKLIST.md`](INTEGRATION_CHECKLIST.md) | Shared verification list for both companies |
| [`PARTNER_SECURITY_HANDOFF.md`](PARTNER_SECURITY_HANDOFF.md) | How credentials are delivered and rotated |

## Machine-readable

| Path | What it is |
|---|---|
| `openapi/vytalix-platform-v2.yaml` | API contract — import into your codegen or Postman |
| `postman/vytalix_postman_collection.json` | Runnable collection |
| `examples/send-payment-webhook.sh` · `.js` | HMAC signing references — run before writing your own |

*`internal/` contains Vytalix operational runbooks and is not part of the partner
deliverable.*

---

## API classification

| Class | Endpoints | Status |
|---|---|---|
| **Core** — the Phase 1 flow | `POST /api/funnel/leads` · `/facial-analysis` · `/vitality-assessment` · `/booking` · `POST /api/v2/webhooks/payment` | **Integrate these** |
| **Support** — operational | `GET /liveness` · `/readiness` · `/openapi.yaml` | Health and contract |
| **Future** — built, outside Phase 1 | `POST /api/v2/vitality/assess` · `GET /api/v2/vitality/{subjectRef}` · `POST /api/v2/preventive/score` · `GET /api/v2/referral/{subjectRef}` · `POST /api/v2/engagement/events` · `GET /api/v2/insights/cohort` | Available if scope expands. Vytalix **computes** the result rather than receiving it |
| **Administrative** — internal only | `/admin/*` | Never exposed to partners |
| **Experimental / not in scope** | `/api/v2/dental/*` · `/api/v2/catalog` · `/api/exchange-rate` | Commercial decision pending |

Full breakdown, with MVP / Phase 1 / Phase 2 / Roadmap, in
[`PHASE_MATRIX.md`](PHASE_MATRIX.md).

---

## Authentication at a glance

| Surface | Mechanism |
|---|---|
| The four funnel endpoints | **None today** — will change before production |
| Payment webhook | HMAC-SHA256 over the canonical body |
| Future (Group B) endpoints | `X-API-Key` header |

Public HTTPS. **No VPN, no tunnel, no IP allow-list, no infrastructure change.**

---

## Environments

| Environment | Base URL |
|---|---|
| Sandbox | `https://sandbox.api.vytalix.health` |
| Production | Issued after sandbox sign-off |

All sandbox data is **synthetic** and carries **no clinical meaning**. A digital
assessment is not a medical diagnosis.

---

## Support

Send the **`X-Correlation-ID`** from the response headers plus the HTTP status —
that locates your exact request. Never send credentials through a support channel.
