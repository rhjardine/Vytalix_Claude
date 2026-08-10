# ARCHITECTURE_READINESS_SCORECARD.md
> **Vytalix Platform — Architecture Readiness Scorecard (Baseline BC-1)**

| Campo | Valor |
|---|---|
| Sprint | BC-1 — Baseline Certification |
| Rama | `adr/baseline-2026` |
| Estado | Evaluación read-only |
| Fecha | 2026-06 |
| Evidencia | AEK report (`.aek/report.json`), CI workflows, ADR-001…008, prior sprint reports |

> Scoring read-only. Ninguna evaluación implica modificación de código. Las puntuaciones reflejan el estado observado, no un objetivo.

---

## 1. Método de puntuación

**Architecture Score (0-100)** pondera: aislamiento de dominio (AEK), pureza/determinismo, cobertura de contrato, invariantes (RLS/append-only), y deuda asociada.

Escalas cualitativas:
- **Engineering Maturity:** Initial · Developing · Defined · Managed
- **Technical Risk:** Low · Medium · High
- **Deployment Readiness:** Production · Stable · Conditional · Experimental · Excluded

---

## 2. Scorecard por dominio

| Dominio | Raíz | Archivos `.ts` | Arch. Score | Maturity | Tech Risk | Deploy Readiness |
|---|---|---:|---:|---|---|---|
| **Core** | `src/core/` | 4 | **92** | Managed | Low | Production |
| **Platform** | `src/platform/` | 8 | **88** | Managed | Low–Medium | Production |
| **API** | `src/api/` | 21 | **85** | Defined | Medium | Stable → Production |
| **Dental** | `src/dental/` | 19 | **90** | Managed | Low | Production |
| **Longevity** | `src/longevity/` | 5 | **86** | Defined | Low–Medium | Stable → Production |
| **Shared** | `src/shared/` | 13 | **84** | Defined | Low–Medium | Stable |
| **Partner Layer** | `src/platform/disglobal-client.ts` + `/api/v2/*` + `sandbox/` | — | **80** | Defined | Medium | Conditional |
| **Legacy** | `src/legacy/` | 7 | **40** | — | Medium | Deprecated (isolated) |
| **Experimental (Vertical2)** | `src/vertical2/` | 2 | **25** | Initial | High | Experimental / Excluded |

---

## 3. Detalle por dominio

### Core — 92 · Production
- **Fortalezas:** motores deterministas puros (decision/referral/algorithm/loinc), invariantes append-only (ADR-006), sin dependencias de I/O, protegido por AEK RULE-DI-003 (core no importa dental).
- **Riesgo:** bajo. Sólida cobertura de tests unitarios deterministas.
- **Recomendación:** incluir en BASELINE 2026. Mantener inmutabilidad.

### Platform — 88 · Production
- **Fortalezas:** `withTenant()` + RLS (ADR-003), event-bus tipado, metering/notification non-blocking, logger, disglobal-client.
- **Riesgo:** bajo–medio (notification.service y payment pipeline recientes; cobertura de integración depende de infra — TD-02).
- **Recomendación:** incluir en BASELINE 2026.

### API — 85 · Stable → Production
- **Fortalezas:** handlers/middlewares/pipelines separados; routers como adaptadores; Composition Root explícito (RULE-DI-001).
- **Riesgo:** medio — webhook de pago reciente; contrato OpenAPI del webhook incompleto (TD-11).
- **Recomendación:** incluir con observación; cerrar contrato OpenAPI del webhook.

### Dental — 90 · Production
- **Fortalezas:** satélite autónomo (ADR-007/008), barrel único (`index.ts`), motores puros (ADR-004), hardening SQL idempotente, auditoría append-only, métricas propias.
- **Riesgo:** bajo. Suite madura (281 tests históricos).
- **Recomendación:** incluir en BASELINE 2026.

### Longevity — 86 · Stable → Production
- **Fortalezas:** biophysics-engine, biological-age, preventive-score, insights, facial-analysis (provider abstraction mock/aws).
- **Riesgo:** bajo–medio (facial-analysis AWS path sin SDK por defecto — degradación controlada).
- **Recomendación:** incluir en BASELINE 2026.

### Shared — 84 · Stable
- **Fortalezas:** ingestion/funnel/engagement services, contracts Zod, mappers; shared kernel autorizado.
- **Riesgo:** bajo–medio.
- **Recomendación:** incluir en BASELINE 2026.

### Partner Layer — 80 · Conditional
- **Fortalezas:** SDK Disglobal, pseudonimización HMAC-SHA256, sandbox determinista (49 tests verdes), `/api/v2/*` con API Key + scopes.
- **Riesgo:** medio — brechas de contrato (webhook signature/canonical body fuera del OpenAPI; split de comisiones contradictorio — TD-11).
- **Recomendación:** **Conditional** — apto para piloto controlado; cerrar contrato antes de escalar multi-partner.

### Legacy — 40 · Deprecated (isolated)
- **Estado:** aislado, no ejecutado en runtime productivo.
- **Riesgo:** medio si se importa accidentalmente; mitigado por aislamiento.
- **Recomendación:** **Excluir** del baseline; sunsetting formal vía ADR.

### Experimental (Vertical2) — 25 · Experimental / Excluded
- **Estado:** **no compila** (TD-01 / TD-12); módulos huérfanos.
- **Riesgo:** alto si se incluye en build (rompe typecheck/build).
- **Recomendación:** **Excluir** del baseline; decisión ADR-009 (cuarentena/legacy o completar).

---

## 4. Resumen agregado

| Banda | Dominios | Veredicto |
|---|---|---|
| Production (≥85) | Core, Platform, API, Dental, Longevity | Núcleo productivo certificable |
| Stable (80–84) | Shared, Partner Layer (80, conditional) | Apto con observaciones |
| Excluded (<50) | Legacy (40), Vertical2 (25) | Aislar / excluir del baseline |

**Architecture Readiness global (núcleo productivo, media ponderada Core/Platform/API/Dental/Longevity/Shared):** **≈ 87 / 100 — "Defined→Managed".**

> Vertical2 y Legacy **no** se promedian en el núcleo productivo; se certifican como aislados/excluidos. Su baja puntuación no degrada el baseline siempre que permanezcan fuera del build productivo.
