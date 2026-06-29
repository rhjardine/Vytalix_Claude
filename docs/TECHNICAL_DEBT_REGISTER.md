# TECHNICAL_DEBT_REGISTER.md
> **Vytalix Platform — Technical Debt Register (Baseline BC-1)**

| Campo | Valor |
|---|---|
| Sprint | BC-1 — Baseline Certification |
| Rama | `adr/baseline-2026` |
| Estado | Registro consolidado (read-only) |
| Fecha | 2026-06 |
| Regla | **No se corrige ninguna deuda en este sprint.** Solo registro. |

Consolidación priorizada de la deuda técnica observada durante la certificación, incluyendo la heredada de los informes de Sprint E0 y E1. Prioridad: **P0** (bloquea baseline productivo), **P1** (debe resolverse antes de escalar), **P2** (mejora de calidad/higiene).

---

## 1. Registro priorizado

| ID | Descripción | Impacto | Riesgo | Prioridad | Sprint recomendado |
|---|---|---|---|---|---|
| **TD-01** | ✅ **RESUELTO (E3-B)** — `src/vertical2/` (app.ts + db.ts) era un prototipo huérfano no compilable que importaba módulos inexistentes. **Eliminado** (`git rm`); sin imports entrantes desde producción. Eliminó 5 de los 122 errores de typecheck y desbloquea la promoción de RULE-ISO-001. | — (cerrado) | — | **E3-B ✓** |
| **TD-02** | Suite de integración acoplada a infraestructura: 19 tests (8 archivos, p. ej. `tests/risk-scoring.test.ts`) requieren PostgreSQL/Redis en vivo (`ECONNREFUSED`). 414 pasan sin infra. | Vitest full y Coverage no pueden ser gates bloqueantes en runner limpio. | MEDIO | **P1** | E2 |
| **TD-03** | ESLint `^8.56.0` instalado sin archivo de configuración ni `eslintConfig`. | `pnpm lint` falla por "No ESLint configuration found"; stage 9 advisory. | MEDIO | **P1** | E2 |
| **TD-04** | Sin tooling de validación OpenAPI committeado (Redocly/Spectral/oasdiff). | No hay validación ni detección de breaking-changes de contratos como gate. | MEDIO | **P1** | E2 |
| **TD-05** | Archivos sueltos versionados en la raíz: `debug_db.ts`, `refactor.ts`, `fix-imports.ts`, `dashboard.page.tsx`, `payload.json`, `diff.txt`, `diff_utf8.txt`, `New_files_claude`, `demo-integration.sh`. | Ruido de topología; ambigüedad de propósito; riesgo de import accidental. | BAJO | **P2** | E2 |
| **TD-06** | Doble lockfile (`package-lock.json` + `pnpm-lock.yaml`) y `packageManager` no declarado en `package.json`. | Ambigüedad de gestor de paquetes; reproducibilidad de CI. | BAJO | **P2** | E2 |
| **TD-07** | Duplicado documental: dos `Architectural-Truth-Matrix.md` (`src/dental/docs/` 75 líneas "Proposed" vs `trd/` 112 líneas "ACTIVO"). | Doble fuente de verdad; riesgo de decidir sobre la versión obsoleta. | MEDIO | **P1** | E1→E2 (ADR-011) |
| **TD-08** | `docs/INTEGRATION_CONTRACT_v1.1.md` es un **directorio**, no un archivo, con dos copias casi idénticas (3062 bytes) y nombres malformados (espacios, em-dash, uno truncado). | Enlaces frágiles; herramientas de docs no lo abren como documento. | BAJO | **P2** | E2 (ADR-010) |
| **TD-09** | Discrepancia nombre-de-carpeta vs título-de-documento en 5/8 ADR (p. ej. "ADR-005 pnpm + Turborepo" → "OpenAPI como contrato único"). | Confusión de navegación; malinterpretación de decisiones. | BAJO | **P2** | E2 |
| **TD-10** | ADR alojados bajo la vertical dental (`src/dental/docs/trd/adr/`) pese a aplicar a toda la plataforma. | Ubicación contraintuitiva para gobernanza global. | BAJO | **P2** | E2 (ADR-009) |
| **TD-11** | Contrato de integración Disglobal: webhook `X-Disglobal-Signature` y canonical body solo en código/comentarios, ausentes del OpenAPI; modelo de split de comisiones contradictorio (70/20/10 vs 30/70). | Bloquea revisión técnica formal con el socio; sin contrato vinculante. | MEDIO | **P1** | Phase 1 / E2 |
| **TD-12** | Stages de CI bloqueantes limitados (sandbox + prisma + AEK) por dependencia de TD-01..04. | Cobertura de gate parcial hasta resolver deuda subyacente. | MEDIO | **P1** | E2 (post TD-01..04) |
| **TD-13** | Artefactos de build presentes localmente (`dist/`, `.next/`, `mnt/`); `dist/` ignorado pero presente. | Higiene; posible confusión de fuente vs compilado. | BAJO | **P2** | E2 |
| **TD-14** | **Descubierto en E3-B:** `pnpm typecheck` reportaba **117 errores**. Progreso de remediación: E4-B (−19: node-fetch + build-scope demo) → **98**; **E4-C1 RC-1 RESUELTO** (−3) → **95**; **E4-C2 RC-2 (Longevity) RESUELTO** (−20) → **75**; **E4-D1 RC-2 (fuera de Longevity) RESUELTO** (−21: api-key, metering, consent, external-v2, engagement tipados) → **54**. **RC-2 (typing) eliminado por completo.** Pendientes: RC-3, RC-4, RC-5, RC-7, RC-8, y TD-18 (funnel `.rows`, bug latente). El runtime usa `transpile-only`, por eso no bloquean ejecución. | Type Check/Build no bloqueantes hasta `typecheck=0`; corregir el resto exige tocar producción (autorización por sprint). | ALTO | **P0** | E4-C2+ (RC-2 keystone) |
| **TD-18** | **Descubierto en E4-D1:** `src/api/handlers/funnel.handler.ts` accede a `.rows` sobre el resultado de `db.rawQuery()`, que ya devuelve el **array de filas** (no un `QueryResult`). `recent.rows`/`result.rows` son `undefined` en runtime → lanzaría `TypeError` si se ejecutara. El router funnel está **comentado en `server.ts`** (ruta muerta). NO es typing (tipar `rawQuery<T>` no añade `.rows`); es un **bug latente** cuya corrección cambia semántica de runtime. | Ninguno hoy (ruta desmontada); fallaría si se montara. | MEDIO | **P1** | Sprint dedicado (con router aún desmontado) |
| **TD-17** | **Descubierto en E4-C1:** `src/demo/seed_mvp.ts` (seed **huérfano** — sin script npm ni imports; el seed activo es `seed-demo.ts`, 0 errores) importa 5 enums ausentes del schema (`ObservationSource`, `RiskCategory`, `RiskScoreType`, `ClinicalDomain`, `ActionType`). No es "artefacto Prisma faltante" (RC-1) sino drift seed↔schema en código muerto. Excluido del gate (E4-B). Resolver exige rediseño del modelo (prohibido) o eliminar el seed huérfano. | Ninguno en runtime (código muerto, excluido). | BAJO | **P2** | Sprint de limpieza (decisión: eliminar seed_mvp o reintroducir enums) |
| **TD-15** | **Descubierto en E3-B:** los 3 archivos `tests/vertical2*.test.ts` importan una estructura inexistente (`../catalog/`, `../voucher/`, `../pricing/`, `../booking/`, `../fulfillment/`, `../access/`, `../analytics/`, `../shared/types/domain`) que nunca se implementó en `src/`. Son tests huérfanos (no importan `src/vertical2/`, por lo que su estado no cambió al resolver TD-01). | Contaminan el conteo de fallos del full suite; `tests/` es de solo lectura. | MEDIO | **P1** | E4 (decisión sobre vertical2 completo) |
| **TD-16** | **Observado en E3-B:** un test de `sandbox/` falló de forma transitoria 1 vez en ~5 ejecuciones (no reproducible; 49/49 en re-runs). Posible flakiness por timing. `sandbox/` es de solo lectura. | Riesgo bajo de falso-rojo intermitente en CI. | BAJO | **P2** | E4 |

---

## 2. Agrupación por origen

- **Heredada de Sprint E1** (SPRINT_E1_REPORT.md): TD-01 (DAD-1), TD-02 (DAD-2), TD-03 (DAD-3), TD-04 (DAD-4), TD-06, TD-12.
- **Heredada de Sprint E0** (SPRINT_E0_REPORT.md): TD-07 (D-1), TD-08 (S-1/D-2), TD-09 (S-2), TD-10 (S-3).
- **Heredada de Phase 1 Governance** (PHASE1_GOVERNANCE_PACKAGE_v1.md): TD-11.
- **Detectada en BC-1:** TD-05, TD-13.

---

## 3. Mapa de prioridad

| Prioridad | IDs | Acción |
|---|---|---|
| **P0** | TD-01 | Resolver antes de promover Type Check/Build a bloqueantes; decisión vía ADR-009 (cuarentena/legacy o completar módulos). |
| **P1** | TD-02, TD-03, TD-04, TD-07, TD-11, TD-12 | Resolver antes de escalar a producción multi-partner. |
| **P2** | TD-05, TD-06, TD-08, TD-09, TD-10, TD-13 | Higiene y consistencia; resolver de forma incremental. |

> **Ninguna deuda fue corregida en BC-1.** Las acciones recomendadas son referencias para sprints futuros (ver `BASELINE_CERTIFICATION_REPORT_BC1.md` → Deferred Technical Actions).
