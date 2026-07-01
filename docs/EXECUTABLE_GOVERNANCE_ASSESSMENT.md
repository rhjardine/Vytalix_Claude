# EXECUTABLE_GOVERNANCE_ASSESSMENT.md
> **Vytalix Platform — Executable Governance Assessment & AEK Evolution Roadmap**

| Campo | Valor |
|---|---|
| Estado | ACTIVO — assessment |
| Rama | `adr/baseline-2026` |
| Sprint de origen | E2 |
| Última revisión | 2026-06 |

> Identifica qué reglas de gobernanza pueden hacerse ejecutables y diseña la evolución no invasiva del AEK. **No modifica las reglas de AEK existentes** ni el análisis de código productivo. Diseño/roadmap únicamente.

---

## 1. AEK — estado actual (línea base)

| Atributo | Valor |
|---|---|
| Versión AEK | **v1.1** (Sprint E3-A — capa de gobernanza añadida) |
| Reglas de arquitectura (bloqueantes) | RULE-DI-001, RULE-DI-002, RULE-DI-003 (ADR-002) — 0 findings |
| Reglas de gobernanza (WARNING-only) | **RULE-ISO-001, RULE-HYG-001, RULE-DOC-001, RULE-ADR-001** |
| Scope de análisis | `src/**/*.{ts,tsx}` (dependency graph) + filesystem snapshot (gobernanza) |
| Componentes | `analyzers/dependency-graph`, `core`, `policy/registry`, `rules/adr-002`, `reporters`, `cli`, **`governance/` (analyzers + rules + engine + health-report)** |
| Integración CI | `ci.yml` (stage 8 bloqueante + stage 8b governance health advisory) + `aek-governance.yml` |
| Salud de gobernanza (E3-A) | Overall 82/100 (OBSERVE); 13 warnings — arquitectura/aislamiento/docs en 100 |

> **Separación de responsabilidades (E3-A):** las reglas de gobernanza son WARNING-only y **nunca** son leídas por el policy gate (que solo cuenta los findings ADR-002). El exit code y el baseline certificado BC-1 permanecen intactos.

## 2. Clasificación de reglas de gobernanza

### 2.1 Already Automated ✅
| Regla | Mecanismo | Severidad |
|---|---|---|
| Aislamiento de dominio (ADR-002) | AEK RULE-DI-001/002/003 | error (bloqueante) |
| Composition Root exemption | AEK RULE-DI-001 | error (bloqueante) |
| Aislamiento dental ↔ core/longevity (ADR-007) | AEK RULE-DI-002/003 | error (bloqueante) |
| Gate de arquitectura en PR | CI (AEK stage, bloqueante) | error |
| Suite determinista de integración | `sandbox:test` (bloqueante) | error |
| Validez de esquema Prisma | `prisma validate` (bloqueante) | error |
| **Experimental isolation (E3-A)** | **AEK RULE-ISO-001** (prod ↛ `vertical2`/`legacy`) | **warning** |
| **Repository hygiene (E3-A)** | **AEK RULE-HYG-001** (archivos sueltos en raíz) | **warning** |
| **Mandatory governance docs (E3-A)** | **AEK RULE-DOC-001** (presencia de docs canónicos) | **warning** |
| **ADR integrity (E3-A)** | **AEK RULE-ADR-001** (doc/estado/drift nombre-título) | **warning** |

### 2.2 Can Be Automated 🟡 (no invasivo, sin tocar análisis de código productivo)
| Regla / política | Enforcement propuesto | Esfuerzo |
|---|---|---|
| **Repository topology validation** | Checker que valida el árbol contra `REPOSITORY_TOPOLOGY.md` (zonas esperadas) | Bajo |
| **Documentation consistency** | Link-checker de rutas relativas en `docs/governance/` (detecta enlaces rotos) | Bajo |
| **Baseline validation** | Verificar presencia/coherencia de los documentos de baseline (manifest, topology, matrix) | Bajo |
| **OpenAPI validation** | Adoptar Redocly/Spectral committeado + `oasdiff` (breaking-change) | Medio (TD-04) |
| **Duplicate-doc detection** | Hash/diff de documentos canónicos vs duplicados (detecta TD-07/08) | Bajo |

> **Entregado en E3-A:** Experimental isolation, Repository hygiene, Mandatory governance docs y ADR integrity pasaron de "Can Be Automated" a "Already Automated" (como reglas WARNING-only de AEK v1.1).

### 2.3 Manual Review Required 🔵
| Regla | Razón |
|---|---|
| Pureza de motores (ADR-004) | Requiere juicio semántico (efectos secundarios sutiles) |
| Jerarquía de verdad (ADR-008) | Resolución de conflictos contextual |
| "Sin lógica de negocio en routers" | Heurística semántica, alto falso-positivo si se automatiza ingenuamente |
| Verificación de salida de IA contra Nivel 1 | Por definición, revisión humana |
| Reconciliación de modelo de comisiones (TD-11) | Decisión comercial/legal |

### 2.4 Future Enhancement 🟣
| Capacidad | Descripción |
|---|---|
| Append-only enforcement como gate de CI (ADR-006) | Verificación estática de mutaciones a tablas inmutables |
| RLS coverage check | Validar que toda tabla de tenant tiene `CREATE POLICY` |
| Contract-drift detection | Comparar handlers Express vs OpenAPI automáticamente |
| Coverage gate | Umbral mínimo cuando la suite sea estable en CI (post TD-02) |

## 3. AEK Evolution Roadmap

> Principio: **aditivo y no invasivo**. Las capacidades de gobernanza son *governance analyzers* separados del `dependency-graph` de producción; las reglas DI-001/002/003 permanecen intactas.

| Fase | Capacidad | Tipo | Estado |
|---|---|---|---|
| **AEK v1.1 (E3-A)** | RULE-ISO-001 — experimental isolation (`vertical2`/`legacy`) | Regla de gobernanza (usa dependency graph) | ✅ **ENTREGADO** |
| **AEK v1.1 (E3-A)** | RULE-HYG-001 — repository hygiene (archivos sueltos en raíz) | Analyzer filesystem | ✅ **ENTREGADO** |
| **AEK v1.1 (E3-A)** | RULE-DOC-001 — mandatory governance docs | Analyzer filesystem | ✅ **ENTREGADO** |
| **AEK v1.1 (E3-A)** | RULE-ADR-001 — ADR integrity + drift nombre/título | Analyzer filesystem | ✅ **ENTREGADO** |
| **AEK v1.1 (E3-A)** | Health report (6 dimensiones + overall) | Reporter enriquecido | ✅ **ENTREGADO** |
| **AEK v1.2 (E4)** | Documentation link-checker + duplicate-doc detection | Analyzer de gobernanza | Pendiente (TD-07) |
| **AEK v1.3 (E4)** | Baseline/topology validator | Analyzer de gobernanza | Pendiente (E2 outputs) |
| **AEK v2.0 (RC1)** | OpenAPI contract-drift + append-only static checks | Analyzers avanzados | Pendiente (ADR-001/005/006) |

> Promoción de severidad: las reglas v1.1 nacen `warning`. Su promoción a `error` (bloqueante) se evalúa en E4/RC1 **una vez resuelta la deuda subyacente** (p. ej. RULE-ISO-001 → `error` tras decidir el destino de `vertical2` en TD-01). Promover ahora rompería CI sobre deuda fuera de alcance.

## 4. Modelo de severidad propuesto (diseño)

| Severidad | Comportamiento en CI |
|---|---|
| `error` | Bloqueante (como las reglas DI actuales) |
| `warning` | Advisory (reporta, no bloquea) — para reglas nuevas en rodaje |
| `info` | Solo reporte/telemetría |

> Las reglas nuevas se introducirían como `warning` y se promoverían a `error` tras un periodo de estabilización, evitando regresiones de CI (consistente con la estrategia advisory de E1).

## 5. Resumen ejecutivo del assessment (post E3-A)

- **10 políticas ya automatizadas** — 6 de arquitectura (bloqueantes) + **4 de gobernanza nuevas** (WARNING-only, AEK v1.1).
- **5 políticas automatizables** restantes de forma no invasiva (topología, consistencia docs, baseline, OpenAPI, duplicados).
- **5 requieren revisión manual** por naturaleza semántica/comercial.
- **4 mejoras futuras** de mayor esfuerzo.

> E3-A entregó la capa de gobernanza ejecutable de AEK v1.1: convirtió 4 convenciones frágiles en señales ejecutables (WARNING-only), enriqueció el reporte con 6 dimensiones de salud, y dejó el baseline certificado BC-1 y el exit code completamente intactos. Próximo paso (E4): link-checker/duplicados y, condicionado a TD-01, promover RULE-ISO-001 a bloqueante.
