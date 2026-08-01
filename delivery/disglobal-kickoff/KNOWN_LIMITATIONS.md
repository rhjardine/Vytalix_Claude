# Vytalix × Disglobal — Known Limitations (Phase 1)

These are consumer-visible limitations that are known, accepted and **do not block
the integration**. Each entry says what to do instead. Nothing here requires a
change on your side beyond awareness.

---

### 1. Referral is synchronous only

The outbound (webhook) referral notification is not active in Phase 1.

**Instead:** poll `GET /api/v2/referral/{subjectRef}` when you need a referral
decision. It returns `{"eligible": false}` or the CTA payload.

### 2. Cohort insights are withheld below 50 subjects

A privacy threshold, not a defect.

**Instead:** expect `{"cohortTooSmall": true, "minimumRequired": 50}` on small
datasets and design the dashboard to handle that state.

### 3. No published npm SDK

The TypeScript client exists as reference source only; it is not distributed as a
package, and older docs referencing `@vytalix/disglobal-sdk` are ahead of reality.

**Instead:** generate a client from `openapi/vytalix-platform-v2.yaml`, or call
REST directly. This is the supported Phase 1 path.

### 4. Error responses are documented in full for two endpoints

`POST /api/v2/vitality/assess` and the payment webhook enumerate their error codes
in the OpenAPI file. The other Phase 1 endpoints document the success path only.

**Instead:** the error contract is uniform across `/api/v2` — see the table in
`QUICK_START.md` §6. All errors use the same RFC 7807 `ProblemDetail` shape.

### 5. Two names exist for the API key environment variable

`VYTALIX_API_KEY` and `VYX_API_KEY` both appear in documentation and examples.

**Instead:** use `VYTALIX_API_KEY`. Only the `X-API-Key` header name is contractual.

### 6. Facial analysis runs on a mock provider in sandbox

The sandbox is configured with the mock vision provider, so facial results are
deterministic placeholders rather than real inference.

**Instead:** use it to validate wiring and response shape; real provider behaviour
is confirmed in staging before go-live.

### 7. API keys are not self-service

Provisioning and rotation happen through an authenticated internal endpoint.

**Instead:** request keys from us. Turnaround is minutes, not a release cycle.

### 8. Out of Phase 1 scope

Public funnel (`/api/funnel/*`), dental endpoints (`/api/v2/dental/*`), exchange
rate, and the administrative surface (`/admin/*`) are not available to partner
keys. Dental remains a pending commercial decision rather than a technical
limitation.
