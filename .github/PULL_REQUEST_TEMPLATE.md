<!--
Vytalix Platform — Pull Request Template
Governance: docs/governance/QUALITY_GATES.md · CHANGE_MANAGEMENT.md
Truth hierarchy & isolation rules: ADR-001 … ADR-008
-->

## Summary

<!-- What does this PR change and why? Link the Nivel 1 artifact that justifies it. -->

## Change classification

<!-- See docs/governance/CHANGE_MANAGEMENT.md §1 -->

- [ ] Documentation only
- [ ] Contract (OpenAPI / DTO) — **OpenAPI updated first** (ADR-001 / ADR-005)
- [ ] Domain logic (clinical / financial engine)
- [ ] Nivel 1 critical (migration, Prisma schema, `src/platform/db.ts`, middlewares, AEK)
- [ ] Architectural decision — **new ADR included** (≥ ADR-009; existing ADRs are not edited)

## Quality gates (see QUALITY_GATES.md)

**Blocking — must be green:**
- [ ] AEK Architecture Gate — 0 findings (`pnpm aek:check`)
- [ ] Sandbox tests pass (`pnpm sandbox:test`)
- [ ] Prisma schema valid (`pnpm exec prisma validate`)

**Advisory (report-only today — see SPRINT_E1_REPORT.md):**
- [ ] Type Check reviewed (`pnpm typecheck`)
- [ ] Build reviewed (`pnpm api:build`)
- [ ] Full test suite / coverage reviewed
- [ ] ESLint reviewed
- [ ] OpenAPI lint reviewed

## Isolation & invariants checklist

- [ ] No cross-domain imports outside authorized barrels (ADR-002 / Domain-Boundaries)
- [ ] All tenant data access goes through `withTenant()` (ADR-003)
- [ ] No new HTTP endpoint without a prior OpenAPI entry (ADR-001 / ADR-005)
- [ ] No mutation of append-only clinical/financial records (ADR-006)
- [ ] No internal fields (`baseCost`) exposed externally
- [ ] No business logic added inside HTTP routers
- [ ] No PHI hardcoded outside its database table

## Risk & rollback

<!-- Blast radius, migration reversibility, feature flag, rollback plan. -->

## Notes for reviewers

<!-- Anything reviewers should focus on. AI-generated changes must be verified
     against Nivel 1 by a human reviewer (ADR-008). -->
