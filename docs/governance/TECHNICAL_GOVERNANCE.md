# TECHNICAL_GOVERNANCE.md
> **Vytalix Platform — Technical Governance (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/TECHNICAL_GOVERNANCE.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Capa de agregación. La autoridad estructural reside en los ADR y en los TRD del dominio (`src/dental/docs/trd/`). Este documento referencia; no duplica ni redefine.

---

## 1. Jerarquía de verdad

La resolución de cualquier contradicción entre artefactos sigue la jerarquía de cuatro niveles definida en **[ADR-008](../../src/dental/docs/trd/adr/ADR-008%20Satellite%20Domains/ADR-008.md)** y detallada en **[Architectural-Truth-Matrix.md](../../src/dental/docs/trd/Architectural-Truth-Matrix.md)**:

- **Nivel 1** — Código compilable, Prisma schema, migraciones SQL ejecutadas, OpenAPI, tests que pasan.
- **Nivel 2** — TRD, DDD, ADR.
- **Nivel 3** — Documentación operativa (runbooks, guías).
- **Nivel 4** — Narrativas generadas por IA (cuarentena hasta verificación).

Regla: el nivel superior prevalece sin negociación. Una narrativa de Nivel 4 que contradiga Nivel 1 va a cuarentena, nunca al contrario.

## 2. Bounded contexts y dependencias

La definición canónica de los cinco bounded contexts, su matriz de dependencias permitidas y las prohibiciones de cruce reside en **[Domain-Boundaries.md](../../src/dental/docs/trd/Domain-Boundaries.md)**. Resumen normativo:

| Dominio | Raíz | Puede importar de |
|---|---|---|
| Core Clinical | `src/core/`, `src/longevity/`, `src/shared/` | `src/shared/`, `src/platform/` |
| Platform | `src/platform/`, `src/api/middlewares/`, `src/api/pipelines/` | `src/shared/` |
| Commercial/API | `src/api/handlers/`, `openapi/` | `src/core/`, `src/platform/`, `src/dental/index.ts`, `src/shared/` |
| Dental (satélite) | `src/dental/` | `src/shared/`, `src/platform/db` (vía `withTenant`) |
| Frontend Dental | `frontend-dental/` | API REST del backend exclusivamente |

Cruces prohibidos y *anti-corruption layers*: ver Domain-Boundaries §Dependencias prohibidas y §Anti-corruption layers.

## 3. Reglas de dependencia (resumen)

1. Un dominio no importa internals de otro. Solo barrels de índice (`src/dental/index.ts`) o contratos publicados.
2. **Excepción Composition Root:** `src/server.ts` puede importar routers para montarlos (ADR-002 / Domain-Boundaries §Dental).
3. `withTenant()` es la única vía de acceso a datos de tenant (ADR-003).
4. Nuevas dependencias npm requieren justificación documentada.

## 4. Enforcement automatizado — AEK

El **Architecture Enforcement Kit** (`tools/aek/`) verifica estáticamente las reglas de dependencia (regla ADR-002 / DI-001) sobre `src/**/*.{ts,tsx}`. El baseline obligatorio es **0 findings**.

- AEK es autoridad de Nivel 1 (es código ejecutable).
- AEK no se modifica para acomodar una violación: se corrige el código o se documenta una excepción en un ADR (ver [CHANGE_MANAGEMENT.md](./CHANGE_MANAGEMENT.md)).
- Gate de CI: ver [QUALITY_GATES.md](./QUALITY_GATES.md).

## 5. Contratos OpenAPI

OpenAPI es el contrato único de integración (ADR-001 / ADR-005). Orden de cambio inmutable: **OpenAPI → implementación → consumidores**. El orden inverso es un defecto. Los archivos vigentes están en `openapi/`.

## 6. Documentación técnica de referencia

| Tema | Documento |
|---|---|
| Estructura física del repo | [docs/ARCHITECTURE_REPO_STRUCTURE.md](../ARCHITECTURE_REPO_STRUCTURE.md) |
| Arquitectura de plataforma | [docs/VYTALIX_PLATFORM_ARCHITECTURE.md](../VYTALIX_PLATFORM_ARCHITECTURE.md) |
| Arquitectura clínica | [docs/CLINICAL_ARCHITECTURE.md](../CLINICAL_ARCHITECTURE.md) |
| Aislamiento de tenant | [docs/TENANT_ISOLATION_REPORT.md](../TENANT_ISOLATION_REPORT.md) |
| Flujo de autenticación | [docs/AUTH_FLOW.md](../AUTH_FLOW.md) |
| Gobernanza estructural del repo | [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md) |
