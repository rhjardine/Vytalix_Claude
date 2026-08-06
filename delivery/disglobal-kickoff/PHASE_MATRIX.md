# Phase Matrix — what exists, what is planned, what is not

One table to remove ambiguity. Columns mean exactly this:

- **Phase 1 — Available**: implemented, validated end to end, integrate now.
- **Phase 2 — Planned**: implemented and working, but outside the agreed Phase 1
  flow. Available if scope expands.
- **Roadmap**: not built. Requires development.
- **Out of scope**: deliberately excluded from this integration.

Labels: **[V]** verified · **[I]** inference · **[C]** commercial decision open.

---

## Phase 1 — Available now

| Capability | Endpoint | Notes |
|---|---|---|
| Lead capture | `POST /api/funnel/leads` | **[V]** live, no auth |
| Facial scan (plumbing) | `POST /api/funnel/facial-analysis` | **[V]** live · **mock provider** — see `FACIAL_ANALYSIS_STATUS.md` |
| Preventive questionnaire | `POST /api/funnel/vitality-assessment` | **[V]** live · accepts a **pre-computed** score · 45 questions fit in `answersPayload` with no schema change |
| Consultation request | `POST /api/funnel/booking` | **[V]** live · `consultationType` selects the subject · returns `WHATSAPP_ONLY` with a confirmation code — a hand-off, not a scheduled appointment |
| Payment confirmation | `POST /api/v2/webhooks/payment` | **[V]** HMAC · idempotent on `intentId` · `200` only after COMMIT |
| Service activation | *(automatic)* | **[V]** post-commit, idempotent |
| Patient notification | *(automatic)* | **[V]** fired post-commit · **sandbox uses the `log` provider — no real email/SMS is delivered** |

## Phase 2 — Planned (built and working, outside the Phase 1 flow)

| Capability | Endpoint | Why it is not Phase 1 |
|---|---|---|
| Biophysics assessment computed by Vytalix | `POST /api/v2/vitality/assess` | **[V]** operational. Requires 8 clinical measurements; Phase 1 sends a pre-computed questionnaire result instead |
| Read stored assessment | `GET /api/v2/vitality/{subjectRef}` | **[V]** operational |
| Composite preventive score | `POST /api/v2/preventive/score` | **[V]** operational; needs biomarkers Disglobal does not currently send |
| Referral eligibility | `GET /api/v2/referral/{subjectRef}` | **[V]** operational |
| Engagement telemetry | `POST /api/v2/engagement/events` | **[V]** operational |
| Population metrics | `GET /api/v2/insights/cohort` | **[V]** operational; withheld below 50 subjects |
| Product catalog | `GET /api/v2/catalog` | **[V]** operational; not in the agreed flow |

*All Phase 2 items require an API Key with the relevant scope. None requires new development — only a scope decision.* **[C]**

## Roadmap — not built

| Capability | State |
|---|---|
| Vytalix scoring the questionnaire from raw answers | **[V]** Not built. The endpoint receives a computed result and persists it |
| Outbound callback Vytalix → Disglobal after activation | **[V]** Does not exist |
| Asynchronous referral webhook | **[V]** Inactive; synchronous endpoint available |
| Rate limit / monthly quota enforcement | **[V]** Tier is recorded; the middleware is never mounted |
| Refund reversing service access | **[V]** `payment.refunded` is acknowledged with no side effect — access stays active |
| Published npm SDK | **[V]** Not published. REST over OpenAPI is supported |
| Authentication on the funnel endpoints | **[C]** Intended before production; mechanism and date open |
| Real AWS Rekognition enabled | **[V]** Code ready, credentials and configuration missing |
| Scheduling / calendar management | Not built |

## Out of scope for this integration

| Item | Reason |
|---|---|
| Dental vertical (`/api/v2/dental/*`) | Implemented; commercial decision pending **[C]** |
| Administrative surface (`/admin/*`) | Internal. Credential issuing and billing |
| Exchange rate service | Not mounted |
| Direct database or repository access | Not granted under any phase |

---

## The three questions this matrix is meant to settle

**1. Can we do the 45-question questionnaire in Phase 1?**
**Yes — with one condition.** `answersPayload` is a free-form map of boolean
answers, so 45 fit without any schema change **[V]**. The condition is that
**Disglobal computes** `score`, `category`, `yearsBiological` and the five
dimension values; Vytalix persists them without recalculating **[V]**.

**2. Is facial recognition real in Phase 1?**
**The endpoint is real; the provider is not.** The call succeeds and the value
persists, but `mock` returns a hash-derived number. Enabling AWS is configuration,
not development **[V]**. Whether it gets enabled is open **[C]**.

**3. Does the flow support both online and in-person consultation?**
**No, not today.** `consultationType` describes the subject of the consultation
(longevity, dental, preventive, second opinion), not its modality **[V]**. No field
in the booking schema distinguishes online from in person. A `bookingType` enum
with those values exists in another module, but the endpoint does not use it.
Raising this is the first thing to settle if the split matters for Phase 1.
