# Phase 1 — Scope and Limitations

This document defines the boundary of the first integration between Vytalix and
Disglobal. Read it before estimating: it states what exists today, and what is
deliberately outside this phase.

Phase 1 is a controlled scope, not a partial product. Capabilities listed as out of
scope are platform features reserved for later phases, not defects.

---

## Available now

Five endpoints, verified against a running service.

| Capability | Endpoint | What it does |
|---|---|---|
| Lead capture | `POST /api/funnel/leads` | Registers a lead and returns an id for correlating the rest of the journey |
| Facial analysis integration point | `POST /api/funnel/facial-analysis` | Accepts a base64 image and returns a structured result including the `provider` field |
| Preventive questionnaire ingestion | `POST /api/funnel/vitality-assessment` | Stores a questionnaire result computed by Disglobal and returns an id |
| Consultation request | `POST /api/funnel/booking` | Records a consultation request and returns a confirmation code plus a WhatsApp hand-off link |
| Payment confirmation | `POST /api/v2/webhooks/payment` | Verifies an HMAC signature, persists the payment and activates the service |

Guarantees that apply to the payment webhook: the response is `200` only after the
database commit; deduplication is keyed on `intentId`, so an identical resend
cannot activate twice.

Field-level detail for all five is in `FUNNEL_API_REFERENCE.md`.

---

## Not included in this phase

### Production biometric facial recognition

**Phase 1:** the endpoint is live and returns a structurally complete response. The
active provider is a sandbox provider whose values are derived from the submitted
image bytes rather than from facial analysis. Every response carries
`provider: "mock"`.

**Later:** a production biometric provider. The response shape does not change when
it is enabled — only the `provider` value and the accuracy of the numbers.

**Consequence for Disglobal:** integrate the endpoint now; read `provider` before
presenting any value to an end user.

### Full clinical engine

**Phase 1:** Vytalix receives, validates and stores the results Disglobal computes.

**Later:** clinical computation exposed as a partner-facing capability.

### Automatic scoring of the preventive questionnaire

**Phase 1:** Disglobal calculates `score`, `category`, `yearsBiological` and the
five dimension values. The endpoint persists them without recalculating and returns
only an identifier. Raw answers travel in `answersPayload` for the record; they are
not an input to any calculation.

**Later:** server-side scoring from raw answers.

**Consequence for Disglobal:** the scoring algorithm is Disglobal's responsibility
in this phase. This is the single largest item to account for in an estimate.

### Automatic scheduling

**Phase 1:** the consultation endpoint records the request and returns a
confirmation code with a WhatsApp link. There is no calendar, no slot reservation
and no availability check. `preferredDate` and `preferredTime` are captured as
preferences.

**Later:** calendar management and real-time reservation.

**Consequence for Disglobal:** surface the confirmation code and the WhatsApp link,
or the user journey ends without a follow-up path.

### Automatic assignment of physician or centre

Not available in any form in this phase. Assignment happens through the WhatsApp
hand-off.

### Commercial catalogue

Product and pricing catalogue endpoints are not part of this integration.

### Complete notification delivery

**Phase 1:** the notification pipeline runs after payment, but the sandbox is
configured with a logging provider. No email or SMS is delivered.

**Later:** production delivery channels.

**Consequence for Disglobal:** message content, channel and deliverability cannot
be validated in sandbox.

### Corporate and vertical modules

Dental, occupational health and other vertical modules are outside this
integration.

---

## Current security posture

Stated plainly so no assumption is carried into the design.

| Surface | Phase 1 | Later |
|---|---|---|
| The four funnel endpoints | **No partner authentication** | A formal authentication mechanism before production |
| Payment webhook | HMAC-SHA256 over the canonical body | Unchanged |
| Rate limiting and quotas | Recorded on the credential, **not enforced** | Enforcement before production volume |
| Transport | Public HTTPS. No VPN, tunnel or IP allow-list | Unchanged |

**Consequence for Disglobal:** keep the base URL and any future authentication
header in configuration rather than hard-coded, so adding a credential later is a
configuration change.

---

## Decisions still open

Each has a technical consequence and needs an answer from both sides.

| Decision | Current technical state |
|---|---|
| Online versus in-person consultation | No field in the booking schema expresses the modality. `consultationType` selects the subject of the consultation |
| Callback to Disglobal after activation | Not implemented. Activation produces no outbound notification |
| Refund behaviour | A refund event is acknowledged but does not revoke service access |
| Vocabulary for `metadata.product` | Free-form; values are stored as sent |
| Authentication mechanism and date for the funnel endpoints | Open |
| Whether production biometric analysis is part of the launch | Open |

---

## Summary for planning

**Can be built today, with no dependency on Vytalix:** the questionnaire and its
scoring, the facial capture interface, the result presentation, the service
selection interface, subject reference handling and error handling.

**Requires credentials from Vytalix:** payment webhook signing.

**Requires a joint decision:** the six items above.
