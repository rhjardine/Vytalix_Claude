# Vytalix — Disglobal Integration Package · Phase 1

This package covers the first integration between Vytalix and Disglobal. It
describes the endpoints available for that integration, their behaviour and their
current limitations.

It does not describe the Vytalix platform as a whole. Capabilities outside this
phase are listed under *Future platform roadmap* and are not part of the current
contract.

**Start here:** [`PHASE1_SCOPE_AND_LIMITATIONS.md`](PHASE1_SCOPE_AND_LIMITATIONS.md)
— what exists, what does not, and why.
**Then:** [`FIRST_DAY_WITH_VYTALIX.md`](FIRST_DAY_WITH_VYTALIX.md) — a working
integration in under an hour.

---

# Phase 1 integration scope

The user journey covered by this integration: facial scan → preventive
questionnaire → initial result → consultation request → payment → service
activation.

| Endpoint | Method | Authentication |
|---|---|---|
| `/api/funnel/leads` | POST | none |
| `/api/funnel/facial-analysis` | POST | none |
| `/api/funnel/vitality-assessment` | POST | none |
| `/api/funnel/booking` | POST | none |
| `/api/v2/webhooks/payment` | POST | HMAC-SHA256 |

Public HTTPS. No VPN, tunnel or IP allow-list required.

**Responsibility split.** Disglobal owns the user, the interface, the questionnaire
and its scoring, and the payment. Vytalix owns persistence, payment verification,
service activation and notifications.

## Documentation

| Document | Answers |
|---|---|
| [`PHASE1_SCOPE_AND_LIMITATIONS.md`](PHASE1_SCOPE_AND_LIMITATIONS.md) | What is in scope, what is not, and the open decisions |
| [`FIRST_DAY_WITH_VYTALIX.md`](FIRST_DAY_WITH_VYTALIX.md) | How do I get something working today? |
| [`FUNNEL_API_REFERENCE.md`](FUNNEL_API_REFERENCE.md) | Field-by-field detail with captured responses |
| [`PAYMENT_AND_NOTIFICATION_FLOW.md`](PAYMENT_AND_NOTIFICATION_FLOW.md) | How payment and activation work |
| [`FACIAL_ANALYSIS_STATUS.md`](FACIAL_ANALYSIS_STATUS.md) | Exact state of the facial component |
| [`PARTNER_SECURITY_HANDOFF.md`](PARTNER_SECURITY_HANDOFF.md) | How credentials are delivered and rotated |
| [`IMPLEMENTATION_ESTIMATION_GUIDE.md`](IMPLEMENTATION_ESTIMATION_GUIDE.md) | Which work belongs to whom, and what it depends on |
| [`INTEGRATION_CHECKLIST.md`](INTEGRATION_CHECKLIST.md) | Shared verification list for both companies |

A second set of documents covering error-handling detail, the full call sequence and
production readiness follows once the sandbox endpoint is confirmed reachable.

## Machine-readable artefacts

| Path | Contents |
|---|---|
| `openapi/vytalix-platform-v2.yaml` | API contract for code generation or Postman import |
| `postman/vytalix_postman_collection.json` | Runnable collection |
| `examples/send-payment-webhook.sh` · `.js` | HMAC signing references |

The OpenAPI file documents the full platform surface. Only the five endpoints
listed above are in scope for this phase.

## Environments

| Environment | Base URL |
|---|---|
| Sandbox | `https://sandbox.api.vytalix.health` |
| Production | Issued after sandbox sign-off |

Sandbox data is synthetic and carries no clinical meaning. A digital assessment is
not a medical diagnosis; determining biological age requires in-person clinical
evaluation.

## Support

Include the `X-Correlation-ID` response header and the HTTP status in any support
request. Credentials must never be sent through a support channel.

---

# Future platform roadmap

The following are Vytalix platform capabilities **outside the Phase 1 contract**.
They are listed for context only. None is available under this integration, and no
delivery date is implied.

| Capability | Current state |
|---|---|
| Production biometric facial recognition | Integration written; sandbox provider active |
| Server-side scoring of the preventive questionnaire | Not available; Disglobal computes the score in Phase 1 |
| Clinical engine exposed to partners | Endpoints exist for platform use; not part of this contract |
| Automatic scheduling and calendar management | Not built |
| Automatic assignment of physician or centre | Not built |
| Commercial catalogue | Not part of this integration |
| Production notification delivery | Pipeline runs; sandbox uses a logging provider |
| Outbound callback to Disglobal after activation | Not built |
| Rate limiting and quota enforcement | Recorded, not enforced |
| Dental and other vertical modules | Outside this integration |

Anything in this table that becomes commercially relevant is scoped as a separate
phase with its own contract.
