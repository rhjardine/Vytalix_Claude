# RELEASE_GOVERNANCE.md
> **Vytalix Platform — Release Governance (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/RELEASE_GOVERNANCE.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Capa de agregación. Los criterios GO/NO-GO verificables y los reportes de release son la autoridad. Este documento enlaza; no redefine umbrales fuera de lo verificable.

---

## 1. Criterios GO / NO-GO

Un release a entorno compartido requiere que **todos** los gates de [QUALITY_GATES.md](./QUALITY_GATES.md) estén en verde:

| Gate | Criterio GO |
|---|---|
| AEK | 0 findings |
| Tests | Suite en verde, sin regresiones |
| Sandbox | `pnpm sandbox:test` en verde |
| OpenAPI | Contratos sincronizados con la implementación |
| Observabilidad | Liveness + readiness operacionales |
| Seguridad | Controles de [SECURITY_GOVERNANCE.md](./SECURITY_GOVERNANCE.md) verificados |

El criterio GO/NO-GO de referencia para el piloto Disglobal está en **[docs/DISGLOBAL_PILOT_READINESS.md §9](../DISGLOBAL_PILOT_READINESS.md)**.

## 2. Versionado

- **Contratos OpenAPI:** versionados; un cambio incompatible exige nuevo prefijo de versión (`v3`) o campo deprecado con periodo de gracia (Repository-Governance §Publicación).
- **Migraciones:** aditivas; nunca se elimina columna/tabla sin ciclo de deprecación documentado.
- **Eventos:** versionables; los consumidores que reciban eventos desconocidos los registran y descartan (open/closed).

## 3. Inmutabilidad de migraciones

- El esquema Prisma y las migraciones SQL son Nivel 1: toda modificación pasa por revisión del arquitecto principal antes de ejecutarse en entorno compartido (ADR-006, Repository-Governance §Publicación).
- Patrón de hardening de referencia: `prisma/dental_sprint7_hardening.sql` (idempotente, `DROP ... IF EXISTS` antes de `ADD`, bloques `DO $$`).

## 4. Entornos

| Entorno | Propósito |
|---|---|
| Local | Desarrollo (`http://localhost:3001`) |
| Sandbox | Integración de socios (Disglobal) — aislado de producción |
| Producción | Operación clínica real |

> **Simulación y producción permanecen aisladas** (invariante de programa). El módulo `sandbox/` está fuera del scope de escaneo de AEK y no importa de `src/`.

## 5. Reportes de release de referencia

| Tema | Documento |
|---|---|
| Release candidate | [docs/RELEASE_CANDIDATE_REPORT.md](../RELEASE_CANDIDATE_REPORT.md) |
| Entrega final | [docs/FINAL_DELIVERY_REPORT.md](../FINAL_DELIVERY_REPORT.md) |
| Estado del sistema | [docs/SYSTEM_STATUS.md](../SYSTEM_STATUS.md) |
| Auditoría del sistema | [docs/SYSTEM_AUDIT.md](../SYSTEM_AUDIT.md) |
| Readiness de piloto | [docs/DISGLOBAL_PILOT_READINESS.md](../DISGLOBAL_PILOT_READINESS.md) |
| Runbook operacional | [docs/RUNBOOK.md](../RUNBOOK.md) |
| Runbook de fallos | [docs/FAILURE_RUNBOOK.md](../FAILURE_RUNBOOK.md) |

## 6. Rollback

- Las migraciones aditivas permiten rollback de aplicación sin pérdida de datos.
- Un incidente P0 sigue el [FAILURE_RUNBOOK.md](../FAILURE_RUNBOOK.md); notificación P0 < 30 min (DISGLOBAL_PILOT_READINESS §SLA).
