# Known Sandbox Behavior

Several responses look like failures and are not. Each entry below was produced
by the sandbox during integration validation. Read this before opening a bug.

---

## `cohortTooSmall` on `GET /api/v2/insights/cohort`

```json
HTTP 200
{"cohortTooSmall": true, "minimumRequired": 50, "note": "Privacy threshold not met"}
```

**Expected when** the tenant holds fewer than 50 subjects — which is always true
of a sandbox seeded with one integration subject.

**Not a failure.** It is a privacy floor, not a data error: population metrics are
withheld below 50 people so no individual can be inferred from an aggregate. The
status is `200` precisely because the API answered correctly.

**What to do:** handle it as a first-class UI state ("not enough data yet"), not as
an error branch. The same code path will start returning metrics in production
once the cohort is large enough.

---

## `{"eligible": false}` on `GET /api/v2/referral/{subjectRef}`

```json
HTTP 200
{"eligible": false}
```

**Expected when** the subject does not currently meet any referral trigger — for
example a biological age close to or below chronological age.

**Not a technical failure.** The referral engine ran and reached a negative
decision. When a trigger *does* fire the same endpoint returns the CTA payload:

```json
{"eligible": true, "referralType": "PREMIUM_CONSULT", "urgency": "URGENT",
 "triggerReason": "differential_age_critical", …}
```

**What to do:** branch on `eligible`, never on the HTTP status. Both shapes are
`200`.

---

## `Insufficient data for score` on `POST /api/v2/preventive/score`

```json
HTTP 202
{"message": "Insufficient data for score", "patientId": "…"}
```

**Expected when** fewer than two of the four score components can be computed. The
components and what each needs:

| Component | Weight | Requires |
|---|---|---|
| Cardiovascular | 0.30 | a stored cardiovascular risk score |
| Metabolic | 0.25 | fasting glucose **or** total cholesterol |
| Biological age | 0.25 | a biophysics assessment **and** the subject's age on the snapshot |
| Lifestyle | 0.20 | any clinical snapshot for the subject |

Below a combined weight of 0.40 the service declines to produce a number rather
than publish a misleading one.

**`202` is not an error and must not be retried** — retrying with the same data
returns `202` again. It means "accepted, nothing to compute yet".

Once enough data exists the same call returns:

```json
HTTP 200
{"scoreId": "06069f68-…", "compositeScore": 99, "scoreTier": "OPTIMAL",
 "components": {"metabolic": …, "biologicalAge": …, "lifestyle": …},
 "insufficientData": ["cardiovascular_risk_score"]}
```

Note that `insufficientData` is present on a **successful** response too: it lists
the components that were skipped while the others still produced a score. It is
information, not a warning.

---

## `404` — two different meanings

| Body | Meaning |
|---|---|
| `Subject 'DISG-…' not found` | The `subjectRef` is unknown in this tenant. Ask us to seed it |
| `No assessment found` | The subject exists but has no assessment yet. Run `POST /vitality/assess` first |

---

## Biological age far from chronological age

If `differentialAge` comes back at tens of years, check your measurement units
before reporting a defect. `digitalReflexes` and `staticBalance` are each reduced
to the **product** of their three dimensions:

- `digitalReflexes` → `high × long × width`, expected order of magnitude **1–5**
- `staticBalance` → `high × long × width`, expected order of magnitude **10–40**

Sending values ten times too large still returns `200`, but the reported
biological age will be meaningless. The reference payload in `FUNNEL_API_REFERENCE.md` §3
is calibrated and safe to start from.

---

## Synthetic data disclaimer

Everything in the sandbox is **synthetic**:

- The integration subject (`DISG-8c1e5a`) is a fabricated record created solely to
  exercise the API. It does not correspond to any real person.
- Every measurement, biomarker and payment amount in the examples is invented for
  technical validation.
- Results carry **no clinical meaning** and must never be shown to a patient,
  stored as a health record, or used to support a medical decision.
- Facial analysis runs on a mock provider in the sandbox, so those results are
  deterministic placeholders rather than real inference.

The sandbox exists to prove that the wiring works — request shapes, authentication,
idempotency, error handling. Clinical validity is established separately, on real
data, in a governed environment.
