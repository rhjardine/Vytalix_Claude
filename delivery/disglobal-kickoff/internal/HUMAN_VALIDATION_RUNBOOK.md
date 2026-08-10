# Human Validation Runbook

**For Vytalix, before any demo or partner session.** A person runs this, not CI.
CI proves the code is consistent; this proves *the environment you are about to
show* actually works. They are different claims.

Budget 15 minutes. Run it the day before, then again 30 minutes before.

---

## A. Preflight

Stop at the first failure. A failed preflight is a reason to reschedule, not to
improvise.

```bash
export BASE=https://sandbox.api.vytalix.health
export KEY=<api key for this environment>
export SUBJ=DISG-8c1e5a
```

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Host is up | `curl -s -o /dev/null -w '%{http_code}\n' $BASE/liveness` | `200` |
| 2 | **Deployed commit** | Ask whoever deployed. Must be **≥ `4dead40`** | Confirmed in writing |
| 3 | Readiness (DB + Redis) | `curl -s $BASE/readiness` | no failing dependency |
| 4 | API Key resolves | `curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/v2/insights/cohort -H "X-API-Key: $KEY"` | `200` |
| 5 | Subject exists | `curl -s $BASE/api/v2/vitality/$SUBJ -H "X-API-Key: $KEY"` | `200`, **or** `404 No assessment found` (both fine — the subject resolves). A `404 Subject '…' not found` **fails** |

**Why #2 matters most:** builds before `4dead40` carry three defects fixed in
DG-03A/DG-03B. On those, `vitality/assess`, `preventive/score` and `referral` all
return `500`. Everything else in this runbook will pass and the demo will still
collapse.

---

## B. Smoke test

Run in order. Each step isolates one failure mode.

| # | Step | Command | Expect |
|---|---|---|---|
| 1 | **No key** | `curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/v2/insights/cohort` | **`401`** |
| 2 | **Invalid key** | same with `-H "X-API-Key: vyx_dis_invalid"` | **`401`** |
| 3 | **Valid key** | same with `-H "X-API-Key: $KEY"` | **`200`** + `cohortTooSmall` |
| 4 | **Assessment** | `POST /api/v2/vitality/assess` with the payload from `QUICK_START.md` §3 | **`200`**, `biologicalAge` ≈ **35.9**, capture `assessmentId` |
| 5 | **Read back** | `GET /api/v2/vitality/$SUBJ` | **`200`** with the **same `assessmentId`** |
| 6 | **Webhook** | `BASE_URL=$BASE DISGLOBAL_WEBHOOK_SECRET=<secret> ./examples/send-payment-webhook.sh` | **`200`** `replayed:false` |
| 7 | **Replay** | rerun step 6 unchanged | **`200`** `replayed:true` |
| 8 | **Bad signature** | alter one character of `signature` | **`401`** |

### The two assertions that actually matter

- **Step 4 → 5: the `assessmentId` must be identical.** That equality is the
  persistence proof. If it differs, the write and the read are not seeing the same
  record and nothing else in the demo is trustworthy.
- **Step 6 → 7: `replayed` must flip from `false` to `true`.** That is the
  idempotency guarantee the partner will build their retry policy on.

### Sanity check on step 4

`biologicalAge` should land near **35.9** for the reference payload. If it comes
back in the hundreds, the payload was altered — `digitalReflexes` and
`staticBalance` are reduced to the product of their three dimensions, so values an
order of magnitude too large still return `200` with a meaningless number.

---

## C. Evidence to capture

One row per step. Paste into the session notes **before** the call, so you are
comparing against a known-good baseline rather than remembering.

| Field | How |
|---|---|
| Timestamp (UTC) | `date -u '+%Y-%m-%dT%H:%M:%SZ'` |
| Step + command | copy verbatim |
| HTTP status | `-w '%{http_code}'` |
| `X-Correlation-ID` | add `-D-` and read the header |
| Response body | first ~200 chars is enough |
| Screenshot | optional; useful only for `/docs` or a Postman run |

Capture the correlation ID with `-D-`:

```bash
curl -s -D- -o /dev/null $BASE/api/v2/insights/cohort -H "X-API-Key: $KEY" \
  | grep -i x-correlation-id
```

**Retention:** keep the run alongside the session notes. Never paste the API Key or
the webhook secret into them — reference them as `<key>` / `<secret>`.

---

## D. Verdict

| Result | Meaning | Action |
|---|---|---|
| Preflight 1–5 and smoke 1–8 pass | Environment is demo-ready | Proceed |
| Any preflight fails | Environment is not ready | **Reschedule.** Do not fix live |
| Smoke 4 or 5 fails | Assessment or persistence broken — likely an old build | **Reschedule**; verify preflight #2 |
| Smoke 6–8 fails, 1–5 pass | Webhook only | Proceed, demo steps 1–5, defer the payment section |
| `biologicalAge` far from 35.9 | Payload was altered | Restore the reference payload and rerun |

---

## E. What not to do

- Do not fix anything live during a session. Note it, finish what works, re-run
  this runbook afterwards.
- Do not seed data, reissue keys, widen scopes or redeploy mid-session — it
  destroys the reproducibility that makes the demo meaningful.
- Do not treat green CI as a substitute for this runbook. CI runs against the
  repository; this runs against the environment you are about to show.
