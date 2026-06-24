# Phase 1 Governance Package — Disglobal Integration

**Mode:** Architecture Governance — Read-Only / Documentation Only
**Role:** Principal Software Architect & Integration Orchestrator
**Date:** 2026-06-24 · **Status:** Pre-NDA · Pre-Integration · Contract-First
**Grounding:** `docs/INTEGRATION_CONTRACT_v1.1.md`, `openapi/vytalix-platform-v2.yaml`, `docs/DISGLOBAL_COMMERCIAL_PACKAGE.md`, `docs/DISGLOBAL_PILOT_READINESS.md`, `src/platform/metering.service.ts`, partner-supplied therapy list.

> **Clinical governance disclaimer applied throughout:** All therapy "purpose" statements below reflect **commercial/marketed positioning only**. Clinical efficacy, indications, and safety are **NOT validated in this document** and require explicit sign-off by Doctor Antivejez as the clinical authority before any partner-facing publication. Digital assessment ≠ medical diagnosis. Biological age determination requires in-person clinical evaluation.

---

## Executive Summary

Phase 1 covers a six-step user journey (facial scan → questionnaire → preventive risk score → online consult → in-person consult/handoff → integrated payment + activation) wrapping a catalog of 10 EXO-branded regenerative therapies delivered through three application modes (IVP / IMS / IQP).

The platform implementation is pilot-ready at the assessment/engagement layer (per `DISGLOBAL_PILOT_READINESS.md`). The governance gap is concentrated in **three areas that block partner technical review**: (1) the therapy catalog has no canonical codes or frozen schema; (2) all pricing and the three-party commission split are unresolved and internally contradictory (metering uses 30/70 platform/tenant; commercial narrative proposes 10/20/70 three-party); (3) the partner-facing OpenAPI contract (`vytalix_insurtech_v1.yaml`) is a stub with no payload, webhook-security, or handoff schemas.

None of the blockers require code. All are documentation/schema and stakeholder-decision items. The single highest-priority decision in the next 72–96h is the **commission split reconciliation** — it gates both the pricing matrix and the billing contract.

---

## Service Catalog Freeze

### Phase 1 Application Modes (delivery vectors)

| Mode code | Clinical descriptor | Marketed name | Notes |
|---|---|---|---|
| `IVP` | Intravenous precision infusion | Intravenous Infusion Precisión | Highest-acuity delivery; consult + handoff likely mandatory |
| `IMS` | Intramuscular injection | Intramuscular Shot | Mid-acuity |
| `IQP` | Intradermal chemotactic papule | Intradermical Quimiotáctic Papul | Lowest-acuity / aesthetic-adjacent |

> Mode↔therapy mapping is **TBD** — clinical authority must define which therapies are delivered via which mode(s). Coding scheme proposes `EXO-{THERAPY}-{MODE}` as the canonical SKU pattern (e.g. `EXO-NEU-IVP`).

### Catalog Freeze — 10 Phase 1 Therapies

| # | Canonical code | Clinical name (provisional) | Commercial name | Short purpose (marketed) | Category | Assess | Consult | Handoff | Payment | Inclusion rationale |
|---|---|---|---|---|---|:--:|:--:|:--:|:--:|---|
| 1 | `EXO-NEU` | Neuroregenerative exosome therapy | EXOneuro | Nervous-system regeneration support | Neuro | ✓ | ✓ | ✓ | ✓ | High-value anchor; aligns with longevity positioning |
| 2 | `EXO-KLO` | Klotho-pathway longevity therapy | EXOliving KLOTHO | Anti-aging / longevity support | Longevity | ✓ | ✓ | ✓ | ✓ | Flagship brand-defining product |
| 3 | `EXO-NAD` | NAD+ energy-potentiation therapy | EXOenergy NAD+ | Cellular energy support | Metabolic | ✓ | ✓ | ✓ | ✓ | Strong mass-market curiosity (energy) |
| 4 | `EXO-IMM` | Immune-support exosome therapy | EXOinmune | Immune-system fortification | Immune | ✓ | ✓ | ✓ | ✓ | Broad addressable demand |
| 5 | `EXO-MOD` | Inflammation-modulation therapy | EXOmodule | Inflammation modulation | Anti-inflammatory | ✓ | ✓ | ✓ | ✓ | Pairs with most risk-score signals |
| 6 | `EXO-SKE` | Musculoskeletal-support therapy | EXOskeleto | Bone / cartilage / ligament support | Musculoskeletal | ✓ | ✓ | ✓ | ✓ | Clear older-cohort indication path |
| 7 | `EXO-VAS` | Cardiovascular-support therapy | EXOvascular | Cardiac / arterial / venous support | Cardiovascular | ✓ | ✓ | ✓ | ✓ | Maps directly to preventive risk score |
| 8 | `EXO-KET` | Weight-management therapy | EXOketo | Weight-reduction support | Metabolic | ✓ | ✓ | ✓ | ✓ | High consumer pull; needs strong non-diagnostic framing |
| 9 | `EXO-QUE` | Systemic detoxification (chelation) therapy | EXOquelacion | Systemic detoxification | Detox | ✓ | ✓ | ✓ | ✓ | Established category; chelation requires elevated clinical gating |
| 10 | `EXO-EST` | Aesthetic refresh therapy | EXOstetic | Facial / body aesthetic refresh | Aesthetic | ✓ | △ | △ | ✓ | Lowest clinical acuity; likely IQP; consult/handoff may be optional |

Legend: ✓ required · △ conditional/TBD per clinical authority.

**Catalog-wide observation:** All 10 require **assessment + payment**. Consult/handoff is uniformly required except `EXO-EST` (aesthetic) where it is conditional. The `assess` step for all items is the *non-diagnostic* funnel assessment, not a clinical determination.

### Exclusions (Phase 1 scope discipline)

| Excluded item | Exclusion rationale |
|---|---|
| B2B corporate longevity packages | Explicitly deferred to Phase 2 in Integration Contract v1.1 §12 |
| Automated digital prescription | Forbidden by clinical invariant (no diagnosis through digital channels) |
| Longitudinal automated follow-up programs | Out of scope per v1.1 §12; requires durable clinical-record infra not yet contracted |
| Multi-therapy bundles / protocols | Pricing and clinical sequencing undefined; freeze as single-SKU only for Phase 1 |
| White-label BioAge API | Phase 4 per Commercial Package §Opción C |

---

## Pricing & Commission Matrix

> **All monetary values are TBD.** No price list exists in the repository for EXO therapies. The matrix below is the **decision template** to be filled at the next commercial meeting. Currency is TBD (repo precedent uses **MXN** for dental commerce and **USD** for API metering — a single settlement currency must be chosen).

| Code | Public price | Currency | Disglobal commission | Clinical partner share | Vytalix platform share | Bank/payment cost | Decision needed |
|---|---|---|---|---|---|---|---|
| `EXO-NEU` | TBD | TBD | TBD | TBD | TBD | TBD | All — see split decision below |
| `EXO-KLO` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-NAD` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-IMM` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-MOD` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-SKE` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-VAS` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-KET` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-QUE` | TBD | TBD | TBD | TBD | TBD | TBD | All |
| `EXO-EST` | TBD | TBD | TBD | TBD | TBD | TBD | All |

### Commission/split — CRITICAL UNRESOLVED CONFLICT

Three different models coexist in the repository and must be reconciled into one before any price is set:

| Source | Model | Implication |
|---|---|---|
| `INTEGRATION_CONTRACT_v1.1` §8 | `clinic 70 / disglobal 20 / vytalix 10` | Three-party therapy-sale split |
| `metering.service.ts` / `PILOT_READINESS` | `revenueShareRatio = 0.30` (Vytalix) / 0.70 (tenant) | Two-party **API-usage** revenue share |
| `DISGLOBAL_COMMERCIAL_PACKAGE` §Opción A | Referral conversion: `Vytalix 30% / Disglobal 70%` | Two-party **referral** share |

**Decision required:** These describe *different transaction types* (therapy sale vs. API usage vs. referral conversion) but use overlapping percentage language. Stakeholders must confirm whether:
1. The 70/20/10 split applies to **therapy gross sale value**, and
2. The 30/70 API/referral shares are **separate, additive** revenue streams, or supersede it.

Until resolved, **no public price or commission cell can be filled** — every row depends on this single decision.

Secondary decisions needed: settlement currency; whether bank/payment cost is deducted pre-split (off the top) or absorbed by one party; tax treatment (out of scope here — no legal/tax advice provided).

---

## API Governance Matrix

Ownership and source-of-truth per the Integration Contract domain authorities (v1.1 §4) and implemented surfaces.

| Domain object | Owner (authority) | Producer | Consumer(s) | Required fields | Optional fields | Security boundary | Sync/Async |
|---|---|---|---|---|---|---|---|
| **Patient identity** | Disglobal | Disglobal | Vytalix (pseudonymized only) | `userId` (Disglobal-internal) | — | userId NEVER crosses to Vytalix; only `subjectRef` (HMAC-SHA256 w/ tenantSecret) | Sync |
| **Patient demographics** | Disglobal | Disglobal | Vytalix | `chronologicalAge`, `biologicalSex` | `isAthlete`, locale | Pseudonymized link; `ageInputMethod` flag TBD | Sync |
| **Assessments (session)** | Vytalix | Vytalix | Disglobal, Clinic | `assessmentId`, `subjectRef`, `consentCapture` | `correlationId` | Tenant-scoped (RLS); non-clinical record | Sync |
| **Scan results (facial)** | Vytalix | Vytalix (VISION_PROVIDER) | Vytalix scoring only | `estimatedAge`, `confidence` | `analysisPoints` | **Image never stored**; numeric result only | Sync (mock) / Async (AWS, TBD) |
| **Questionnaire results** | Vytalix | Disglobal/end-user | Vytalix scoring | `leadId`, answer set (Fast-5 / Full-45) | free-text notes | Tenant-scoped; non-diagnostic | Sync |
| **Risk score (preventive)** | Vytalix | Vytalix | Disglobal, Clinic | `compositeScore`, `scoreTier` | `components`, `insufficientData` | Result-only; algorithm is IP black box | Sync |
| **Appointments** | Clinic (Dr Antivejez) | Clinic | Disglobal, Vytalix | `bookingId`, `status`, `slot` | `scheduledFor`, `notes` | Clinic is source of truth; Vytalix orchestrates | Async (clinic confirms) |
| **Payment intent** | Disglobal | Disglobal | Vytalix | `intentId`, `amount`, `currency`, `splitRuleId` (TBD) | `metadata` | Disglobal = financial truth | Sync |
| **Payment confirmation** | Disglobal | Disglobal | Vytalix | `event`, `intentId`, `amount`, `currency`, `timestamp`, `subjectRef`, `signature` | `metadata`, `eventVersion` (TBD) | HMAC-SHA256 `X-Disglobal-Signature`; idempotent on `intentId` (24h) | Async (webhook) |
| **Clinical handoff** | Clinic (Dr Antivejez) | Vytalix → Clinic | Clinic | `recordId`, `subjectRef`, `handoffStatus` | `summary`, `riskSignals` | `clinicAccess` scope (TBD); separate from Disglobal API key | Async |
| **Service activation** | Vytalix | Vytalix (post-payment) | Disglobal, Clinic | `subjectRef`, `tenantId`, `product`, `activatedAt` | `correlationId` | Currently Redis flag only; no durable event schema | Async |

---

## OpenAPI Readiness Gaps

Scope-limited to: payloads, webhooks, idempotency, demographics, split billing, clinical handoff, webhook security, event ownership.

| ID | Area | Finding | Priority |
|---|---|---|---|
| G-01 | Webhook security | `X-Disglobal-Signature` header + canonical body field-ordering (`event,intentId,amount,currency,timestamp,subjectRef,metadata`) exist only in code/comments; absent from any OpenAPI contract. A partner cannot implement delivery without it. | **P0** |
| G-02 | Split billing | `POST /payments/intent` is a schema-less stub; no `SplitRule` schema; commission model internally contradictory (see Pricing). | **P0** |
| G-03 | Payloads | Partner-facing `vytalix_insurtech_v1.yaml` has 8 paths with **zero** request/response schemas. Not contract-grade. | **P0** |
| G-04 | Demographics | No `ConsentCapture` schema (purpose/version/timestamp); v1.1 has only `consentAccepted: boolean` — legally insufficient placeholder. No `ageInputMethod` flag. | **P0** |
| G-05 | Clinical handoff | `GET /clinical-records/{id}` referenced in v1.1 but absent from all OpenAPI; no `handoffStatus`/`clinicalHandoffRequired` field on assessment result. | **P0** |
| G-06 | Event ownership | 5 of 9 contract events have no schema anywhere; name mismatches (`RiskScoreGenerated` ≠ `RiskScoreComputed`, `ClinicalReviewRequested` ≠ `DecisionGenerated`). | **P1** |
| G-07 | Idempotency | Replay semantics (`200 {replayed:true}`) defined in code but not documented in contract; partner doesn't know expected behavior on retry. | **P1** |
| G-08 | Webhook versioning | No `eventVersion` field; unknown event types silently discarded with no documented open/closed policy. | **P1** |
| G-09 | Payloads (surface) | Dual API surface (`/v1/assessments...` narrative vs `/api/v2/...` implemented) with no migration map; three different production domains (`.health`/`.io`/`.com`). | **P1** |
| G-10 | Service activation | No `ServiceActivatedEvent` schema or delivery mechanism to Disglobal; activation is Redis-flag only. | **P2** |

---

## Risk Register

Phase 1 execution within 72–96 hours.

| Risk | Impact | Mitigation | Priority |
|---|---|---|---|
| Commission split unresolved blocks all pricing | Cannot fill pricing matrix; no enforceable financial contract for partner meeting | Force a single stakeholder decision (therapy-sale split vs. API/referral shares); document as ADR-draft | **P0** |
| Therapy catalog has no frozen codes | OpenAPI refinement cannot reference SKUs; partner integration stalls | Ratify the `EXO-{THERAPY}-{MODE}` coding scheme in this freeze; obtain clinical authority sign-off on mode mapping | **P0** |
| Webhook signature spec only in code | Partner cannot build correct delivery; integration session unproductive | Publish canonical-body + signature spec as a doc addendum (no code) | **P0** |
| Marketed therapy claims unvalidated | Regulatory/clinical exposure if published as efficacy claims | Label all purposes as marketed positioning; gate publication on Doctor Antivejez sign-off | **P0** |
| Consent model is a boolean placeholder | Privacy/regulatory exposure at first live data flow | Specify `ConsentCapture` schema in contract (documentation only this sprint) | **P1** |
| Dual API surface + 3 domains | Partner confusion; contract ambiguity = deal risk | Publish Surface-A→B migration table + canonical domain decision | **P1** |

---

## Next Actions

Strict order. Each is documentation-only and feasible within the window.

1. **Draft the Commission Split Decision Record (ADR-draft, markdown).** Lay out the three conflicting models side-by-side, state the precise decision required (transaction-type scoping), and present it for stakeholder ratification. This unblocks the entire pricing matrix. *(CATEGORY A)*
2. **Ratify the Service Catalog Freeze codes** in this document and circulate the `EXO-{THERAPY}-{MODE}` mode-mapping table to Doctor Antivejez for clinical sign-off (fills the mapping TBDs). *(CATEGORY A)*
3. **Draft the Webhook Security & Canonical-Body Specification addendum** to Integration Contract v1.1 (signature header, field ordering, idempotency/replay semantics, event versioning) — closing G-01, G-07, G-08 at the documentation level ahead of the OpenAPI sprint. *(CATEGORY A)*

> No `src/`, OpenAPI, CI, AEK, or commit actions are proposed beyond this document. Any schema authoring (CATEGORY B) or implementation (CATEGORY D) requires explicit authorization.

---

## Decision Summary

| # | Decision needed | Owner | Blocks |
|---|---|---|---|
| D-1 | Commission split model — does 70/20/10 apply to therapy gross sale, and are 30/70 API/referral shares separate streams? | Commercial + Vytalix | Entire pricing matrix, billing contract |
| D-2 | Settlement currency (MXN vs USD) and bank-cost allocation (off-the-top vs absorbed) | Commercial | Pricing matrix |
| D-3 | Therapy ↔ application-mode mapping (which EXO therapy via IVP/IMS/IQP) | Doctor Antivejez | Catalog SKU finalization |
| D-4 | Consult/handoff requirement for `EXO-EST` (aesthetic) | Doctor Antivejez | Catalog flags, journey routing |
| D-5 | Canonical production domain (`.health` / `.io` / `.com`) | Vytalix | OpenAPI server block, all contracts |
| D-6 | Canonical event names (align contract ↔ event bus) | Vytalix architecture | Event ownership schema (G-06) |

---

**AUTHORIZED NEXT STEP:** Produce items 1–3 in Next Actions as standalone markdown documents (decision record, catalog sign-off sheet, webhook spec addendum). All documentation-only.

**NOT AUTHORIZED NEXT STEP:** Authoring/editing OpenAPI YAML, `src/**`, CI, AEK, or ADR files; commits; branches; pushes; any runtime implementation. These remain CATEGORY E until explicitly authorized.
