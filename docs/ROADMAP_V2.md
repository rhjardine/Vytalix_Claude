# ROADMAP_V2.md
> **Vytalix Platform — Sprint E4-D8 · Phase 4 · Architecture-Oriented Roadmap (Rebaseline)**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 · Fase 4 |
| Reemplaza | El roadmap orientado a errores (E4-A → E4-D7) |
| Modo | Planificación; no autoriza implementación |
| Fecha | 2026-06 |

> Rebaseline: el trabajo restante ya **no** se mide por conteo de errores TS sino por **decisiones de arquitectura, reparaciones funcionales y completitud de tipos**. La fase type-only runtime-neutral está agotada (RC-1/2/4/7 hechos; RC-6/RC-3 certificados no-type-only).

---

## Phase A — Architecture Decisions (sin cambios de runtime)

Emisión formal de ADRs a partir de [ARCHITECTURE_DECISION_CANDIDATES.md](./ARCHITECTURE_DECISION_CANDIDATES.md). **Documentación/gobernanza únicamente.**

### Sprint A1 — ADR-EventBus decision
- **Goal:** decidir el modelo de eventos (migrar al tipado / eliminar ad-hoc); confirmar comportamiento esperado del piloto (referral webhook, re-score).
- **Scope:** ADR-EventBus. **Out of scope:** implementación.
- **Dependencies:** input de negocio (piloto Disglobal).
- **Runtime authorization:** No (solo ADR).
- **Testing:** N/A.
- **Success:** ADR-EventBus ACCEPTED con decisión inequívoca.
- **Risk:** Bajo (documento).

### Sprint A2 — ADR-LegacyBuildScope + ADR-TypeCheckGatePromotion + ADR-DTOPolicy
- **Goal:** decidir exclusión de `src/legacy/` del gate, estrategia de promoción del gate (por-directorio), y política DTO/error-body.
- **Scope:** 3 ADRs. **Out of scope:** implementación.
- **Dependencies:** ninguna.
- **Runtime authorization:** No.
- **Success:** 3 ADRs ACCEPTED.
- **Risk:** Bajo.

---

## Phase B — Functional Repairs (requieren autorización de runtime + tests)

### Sprint B1 — TD-21 EventBus implementation (según ADR-EventBus)
- **Goal:** ejecutar la decisión de ADR-EventBus (migrar/eliminar cadenas ad-hoc; cablear listeners).
- **Scope:** `funnel.service`, `biological-age.service`, `referral.engine`, `quota.middleware`, `pipeline-v2.orchestrator`, `event-bus.ts` (según ADR), `server.ts` (wiring). **Out of scope:** cambiar contratos externos.
- **Dependencies:** ADR-EventBus (A1). **Nunca en paralelo con** Sprint B2 health(71) ni con Sprint C (tocan mismos archivos).
- **Runtime authorization:** **SÍ.**
- **Testing:** integración por cadena; regresión de `PaymentConfirmed`; sandbox 49/49.
- **Success:** cadenas definidas funcionan o eliminadas; `typecheck` −9; runtime validado.
- **Risk:** ALTO (activa/elimina eventos observables).

### Sprint B2 — TD-20 Runtime imports + TD-18 funnel `.rows`
- **Goal:** corregir imports dinámicos (billing 99/118, health 71) y `.rows` de funnel.
- **Scope:** `billing-admin.handler`, `health.handler`, `funnel.handler`, `metering.service` (export). **Out of scope:** EventBus redesign.
- **Dependencies:** health(71) depende de ADR-EventBus (B1); billing/funnel independientes.
- **Runtime authorization:** **SÍ.**
- **Testing:** runtime de `/usage`, revocación de key, health-check, funnel (si se reactiva).
- **Success:** `typecheck` −8 (5 funnel + 3 RC-6); comportamiento validado.
- **Risk:** Medio.

### Sprint B3 — Logger (`clinicalLog`)
- **Goal:** resolver `funnelLead`/`assessmentCompleted` (añadir métodos o eliminar llamadas).
- **Scope:** `platform/logger.ts` + 2 call-sites. **Out of scope:** otros loggers.
- **Dependencies:** **serializar con B1** (mismos archivos funnel.service/biological-age).
- **Runtime authorization:** Bajo (log emit).
- **Testing:** typecheck + smoke.
- **Success:** `typecheck` −2.
- **Risk:** Bajo.

---

## Phase C — Type Completion (type-only)

### Sprint C1 — TD-19 DTO policy application
- **Goal:** aplicar ADR-DTOPolicy (narrowing error-body vs `ProblemDetailV1`; mapeo Zod↔dominio).
- **Scope:** `index.ts`, `disglobal-client`, `external-v2.handler`, `funnel.service`. **Out of scope:** cambiar schemas/contratos.
- **Dependencies:** ADR-DTOPolicy (A2); serializar con B1 (funnel.service).
- **Runtime authorization:** No (type-only).
- **Testing:** typecheck; tests de wrappers de error.
- **Success:** `typecheck` −7/8; runtime byte-idéntico.
- **Risk:** Bajo.

---

## Phase D — Production Hardening

### Sprint D1 — Legacy build-scope + gate promotion
- **Goal:** aplicar ADR-LegacyBuildScope (excluir `src/legacy/`) y ADR-TypeCheckGatePromotion (gate por-directorio → global cuando `typecheck=0`).
- **Scope:** `tsconfig.server.json`, `.github/workflows/ci.yml`, `docs/governance/QUALITY_GATES.md`. **Out of scope:** código de dominio.
- **Dependencies:** A2; idealmente tras B/C para `typecheck=0`.
- **Runtime authorization:** No (config).
- **Testing:** CI dry-run.
- **Success:** Type Check/Build promovidos a bloqueantes (por-directorio o global); legacy fuera del gate.
- **Risk:** Bajo-medio.

### Sprint D2 — Full-suite CI (heredado de E1 DAD-2)
- **Goal:** service containers (Postgres+Redis) + migraciones + seed → promover full Vitest/Coverage a bloqueantes.
- **Scope:** `.github/`. **Out of scope:** tests.
- **Dependencies:** B (para que integración pase).
- **Runtime authorization:** No (CI infra).
- **Success:** full suite verde y bloqueante.
- **Risk:** Medio.

---

## Critical path

```
A1 (ADR-EventBus decision)
  └─► B1 (EventBus impl) ──► B2(health 71) ──┐
        (serializar B3, C1: mismos archivos) │
A2 (ADRs: DTO/Legacy/Gate) ──► C1 (DTO) ─────┤
                                             ▼
B2(billing/funnel) ─────────────────────► typecheck → 0
                                             │
                              D1 (gate promotion) ──► D2 (full-suite CI)
```

**Ruta crítica:** A1 → B1 → (B2 health) → typecheck=0 → D1. El cuello de botella es **A1/B1 (EventBus)**: bloquea health(71), define funcionalidad de negocio, y es el mayor riesgo. Los sprints independientes (B2 billing/funnel, B3 Logger, C1 DTO, D1 legacy-scope) pueden avanzar en paralelo **respetando la serialización de archivos compartidos** (funnel.service: B1+B3+C1; biological-age: B1+B3).

> **STOP:** roadmap reconstruido. No iniciar implementación sin autorización.
