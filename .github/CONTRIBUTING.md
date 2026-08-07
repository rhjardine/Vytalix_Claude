# Contributing to Vytalix Platform

> This guide describes the **engineering process**. Structural rules (what may
> enter each zone, dependency boundaries) are normative in
> [`Repository-Governance.md`](../src/dental/docs/trd/Repository-Governance.md) and
> [`Domain-Boundaries.md`](../src/dental/docs/trd/Domain-Boundaries.md).
> Process governance lives in [`docs/governance/`](../docs/governance/README.md).

## Golden rules

1. **Contract-first.** No HTTP endpoint exists without a prior OpenAPI entry
   (ADR-001 / ADR-005). Order is always: OpenAPI → implementation → consumers.
2. **Domain isolation.** No cross-domain internal imports; use barrels
   (`src/dental/index.ts`) or the event bus (ADR-002 / ADR-007). Enforced by AEK.
3. **Tenant isolation.** All tenant data access goes through `withTenant()` (ADR-003).
4. **Append-only.** Clinical & financial records are immutable (ADR-006).
5. **ADRs are authority.** ADR-001…008 are not edited. New decisions = new ADR (≥ ADR-009).
6. **AI output is not a review.** AI-generated changes are Nivel 4 until verified
   by a human against Nivel 1 (ADR-008).

## Local development

See [`README.md`](../README.md) and the `Makefile`:

```bash
make setup      # install, migrate, RLS, seed
make dev        # run API + frontend
```

## Quality gates before opening a PR

Run the same checks CI runs (see [`QUALITY_GATES.md`](../docs/governance/QUALITY_GATES.md)):

```bash
make ci          # aggregate: prisma validate + sandbox tests + AEK (blocking gates)
# or individually:
pnpm aek:check       # architecture gate — must be 0 findings (BLOCKING)
pnpm sandbox:test    # deterministic integration suite (BLOCKING)
pnpm exec prisma validate   # schema validity (BLOCKING)
pnpm typecheck       # advisory today — see SPRINT_E1_REPORT.md
pnpm test            # full suite needs Postgres + Redis (see Makefile `make setup`)
```

## Branching & commits

- Work on the designated branch (current baseline: `adr/baseline-2026`).
- Descriptive commit messages; Nivel 1 changes reference the justifying artifact.
- Never delete existing documentation — reuse, extend, or reorganize.

## Pull requests

- Fill the [PR template](./PULL_REQUEST_TEMPLATE.md) completely.
- CODEOWNERS review is required for governance, ADR, CI, OpenAPI, Prisma, and
  domain paths (see [`CODEOWNERS`](./CODEOWNERS)).
- A PR that breaks a **blocking** gate is not merged.

## Dependencies

- New npm dependencies require documented justification (Repository-Governance).
- No dependency with known high/critical vulnerabilities enters the baseline.

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md) — do not open public issues for vulnerabilities.
