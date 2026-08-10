# Integration Checklist

A shared list for both companies. Every line is objectively verifiable — no
"reviewed" or "aligned", only things that are done or not done.

Owner: **[D]** Disglobal · **[V]** Vytalix · **[B]** both.

---

## Stage 0 — Before any code

| ✓ | Item | Owner |
|---|---|---|
| ☐ | NDA signed | **[B]** |
| ☐ | Commercial terms closed and joint "go" given | **[B]** |
| ☐ | Technical contacts and escalation path exchanged | **[B]** |
| ☐ | Documentation package received and readable | **[D]** |
| ☐ | Sandbox base URL reachable from Disglobal's network | **[D]** |
| ☐ | `GET /liveness` returns `200` | **[D]** |

## Stage 1 — Credentials

| ✓ | Item | Owner |
|---|---|---|
| ☐ | Webhook secret delivered through a secret manager or one-time link — **never email or chat** | **[V]** |
| ☐ | Test `subjectRef` (`DISG-8c1e5a`) confirmed provisioned | **[V]** |
| ☐ | Credentials loaded into Disglobal's secret store, server-side only | **[D]** |
| ☐ | Expiry set on the shared credential | **[V]** |
| ☐ | Handover logged: who, to whom, when, which channel, expiry | **[V]** |

## Stage 2 — First calls

| ✓ | Item | Owner |
|---|---|---|
| ☐ | Facial scan returns a payload; `provider` field is read by the client | **[D]** |
| ☐ | Questionnaire accepts the computed score and returns an `id` | **[D]** |
| ☐ | Booking accepts `ONLINE_CONSULT` | **[D]** |
| ☐ | Booking accepts `IN_PERSON` | **[D]** |
| ☐ | Signed webhook returns `200` `replayed:false` | **[D]** |
| ☐ | Repeat of the same webhook returns `replayed:true` | **[D]** |
| ☐ | Tampered signature returns `401` | **[D]** |
| ☐ | Postman collection runs with no unexpected failures | **[D]** |

## Stage 3 — Disglobal's implementation

| ✓ | Item | Owner |
|---|---|---|
| ☐ | Questionnaire UI complete (45 questions) | **[D]** |
| ☐ | **Scoring logic implemented** — `score`, `category`, `yearsBiological`, 5 dimensions | **[D]** |
| ☐ | Scoring validated against Disglobal's own clinical criteria | **[D]** |
| ☐ | `subjectRef` generation: stable, pseudonymous, no personal identity | **[D]** |
| ☐ | `provider !== "mock"` checked before any facial result reaches a user | **[D]** |
| ☐ | Retry policy on webhook `500` and timeout | **[D]** |
| ☐ | Handling for `202`, `cohortTooSmall`, `eligible:false` as **non-error** states | **[D]** |
| ☐ | Both `404` meanings distinguished by reading `detail` | **[D]** |
| ☐ | `X-Correlation-ID` logged on every call | **[D]** |
| ☐ | Base URL and auth header held in configuration, not hard-coded | **[D]** |

## Stage 4 — Open decisions closed

| ✓ | Decision | Owner |
|---|---|---|
| ☐ | Will the funnel endpoints require authentication before production, and when | **[V]** |
| ☐ | Will real AWS facial analysis be enabled for Phase 1 | **[B]** |
| ☐ | Is a callback from Vytalix after activation required | **[B]** |
| ☐ | Refund policy — today a refund leaves access **active** | **[B]** |
| ☐ | Agreed vocabulary for `metadata.product` | **[B]** |
| ☐ | Who owns scheduling after booking | **[B]** |
| ☐ | Expected volume and the throttling policy | **[B]** |

## Stage 5 — Production readiness

| ✓ | Item | Owner |
|---|---|---|
| ☐ | Production environment provisioned and URL issued | **[V]** |
| ☐ | Production credentials issued through the secure channel | **[V]** |
| ☐ | Notification provider switched from `log` to a real channel | **[V]** |
| ☐ | Rate limiting in place before real volume | **[V]** |
| ☐ | Authentication on the funnel endpoints resolved | **[V]** |
| ☐ | `subjectRef` strategy for real users agreed | **[B]** |
| ☐ | End-to-end run completed against production | **[B]** |
| ☐ | Rollback plan agreed | **[B]** |
| ☐ | Support channel live | **[B]** |

---

## Go / No-Go

**Go to build** when Stage 0–1 are complete. Stages 2 and 3 can then proceed in
parallel; most of Stage 3 needs no credential at all.

**Go to production** only when every box above is ticked. Stage 4 in particular is
not paperwork — each open decision has a technical consequence that reaches real
users if left unanswered.
