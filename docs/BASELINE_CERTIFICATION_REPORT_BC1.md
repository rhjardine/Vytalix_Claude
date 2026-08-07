# BASELINE_CERTIFICATION_REPORT_BC1.md
> **Vytalix Platform — Baseline Certification Report (Sprint BC-1)**

| Campo | Valor |
|---|---|
| Sprint | BC-1 — Baseline Certification |
| Rama | `adr/baseline-2026` |
| Modo | READ · VERIFY · AUDIT · CLASSIFY · DOCUMENT · CERTIFY |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Documentos asociados | [ARCHITECTURE_READINESS_SCORECARD.md](./ARCHITECTURE_READINESS_SCORECARD.md) · [TECHNICAL_DEBT_REGISTER.md](./TECHNICAL_DEBT_REGISTER.md) |

> Ejercicio de certificación estrictamente read-only. **Cero modificaciones** de código, APIs, OpenAPI, Prisma, EventBus, RLS o lógica de negocio. Solo se crearon los tres documentos de certificación.

---

## 0. Resumen ejecutivo

Tras los Sprints E0 (consolidación de gobernanza) y E1 (gates de calidad automatizados), el repositorio Vytalix presenta un **núcleo productivo sólido** (Core, Platform, API, Dental, Longevity, Shared) con **AEK en 0 findings** sobre 3 reglas de aislamiento (ADR-002), gobernanza documentada, seguridad multitenant (RLS, pseudonimización, HMAC) y un pipeline de CI operativo.

Las observaciones se concentran en **áreas no productivas y brechas de tooling**, no en el núcleo: la vertical experimental `src/vertical2/` no compila, `src/legacy/` está aislado pero sin sunsetting formal, hay ruido de topología (archivos sueltos versionados en la raíz), duplicidad documental, y faltan gates bloqueantes para typecheck/build/tests/lint/OpenAPI por deuda pre-existente.

**Certificación final: ✅ CERTIFIED WITH OBSERVATIONS** (justificación en §8).

---

## 1. Task 1 — Repository Audit

### 1.1 Topología verificada

```
raíz/
├── src/            api · core · demo · dental · legacy · longevity · platform · shared · vertical2
├── frontend-dental/ (presentación Next.js — no auditado en profundidad, fuera de scope de cambio)
├── openapi/        5 contratos (.yaml)
├── prisma/         schema + migraciones (Nivel 1)
├── tests/          24 archivos *.test.ts
├── sandbox/        3 archivos *.test.ts (49 tests, deterministas)
├── tools/aek/      Architecture Enforcement Kit (3 reglas, 0 findings)
├── docs/           documentación + docs/governance/ (capa E0)
├── .github/        ci.yml + aek-governance.yml + sandbox-ci.yml + governance files (E1)
└── .aek/report.json  (artefacto AEK)
```

### 1.2 Inventario de dominios (`src/`)

| Dominio | Archivos `.ts(x)` | Rol |
|---|---:|---|
| api | 21 | Capa HTTP (handlers/middlewares/pipelines) |
| core | 4 | Motores clínicos deterministas |
| dental | 19 | Vertical satélite (ADR-007/008) |
| shared | 13 | Shared kernel |
| platform | 8 | Infra multitenant + SDK partner |
| legacy | 7 | Aislado, no productivo |
| demo | 6 | Seed/demo |
| longevity | 5 | Motor preventivo/vitalidad |
| vertical2 | 2 | Experimental (no compila) |

### 1.3 Inconsistencias identificadas (NO corregidas)

| # | Inconsistencia | Evidencia |
|---|---|---|
| I-1 | `src/vertical2/` no compila — módulos huérfanos | TD-01 |
| I-2 | Archivos sueltos versionados en raíz | `debug_db.ts`, `refactor.ts`, `fix-imports.ts`, `dashboard.page.tsx`, `payload.json`, `diff.txt`, `diff_utf8.txt`, `New_files_claude`, `demo-integration.sh` (todos git-tracked) — TD-05 |
| I-3 | Duplicado `Architectural-Truth-Matrix.md` (2 copias divergentes) | TD-07 |
| I-4 | `docs/INTEGRATION_CONTRACT_v1.1.md` es un directorio, no un archivo | TD-08 |
| I-5 | Drift nombre-de-carpeta vs título en 5/8 ADR | TD-09 |
| I-6 | ADR alojados bajo vertical dental | TD-10 |
| I-7 | Webhook de pago no reflejado en OpenAPI; split de comisiones contradictorio | TD-11 |
| I-8 | Doble lockfile + `packageManager` no declarado | TD-06 |

> Consistencia de ADR: los 8 ADR están en estado **Accepted** y son coherentes entre sí en cuanto a decisión; la única inconsistencia es de **nomenclatura de carpetas** (I-5), no de contenido.

---

## 2. Task 2 — Baseline Classification

| Área | Clasificación | Razón | Riesgo | Acción recomendada |
|---|---|---|---|---|
| Core | **Production** | Motores puros, AEK-protegido, append-only | Low | Incluir en baseline; preservar inmutabilidad |
| Platform | **Production** | RLS + event-bus + metering/notification | Low–Med | Incluir; verificar cobertura de integración (TD-02) |
| Dental | **Production** | Satélite autónomo, hardened, barrel único | Low | Incluir |
| Longevity | **Stable** | Motores preventivos; facial-analysis con degradación controlada | Low–Med | Incluir |
| API | **Stable** | Adaptadores HTTP; webhook reciente | Med | Incluir con observación (cerrar contrato webhook) |
| Shared | **Stable** | Shared kernel, contracts Zod | Low–Med | Incluir |
| Partner Layer | **Stable / Conditional** | SDK + sandbox verde; brechas de contrato | Med | Piloto controlado; cerrar contrato antes de escalar |
| AEK / CI / Governance | **Stable** | 0 findings; pipeline operativo; gates parciales | Med | Promover gates advisory tras resolver deuda |
| Legacy | **Deprecated** | Aislado, no productivo | Med | Excluir; sunsetting vía ADR |
| Vertical2 | **Experimental** | No compila | High | Excluir; ADR-009 |

---

## 3. Task 3 — Architecture Readiness Score

Detalle completo en **[ARCHITECTURE_READINESS_SCORECARD.md](./ARCHITECTURE_READINESS_SCORECARD.md)**. Resumen:

| Dominio | Score | Readiness |
|---|---:|---|
| Core | 92 | Production |
| Dental | 90 | Production |
| Platform | 88 | Production |
| Longevity | 86 | Stable→Production |
| API | 85 | Stable→Production |
| Shared | 84 | Stable |
| Partner Layer | 80 | Conditional |
| Legacy | 40 | Deprecated (isolated) |
| Vertical2 | 25 | Experimental/Excluded |

**Architecture Readiness global (núcleo productivo):** **≈ 87/100 — Defined→Managed.**

---

## 4. Task 4 — Quality Certification

| Dimensión | Score | Evidencia | Estado |
|---|---:|---|---|
| AEK | **95** | 3 reglas (DI-001/002/003), 0 findings, integrado en CI | PASS |
| CI | **78** | `ci.yml` 10 stages; bloqueantes = sandbox/prisma/AEK; resto advisory | PASS WITH OBSERVATIONS |
| Documentation | **82** | Cobertura amplia + capa governance; duplicados/defecto de directorio | PASS WITH OBSERVATIONS |
| Governance | **90** | E0 (capa corporativa) + E1 (GitHub governance) | PASS |
| Testing | **70** | 49 sandbox verdes + 414 unit verdes; 19 integración acoplados a infra | PASS WITH OBSERVATIONS |
| Observability | **85** | Prometheus, liveness/readiness, correlation IDs (docs) | PASS |
| Security | **88** | RLS, pseudonimización HMAC, hardening reports | PASS |
| OpenAPI Governance | **60** | 5 contratos; sin tooling de validación; webhook no en spec | PASS WITH OBSERVATIONS |
| Repository Consistency | **65** | Archivos sueltos, duplicados, drift de ADR, vertical2 | PASS WITH OBSERVATIONS |

**Madurez de calidad agregada:** **≈ 79/100 — Defined.**

---

## 5. Task 5 — Production Baseline (BASELINE 2026)

### ✅ Approved Production Components
- `src/core/` — motores clínicos deterministas
- `src/platform/` — infra multitenant, RLS, event-bus, metering, notification
- `src/dental/` — vertical satélite (vía barrel `index.ts`)
- `src/longevity/` — motores preventivos/vitalidad
- `src/shared/` — shared kernel
- `src/api/` — capa HTTP (handlers/middlewares/pipelines)
- `tools/aek/` — enforcement de arquitectura
- `sandbox/` — suite de integración determinista (no productivo, pero certifica el flujo)
- `docs/governance/` + `.github/` — gobernanza y CI

### ⚠️ Conditional Components
- **Partner Layer** (`disglobal-client.ts` + `/api/v2/*`): apto para **piloto controlado**; requiere cerrar contrato OpenAPI del webhook y reconciliar el modelo de comisiones (TD-11) antes de escalar multi-partner.
- **CI gates advisory** (typecheck/build/tests/coverage/eslint/openapi): operativos pero no bloqueantes hasta resolver TD-01..04.

### 🧪 Experimental Components
- `src/vertical2/` — **no compila** (TD-01). Mantener **aislado y excluido del build productivo**.

### ⛔ Excluded Components
- `src/legacy/` — aislado, no productivo; sunsetting formal pendiente.
- Archivos sueltos de raíz (TD-05) — artefactos de desarrollo; no forman parte del baseline.

> **Condición de certificación:** el baseline productivo es válido **siempre que Vertical2 y Legacy permanezcan aislados** del build y del runtime productivo (no importados por `src/server.ts` ni por dominios productivos). AEK refuerza parcialmente este aislamiento.

---

## 6. Task 6 — Technical Debt Register

Registro completo y priorizado en **[TECHNICAL_DEBT_REGISTER.md](./TECHNICAL_DEBT_REGISTER.md)** (13 ítems: 1×P0, 6×P1, 6×P2). **Ninguna deuda fue corregida.**

Top items:
- **TD-01 (P0):** `src/vertical2/` no compila.
- **TD-02/03/04 (P1):** tests acoplados a infra · sin config ESLint · sin tooling OpenAPI.
- **TD-07/TD-11 (P1):** duplicado Truth-Matrix · brechas de contrato Disglobal.

---

## 7. Task 7 — Deferred Architectural Decisions (consolidado)

Consolidación de decisiones diferidas de E0, E1 y Phase 1 Governance. **Ninguna se implementa.**

| ID | Decisión diferida | Origen | Sprint propuesto |
|---|---|---|---|
| DAD-1 | Destino de `src/vertical2/` (cuarentena/legacy vía ADR-009 o completar módulos) | E1 | E2 |
| DAD-2 | Service containers (Postgres+Redis) + migraciones + seed en CI → promover full tests a bloqueante | E1 | E2 |
| DAD-3 | Adoptar ESLint flat config + endurecimiento incremental | E1 | E2 |
| DAD-4 | Adoptar tooling OpenAPI (Redocly/Spectral + oasdiff) → gate de contrato | E1 | E2 |
| DAD-5 | ADR-009 — ubicación canónica de ADR/gobernanza (resuelve TD-10) | E0 | E2 |
| DAD-6 | ADR-010 — consolidación del Integration Contract (resuelve TD-08) | E0 | E2 |
| DAD-7 | ADR-011 — política de ciclo de vida documental + retiro de duplicados (resuelve TD-07) | E0 | E2 |
| DAD-8 | Reconciliación del split de comisiones (70/20/10 vs 30/70) + contrato webhook en OpenAPI | Phase 1 | Phase 1 / E2 |
| DAD-9 | Consolidación de workflows CI (ci.yml único) + unificación de package manager/lockfile | E1 | E2 |

---

## 8. Certification Matrix

| Eje | Estado | Nota |
|---|---|---|
| Repository Governance | **PASS** | Capa E0 + GitHub governance E1 |
| Architecture | **PASS WITH OBSERVATIONS** | Núcleo sólido; vertical2/legacy aislados |
| Security | **PASS** | RLS, pseudonimización, HMAC, hardening |
| Quality | **PASS WITH OBSERVATIONS** | Gates bloqueantes parciales (TD-01..04) |
| Observability | **PASS** | Prometheus, liveness/readiness, correlation IDs |
| CI/CD | **PASS WITH OBSERVATIONS** | Pipeline operativo; stages advisory pendientes |
| Documentation | **PASS WITH OBSERVATIONS** | Duplicados (TD-07) y directorio-como-archivo (TD-08) |
| OpenAPI | **PASS WITH OBSERVATIONS** | Sin tooling de validación; webhook no en spec |
| DDD | **PASS** | Bounded contexts definidos (ADR-002) |
| Hexagonal | **PASS** | Adaptadores/puertos; motores puros (ADR-004) |
| Multi-tenancy | **PASS** | `withTenant()` + RLS (ADR-003) |
| RLS | **PASS** | Doble capa app+DB; reportes de aislamiento |
| Dental Vertical | **PASS** | Satélite autónomo (ADR-007/008), hardened |
| Partner APIs | **PASS WITH OBSERVATIONS** | Brechas de contrato (TD-11) — apto para piloto |
| Legacy | **PASS WITH OBSERVATIONS** | Aislado; sunsetting pendiente |
| Experimental | **FAIL** | `src/vertical2/` no compila (aislado/excluido del baseline) |

---

## 9. Final Certification

# ✅ CERTIFIED WITH OBSERVATIONS

### Justificación

El **núcleo productivo** de Vytalix (Core, Platform, API, Dental, Longevity, Shared) está **certificado para BASELINE 2026**:

1. **Aislamiento arquitectónico verificado** — AEK reporta **0 findings** sobre 3 reglas de aislamiento de dominio (ADR-002); las fronteras DDD/Hexagonal son ejecutables y se hacen cumplir en CI.
2. **Seguridad multitenant sólida** — RLS en doble capa (ADR-003), pseudonimización HMAC-SHA256, verificación de webhooks con `timingSafeEqual`, inmutabilidad clínica/financiera (ADR-006).
3. **Gobernanza y CI operativos** — capa de gobernanza consolidada (E0) y pipeline de calidad automatizado con gates bloqueantes verificados en verde (sandbox 49/49, Prisma válido, AEK 0 findings).
4. **Readiness arquitectónica ≈ 87/100** en el núcleo productivo; madurez de calidad ≈ 79/100.

La certificación es **"with observations"** —y no "for baseline" pleno— porque persisten observaciones **fuera del núcleo productivo** y en **tooling**, ninguna bloqueante para el núcleo:

- Un eje (**Experimental / `src/vertical2/`**) está en **FAIL** por no compilar, pero está **aislado y excluido** del baseline.
- Gates de CI clave (typecheck/build/tests/lint/OpenAPI) son **advisory** por deuda pre-existente (TD-01..04).
- Brechas de contrato en la capa Partner (TD-11) limitan el escalado multi-partner (apto para piloto).
- Higiene de repositorio y duplicidad documental (TD-05/07/08).

**No se emite "NOT CERTIFIED"** porque ninguna observación compromete la integridad del núcleo productivo, la seguridad, ni el aislamiento arquitectónico. **No se emite "CERTIFIED FOR BASELINE"** pleno porque la cobertura de gates bloqueantes y el cierre de contratos de socio aún dependen de la deuda P0/P1 registrada.

### Condiciones de la certificación
1. `src/vertical2/` y `src/legacy/` permanecen **aislados/excluidos** del build y runtime productivo.
2. La deuda **P0 (TD-01)** se resuelve antes de promover Type Check/Build a gates bloqueantes.
3. La capa **Partner** opera en **modo piloto controlado** hasta cerrar TD-11.

---

## 10. Deferred Technical Actions

> Conforme a la REGLA FINAL: todo hallazgo que requiera modificar código productivo fue **detenido y registrado**, no implementado.

Todas las acciones correctivas (resolver TD-01..13, implementar DAD-1..9) se difieren a **Sprint E2 / Phase 1** según el [TECHNICAL_DEBT_REGISTER.md](./TECHNICAL_DEBT_REGISTER.md) y §7. **Cero correcciones aplicadas en BC-1.**

---

## 11. Success criteria — verificación

| Criterio | Resultado |
|---|---|
| ✓ Zero code modifications | **CUMPLE** |
| ✓ Zero functional changes | **CUMPLE** |
| ✓ Zero API modifications | **CUMPLE** |
| ✓ Zero OpenAPI modifications | **CUMPLE** |
| ✓ Zero Prisma modifications | **CUMPLE** |
| ✓ Zero architectural refactoring | **CUMPLE** |
| ✓ Complete repository classification | **CUMPLE** (§2, §5) |
| ✓ Complete Architecture Readiness Score | **CUMPLE** (§3 + scorecard) |
| ✓ Official Baseline Certification issued | **CUMPLE** (§9) |

> Únicos archivos creados en BC-1: `docs/BASELINE_CERTIFICATION_REPORT_BC1.md`, `docs/ARCHITECTURE_READINESS_SCORECARD.md`, `docs/TECHNICAL_DEBT_REGISTER.md`. Ningún otro archivo modificado.
