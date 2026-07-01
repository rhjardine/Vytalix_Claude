# ADR_TRACEABILITY_MATRIX.md
> **Vytalix Platform — Architecture Decision Traceability Matrix**

| Campo | Valor |
|---|---|
| Estado | ACTIVO — trazabilidad |
| Rama | `adr/baseline-2026` |
| Sprint de origen | E2 |
| Última revisión | 2026-06 |

> Mapeo bidireccional entre documentos de gobernanza y ADR. **No reescribe ADR ni documentos**; solo establece la trazabilidad. Los ADR (Accepted) residen en `src/dental/docs/trd/adr/`. Nota: los **títulos reales** difieren de los nombres de carpeta (TD-09); aquí se usa el título real.

---

## 1. Catálogo de ADR (título real)

| ADR | Título real | Scope de gobernanza |
|---|---|---|
| ADR-001 | Arquitectura API-First | Contratos HTTP, orden OpenAPI→impl→consumidores |
| ADR-002 | Aislamiento de dominios (Domain Isolation) | Bounded contexts, dependencias, AEK |
| ADR-003 | Tenant Isolation mediante PostgreSQL RLS | Multitenancy, seguridad de datos |
| ADR-004 | Motores puros para lógica dental | Pureza/determinismo, testabilidad |
| ADR-005 | OpenAPI como contrato único de integración | Integración partner/frontend/backend |
| ADR-006 | Append-Only para registros clínicos y financieros | Inmutabilidad, trazabilidad legal |
| ADR-007 | Dental como vertical autónoma | Aislamiento de vertical satélite |
| ADR-008 | Gobernanza arquitectónica y jerarquía de verdad | Resolución de conflictos, gobernanza IA |

## 2. Governance document → ADRs que lo sustentan

| Documento de gobernanza | ADRs soporte |
|---|---|
| `governance/PROGRAM_CHARTER.md` | ADR-001 … ADR-008 (todos) |
| `governance/TECHNICAL_GOVERNANCE.md` | ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-008 |
| `governance/SECURITY_GOVERNANCE.md` | ADR-003, ADR-006 |
| `governance/QUALITY_GATES.md` | ADR-001, ADR-002, ADR-005, ADR-006, ADR-008 |
| `governance/CHANGE_MANAGEMENT.md` | ADR-001, ADR-005, ADR-008 |
| `governance/RELEASE_GOVERNANCE.md` | ADR-001, ADR-005, ADR-006 |
| `REPOSITORY_MANIFEST.md` | ADR-002, ADR-007, ADR-008 |
| `REPOSITORY_TOPOLOGY.md` | ADR-002, ADR-007 |
| `Repository-Governance.md` (TRD) | ADR-002, ADR-003, ADR-004, ADR-006, ADR-008 |
| `Domain-Boundaries.md` (TRD) | ADR-002, ADR-007 |
| `Architectural-Truth-Matrix.md` (TRD) | ADR-008 |
| `.github/PULL_REQUEST_TEMPLATE.md` | ADR-001, ADR-002, ADR-003, ADR-005, ADR-006 |
| `.github/CONTRIBUTING.md` | ADR-001, ADR-002, ADR-003, ADR-006, ADR-007, ADR-008 |
| `.github/SECURITY.md` | ADR-003, ADR-006 |
| `.github/CODEOWNERS` | ADR-008 (autoridad de revisión) |
| CI (`.github/workflows/ci.yml`, `aek-governance.yml`) | ADR-002 (AEK), ADR-005 (OpenAPI), ADR-001 |

## 3. ADR → documentos / mecanismos que lo implementan

| ADR | Implementado / referenciado por |
|---|---|
| ADR-001 | TECHNICAL_GOVERNANCE, CHANGE_MANAGEMENT, RELEASE_GOVERNANCE, PR template, CI |
| ADR-002 | TECHNICAL_GOVERNANCE, Domain-Boundaries, REPOSITORY_TOPOLOGY, **AEK RULE-DI-001/002/003**, CI |
| ADR-003 | SECURITY_GOVERNANCE, TENANT_ISOLATION_REPORT, Domain-Boundaries, PR template |
| ADR-004 | TECHNICAL_GOVERNANCE, Domain-Boundaries (Dental), Repository-Governance |
| ADR-005 | QUALITY_GATES, CHANGE_MANAGEMENT, RELEASE_GOVERNANCE, CI (OpenAPI stage) |
| ADR-006 | SECURITY_GOVERNANCE, RELEASE_GOVERNANCE, Repository-Governance, PR template |
| ADR-007 | REPOSITORY_MANIFEST, REPOSITORY_TOPOLOGY, Domain-Boundaries |
| ADR-008 | Architectural-Truth-Matrix, PROGRAM_CHARTER, CHANGE_MANAGEMENT, CODEOWNERS |

## 4. Cobertura de enforcement automatizado

| ADR | ¿Enforcement automatizado hoy? | Mecanismo |
|---|---|---|
| ADR-002 | ✅ Sí | AEK (3 reglas, 0 findings) en CI |
| ADR-001 / ADR-005 | ⚠️ Parcial | OpenAPI stage advisory (sin tooling committeado — TD-04) |
| ADR-003 | ⚠️ Parcial | RLS en DB + tests de aislamiento (acoplados a infra — TD-02) |
| ADR-006 | ⚠️ Parcial | Triggers DB `prevent_modification()`; sin gate de CI dedicado |
| ADR-004 | ❌ Revisión manual | Pureza verificada por revisión + tests |
| ADR-007 | ⚠️ Parcial | AEK RULE-DI-002/003 cubren aislamiento dental |
| ADR-008 | ❌ Revisión manual | Jerarquía de verdad aplicada por revisores |

> Brechas de enforcement → ver [EXECUTABLE_GOVERNANCE_ASSESSMENT.md](./EXECUTABLE_GOVERNANCE_ASSESSMENT.md).

## 5. ADR pendientes (propuestos, NO creados)

| ADR propuesto | Tema | Origen |
|---|---|---|
| ADR-009 | Ubicación canónica de ADR/gobernanza | TD-10 / E0 |
| ADR-010 | Consolidación del Integration Contract | TD-08 / E0 |
| ADR-011 | Ciclo de vida documental + retiro de duplicados | TD-07 / E0 |
| ADR-012 (sugerido) | Destino de `src/vertical2` (cuarentena/legacy) | TD-01 / BC-1 |
