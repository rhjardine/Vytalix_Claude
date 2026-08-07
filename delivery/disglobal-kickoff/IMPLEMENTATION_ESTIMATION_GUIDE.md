# Implementation Estimation Guide

**This guide contains no time estimates.** Only your team can size the work.
What it gives you is the complete dependency picture, so the estimate you produce
is not revised three times.

Ownership labels: **[D]** Disglobal · **[V]** Vytalix · **[B]** business decision ·
**[X]** external dependency.

---

## 1 · Work that belongs to Disglobal

| # | Work item | Notes |
|---|---|---|
| D1 | UI for the facial capture step | Base64 JPEG, 100 chars – ~2 MB |
| D2 | **The 45-question questionnaire itself** | Presentation, navigation, persistence of answers |
| D3 | **Questionnaire scoring logic** | `score` 0–100, `category`, `yearsBiological`, five `dimensions`. **Vytalix does not compute any of these** |
| D4 | Rendering the initial result | The API returns only an `id`, no interpretation |
| D5 | Service selection UI (online / in person) | **No API field expresses this today** — `consultationType` selects the subject, not the modality. Needs a decision |
| D6 | Checkout and payment | Your PSP; Vytalix is not in this path |
| D7 | HMAC signing of the payment webhook | Canonical body; reference implementation shipped |
| D8 | Retry policy on `500` and timeout | Guarantee provided; policy is yours |
| D9 | `subjectRef` generation and mapping | Pseudonymous, stable per user |
| D10 | Error handling for the documented codes | See `FUNNEL_API_REFERENCE.md` |
| D11 | Secret storage | Server-side only; never in a client bundle |

**D3 is the largest and least obvious item.** If your estimate assumed Vytalix
would score the answers, revise it — the endpoint receives a computed result.

---

## 2 · Work that belongs to Vytalix

| # | Work item | Status |
|---|---|---|
| V1 | The five Phase 1 endpoints | ✅ Live and validated |
| V2 | Persistence of every step | ✅ Validated |
| V3 | Payment verification, commit, activation | ✅ Validated, idempotent |
| V4 | Notifications | ✅ Fires — but sandbox uses the `log` provider, so nothing is actually delivered |
| V5 | Provisioning your `subjectRef` in each environment | ✅ Sandbox done |
| V6 | Issuing credentials | ✅ Process defined |
| V7 | Production environment and URL | ⏳ Pending |
| V8 | **Authentication on the funnel endpoints** | ⏳ Intended before production; mechanism and date open |
| V9 | Enabling real AWS Rekognition | ⏳ Configuration only — see §5 |
| V10 | Rate limit / quota enforcement | ⏳ Not implemented |
| V11 | Refund reversing service access | ⏳ Not implemented |

---

## 3 · Dependencies on business decisions **[B]**

These block planning, not code. Each one has a concrete technical consequence.

| # | Decision | If unresolved |
|---|---|---|
| B1 | Commission / revenue share | Commercial gate on the "go" |
| B2 | NDA formalised | Reported signed |
| B3 | Does Disglobal need a callback after activation? | **Nothing is built.** If required, it is new scope with its own contract |
| B4 | Refund policy | Today a refund leaves service access **active** |
| B5 | Agreed vocabulary for `metadata.product` | Currently free-form; unknown values are stored as sent |
| B6 | Will real AWS facial analysis be part of Phase 1? | Determines whether you can show the result to a user |
| B7 | Who owns scheduling after booking | No Phase 1 endpoint covers calendars |
| B8 | Dental vertical in or out | Implemented, decision pending |

---

## 4 · Dependencies on infrastructure

| Item | Status |
|---|---|
| VPN, tunnel, IP allow-list | **None required.** Public HTTPS |
| Firewall changes | None on the Vytalix side |
| Certificates | Standard TLS |
| Production environment | Pending provisioning **[V]** |
| Your outbound access to `sandbox.api.vytalix.health` | Verify from your network early **[D]** |

**This is the shortest section on purpose.** The absence of infrastructure work is
the single biggest reason this integration can move faster than a typical
enterprise one.

---

## 5 · Dependencies on credentials

| Credential | Needed for | Blocking? |
|---|---|---|
| Webhook secret | Payment webhook | **Yes** — nothing signs without it |
| Sandbox base URL | Everything | Yes |
| `subjectRef` | Any subject-scoped call | Yes — provisioned |
| API Key | **Only Group B** (`/api/v2` clinical) | No, not for the Phase 1 flow |

The four funnel endpoints need **no credential today**, so D1–D5 can begin before
credentials are exchanged. Only D7 (webhook signing) is gated.

---

## 6 · Dependency on AWS

| Aspect | State |
|---|---|
| Implementation | Written; SDK installed |
| Active provider | **`mock`** |
| Blocking Phase 1 integration? | **No** — the endpoint works and the journey completes |
| Blocking a user-facing facial result? | **Yes** — mock values must not be shown |
| To enable | `VISION_PROVIDER=aws` + IAM credentials with `rekognition:DetectFaces` |
| Owner | Vytalix **[V]**, gated on **[B6]** |

**Plan the integration as if AWS were enabled.** The response shape does not change
when it is — only `provider` flips from `mock` to `aws`. Read that field and you
need no rework.

---

## 7 · What can start today, with no dependency

- D1, D2, D3, D4, D5 — the entire user-facing journey and the scoring
- D9, D10 — subject mapping and error handling
- Client generation from `openapi/vytalix-platform-v2.yaml`
- Postman collection against sandbox for the four unauthenticated endpoints

That is the majority of the work, and none of it waits on a credential, a
commercial decision, or AWS.

---

## 8 · Critical path

```
  [B1 commission] ──▶ "go" ──▶ credentials ──▶ D7 webhook signing ──▶ end-to-end test
                                    ▲
  D1..D5, D9, D10  (start now) ─────┘
                                    │
  [B6 AWS] ──▶ V9 enable ───────────┘   (parallel; does not block the path)
```

Only **D7** truly depends on the credential exchange. Everything upstream of it can
proceed in parallel with the commercial close.

---

## 9 · Questions to answer before you commit to a date

1. Does your team own the questionnaire scoring algorithm, or was it expected from
   Vytalix? *(D3 — biggest single risk to the estimate)*
2. Do you need a callback after activation? *(B3 — not built)*
3. Must the facial result be user-visible at launch? *(B6 — gates AWS)*
4. What refund behaviour does the business require? *(B4 — not implemented)*
5. Will the funnel endpoints be authenticated before you go live? *(V8 — affects your
   client design)*
