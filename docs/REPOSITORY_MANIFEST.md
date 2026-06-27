# REPOSITORY_MANIFEST.md
> **Vytalix Platform — Official Repository Manifest**

| Campo | Valor |
|---|---|
| Documento | Identidad oficial del repositorio |
| Estado | ACTIVO — autoridad de identidad |
| Rama baseline | `adr/baseline-2026` |
| Sprint de origen | E2 — Repository Normalization & Executable Governance |
| Última revisión | 2026-06 |

> Este documento es la **identidad canónica** del repositorio. No redefine decisiones arquitectónicas (residen en los ADR) ni reglas estructurales (residen en los TRD). Ante contradicción, prevalece la jerarquía de verdad de **ADR-008**.

---

## 1. Platform Identity

| Atributo | Valor |
|---|---|
| Nombre | Vytalix Clinical Intelligence Platform |
| Paquete | `vytalix-clinical-engine` (`package.json`) |
| Versión | `0.9.0-demo` |
| Tipo | Plataforma de inteligencia clínica preventiva, API-first, multitenant |
| Autoridad clínica | Doctor Antivejez |
| Canal de distribución/pago | Disglobal (partner) |
| Modelo | Monorepo con verticales satélite |

## 2. Baseline Version

| Atributo | Valor |
|---|---|
| Baseline oficial | **BASELINE 2026** |
| Rama | `adr/baseline-2026` |
| Certificación vigente | **CERTIFIED WITH OBSERVATIONS** (BC-1) |
| Readiness arquitectónica (núcleo) | ≈ 87/100 |
| Madurez de calidad | ≈ 79/100 |
| AEK | 3 reglas, 0 findings |

## 3. Certification History

| Sprint | Entregable | Resultado |
|---|---|---|
| E0 | Consolidación de gobernanza (`docs/governance/`) | Capa corporativa establecida |
| E1 | Gates de calidad automatizados (CI + GitHub governance) | Pipeline operativo; gates parciales |
| BC-1 | Baseline Certification | **CERTIFIED WITH OBSERVATIONS** |
| E2 | Repository Normalization & Executable Governance | Este manifiesto + topología + trazabilidad |

Referencias: [SPRINT_E0_REPORT.md](./SPRINT_E0_REPORT.md) · [SPRINT_E1_REPORT.md](./SPRINT_E1_REPORT.md) · [BASELINE_CERTIFICATION_REPORT_BC1.md](./BASELINE_CERTIFICATION_REPORT_BC1.md)

## 4. Repository Scope

El repositorio contiene: la capa de inteligencia clínica (Core/Longevity), la plataforma multitenant (Platform), la capa HTTP/API, la vertical satélite Dental (backend + `frontend-dental`), la capa Partner (SDK Disglobal + `/api/v2/*`), el sandbox de integración determinista, el enforcement de arquitectura (AEK), la gobernanza (`docs/governance/`) y la automatización CI (`.github/`).

## 5. Domain Inventory & Bounded Contexts

| Bounded Context | Raíz | Archivos `.ts(x)` | Autoridad |
|---|---|---:|---|
| Core Clinical | `src/core/`, `src/longevity/`, `src/shared/` | 4 / 5 / 13 | ADR-002 |
| Platform | `src/platform/`, `src/api/middlewares/`, `src/api/pipelines/` | 8 | ADR-003 |
| Commercial / API | `src/api/handlers/`, `openapi/` | 21 (api total) | ADR-001/004/005 |
| Dental (satélite) | `src/dental/`, `frontend-dental/` | 19 | ADR-007/008 |

Definición canónica: [Domain-Boundaries.md](../src/dental/docs/trd/Domain-Boundaries.md).

## 6. Repository Classification

| Clase | Componentes |
|---|---|
| **Production** | `src/core`, `src/platform`, `src/dental`, `src/longevity`, `src/api`, `src/shared`, `tools/aek` |
| **Stable / Conditional** | Partner Layer (`disglobal-client` + `/api/v2/*`), CI gates |
| **Experimental** | `src/vertical2` (no compila — aislado/excluido) |
| **Deprecated** | `src/legacy` (aislado, no productivo) |

Detalle: [REPOSITORY_TOPOLOGY.md](./REPOSITORY_TOPOLOGY.md) · [ARCHITECTURE_READINESS_SCORECARD.md](./ARCHITECTURE_READINESS_SCORECARD.md).

## 7. Release Policy

- Contratos OpenAPI versionados; cambio incompatible ⇒ nuevo prefijo (`v3`) o deprecación con periodo de gracia.
- Migraciones aditivas; sin eliminación de columna/tabla sin ciclo de deprecación.
- GO/NO-GO según [RELEASE_GOVERNANCE.md](./governance/RELEASE_GOVERNANCE.md).

## 8. Deployment Policy

- Entornos: Local · Sandbox (aislado) · Producción.
- **Simulación y producción permanecen aisladas** (sandbox fuera del scope de AEK; no importa de `src/`).
- Vertical2 y Legacy **excluidos** del build/runtime productivo.

## 9. Branch Policy

- Rama baseline activa: `adr/baseline-2026`.
- Branch protection recomendada (no aplicada aún): required check `Quality Gates`, CODEOWNERS review, conversación resuelta, rama actualizada. Ver [QUALITY_GATES.md §2.3](./governance/QUALITY_GATES.md).

## 10. ADR Authority

ADR-001…008 (estado **Accepted**) en `src/dental/docs/trd/adr/` son autoridad de Nivel 2. No se editan; las nuevas decisiones se emiten como ADR ≥ 009. Mapeo: [ADR_TRACEABILITY_MATRIX.md](./ADR_TRACEABILITY_MATRIX.md).

## 11. Governance Authority

| Capa | Fuente canónica |
|---|---|
| Identidad | Este manifiesto |
| Proceso corporativo | [docs/governance/](./governance/README.md) |
| Estructura/zonas | [Repository-Governance.md](../src/dental/docs/trd/Repository-Governance.md) |
| Fronteras de dominio | [Domain-Boundaries.md](../src/dental/docs/trd/Domain-Boundaries.md) |
| Jerarquía de verdad | [Architectural-Truth-Matrix.md](../src/dental/docs/trd/Architectural-Truth-Matrix.md) (canónica en `trd/`) |

## 12. Ownership Matrix

Definida en [.github/CODEOWNERS](../.github/CODEOWNERS). Resumen:

| Path | Owner |
|---|---|
| `/docs/governance/`, `/src/dental/docs/trd/` | @rhjardine |
| `/.github/`, `/tools/aek/`, `/Makefile` | @rhjardine |
| `/openapi/`, `/prisma/`, `/src/platform/db.ts`, `/src/api/middlewares/` | @rhjardine |
| `/src/core/`, `/src/longevity/`, `/src/dental/` | @rhjardine |

## 13. Partner Boundaries

- Disglobal consume **únicamente** `/api/v2/*` (API Key + scopes). El back-office clínico usa `/v1/*` (JWT + `X-Tenant-ID`).
- Pseudonimización HMAC-SHA256 obligatoria: el `userId` real nunca cruza a Vytalix.
- Contrato Partner con brechas abiertas (TD-11): apto para **piloto controlado**. Ver [PHASE1_GOVERNANCE_PACKAGE_v1.md](./PHASE1_GOVERNANCE_PACKAGE_v1.md).

## 14. Technical Authorities

| Dominio de verdad | Autoridad |
|---|---|
| Contratos HTTP | OpenAPI (`openapi/`) — Nivel 1 |
| Esquema de datos | `prisma/schema.prisma` + migraciones — Nivel 1 |
| Aislamiento de arquitectura | AEK (`tools/aek/`) — ejecutable, Nivel 1 |
| Decisiones | ADR-001…008 — Nivel 2 |
| Seguridad | [SECURITY_GOVERNANCE.md](./governance/SECURITY_GOVERNANCE.md) + hardening reports |

---

> Documentos hermanos de E2: [REPOSITORY_TOPOLOGY.md](./REPOSITORY_TOPOLOGY.md) · [ADR_TRACEABILITY_MATRIX.md](./ADR_TRACEABILITY_MATRIX.md) · [ENGINEERING_GOVERNANCE_ROADMAP.md](./ENGINEERING_GOVERNANCE_ROADMAP.md) · [EXECUTABLE_GOVERNANCE_ASSESSMENT.md](./EXECUTABLE_GOVERNANCE_ASSESSMENT.md).
