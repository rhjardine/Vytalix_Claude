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
| `.github/workflows/aek-governance.yml` | Ejecuta `pnpm aek:check` en PR/push a `main` y `adr/**` (Gate G1) |
| `.github/workflows/sandbox-ci.yml` | Ejecuta `pnpm sandbox:test` (Gate G6) |

> El detalle de los workflows es Nivel 1 (los archivos YAML en `.github/workflows/`). Esta tabla referencia; el archivo prevalece.

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
