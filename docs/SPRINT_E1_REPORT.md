# SPRINT_E1_REPORT.md
> **Vytalix Platform — Sprint Enterprise E1 · Automated Quality Gates**

| Campo | Valor |
|---|---|
| Sprint | E1 — Automatización de gates de calidad |
| Rama | `adr/baseline-2026` |
| Modo | Safe Implementation (incremental, backward compatible, zero functional regression) |
| Estado | COMPLETADO (con deuda pre-existente documentada y diferida) |
| Fecha | 2026-06 |

---

## 0. Resumen ejecutivo

E1 transformó la gobernanza de E0 en **gates de calidad automatizados** sin tocar lógica de negocio, dominios, APIs, OpenAPI, Prisma ni tests. Se añadió un pipeline de CI unificado de 10 stages, gobernanza de GitHub (CODEOWNERS, PR template, SECURITY, CONTRIBUTING, issue templates), un comando único de CI (`npm run ci` / `make ci`) que reutiliza scripts existentes, y se integró AEK en CI reutilizando `pnpm aek:check`.

Durante la ejecución se detectaron **tres condiciones de breakage/infra pre-existentes** que impiden que ciertos stages sean bloqueantes sin modificar código prohibido. Conforme a la REGLA FINAL, **no se implementó ninguna corrección de código de negocio**; se clasificaron esos stages como *advisory* y se documentan en §Deferred Architectural Decisions y §Technical Debt.

**Gates bloqueantes (verificados en verde en runner limpio):** Sandbox tests (49/49), Prisma Validate, AEK (0 findings).

---

## 1. Completed tasks

| Tarea | Estado | Detalle |
|---|---|---|
| **T1 — GitHub Governance** | ✅ | CODEOWNERS, PR template, SECURITY.md, CONTRIBUTING.md, issue templates (bug/feature/config). Ningún archivo existente sobrescrito. |
| **T2 — GitHub Actions CI** | ✅ | `ci.yml` con los 10 stages en orden. Falla en errores de validación de los gates dentro de alcance. |
| **T3 — AEK Integration** | ✅ | Sin reescribir AEK. Integrado vía `pnpm aek:check` (stage 8) y expuesto como `npm run ci` / `make ci` / `make aek`. |
| **T4 — Quality Gates** | ✅ | `docs/governance/QUALITY_GATES.md` ampliado: mapping del pipeline, clasificación bloqueante/advisory, requisitos oficiales de merge y branch protection. |
| **T5 — OpenAPI Governance** | ✅ (documentado) | No existe tooling committeado. Stage 7 ejecuta Redocly vía `npx` como señal advisory; adopción formal recomendada para E2. OpenAPI **no modificado**. |
| **T6 — Repository Health** | ✅ | Solapamientos y artefactos identificados (ver §Repository Health). Nada eliminado. |
| **T7 — Documentation** | ✅ | Solo se amplió documentación de gobernanza existente; referencias a ADR; sin duplicación. |

---

## 2. Files created

| Archivo | Propósito |
|---|---|
| `.github/workflows/ci.yml` | Pipeline unificado de 10 stages |
| `.github/CODEOWNERS` | Revisores requeridos por path (governance, ADR, CI, OpenAPI, Prisma, dominios) |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist de PR (gates + invariantes ADR) |
| `.github/SECURITY.md` | Política de seguridad y reporte privado |
| `.github/CONTRIBUTING.md` | Proceso de contribución |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Plantilla de bug |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Plantilla de feature |
| `.github/ISSUE_TEMPLATE/config.yml` | Config de issues (deshabilita blank; enlaces a seguridad y gobernanza) |
| `docs/SPRINT_E1_REPORT.md` | Este informe |

## 3. Files updated

| Archivo | Cambio | Garantía |
|---|---|---|
| `package.json` | Añadido script `ci` (reutiliza `sandbox:test` + `prisma validate` + `aek:check`) | Solo adición; scripts existentes intactos; JSON válido |
| `Makefile` | Añadidos targets `ci`, `ci-full`, `aek` + `.PHONY` | Solo adición; targets existentes intactos |
| `docs/governance/QUALITY_GATES.md` | §2 ampliada (pipeline, clasificación, comando único, branch protection) | Extensión, sin duplicación |
| `docs/governance/README.md` | Nueva §7 (plataforma de ingeniería / CI) | Extensión del índice |

> **No se modificó** ningún archivo bajo `src/`, `frontend-dental/src/`, `tests/`, `openapi/`, `prisma/schema.prisma`, ni los ADR. No se eliminó ningún archivo.

---

## 4. Pipeline — clasificación de stages

| # | Stage | Comando | Clase | Verificación local |
|---|---|---|---|---|
| 1 | Install | `pnpm install` | infra | — |
| 2 | Type Check | `pnpm typecheck` | **Advisory** | ❌ falla (pre-existente, `src/vertical2/`) |
| 3 | Build | `pnpm api:build` | **Advisory** | ❌ falla (mismo origen) |
| 4 | Vitest (sandbox) | `pnpm sandbox:test` | **BLOQUEANTE** | ✅ 49/49 |
| 4b | Vitest (full) | `pnpm test` | **Advisory** | ❌ 19 fallos (ECONNREFUSED Postgres) |
| 5 | Coverage | `pnpm test:coverage` | **Advisory** | depende de 4b |
| 6 | Prisma Validate | `pnpm exec prisma validate` | **BLOQUEANTE** | ✅ válido |
| 7 | OpenAPI | `npx @redocly/cli lint` | **Advisory** | tooling no committeado |
| 8 | AEK | `pnpm aek:check` | **BLOQUEANTE** | ✅ 0 findings |
| 9 | ESLint | `pnpm lint` | **Advisory** | sin config ESLint |
| 10 | Upload Reports | artifacts | infra | `if: always()` |

Comando único de gates bloqueantes: `npm run ci` (verificado ✅ en verde).

---

## 5. Deferred Architectural Decisions

> Conforme a la REGLA FINAL: las siguientes mejoras requieren modificar código de negocio o archivos fuera del alcance permitido. **No se implementaron.** Se registran para decisión explícita en E2.

### DAD-1 — Breakage pre-existente en `src/vertical2/`
`src/vertical2/app.ts` importa módulos inexistentes (`./admin/adminRouter`, `./shared/middleware/partnerMiddleware`, `./shared/db/db`, `./shared/config/config`). El directorio solo contiene `app.ts` y `db.ts`. Esto rompe `pnpm typecheck` y `pnpm api:build` (ambos usan `tsconfig.server.json`, que incluye `src/**/*`).
- **Por qué no se corrigió:** corregir exige modificar `src/` (prohibido) o `tsconfig.server.json` (no está en las ubicaciones permitidas).
- **Impacto:** stages 2 y 3 son advisory.
- **Recomendación E2:** decidir si `src/vertical2/` es código huérfano (→ cuarentena/legacy vía ADR) o completar los módulos faltantes. Hasta entonces, Type Check/Build no pueden ser bloqueantes.

### DAD-2 — Suite de tests acoplada a infraestructura
19 tests (8 archivos, p. ej. `tests/risk-scoring.test.ts`) requieren PostgreSQL (y Redis) en vivo; fallan con `ECONNREFUSED 127.0.0.1:5432` en un runner limpio. 414 tests pasan sin infra.
- **Por qué no se corrigió:** los tests están en `tests/` (prohibido modificar). Hacerlos green exige levantar servicios + migraciones + seed en CI, cuyo resultado no es verificable en este entorno.
- **Impacto:** stages 4b y 5 son advisory.
- **Recomendación E2:** añadir *service containers* (postgres, redis) al workflow + `prisma migrate deploy` + `db:rls` + `db:seed`, y promover el full suite y coverage a bloqueantes una vez verificados en verde.

### DAD-3 — ESLint sin configuración
ESLint `^8.56.0` está instalado pero no hay archivo de config ni `eslintConfig` en `package.json`. `eslint src` fallaría por "No ESLint configuration found".
- **Por qué no se corrigió:** establecer una config y satisfacer `--max-warnings 0` casi con certeza requeriría modificar `src/` (prohibido).
- **Impacto:** stage 9 advisory.
- **Recomendación E2:** introducir `eslint.config.js` (flat config) con un baseline tolerante, corregir incrementalmente y luego endurecer a bloqueante.

### DAD-4 — OpenAPI sin tooling de validación
No hay Redocly/Spectral/swagger-cli committeado (Task 5). El stage 7 usa `npx @redocly/cli` efímero como señal advisory.
- **Recomendación E2:** adoptar formalmente Redocly o Spectral como devDependency con ruleset versionado y detección de breaking-changes (p. ej. `oasdiff`), luego promover a bloqueante.

---

## 6. Technical debt (resumen)

| ID | Deuda | Severidad | Origen |
|---|---|---|---|
| TD-1 | `src/vertical2/` no compila (módulos huérfanos) | ALTA | Pre-existente (commit "Feac Vertical2 Dental CFE") |
| TD-2 | Tests de integración sin servicios en CI | MEDIA | Diseño de suite |
| TD-3 | Sin configuración ESLint | MEDIA | Falta de baseline de lint |
| TD-4 | Sin tooling OpenAPI committeado | MEDIA | Falta de adopción |
| TD-5 | Dos lockfiles (`package-lock.json` + `pnpm-lock.yaml`) | BAJA | Ambigüedad de package manager |
| TD-6 | `packageManager` no declarado en `package.json` | BAJA | Reproducibilidad de CI |

---

## 7. Repository Health (Task 6 — solo documentación, nada eliminado)

### Workflows solapados
- `ci.yml` (nuevo) ejecuta AEK (stage 8) y sandbox (stage 4), que ya cubren `aek-governance.yml` y `sandbox-ci.yml` respectivamente.
- **Recomendación E2:** consolidar en `ci.yml` y retirar los dos workflows dedicados, **o** mantenerlos como gates rápidos independientes. Decisión explícita pendiente. **No se eliminó nada en E1.**

### Doble lockfile / package manager
- Coexisten `package-lock.json` y `pnpm-lock.yaml`; `packageManager` no está declarado. Los workflows usan pnpm. **Recomendación E2:** declarar `packageManager` y elegir un único lockfile.

### Scripts/targets redundantes
- `Makefile` tiene `test`/`typecheck`/`lint`/`build` que duplican scripts de `package.json` con `npx` en vez de `pnpm`. No se modificaron (fuera de alcance destructivo). **Recomendación E2:** unificar a `pnpm`.
- `rc-validate` (Makefile) se solapa parcialmente con `make ci-full`. Documentado; no removido.

### Artefactos de gobernanza
- No se detectaron archivos de gobernanza obsoletos introducidos en E0/E1. La capa `docs/governance/` permanece coherente.

---

## 8. Risks

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Stages advisory podrían interpretarse como "passing" | MEDIA | Clasificación explícita en QUALITY_GATES.md §2.1 y PR template; solo gates bloqueantes son *required checks* |
| `npx @redocly/cli` depende de red en CI | BAJA | Stage advisory (`continue-on-error`); no bloquea |
| Branch protection no aplicada todavía (requiere config de repo en GitHub UI) | MEDIA | Documentada en QUALITY_GATES §2.3; acción de administración del repo |
| Deuda TD-1 mantiene Type Check/Build fuera de bloqueo | MEDIA | DAD-1 con plan E2 |

---

## 9. Future Sprint E2 recommendations

1. **Resolver TD-1 (`src/vertical2/`)** vía ADR-009 (cuarentena/legacy o completar módulos) → promover Type Check + Build a bloqueantes.
2. **Service containers en CI** (Postgres + Redis) + migraciones + seed → promover full Vitest + Coverage a bloqueantes (DAD-2).
3. **Adoptar ESLint flat config** con baseline + endurecimiento incremental (DAD-3).
4. **Adoptar tooling OpenAPI** (Redocly/Spectral committeado + `oasdiff` para breaking-changes) (DAD-4).
5. **Consolidar workflows** (`ci.yml` como único) y **unificar package manager/lockfile** (TD-5/TD-6).
6. **Aplicar branch protection** en `main` y `adr/**` con `Quality Gates` como required check + CODEOWNERS review.
7. **Cobertura como gate** con umbral mínimo una vez la suite sea estable en CI.

---

## 10. Success criteria — verificación

| Criterio | Resultado |
|---|---|
| ✓ Zero functional regression | **CUMPLE** — sin cambios en `src/`, dominios, EventBus, RLS, tenant model |
| ✓ Zero API changes | **CUMPLE** |
| ✓ Zero OpenAPI changes | **CUMPLE** — `openapi/` intacto |
| ✓ Zero Prisma changes | **CUMPLE** — `prisma/schema.prisma` intacto |
| ✓ Zero domain changes | **CUMPLE** |
| ✓ Zero test failures (introducidos) | **CUMPLE** — no se modificaron tests; fallos detectados son pre-existentes y documentados (DAD-2) |
| ✓ CI executes automatically | **CUMPLE** — `ci.yml` en PR/push a `main` y `adr/**` |
| ✓ AEK integrated into CI | **CUMPLE** — stage 8 + `npm run ci` |
| ✓ Governance strengthened | **CUMPLE** — GitHub governance + quality gates documentados |

---

## 11. Detención por código de negocio

Conforme a la REGLA FINAL, toda mejora que requería modificar código de negocio o archivos prohibidos (corregir `src/vertical2/`, ajustar `tsconfig.server.json`, modificar tests para desacoplar infra, satisfacer ESLint en `src/`) fue **detenida y documentada** en §5 (Deferred Architectural Decisions) y §6 (Technical Debt). No se implementó ninguna de ellas en E1.
