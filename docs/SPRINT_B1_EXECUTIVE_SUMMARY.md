# SPRINT_B1_EXECUTIVE_SUMMARY.md
> **Vytalix Platform — Sprint B1 · Executive Summary: EventBus Migration Preparation (Analysis Only)**

| Campo | Valor |
|---|---|
| Sprint | B1 — EventBus Migration Preparation (Implementation Readiness) |
| Modo | **Análisis únicamente** — sin código/runtime/EventBus/typecheck |
| Fecha | 2026-07 |
| Entregables | 3 (máximo permitido): [EVENT_CHAIN_CLASSIFICATION.md](./EVENT_CHAIN_CLASSIFICATION.md) · [EVENT_MIGRATION_BACKLOG.md](./EVENT_MIGRATION_BACKLOG.md) · este summary |

---

## Resultado en una frase

**Las 13 cadenas de eventos del repositorio quedaron inventariadas desde el código, clasificadas (KEEP 7 / MIGRATE 2 / REMOVE 4), priorizadas en 4 waves deterministas y documentadas con fichas técnicas completas para las 2 cadenas MIGRATE.** La implementación puede comenzar en un sprint posterior sin incertidumbre técnica; solo resta confirmación de negocio (marcada INSUFFICIENT REPOSITORY EVIDENCE) y autorización de runtime.

## Clasificación (evidencia por `archivo:línea`)

| Categoría | # | Cadenas |
|---|---|---|
| **KEEP** | 7 | PaymentConfirmed (activa) · ObservationAdded, DecisionGenerated (activación pendiente) · PatientCreated, RiskScoreComputed, RecommendationReviewed, PatientModelUpdated (forward-compatible) |
| **MIGRATE** | 2 | `vitality.assessed` → `VitalityAssessed` (re-score, interno) · `referral.triggered` → `ReferralTriggered` (webhook a partner, externo) |
| **REMOVE** | 4 | `referral.converted` + `funnel.lead.created` + `funnel.assessment.completed` + `funnel.booking.created` (todos `emit` **huérfanos**, sin listener) |

## Orden de migración (determinista, minimiza riesgo)

```
W1  REMOVE huérfanos (10–13)        → efecto runtime NULO, −4 TD-21, riesgo mínimo
W2  Wiring core subs (2,3)          → interno (pipeline/audit), bajo riesgo
W3  MIGRATE vitality.assessed (8)   → efecto INTERNO (re-score+cache), medio
W4  MIGRATE referral.triggered (9)  → efecto EXTERNO (webhook partner), alto — ÚLTIMO, tras flag
```
Regla: primero lo irreversible-seguro y sin efecto runtime; el efecto externo, al final y detrás de flag. **PaymentConfirmed permanece intacto como ancla de regresión.**

## Necesidad Disglobal (Fase 3) — solo evidencia

- **Única demostrada:** **PaymentConfirmed** (receptor de pago → activación; cableado y activo).
- **Todo lo demás** (referral webhook, re-score, core subs): **INSUFFICIENT REPOSITORY EVIDENCE** — el repo no codifica el proceso de negocio del piloto. Alineado con [ADR_EVENTBUS.md](./ADR_EVENTBUS.md).

## Hallazgos notables (hechos del repositorio)

1. **4 cadenas huérfanas** (`referral.converted`, `funnel.*`): `emit` sin ningún `.on(...)` — emiten a la nada (código muerto TD-21).
2. **2 cadenas rotas-con-lógica** (`vitality.assessed`, `referral.triggered`): consumidores con trabajo real, pero usan `emit`/`on` inexistentes en `IEventBus` y su registrador está comentado (`server.ts:172`).
3. **Mismatch de payload** en `referral.triggered`: el productor envía `triggerCode` (`referral.engine.ts:217`) que el consumidor ignora (`orchestrator.ts:242`) — a reconciliar en la migración.
4. **Duplicado legacy:** `publish.patientModelUpdated` existe en `shared/snapshot.service.ts:92` **y** `legacy/snapshot_service.ts:95` — deuda de build-scope de legacy, fuera del alcance de esta migración (se señala, no se actúa).

---

## Distinción explícita (calidad requerida)

- **Hechos:** el inventario, los call-sites, el estado de cableado, los payloads, los huérfanos y el mismatch — todo verificable por `git grep` / lectura de código.
- **Inferencias:** que las cadenas 4–7 sean "forward-compatible" y no "muertas" (se publican dentro del flujo tipado sano; sin evidencia de que deban borrarse).
- **Riesgos:** activar cadenas cambia comportamiento observable (interno en W2/W3; **externo** en W4 → partner).
- **Decisiones pendientes:** activar o no cada cadena inerte → **negocio** (INSUFFICIENT REPOSITORY EVIDENCE); autorización de runtime → arquitecto/negocio.

---

## Validación obligatoria (checklist del prompt)

| Ítem | Estado | Evidencia |
|---|---|---|
| No se modificó código | ✅ | Solo 3 `.md` nuevos en `docs/`; `git status` sin cambios en `src/` |
| No cambió runtime | ✅ | Cero ejecución alterada |
| No cambió EventBus | ✅ | `event-bus.ts` intacto |
| No cambió typecheck | ✅ | **36** errores, sin cambio |
| No se duplicó documentación | ✅ | Ver anti-duplicación abajo |
| Se reutilizaron artefactos existentes | ✅ | Referenciados: CANONICAL_EVENT_MODEL §3/§8, EVENTBUS_MIGRATION_PLAN M0–M4, ADR_EVENTBUS, EXECUTIVE_DECISION_SUMMARY |
| Todas las decisiones trazables al repo | ✅ | Cada fila cita `archivo:línea` |
| Backlog completamente priorizado | ✅ | 4 waves deterministas + 2 fichas completas |

## Anti-duplicación (decisión explícita)

- **Ninguno de los 3 artefactos existía** (verificado por `ls`/`grep`) → se crean, no se duplican.
- **NO se re-definieron eventos** → se referencia [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §3/§8.
- **NO se re-escribió la estrategia** → el backlog **operacionaliza** [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md) (M0–M4), no la reemplaza.
- **Separación de profundidad para evitar solape:** CLASSIFICATION cubre las 13 cadenas a **poca** profundidad (disposición + justificación); BACKLOG cubre **solo** las 2 MIGRATE a **gran** profundidad (fichas). Sin solape.
- **NO se creó** nuevo ADR, roadmap, ni gobernanza (fuera de alcance B1).

---

> **STOP.** Preparación de migración completa. Backlog priorizado y determinista; cadenas clasificadas; riesgos identificados; fichas listas. La implementación puede comenzar en un Sprint posterior sin incertidumbre técnica adicional — pendiente **solo** de confirmación de negocio (por-cadena) y autorización de runtime. No se inició implementación. No se escribió código.
