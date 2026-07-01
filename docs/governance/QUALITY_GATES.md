# QUALITY_GATES.md
> **Vytalix Platform — Quality Gates (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/QUALITY_GATES.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Capa de agregación. Los gates ejecutables (CI, AEK, Vitest) son la autoridad de Nivel 1. Este documento los enumera; no redefine umbrales fuera de lo verificable en el repositorio.

---

## 1. Gates obligatorios antes de merge

| # | Gate | Mecanismo | Umbral |
|---|---|---|---|
| G1 | Arquitectura (dependencias) | AEK (`pnpm aek:check`) | **0 findings** |
| G2 | Tests | Vitest | Suite en verde (sin regresiones) |
| G3 | OpenAPI antes de código | Revisión | Endpoint nuevo ⇒ entrada OpenAPI previa (ADR-001/005) |
| G4 | Tipado estricto | `tsc` typecheck | Sin errores |
| G5 | Auditoría en mutaciones | Revisión + tests | Mutación de tenant ⇒ registro de auditoría en la misma transacción |
| G6 | Sandbox (integración Disglobal) | `pnpm sandbox:test` | Suite en verde |

## 2. CI workflows vigentes

| Workflow | Propósito |
|---|---|
| `.github/workflows/ci.yml` | **Pipeline unificado (Sprint E1)** — 10 stages en PR/push a `main` y `adr/**` |
| `.github/workflows/aek-governance.yml` | Gate AEK dedicado (G1) — solapa con stage 8 de `ci.yml` (ver SPRINT_E1_REPORT §Repository Health) |
| `.github/workflows/sandbox-ci.yml` | Gate sandbox dedicado (G6) — solapa con stage 4 de `ci.yml` |

> El detalle de los workflows es Nivel 1 (los archivos YAML en `.github/workflows/`). Esta tabla referencia; el archivo prevalece.

### 2.1 Pipeline unificado — clasificación de stages

`ci.yml` ejecuta los 10 stages en orden. La clasificación distingue gates **bloqueantes** (fallan el merge) de **advisory** (ejecutan y reportan, sin bloquear). La razón de cada advisory es deuda pre-existente fuera del alcance de E1 (ver SPRINT_E1_REPORT.md).

| # | Stage | Comando | Clase |
|---|---|---|---|
| 1 | Install | `pnpm install` | infra |
| 2 | Type Check | `pnpm typecheck` | **Advisory** — breakage pre-existente en `src/vertical2/` |
| 3 | Build | `pnpm api:build` | **Advisory** — mismo breakage |
| 4 | Vitest (sandbox) | `pnpm sandbox:test` | **BLOQUEANTE** |
| 4b | Vitest (full) | `pnpm test` | **Advisory** — requiere Postgres + Redis + seed |
| 5 | Coverage | `pnpm test:coverage` | **Advisory** — depende de infra del full suite |
| 6 | Prisma Validate | `pnpm exec prisma validate` | **BLOQUEANTE** |
| 7 | OpenAPI | `npx @redocly/cli lint` | **Advisory** — tooling no adoptado (Task 5) |
| 8 | AEK | `pnpm aek:check` | **BLOQUEANTE** — 0 findings |
| 9 | ESLint | `pnpm lint` | **Advisory** — sin config ESLint committeada |
| 10 | Upload Reports | artifacts | infra (`if: always()`) |

### 2.2 Comando único de CI

Los gates **bloqueantes** se ejecutan localmente con un solo comando (reutiliza scripts existentes):

```bash
npm run ci      # = sandbox:test + prisma validate + aek:check
make ci         # idéntico, vía Makefile
make ci-full    # incluye stages advisory (typecheck, build, full tests, lint)
```

## 2.3 Requisitos oficiales de merge (branch protection)

Configuración recomendada de *branch protection* para `main` y `adr/**`:

- **Required status checks** (bloqueantes): `Quality Gates` (job de `ci.yml`). Dentro del job, los stages bloqueantes (4, 6, 8) hacen fallar el check.
- **Require a pull request before merging** con al menos 1 aprobación.
- **Require review from Code Owners** (ver `.github/CODEOWNERS`).
- **Require conversation resolution** antes del merge.
- **Require branches to be up to date** antes del merge.

> Los stages advisory NO se marcan como required hasta que su deuda se resuelva (ver SPRINT_E1_REPORT.md → Deferred Architectural Decisions / E2).

## 3. AEK como gate primario de arquitectura

- AEK escanea `src/**/*.{ts,tsx}` y verifica la regla ADR-002 (Domain Isolation, DI-001) más la excepción de Composition Root.
- **El baseline es 0 findings y no se relaja.** Una violación se resuelve corrigiendo el código o documentando una excepción en un ADR (ver [CHANGE_MANAGEMENT.md](./CHANGE_MANAGEMENT.md)).
- AEK, Policy Engine, Analyzer y las reglas ADR-002 son inmutables salvo decisión arquitectónica formal (nuevo ADR en Sprint E1+).

## 4. Checklist de aceptación

El checklist normativo completo reside en **[Repository-Governance.md §Checklist de aceptación](../../src/dental/docs/trd/Repository-Governance.md)**. Resumen:

- [ ] Cambio respaldado por un artefacto de Nivel 1.
- [ ] Sin regresiones en la suite de tests.
- [ ] Endpoint nuevo ⇒ OpenAPI previo.
- [ ] Tabla/columna nueva ⇒ migración SQL idempotente.
- [ ] Mutación de tenant ⇒ auditoría en la misma transacción.
- [ ] Sin exposición de campos internos (`baseCost`) fuera de OpenAPI.
- [ ] Sin lógica de negocio en routers HTTP.
- [ ] Sin imports cruzados entre dominios fuera de canales autorizados (AEK 0 findings).
- [ ] Sin PHI hardcodeado.
- [ ] Salida de IA verificada contra Nivel 1 por revisor humano (ADR-008).

## 5. Referencias

- Política de cambios y excepciones: [CHANGE_MANAGEMENT.md](./CHANGE_MANAGEMENT.md)
- Gobernanza de release: [RELEASE_GOVERNANCE.md](./RELEASE_GOVERNANCE.md)
- Readiness de observabilidad: [docs/OBSERVABILITY_READINESS.md](../OBSERVABILITY_READINESS.md)
