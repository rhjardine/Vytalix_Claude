# First Integration Rehearsal — Session Runbook

**Baseline:** commit `4dead40` · branch `adr/baseline-2026` · working tree clean
**Audience:** Vytalix side, before and during the first technical session with Disglobal
**Scope:** the seven Phase 1 endpoints only

> **What this runbook can and cannot claim.** Every behaviour below was observed on
> a disposable environment built from this commit — real PostgreSQL, real server,
> real HTTP. Nothing here has been executed against `sandbox.api.vytalix.health`;
> that host has never been reached from the validation environment. Section 1
> therefore separates *proven behaviour* from *unconfirmed deployment state*. Do
> not treat the second group as done because the first group passed.

---

## 1. Pre-flight checklist

Run this the **day before**, not during the call. Items marked 🔴 have never been
confirmed on the actual sandbox host and are the ones that will end the session
early if they are wrong.

### 1.1 Deployment state — unconfirmed, verify first

| # | Item | How to confirm | Status |
|---|---|---|---|
| 1 | 🔴 Sandbox host reachable | `curl -s -o /dev/null -w '%{http_code}' https://sandbox.api.vytalix.health/liveness` → expect `200` | ☐ |
| 2 | 🔴 Deployed commit is `4dead40` or later | Confirm with whoever deployed. Earlier builds carry the three defects fixed in DG-03A/DG-03B and **all seven endpoints will not work** | ☐ |
| 3 | 🔴 `subjectRef` provisioned | `prisma/sandbox_integration_subject.sql` applied to the sandbox database. The script is proven idempotent, but **applying it there has not been observed** | ☐ |
| 4 | 🔴 API Key issued against the sandbox tenant | Minted via `POST /admin/tenants/{tenantId}/api-keys` with an `ORG_ADMIN` JWT — `/admin` is authenticated since RC-1, so this is not self-service | ☐ |
| 5 | 🔴 Webhook secret loaded | `DISGLOBAL_WEBHOOK_SECRET` set in the sandbox environment, same value handed to Disglobal | ☐ |

### 1.2 Credentials to hand over — out of band only

| # | Item | Value |
|---|---|---|
| 6 | Base URL | `https://sandbox.api.vytalix.health` |
| 7 | API Key | issued in step 4 — never in a ticket, email body, or repo |
| 8 | Webhook secret | issued in step 5 |
| 9 | `subjectRef` | `DISG-8c1e5a` |
| 10 | Scopes on the key | `vitality:read` `vitality:write` `preventive:write` `referral:read` `engagement:write` `insights:read` |
| 11 | Rate limit tier agreed | confirm expected volume before the call | ☐ |

### 1.3 Artefacts to send — already validated

| # | Item | Location |
|---|---|---|
| 12 | Kickoff package | `delivery/disglobal-kickoff/` |
| 13 | OpenAPI contract | `openapi/vytalix-platform-v2.yaml` (byte-identical copy in the package) |
| 14 | Postman collection | `postman/vytalix_postman_collection.json` — 15 requests, covers all seven endpoints |
| 15 | Webhook signing examples | `examples/send-payment-webhook.sh` and `.js` — both verified to produce the same digest |
| 16 | Guides | `FIRST_DAY_WITH_VYTALIX.md`, `QUICK_START.md`, `KNOWN_SANDBOX_BEHAVIOR.md` |

### 1.4 Your own dry run — do this before the call

Run the exact sequence in section 2 yourself against the sandbox. If you have not
personally seen a `200` from that host, you are rehearsing in front of the partner.

---

## 2. Execution order for the session

Ten steps, in this order. Each one isolates a single failure mode, so when
something breaks you already know what it was.

| # | Step | Command | Expected |
|---|---|---|---|
| 1 | Liveness | `GET /liveness` | `200` |
| 2 | **Negative control** | `GET /api/v2/insights/cohort` with **no** key | `401` |
| 3 | **First authenticated call** | `GET /api/v2/insights/cohort` with key | `200` + `{"cohortTooSmall":true,…}` |
| 4 | Scope boundary | `GET /api/v2/catalog` (scope not granted) | `403` |
| 5 | **Assessment** | `POST /api/v2/vitality/assess` — payload from `QUICK_START.md` §3 | `200`, `biologicalAge` ≈ 35.9, capture `assessmentId` |
| 6 | **State validation** | `GET /api/v2/vitality/DISG-8c1e5a` | `200`, **same `assessmentId`** as step 5 |
| 7 | Preventive score | `POST /api/v2/preventive/score` | `202` `Insufficient data` **or** `200` with a score — both correct |
| 8 | Referral + engagement | `GET /api/v2/referral/DISG-8c1e5a`, `POST /api/v2/engagement/events` | `200` (`eligible` either value), `202` |
| 9 | **Webhook** | `./examples/send-payment-webhook.sh` | `200` `{"received":true,"replayed":false}` |
| 10 | **Replay** | same request again, unchanged | `200` `{"received":true,"replayed":true}` |

**Correlation ID** — verify once, at step 3: every response carries
`X-Correlation-ID`. Send your own via the request header and confirm it is echoed.
Ask Disglobal to log it from day one; it is how any later incident gets traced.

**Persistence** — steps 5→6 are the persistence proof the partner can see: the
`assessmentId` returned by the write is the one the read returns. If you have
database access during the session, `SELECT count(*) FROM payment_transactions`
before and after steps 9–10 shows one row for two identical POSTs. Do not open a
database console on a shared screen unless it was agreed beforehand.

---

## 3. Failure matrix

Every response below was observed during validation. The "Meaning" column is what
it actually indicates, not what it looks like.

| Failure | Where it appears | Meaning |
|---|---|---|
| **401** | any `/api/v2/*` | Key missing, invalid, expired or revoked — deliberately indistinguishable |
| **401** | webhook only | Signature mismatch — different cause, same code |
| **403** | any `/api/v2/*` | Key is valid; the scope for that endpoint was not granted. Body names the missing scope |
| **404** `Subject '…' not found` | subject-scoped endpoints | The `subjectRef` does not exist in the tenant |
| **404** `No assessment found` | `GET /vitality/{ref}` | Subject exists, has no assessment yet |
| **422** | `POST` endpoints | Payload validation failed; `errors[]` names each field |
| **500** | webhook | Nothing was recorded |
| **500** | other endpoints | Server-side failure; body carries `correlationId` |
| **Timeout** | webhook | Unknown whether the commit landed |
| **`cohortTooSmall`** | `insights/cohort` | `200`. Privacy floor below 50 subjects — **not a failure** |
| **`eligible:false`** | `referral` | `200`. Engine ran, decision was negative — **not a failure** |
| **`202` Insufficient data** | `preventive/score` | Accepted, not enough components — **not a failure, do not retry** |

---

## 4. Action per failure

### 401 on `/api/v2/*`
**Verify:** header name is exactly `X-API-Key`; the key was pasted whole; you are
pointing at the sandbox host, not production.
**Capture:** `X-Correlation-ID`, timestamp, endpoint.
**Retry:** once, after checking the header. Never in a loop — repeated failures
trip the brute-force guard and return `429`.
**Stop the session if:** the key you issued yourself returns `401`. That means the
key was minted against a different tenant or environment; it cannot be fixed live.

### 401 on the webhook
**Verify:** canonical body order — `event, intentId, amount, currency, timestamp,
subjectRef, metadata`, compact JSON, `signature` excluded.
**Capture:** the exact canonical string Disglobal signed, and their digest.
**Action:** run `examples/send-payment-webhook.sh` from your side. If yours
returns `200` and theirs `401`, the difference is in their serialisation — that is
a client-side fix, and it is the most common one.
**Escalate if:** your own reference script also returns `401` → the deployed secret
does not match the one you handed over.

### 403
**Verify:** which scope the body names, against the six granted on the key.
**Action:** if the endpoint is in Phase 1 scope and the scope is missing, the key
was provisioned wrong. Note it, continue the session on the other endpoints, and
reissue afterwards. **Do not widen scopes live.**

### 404 — read the body first
`Subject '…' not found` → the seed was not applied to this environment
(pre-flight item 3). **Stop the subject-scoped steps**; steps 1–4 and 9–10 still
work and are worth completing.
`No assessment found` → expected before step 5. Run the assessment first.

### 422
**Verify:** `errors[]` field by field. Most likely `digitalReflexes` or
`staticBalance` sent as a number instead of a `{high,long,width}` object.
**Action:** correct the payload and retry immediately — this is a normal part of a
first integration, not an incident.

### 500 on the webhook
**Meaning:** the payment was **not** recorded.
**Action:** **retry the same request unchanged.** Deduplication is on `intentId`,
so a retry cannot double-charge or double-activate.
**Escalate if:** it persists across three retries → the sandbox database is
unhealthy. End the webhook section, continue with read-only endpoints.

### 500 elsewhere
**Capture:** `correlationId` from the body — that is the only thing that lets the
platform team find the request.
**Action:** do not debug live. Note it, move on, investigate after.

### Timeout on the webhook
**Meaning:** you do not know whether the commit landed.
**Action:** resend the same `intentId`. A `replayed:true` proves the first one
committed; a `replayed:false` proves it did not. Either answer is definitive.

### `subjectRef` missing
This is pre-flight item 3 failing in front of the partner. Say so plainly, pivot
to steps 1–4 and 9–10, and schedule the subject-scoped walkthrough. **Do not seed
data live on a shared screen.**

---

### Stop / escalate / retry — the short version

| Retry | Escalate after the session | Stop the session |
|---|---|---|
| 422 after fixing the payload · 500 on webhook (same request) · timeout (same `intentId`) | 403 with a Phase 1 scope · 500 on a read endpoint · any behaviour not in this matrix | Your own key returns `401` · sandbox unreachable · repeated `500` on writes · deployed build is older than `4dead40` |

---

## 5. Session script

### Opening (2 minutes)

> "Today is a rehearsal, not a certification. We will run the seven Phase 1
> endpoints live against sandbox, in a fixed order, and you will see exactly what
> your consumer will see. All data is synthetic — a fabricated subject that
> exists only to exercise the API. Nothing here has clinical meaning.
>
> Two responses will look like errors and are not: `cohortTooSmall` on the cohort
> endpoint and a `202` on the preventive score. We will hit both deliberately so
> you recognise them."

Hand over: base URL, API Key, webhook secret, `subjectRef`, scopes — out of band,
before the call, not pasted into the meeting chat.

### Evidence to show, in order

1. `401` without a key — establishes that auth is real.
2. `200` with the key — first success.
3. `403` on an ungranted scope — shows scoping is enforced, not decorative.
4. Assessment `200` → read-back returns the **same `assessmentId`** — this is the
   persistence proof and the most convincing single moment of the session.
5. Webhook `200`, then the same request → `replayed:true` — this is what makes
   their retry policy safe, and it is worth pausing on.
6. `X-Correlation-ID` echoed — the support handle.

### Do not promise

- Dates for anything outside Phase 1: dental, the outbound referral webhook, the
  published SDK. The npm package does not exist; REST against the OpenAPI file is
  the supported path.
- That the preventive score will return a number for their subjects — it needs
  clinical data the sandbox subject does not carry.
- Production credentials, throughput figures, or SLAs that have not been agreed.
- Any fix "by tomorrow" for something discovered during the call.

### Do not change live

- No scope changes, no key reissues, no data seeding, no configuration edits, and
  no deploys during the session. The baseline is frozen at `4dead40`; changing it
  mid-session destroys the reproducibility that makes this rehearsal worth
  anything. Write it down, fix it after, re-run the sequence.

### Closing (3 minutes)

State three things explicitly:

1. **What passed** — name the steps, by number.
2. **What did not** — including anything skipped, and why. Do not round up.
3. **What happens next** — who owns each open item and when it will be re-run.

> "Everything you saw came from commit `4dead40`. The package you have —
> OpenAPI, Postman, the two signing examples, and the three guides — matches
> exactly what we just ran. Start with `FIRST_DAY_WITH_VYTALIX.md`; if a
> response looks wrong, check `KNOWN_SANDBOX_BEHAVIOR.md` before filing it, and
> send us the `X-Correlation-ID` with anything you do file."

---

## 6. Exit criterion

## 🟡 READY WITH CONDITIONS

**What is proven.** All seven Phase 1 endpoints complete their flow through to
verified database persistence; authentication, scopes, HMAC and admin RBAC each
respond correctly including their negative controls; the webhook is idempotent
under replay; the three blocking CI gates are green; the schema-versus-code sweep
over the authorised surface is clean; and the shipped example payload has been
corrected and re-verified against a running server. All of it at commit `4dead40`.

**What is not proven, and why it is a condition rather than a risk.** Every one of
those results comes from a disposable environment built from this repository.
`sandbox.api.vytalix.health` has never been reached from the validation
environment, so five things remain genuinely unknown: whether the host is
reachable, which commit is deployed there, whether the integration subject was
seeded, whether an API Key exists for that tenant, and whether the webhook secret
is loaded. Pre-flight items 1–5 exist precisely to close them.

**Conditions to reach READY FOR FIRST LIVE INTEGRATION:**

1. Pre-flight items 1–5 confirmed against the real sandbox host.
2. One full dry run of section 2 executed by Vytalix on that host, end to end.
3. Credentials and `subjectRef` delivered out of band and acknowledged.

Those three are the whole gap. None requires a code change, and all can be closed
in well under a day — but they must be closed **before** the session, not during
it. Running the rehearsal without them turns a demonstration into a debugging
session in front of the partner.
