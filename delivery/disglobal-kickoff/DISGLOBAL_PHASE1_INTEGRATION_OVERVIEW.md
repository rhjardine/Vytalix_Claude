# Disglobal — Phase 1 Integration Overview

**Entry point for any engineer starting this integration.** Read this first; every
other document in the package expands one part of it.

Each statement below is labelled:
**[V]** verified against code, OpenAPI or a running server · **[I]** inference ·
**[C]** commercial decision still open.

---

## 1. Objective

Disglobal's Marketplace Vita App offers a preventive health journey: a facial
scan, a preventive questionnaire, an initial result, and the option to book a
consultation — online or in person — which the user pays for on Disglobal's rails.

Vytalix provides the endpoints that capture each step, persist it, and activate
the service once payment is confirmed.

**Disglobal owns:** the user, the interface, measurement capture, questionnaire
scoring, and payment.
**Vytalix owns:** persistence, service activation, notifications, and the clinical
engine behind them.

---

## 2. Phase 1 scope — the functional flow

```
   USUARIO DISGLOBAL
          │
          ▼
   1. ESCANEO FACIAL ─────────▶ POST /api/funnel/facial-analysis
          │                      returns estimatedAge, confidence, provider
          ▼
   2. CUESTIONARIO PREVENTIVO ▶ POST /api/funnel/vitality-assessment
          │                      Disglobal sends the ALREADY-COMPUTED score
          ▼
   3. RESULTADO INICIAL          (rendered by Disglobal from its own scoring)
          │
          ▼
   4. SELECCIÓN DE SERVICIO
          │
      ┌───┴────┐
      ▼        ▼
   ONLINE   PRESENCIAL ───────▶ POST /api/funnel/booking
   consulta  clínica/médico     consultationType selects the subject, not the
                                modality — see FUNNEL_API_REFERENCE.md §4
      └───┬────┘
          ▼
   5. PAGO (Disglobal)           Disglobal's own PSP — Vytalix is not in this path
          │
          ▼
   6. ACTIVACIÓN ─────────────▶ POST /api/v2/webhooks/payment   (HMAC-signed)
          │                      200 only after the database COMMIT
          ▼
   7. NOTIFICACIONES             fired post-commit, best-effort
```

**[V]** All four funnel endpoints are live and covered by an automated regression
suite.
**[V]** `POST /api/funnel/leads` also exists for lead capture before step 1 — use it
if you want the journey correlated from first contact.

---

## 3. Simplified architecture

```
  DISGLOBAL                          VYTALIX
  ─────────                          ───────
  UI + scoring        ──HTTPS──▶     /api/funnel/*        (public, no auth)
  PSP + checkout      ──HTTPS──▶     /api/v2/webhooks/…   (HMAC-signed)
                                          │
                                          ▼
                                     persistence (tenant-scoped)
                                          │
                                          ▼
                                     activation + notifications
```

There is no VPN, no tunnel and no IP allow-list. **[V]**

---

## 4. APIs involved

### Group A — Partner Integration APIs (your Phase 1)

| # | Endpoint | Method | Purpose | Auth |
|---|---|---|---|---|
| 1 | `/api/funnel/leads` | POST | Capture or identify a lead | **none** |
| 2 | `/api/funnel/facial-analysis` | POST | Facial scan | **none** |
| 3 | `/api/funnel/vitality-assessment` | POST | Store the questionnaire result | **none** |
| 4 | `/api/funnel/booking` | POST | Request a consultation (online / in person) | **none** |
| 5 | `/api/v2/webhooks/payment` | POST | Confirm payment → activate service | **HMAC-SHA256** |

**[V]** Endpoints 1–4 currently require **no authentication**. Endpoint 5
authenticates by HMAC signature over the canonical body.

> **[C] Open decision.** That the funnel is unauthenticated is the current state,
> not a commitment. Before production Vytalix intends to place these behind a
> credential; the mechanism and timing are open. Design your client so the base URL
> and an eventual auth header are configuration, not hard-coded.

### Group B — Platform APIs (available, not part of your Phase 1 flow)

| Endpoint | What it offers |
|---|---|
| `POST /api/v2/vitality/assess` | Full biophysics assessment computed **by Vytalix** from 8 measurements |
| `GET /api/v2/vitality/{subjectRef}` | Read the latest computed assessment |
| `POST /api/v2/preventive/score` | Composite preventive score |
| `GET /api/v2/referral/{subjectRef}` | Referral eligibility decision |
| `POST /api/v2/engagement/events` | Engagement telemetry |
| `GET /api/v2/insights/cohort` | Anonymised population metrics |

**[V]** These are operational, API-Key authenticated, and validated end to end.
They are **not** required for the flow in §2.

**[I]** They become relevant when Disglobal wants Vytalix to *compute* the clinical
result rather than receive one — a natural Phase 2, not a gap in Phase 1.

**Never mix the two groups.** Group A is unauthenticated and receives results you
computed. Group B is API-Key authenticated and computes results for you. Different
auth, different direction of responsibility.

---

## 5. Authentication — what you need

| Surface | Mechanism | You need |
|---|---|---|
| `/api/funnel/*` | none today | Base URL only |
| `/api/v2/webhooks/payment` | HMAC-SHA256 over the canonical body | **Webhook secret** (delivered out of band) |
| Group B (if you use it) | `X-API-Key` header | **API Key** with the relevant scopes |

**[V] The APIs are publicly reachable over HTTPS.** No VPN, no tunnel, no IP
allow-list, no infrastructure change required on either side to begin.

Canonical body for the webhook signature — exactly these keys, in this order,
compact JSON, `signature` excluded:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

---

## 6. What Disglobal integrates vs what stays in Vytalix

| Responsibility | Owner | Evidence |
|---|---|---|
| User identity, UI, journey | Disglobal | — |
| Facial image capture | Disglobal | sends `imageBase64` |
| **Questionnaire scoring and classification** | **Disglobal** | **[V]** the endpoint receives `score`, `category`, `yearsBiological` and 5 dimension values already computed, and persists them without recalculating |
| Rendering the initial result | Disglobal | **[V]** the questionnaire endpoint returns only `{ id }` — no interpretation |
| Charging the user | Disglobal | Disglobal's PSP |
| Persistence of every step | Vytalix | — |
| Service activation on payment | Vytalix | after COMMIT |
| Notifications | Vytalix | post-commit, best-effort |
| Clinical methodology and validation | Doctor Antivejez | clinical authority |

> **A digital assessment is not a medical diagnosis.** Determining biological age
> requires in-person clinical evaluation. Results returned by these APIs inform and
> route a user toward care; they do not replace it.

---

## 7. Out of scope for Phase 1

| Item | Status |
|---|---|
| Vytalix computing the questionnaire score from raw answers | **Not built.** The endpoint accepts a computed result |
| Real AWS facial recognition | **[V]** Code implemented, **`mock` provider active**. See `FACIAL_ANALYSIS_STATUS.md` |
| Dental vertical | Implemented; commercial decision pending **[C]** |
| Outbound callback from Vytalix to Disglobal | **[V]** Does not exist |
| Asynchronous referral webhook | Not active — synchronous endpoint available instead |
| Published npm SDK | Does not exist. REST over OpenAPI is the supported path |
| Rate limit / quota enforcement | **[V]** Tier is recorded, not enforced |
| Scheduling/calendar management after booking | No endpoint in Phase 1 |

---

## 8. Before you go to production — ask Vytalix for

1. Whether the funnel endpoints will require authentication, and by when **[C]**
2. Production base URL and credentials
3. Whether AWS facial recognition will be enabled, and the expected response shape
4. Refund behaviour — **[V]** today `payment.refunded` is acknowledged but does
   **not** deactivate service access
5. The agreed vocabulary for `metadata.product` — **[V]** currently free-form
6. Expected volume and the throttling policy that will apply
7. Whether Vytalix should return a confirmation callback after activation **[C]**

---

## 9. Reading order

| # | Document | Answers |
|---|---|---|
| 1 | **this file** | What am I integrating, and in what order? |
| 2 | `FIRST_DAY_WITH_VYTALIX.md` | How do I make my first call work? |
| 3 | `QUICK_START.md` | What exactly do I send and receive? |
| 4 | `API_QUICK_REFERENCE.md` | Every endpoint at a glance |
| 5 | `KNOWN_SANDBOX_BEHAVIOR.md` | Which responses are *not* errors? |
| 6 | `INTEGRATION_FLOW_FASE1.md` | The full sequence, hop by hop |
| 7 | `PAYMENT_AND_NOTIFICATION_FLOW.md` | Who does what around payment |
| 8 | `PARTNER_SECURITY_HANDOFF.md` | How credentials reach me |
| 9 | `PHASE_MATRIX.md` | What is available now vs later |
| — | `FACIAL_ANALYSIS_STATUS.md` | Exact state of the facial component |
