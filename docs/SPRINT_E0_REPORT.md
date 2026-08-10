# SPRINT_E0_REPORT.md
> **Vytalix Platform — Sprint Enterprise E0 · Informe de Consolidación de Gobernanza**

| Campo | Valor |
|---|---|
| Sprint | E0 — Fortalecimiento de gobernanza |
| Rama | `adr/baseline-2026` |
| Modo | Implementación controlada (solo gobernanza) |
| Estado | COMPLETADO |
| Fecha | 2026-06 |

---

## 0. Resumen ejecutivo

Sprint E0 consolidó la gobernanza del repositorio **sin tocar lógica funcional**. Se creó una capa de gobernanza corporativa nueva (`docs/governance/`) compuesta por un índice maestro y seis documentos normativos de proceso, **todos como capa de agregación que referencia la autoridad existente** (ADR-001…008 y TRD) sin duplicarla ni reescribirla.

No se modificó ningún archivo bajo `src/`, `frontend-dental/src/`, `prisma/`, `openapi/` ni `tests/`. No se eliminó ningún archivo. No se crearon nuevos ADR. Se identificaron duplicidades y defectos estructurales que se documentan aquí como recomendaciones para Sprint E1 (no se ejecutaron, por respetar las reglas de no-eliminación y no-modificación de `src/`).

---

## 1. Documentos encontrados (auditoría)

### 1.1 `docs/` (raíz de documentación de plataforma) — 40 archivos

Arquitectura: `ARCHITECTURE.md`, `ARCHITECTURE_REPO_STRUCTURE.md`, `VYTALIX_PLATFORM_ARCHITECTURE.md`, `CLINICAL_ARCHITECTURE.md`, `NARRATIVA_TECNICA.md`.
Integración / contratos: `API_CONTRACTS_V2.md`, `INTEGRATION_GUIDE.md`, `INTEGRATION_GUIDE_V2.md`, `INTEGRATION_CONTRACT_v1.1.md/` (directorio), `PHASE1_GOVERNANCE_PACKAGE_v1.md`, `SDK_QUICKSTART.md`, `PARTNER_FAQ.md`, `PARTNER_PACKAGE.md`.
Disglobal: `DISGLOBAL_COMMERCIAL_PACKAGE.md`, `DISGLOBAL_PILOT_READINESS.md`, `DISGLOBAL_READY_FOR_PILOT.md`.
Seguridad / operación: `SECURITY_HARDENING_REPORT.md`, `TENANT_ISOLATION_REPORT.md`, `AUTH_FLOW.md`, `OBSERVABILITY_READINESS.md`, `RUNBOOK.md`, `FAILURE_RUNBOOK.md`, `DRY_RUNS.md`.
Estado / entrega: `SYSTEM_AUDIT.md`, `SYSTEM_STATUS.md`, `RELEASE_CANDIDATE_REPORT.md`, `FINAL_DELIVERY_REPORT.md`, `ROADMAP_RISKS_CONCLUSION.md`, `REPO_ORGANIZATION_PLAN.md`, `DEMO_PACKAGE.md`, `DEMO_RUNBOOK.md`, `VYTALIX_README.md`.
Dental (en `docs/dental/` y raíz): `DENTAL_ROADMAP.md`, `CFE_DENTAL_API_CONTRACTS.md`, `CFE_DENTAL_ALIGNMENT_REPORT.md`, `CFE_DENTAL_HARDENING_AUDIT.md`, `CFE_DENTAL_OPENAPI_SYNC.md`, `CFE_DENTAL_REPOSITORY_CONSISTENCY.md`, `dental/CFE_DENTAL_ARCHITECTURE.md`, `dental/CFE_DENTAL_DOMAIN_MODEL.md`, `dental/CFE_DENTAL_FINANCIAL_FLOW.md`, `dental/CFE_DENTAL_SPRINTS_CLOSURE.md`.
Vertical 2: `vertical2/ARCHITECTURE.md`, `vertical2/DISGLOBAL_QUICKSTART.md`, `vertical2/OPENAPI-v2-commerce.yaml`.

### 1.2 `src/dental/docs/` — autoridad técnica (TRD + ADR)

- `Architectural-Truth-Matrix.md` (75 líneas, estado "Proposed → Candidate Official").
- `trd/Architectural-Truth-Matrix.md` (112 líneas, estado "ACTIVO — autoridad normativa").
- `trd/Domain-Boundaries.md`, `trd/Repository-Governance.md`.
- `trd/adr/ADR-001 … ADR-008` (8 ADR, todos `Accepted`).

---

## 2. Documentos reutilizados (no modificados)

La nueva capa de gobernanza **enlaza y referencia** los siguientes documentos en su ubicación canónica, sin alterarlos:

- ADR-001 … ADR-008 (`src/dental/docs/trd/adr/`).
- `Architectural-Truth-Matrix.md`, `Domain-Boundaries.md`, `Repository-Governance.md` (`src/dental/docs/trd/`).
- Reportes de plataforma: `VYTALIX_PLATFORM_ARCHITECTURE.md`, `CLINICAL_ARCHITECTURE.md`, `SECURITY_HARDENING_REPORT.md`, `TENANT_ISOLATION_REPORT.md`, `AUTH_FLOW.md`, `OBSERVABILITY_READINESS.md`, `RUNBOOK.md`, `FAILURE_RUNBOOK.md`, `DISGLOBAL_PILOT_READINESS.md`, `RELEASE_CANDIDATE_REPORT.md`, `FINAL_DELIVERY_REPORT.md`, `SYSTEM_STATUS.md`, `SYSTEM_AUDIT.md`, `PHASE1_GOVERNANCE_PACKAGE_v1.md`.

---

## 3. Documentos nuevos (creados en E0)

Todos bajo `docs/governance/` (directorio nuevo), como capa de agregación:

| Documento | Rol |
|---|---|
| `docs/governance/README.md` | Índice maestro: ADR, TRD, arquitectura, contratos, seguridad, reglas |
| `docs/governance/PROGRAM_CHARTER.md` | Propósito, partes, principios rectores, invariantes clínicos |
| `docs/governance/TECHNICAL_GOVERNANCE.md` | Jerarquía de verdad, bounded contexts, dependencias, AEK, OpenAPI |
| `docs/governance/SECURITY_GOVERNANCE.md` | Zero Trust, invariantes de seguridad, privacidad |
| `docs/governance/QUALITY_GATES.md` | Gates obligatorios, CI, AEK, checklist |
| `docs/governance/CHANGE_MANAGEMENT.md` | Clasificación de cambios, flujo de ADR, excepciones, IA |
| `docs/governance/RELEASE_GOVERNANCE.md` | GO/NO-GO, versionado, migraciones, entornos, rollback |

Y este informe: `docs/SPRINT_E0_REPORT.md`.

> Verificación: los enlaces relativos de la capa de gobernanza hacia ADR/TRD/reportes/`openapi/` fueron comprobados y resuelven correctamente en disco.

---

## 4. Duplicidades detectadas

| # | Duplicidad | Detalle | Acción tomada |
|---|---|---|---|
| D-1 | **Architectural-Truth-Matrix duplicado** | `src/dental/docs/Architectural-Truth-Matrix.md` (75 líneas, narrativa antigua "Proposed") vs `src/dental/docs/trd/Architectural-Truth-Matrix.md` (112 líneas, "ACTIVO — autoridad normativa"). Contenido divergente; la versión `trd/` se declara canónica. | **No eliminada** (Rule 1: bajo `src/`; Rule 2: no eliminar). Documentada para E1. La capa de gobernanza enlaza solo la versión canónica (`trd/`). |
| D-2 | **Integration Contract: dos copias del mismo byte-count** | `docs/INTEGRATION_CONTRACT_v1.1.md/` es un **directorio** (no archivo) que contiene `DOCUMENTO EJECUTIVO — Insurtech Integration Contract v1.1` y `…v1.md`, ambos de 3062 bytes (probables duplicados). | **No modificada/eliminada.** Documentada para E1. |
| D-3 | **Solapamiento de estructura de repo** | `docs/ARCHITECTURE_REPO_STRUCTURE.md`, `docs/REPO_ORGANIZATION_PLAN.md` y la estructura en `Repository-Governance.md` describen el árbol del repo con solapamiento parcial. | **No consolidada** (no destructivo; bajo `src/` el tercero). Recomendación de consolidación en E1. |

---

## 5. Defectos estructurales detectados

| # | Defecto | Impacto | Recomendación |
|---|---|---|---|
| S-1 | **`docs/INTEGRATION_CONTRACT_v1.1.md` es un directorio**, no un archivo `.md`. Sus archivos internos tienen nombres con espacios, em-dash y uno truncado (`…v1.md`). | Enlaces frágiles; el "archivo" no abre como documento; ruptura potencial de herramientas de docs. | E1: consolidar en un único `docs/INTEGRATION_CONTRACT_v1.1.md` (archivo). Requiere eliminar duplicado → fuera del alcance de E0 (no-eliminación). |
| S-2 | **Discrepancia nombre-de-carpeta vs título-de-ADR.** 5 de 8 ADR: carpeta "ADR-001 Arquitectura Hexagonal" → título real "ADR-001 — Arquitectura API-First"; "ADR-004 OpenAPI First" → "Motores puros para lógica dental"; "ADR-005 pnpm + Turborepo" → "OpenAPI como contrato único"; "ADR-007 Event Driven Integration" → "Dental como vertical autónoma"; "ADR-008 Satellite Domains" → "Gobernanza arquitectónica y jerarquía de verdad". | Confusión de navegación; un lector que confíe en el nombre de carpeta malinterpreta la decisión. | E1: normalizar nombres de carpeta a los títulos reales **sin alterar la decisión** (Rule 4 permite normalizar formato/referencias). Bajo `src/` → requiere decisión explícita. La capa de gobernanza ya enlaza por **título real** y advierte la discrepancia. |
| S-3 | **ADR alojados bajo la vertical dental** (`src/dental/docs/trd/adr/`) pese a aplicar a toda la plataforma. | Ubicación contraintuitiva para gobernanza global. | E1: evaluar reubicación a `docs/adr/` o `docs/governance/adr/` con redirección. Implica mover archivos bajo `src/` → decisión arquitectónica formal. |

---

## 6. Recomendaciones (consolidadas)

1. **Resolver D-1**: promover formalmente `trd/Architectural-Truth-Matrix.md` como única y marcar/retirar la copia de `src/dental/docs/` (con registro de cambio).
2. **Resolver S-1/D-2**: colapsar el directorio `INTEGRATION_CONTRACT_v1.1.md` a un único archivo canónico.
3. **Resolver S-2**: normalizar nombres de carpeta de ADR a sus títulos reales.
4. **Evaluar S-3**: decidir si los ADR se reubican a una raíz de gobernanza global.
5. **Consolidar D-3**: unificar la descripción de estructura del repo en una sola fuente, referenciada por las demás.

> Todas las recomendaciones 1–5 implican **eliminar, mover o modificar archivos existentes (varios bajo `src/`)**, lo que está fuera del alcance de E0 por las reglas de no-eliminación y no-modificación de `src/`. Se difieren a Sprint E1 con autorización explícita.

---

## 7. Riesgos encontrados

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Doble fuente de verdad en Truth-Matrix (D-1) puede inducir decisiones sobre la versión obsoleta | MEDIO | Capa de gobernanza enlaza solo la canónica; resolver en E1 |
| Nombres de ADR engañosos (S-2) inducen malinterpretación de decisiones | MEDIO | README de gobernanza enlaza por título real y advierte; normalizar en E1 |
| Directorio-como-archivo (S-1) rompe herramientas de documentación | BAJO | Documentado; consolidar en E1 |
| Proliferación de reportes de estado/entrega solapados puede generar deriva documental | BAJO | Índice maestro centraliza la navegación |

---

## 8. Documentos pendientes para Sprint E1

ADR nuevos a evaluar (no creados en E0, solo identificados):

| Propuesta | Motivo |
|---|---|
| **ADR-009 — Ubicación canónica de gobernanza y ADR** | Formalizar si ADR/TRD se reubican a una raíz global y cómo se redirige (resuelve S-3). |
| **ADR-010 — Consolidación de contratos de integración** | Decidir el archivo canónico único de Integration Contract (resuelve S-1/D-2). |
| **ADR-011 — Política de ciclo de vida documental** | Estado obligatorio (DRAFT/ACTIVO/DEPRECADO) y retiro de duplicados (resuelve D-1/D-3). |

Documentos de gobernanza a considerar en E1: `DATA_GOVERNANCE.md` (retención/PHI), `INCIDENT_RESPONSE.md` (formalizar sobre `FAILURE_RUNBOOK.md`), `DEPENDENCY_GOVERNANCE.md`.

---

## 9. Verificación de criterios de éxito

| Criterio | Resultado |
|---|---|
| ✓ Ningún archivo funcional modificado | **CUMPLE** — solo se crearon archivos nuevos en `docs/` |
| ✓ Ninguna prueba afectada | **CUMPLE** — `tests/` intacto |
| ✓ Ningún contrato OpenAPI modificado | **CUMPLE** — `openapi/` intacto |
| ✓ Ninguna regla del AEK vulnerada | **CUMPLE** — `tools/aek/` intacto; sin cambios en `src/**/*.ts` |
| ✓ Gobernanza consolidada | **CUMPLE** — capa `docs/governance/` con índice maestro |
| ✓ Documentación navegable | **CUMPLE** — enlaces verificados en disco |
| ✓ Ningún archivo eliminado | **CUMPLE** |
| ✓ Ningún ADR nuevo creado | **CUMPLE** — solo identificados para E1 |

---

## 10. Detención por decisión arquitectónica

Conforme a la regla de detención del sprint: las acciones que implicaban **mover o eliminar archivos existentes** (consolidar el directorio Integration Contract, retirar la copia duplicada de Truth-Matrix, renombrar carpetas de ADR, reubicar ADR) fueron **detenidas y documentadas** en las secciones 5–8, no ejecutadas. Requieren autorización explícita y, en varios casos, un ADR nuevo en Sprint E1.
