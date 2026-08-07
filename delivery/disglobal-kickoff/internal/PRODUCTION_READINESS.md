# Production Readiness

Three columns, no ambiguity: what is ready, what is ready with conditions, and what
is not part of this phase. Everything is stated against the sandbox environment
validated end to end.

---

## ✅ Ready

| Capability | Evidence |
|---|---|
| The five Phase 1 endpoints respond and persist | Validated end to end against a real database |
| Payment webhook: HMAC verification | Valid signature `200`; tampered signature `401` |
| Payment webhook: transactional guarantee | `200` returned **only after** the database commit |
| Payment webhook: idempotency | Same `intentId` twice → one row, `replayed:true` on the second |
| Service activation | Fires post-commit, idempotent, cannot double-activate |
| Booking modality | `ONLINE_CONSULT`, `IN_PERSON`, `LAB_PANEL` all accepted |
| 45-question questionnaire | `answersPayload` is free-form — fits with no schema change |
| Error contract | RFC 7807 with `correlationId` on every error |
| Request tracing | `X-Correlation-ID` on every response, echoed if you send one |
| Administrative surface secured | `/admin/*` requires an authenticated administrator |
| Public reachability | HTTPS, no VPN, no allow-list, no infrastructure work |

---

## ⚠️ Ready with conditions

Each of these works, but has a caveat you must design around.

| Capability | Condition |
|---|---|
| **Facial analysis** | Endpoint is live; the **`mock` provider is active**. Values are hash-derived and must not be shown to a user. Enabling AWS is configuration, not development — see `FACIAL_ANALYSIS_STATUS.md` |
| **Funnel authentication** | The four funnel endpoints currently accept **unauthenticated** requests. Authentication is intended before production; mechanism and date are open. Keep auth headers configurable |
| **Notifications** | The pipeline fires, but sandbox runs the `log` provider — **no email or SMS is actually delivered**. Message content and channel cannot be validated here |
| **Questionnaire scoring** | Works as specified, but **Disglobal computes the score**. If your plan assumed otherwise, that is a scope change on your side, not ours |
| **Preventive score** | Returns `202` unless the subject carries enough biomarkers. Correct behaviour, but it means the sandbox subject will usually not produce a number |
| **Cohort insights** | Withheld below 50 subjects. Sandbox will always return `cohortTooSmall` |
| **Production environment** | Not yet provisioned. URL and credentials pending |

---

## ❌ Not part of this phase

| Item | Note |
|---|---|
| Vytalix computing the questionnaire score from raw answers | Not built |
| Outbound callback Vytalix → Disglobal after activation | **Does not exist.** New scope if required |
| Refund reversing service access | `payment.refunded` is acknowledged with no effect — access stays active |
| Rate limit and monthly quota enforcement | Tier is recorded, not enforced. No `429` will signal volume |
| Asynchronous referral webhook | Inactive; synchronous endpoint available |
| Published npm SDK | Not published. REST over OpenAPI is the supported path |
| Scheduling / calendar management | No endpoint after booking |
| Dental vertical | Implemented; commercial decision pending |
| Administrative API access for the partner | Internal only, under any phase |

---

## Before the production switch — joint checklist

**Vytalix must confirm**

- [ ] Production environment provisioned, URL issued
- [ ] Authentication decision on the funnel endpoints, communicated with a date
- [ ] AWS Rekognition enabled, or explicitly deferred with the consequence accepted
- [ ] Notification provider switched from `log` to a real channel
- [ ] Production credentials issued through the secure channel
- [ ] `subjectRef` strategy for real users agreed (who creates them, and when)
- [ ] Rate limiting in place before opening real volume

**Disglobal must confirm**

- [ ] Scoring logic implemented and validated against your own clinical criteria
- [ ] `provider` field checked before any facial result reaches a user
- [ ] Retry policy implemented on `500` and timeout for the webhook
- [ ] Secrets stored server-side, never in a client bundle
- [ ] `subjectRef` carries no personal identity
- [ ] Error handling covers every documented code
- [ ] `X-Correlation-ID` logged on every call

**Both must agree**

- [ ] Refund behaviour **[business]**
- [ ] Whether a callback after activation is required **[business]**
- [ ] `metadata.product` vocabulary **[business]**
- [ ] Expected volume and the throttling policy that will apply
- [ ] Support channel and escalation path
- [ ] Commercial terms closed and the joint "go" given

---

## Honest summary

The **integration path** is ready: every call in the Phase 1 flow works, persists,
and behaves predictably under retry — verified, not asserted.

What is not ready is the **production posture**: unauthenticated funnel endpoints,
a mock facial provider, notifications that do not leave the building, and no
throttling. None of these blocks building and testing the integration today. All of
them must close before real users touch it.

Build now. Launch after the checklist above is complete.
