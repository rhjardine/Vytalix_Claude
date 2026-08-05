# Vytalix × Disglobal — Integration Overview (Phase 1)

Two pages: what Vytalix is, what Disglobal consumes, and how a user moves through
the combined flow. Read this before the API reference.

---

## What Vytalix is

Vytalix is a **clinical intelligence engine**. It takes measurements about a person
and returns interpreted results — a biological age estimation, a preventive score,
a referral decision. It does not own the end-user relationship, does not render a
user interface, and does not process payments.

Three names, three roles, not interchangeable:

| Name | Role |
|---|---|
| **Doctor Antivejez** | The clinical product and the clinical authority. Owns methodology and validation |
| **Marketplace Vita App** | The channel where the end user buys and interacts — Disglobal's surface |
| **Vytalix Engine** | The platform that computes and stores results. What you integrate with |

**What crosses the boundary to you:** results only — a biological age estimation,
an `ageStatus`, a score, a referral decision — always about a **pseudonymous
subject** (`subjectRef`). The clinical algorithms stay inside Vytalix; no clinical
identity travels out.

> **Governance boundary.** A digital assessment is **not a medical diagnosis**.
> Determining biological age requires in-person clinical evaluation. What the API
> returns is an *estimation* meant to inform and to route a user toward care —
> never to replace it. Clinical efficacy claims require sign-off from Doctor
> Antivejez.

---

## What Disglobal consumes

Seven endpoints. Nothing else in Phase 1.

| Capability | Endpoint | Auth |
|---|---|---|
| Run an assessment | `POST /api/v2/vitality/assess` | API Key |
| Read the latest result | `GET /api/v2/vitality/{subjectRef}` | API Key |
| Preventive score | `POST /api/v2/preventive/score` | API Key |
| Referral decision | `GET /api/v2/referral/{subjectRef}` | API Key |
| Engagement events | `POST /api/v2/engagement/events` | API Key |
| Population metrics | `GET /api/v2/insights/cohort` | API Key |
| Payment confirmation | `POST /api/v2/webhooks/payment` | **HMAC-SHA256** |

Six use `X-API-Key`. The seventh uses an HMAC signature over the request body,
because there you are notifying us rather than querying us.

**Not in Phase 1:** the public funnel (`/api/funnel/*`), dental endpoints, the
product catalog, facial analysis, the outbound referral webhook, and the
administrative surface. Your key will not open them. If any becomes commercially
interesting, it is a separate conversation.

---

## The combined flow

```
   USER (Marketplace Vita App)
     │
     │  1. Buys a digital assessment
     ▼
   DISGLOBAL — collects measurements in your UI
     │
     │  2. POST /api/v2/vitality/assess        (X-API-Key)
     ▼
   VYTALIX — computes and persists
     │
     │  3. 200 + assessmentId, biologicalAge, ageStatus, partialAges
     ▼
   DISGLOBAL — shows the result to the user
     │
     │  4. GET /api/v2/vitality/{subjectRef}   (re-read at any time)
     │     GET /api/v2/referral/{subjectRef}   (is a consult warranted?)
     ▼
   USER — decides to pay for the next step
     │
     │  5. Disglobal charges the user (your rails, your PSP)
     ▼
   DISGLOBAL — payment confirmed on your side
     │
     │  6. POST /api/v2/webhooks/payment       (HMAC-signed)
     ▼
   VYTALIX — persists, commits, THEN answers 200 → activates the service
     │
     │  7. Activation is durable and idempotent
     ▼
   USER — booking and consultation (in person or online)
```

**Who owns which truth**

| Concern | Owner |
|---|---|
| User identity, UI, checkout | **Disglobal** |
| Charging the end user | **Disglobal** |
| Measurement capture | **Disglobal** |
| Computation, results, clinical logic | **Vytalix** |
| Payment record, service activation | **Vytalix** (after your webhook) |
| Clinical validity and methodology | **Doctor Antivejez** |

---

## Three properties to know before you design

**1. On the webhook we answer `200` only after the database commit.** If
persistence fails you get `500` and nothing was recorded — your signal to retry. A
`200` is a durable promise, not an acknowledgement of receipt.

**2. Deduplication is on `intentId`, in the database.** Replaying a webhook returns
`200` with `"replayed": true` and never re-activates or re-notifies. Retries and
timeouts are therefore safe by construction — build your retry policy on it.

**3. Subjects are pseudonymous.** You send a reference you control (`subjectRef`),
never a name, document number or contact detail. We resolve it internally. This is
a hard boundary, not a convention.

---

## Where to go next

| You want to… | Read |
|---|---|
| Make your first call | `FIRST_SUCCESSFUL_CALL_GUIDE.md` |
| See every endpoint at a glance | `API_QUICK_REFERENCE.md` |
| Understand the end-to-end sequence | `INTEGRATION_FLOW_FASE1.md` |
| Wire up payments | `PAYMENT_AND_NOTIFICATION_FLOW.md` |
| Full request/response detail | `QUICK_START.md` + `openapi/vytalix-platform-v2.yaml` |
| Decide whether something is a bug | `KNOWN_SANDBOX_BEHAVIOR.md` |
| Know what is deliberately absent | `KNOWN_LIMITATIONS.md` |
| Receive credentials safely | `PARTNER_SECURITY_HANDOFF.md` |
