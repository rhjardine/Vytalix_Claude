# Vytalix Platform — Governance Index (Master)
> **Índice maestro de gobernanza · Capa corporativa**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Ruta canónica | `docs/governance/README.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

Este directorio es la **capa de gobernanza corporativa** de Vytalix: una capa de **agregación e índice** que enlaza la autoridad técnica existente sin duplicarla ni reemplazarla. Toda decisión arquitectónica reside en los ADR; toda regla estructural en los TRD del dominio. Ante contradicción, prevalece la jerarquía de verdad de **ADR-008**.

---

## 1. Gobernanza corporativa (este directorio)

| Documento | Propósito |
|---|---|
| [PROGRAM_CHARTER.md](./PROGRAM_CHARTER.md) | Propósito del programa, partes, principios rectores, invariantes clínicos |
| [TECHNICAL_GOVERNANCE.md](./TECHNICAL_GOVERNANCE.md) | Jerarquía de verdad, bounded contexts, dependencias, AEK, OpenAPI |
| [SECURITY_GOVERNANCE.md](./SECURITY_GOVERNANCE.md) | Zero Trust, invariantes de seguridad, privacidad, vulnerabilidades |
| [QUALITY_GATES.md](./QUALITY_GATES.md) | Gates obligatorios, CI, AEK, checklist de aceptación |
| [CHANGE_MANAGEMENT.md](./CHANGE_MANAGEMENT.md) | Clasificación de cambios, flujo de ADR, excepciones, material IA |
| [RELEASE_GOVERNANCE.md](./RELEASE_GOVERNANCE.md) | GO/NO-GO, versionado, migraciones, entornos, rollback |

## 2. Decisiones arquitectónicas (ADR) — autoridad Nivel 2

> **Nota:** los ADR residen bajo `src/dental/docs/trd/adr/` por razones históricas (origen en la vertical dental) pero aplican a toda la plataforma. Su reubicación se evalúa para Sprint E1. Los títulos de carpeta y de documento presentan discrepancias documentadas en `SPRINT_E0_REPORT.md`; los enlaces siguientes apuntan a las rutas reales en disco y enuncian el **título real** del documento.

| ADR (título real del documento) | Enlace |
|---|---|
| ADR-001 — Arquitectura API-First | [ADR-001](../../src/dental/docs/trd/adr/ADR-001%20Arquitectura%20Hexagonal/ADR-001.md) |
| ADR-002 — Aislamiento de dominios (Domain Isolation) | [ADR-002](../../src/dental/docs/trd/adr/ADR-002%20DDD%20como%20patron%20dominante/ADR-002.md) |
| ADR-003 — Tenant Isolation mediante PostgreSQL RLS | [ADR-003](../../src/dental/docs/trd/adr/ADR-003%20PostgreSQL%20+%20RLS/ADR-003.md) |
| ADR-004 — Motores puros para lógica dental | [ADR-004](../../src/dental/docs/trd/adr/ADR-004%20OpenAPI%20First/ADR-004.md) |
| ADR-005 — OpenAPI como contrato único de integración | [ADR-005](../../src/dental/docs/trd/adr/ADR-005%20pnpm%20+%20Turborepo/ADR-005.md) |
| ADR-006 — Append-Only para registros clínicos y financieros | [ADR-006](../../src/dental/docs/trd/adr/ADR-006%20Clinical%20Immutability/ADR-006.md) |
| ADR-007 — Dental como vertical autónoma | [ADR-007](../../src/dental/docs/trd/adr/ADR-007%20Event%20Driven%20Integration/ADR-007.md) |
| ADR-008 — Gobernanza arquitectónica y jerarquía de verdad | [ADR-008](../../src/dental/docs/trd/adr/ADR-008%20Satellite%20Domains/ADR-008.md) |

## 3. TRD y gobernanza estructural — autoridad Nivel 2

| Documento | Enlace |
|---|---|
| Architectural Truth Matrix (canónica) | [Architectural-Truth-Matrix.md](../../src/dental/docs/trd/Architectural-Truth-Matrix.md) |
| Domain Boundaries | [Domain-Boundaries.md](../../src/dental/docs/trd/Domain-Boundaries.md) |
| Repository Governance (reglas estructurales) | [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md) |

## 4. Arquitectura

| Documento | Enlace |
|---|---|
| Arquitectura de plataforma | [VYTALIX_PLATFORM_ARCHITECTURE.md](../VYTALIX_PLATFORM_ARCHITECTURE.md) |
| Arquitectura clínica | [CLINICAL_ARCHITECTURE.md](../CLINICAL_ARCHITECTURE.md) |
| Arquitectura general | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| Estructura física del repositorio | [ARCHITECTURE_REPO_STRUCTURE.md](../ARCHITECTURE_REPO_STRUCTURE.md) |
| Arquitectura vertical 2 (commerce) | [vertical2/ARCHITECTURE.md](../vertical2/ARCHITECTURE.md) |
| Arquitectura dental | [dental/CFE_DENTAL_ARCHITECTURE.md](../dental/CFE_DENTAL_ARCHITECTURE.md) |

## 5. Contratos de integración

| Documento | Enlace |
|---|---|
| Integration Contract v1.1 (ejecutivo) | [INTEGRATION_CONTRACT_v1.1.md/](../INTEGRATION_CONTRACT_v1.1.md/) |
| Phase 1 Governance Package | [PHASE1_GOVERNANCE_PACKAGE_v1.md](../PHASE1_GOVERNANCE_PACKAGE_v1.md) |
| Guía de integración v2 | [INTEGRATION_GUIDE_V2.md](../INTEGRATION_GUIDE_V2.md) |
| API Contracts v2 | [API_CONTRACTS_V2.md](../API_CONTRACTS_V2.md) |
| Quickstart Disglobal (commerce) | [vertical2/DISGLOBAL_QUICKSTART.md](../vertical2/DISGLOBAL_QUICKSTART.md) |
| Especificaciones OpenAPI | [`openapi/`](../../openapi/) |

## 6. Seguridad y operación

| Documento | Enlace |
|---|---|
| Security Hardening Report | [SECURITY_HARDENING_REPORT.md](../SECURITY_HARDENING_REPORT.md) |
| Tenant Isolation Report | [TENANT_ISOLATION_REPORT.md](../TENANT_ISOLATION_REPORT.md) |
| Auth Flow | [AUTH_FLOW.md](../AUTH_FLOW.md) |
| Observability Readiness | [OBSERVABILITY_READINESS.md](../OBSERVABILITY_READINESS.md) |
| Runbook | [RUNBOOK.md](../RUNBOOK.md) |
| Failure Runbook | [FAILURE_RUNBOOK.md](../FAILURE_RUNBOOK.md) |
| Disglobal Pilot Readiness | [DISGLOBAL_PILOT_READINESS.md](../DISGLOBAL_PILOT_READINESS.md) |

## 7. Plataforma de ingeniería (CI / GitHub governance)

Automatización de gates de calidad introducida en Sprint E1 (ver [SPRINT_E1_REPORT.md](../SPRINT_E1_REPORT.md)):

| Artefacto | Propósito |
|---|---|
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | Pipeline unificado de 10 stages |
| [.github/CODEOWNERS](../../.github/CODEOWNERS) | Revisores requeridos por path |
| [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) | Checklist de PR (gates + invariantes) |
| [.github/CONTRIBUTING.md](../../.github/CONTRIBUTING.md) | Proceso de contribución |
| [.github/SECURITY.md](../../.github/SECURITY.md) | Política de seguridad y reporte |
| Comando único | `npm run ci` / `make ci` (gates bloqueantes) |

## 8. Reglas del repositorio

Las reglas de qué entra en cada zona, dependencias permitidas/prohibidas, cuarentena, revisión y publicación son normativas en [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md) y [Domain-Boundaries.md](../../src/dental/docs/trd/Domain-Boundaries.md).

---

> Informe de consolidación que originó esta capa: [SPRINT_E0_REPORT.md](../SPRINT_E0_REPORT.md).
