# Security Policy

> Vytalix Clinical Intelligence Platform. This policy complements the technical
> controls documented in [`docs/governance/SECURITY_GOVERNANCE.md`](../docs/governance/SECURITY_GOVERNANCE.md)
> and the hardening reports under `docs/`.

## Supported scope

This repository hosts a multitenant clinical/commercial platform handling
pseudonymized health-adjacent data. Security issues in the following areas are
in scope:

- Tenant isolation / RLS bypass (ADR-003)
- Authentication & authorization (API Key, JWT, scopes) — see `docs/AUTH_FLOW.md`
- Pseudonymization / PII or PHI exposure
- Webhook signature verification (HMAC) and replay protection
- Append-only immutability bypass (ADR-006)
- Secret handling / credential exposure

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately to: **security@vytalix.health**
(use the GitHub *Private vulnerability reporting* feature where available).

Include:
- Affected component / path and environment
- Reproduction steps or proof of concept
- Impact assessment (tenant isolation, PHI, financial, availability)
- Any suggested remediation

## Response targets

Aligned with the operational SLA in `docs/DISGLOBAL_PILOT_READINESS.md`:

| Severity | Acknowledgement | Initial assessment |
|---|---|---|
| P0 — active exploitation / data exposure | < 30 min | < 4 h |
| P1 — high, no active exploitation | < 2 h | < 24 h |
| P2 — medium / low | < 2 business days | best effort |

## Disclosure

Coordinated disclosure. We will confirm receipt, validate, remediate, and agree
on a disclosure timeline with the reporter. Fixes to clinical/financial
invariants follow the change-management flow in
[`docs/governance/CHANGE_MANAGEMENT.md`](../docs/governance/CHANGE_MANAGEMENT.md).

## Non-negotiable invariants

See [`docs/governance/SECURITY_GOVERNANCE.md`](../docs/governance/SECURITY_GOVERNANCE.md) §2.
Mandatory pseudonymization, contract separation (`/api/v2/*` vs `/v1/*`), RLS via
`withTenant()`, no plaintext secret fallbacks in production, and
`timingSafeEqual` webhook verification are not subject to exception without a
documented, time-boxed ADR.
