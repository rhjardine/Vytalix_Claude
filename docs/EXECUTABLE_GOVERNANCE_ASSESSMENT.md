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
| Reglas activas | RULE-DI-001, RULE-DI-002, RULE-DI-003 (todas ADR-002) |
| Findings | 0 |
| Scope de análisis | `src/**/*.{ts,tsx}` (dependency graph) |
| Componentes | `analyzers/dependency-graph`, `core`, `policy/registry`, `rules/adr-002`, `reporters`, `cli` |
| Integración CI | `ci.yml` (stage 8) + `aek-governance.yml` |

## 2. Clasificación de reglas de gobernanza

### 2.1 Already Automated ✅
| Regla | Mecanismo |
|---|---|
| Aislamiento de dominio (ADR-002) | AEK RULE-DI-001/002/003 |
| Composition Root exemption | AEK RULE-DI-001 |
| Aislamiento dental ↔ core/longevity (ADR-007) | AEK RULE-DI-002/003 |
| Gate de arquitectura en PR | CI (AEK stage, bloqueante) |
| Suite determinista de integración | `sandbox:test` (bloqueante) |
| Validez de esquema Prisma | `prisma validate` (bloqueante) |

### 2.2 Can Be Automated 🟡 (no invasivo, sin tocar análisis de código productivo)
| Regla / política | Enforcement propuesto | Esfuerzo |
|---|---|---|
| **Repository topology validation** | Checker que valida el árbol contra `REPOSITORY_TOPOLOGY.md` (zonas esperadas, no archivos sueltos en raíz) | Bajo |
| **Repository hygiene** | Lint de archivos prohibidos en raíz (`*.diff`, `debug_*`, `refactor*`, `fix-imports*`, `payload.json`) | Bajo |
| **Experimental isolation** | Verificar que `src/server.ts` y dominios productivos NO importan `src/vertical2/` ni `src/legacy/` | Medio (extensión del dependency graph existente) |
| **ADR integrity** | Validar que cada carpeta ADR tiene `ADR-NNN.md`, estado declarado, y que nombre de carpeta ≈ título (detecta TD-09) | Bajo |
| **Documentation consistency** | Link-checker de rutas relativas en `docs/governance/` (detecta enlaces rotos) | Bajo |
| **Baseline validation** | Verificar presencia/coherencia de los documentos de baseline (manifest, topology, matrix) | Bajo |
| **OpenAPI validation** | Adoptar Redocly/Spectral committeado + `oasdiff` (breaking-change) | Medio (TD-04) |
| **Duplicate-doc detection** | Hash/diff de documentos canónicos vs duplicados (detecta TD-07/08) | Bajo |

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

## 3. AEK Evolution Roadmap (diseño — NO implementado en E2)

> Principio: **aditivo y no invasivo**. Las nuevas capacidades serían *governance analyzers* separados del `dependency-graph` de producción; las reglas DI-001/002/003 permanecen intactas.

| Fase | Capacidad | Tipo | ADR/Deuda |
|---|---|---|---|
| **AEK v1.1 (E3)** | Experimental isolation rule (RULE-ISO-00x): prohíbe import de `vertical2`/`legacy` desde producción | Extensión del graph existente | TD-01 / ADR-007 |
| **AEK v1.2 (E3)** | Repository hygiene analyzer (archivos sueltos en raíz) | Analyzer nuevo (no toca producción) | TD-05 |
| **AEK v1.3 (E4)** | ADR integrity + documentation link checker | Analyzer de gobernanza | TD-09 / TD-07 |
| **AEK v1.4 (E4)** | Baseline/topology validator | Analyzer de gobernanza | E2 outputs |
| **AEK v2.0 (RC1)** | OpenAPI contract-drift + append-only static checks | Analyzers avanzados | ADR-001/005/006 |

## 4. Modelo de severidad propuesto (diseño)

| Severidad | Comportamiento en CI |
|---|---|
| `error` | Bloqueante (como las reglas DI actuales) |
| `warning` | Advisory (reporta, no bloquea) — para reglas nuevas en rodaje |
| `info` | Solo reporte/telemetría |

> Las reglas nuevas se introducirían como `warning` y se promoverían a `error` tras un periodo de estabilización, evitando regresiones de CI (consistente con la estrategia advisory de E1).

## 5. Resumen ejecutivo del assessment

- **6 políticas ya automatizadas** (núcleo de arquitectura, el más crítico).
- **8 políticas automatizables** de forma no invasiva (topología, higiene, aislamiento experimental, integridad ADR, consistencia docs, baseline, OpenAPI, duplicados).
- **5 requieren revisión manual** por naturaleza semántica/comercial.
- **4 mejoras futuras** de mayor esfuerzo.

> Recomendación: priorizar **Experimental isolation** (AEK v1.1) en E3 — convierte una convención frágil (TD-01) en invariante ejecutable, reforzando la condición de certificación de BC-1.
