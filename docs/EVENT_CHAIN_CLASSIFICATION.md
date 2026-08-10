# EVENT_CHAIN_CLASSIFICATION.md
> **Vytalix Platform — Sprint B1 · Clasificación definitiva de cadenas de eventos (KEEP / MIGRATE / REMOVE)**

| Campo | Valor |
|---|---|
| Sprint | B1 — EventBus Migration Preparation (Analysis Only) |
| Rol | **Capa de DECISIÓN**: dispone cada cadena en exactamente una categoría |
| Modo | **Análisis únicamente** — sin código/runtime/EventBus/typecheck |
| Fecha | 2026-07 |

> **Qué es / qué NO es.** Este documento **clasifica** cada cadena (Fase 1–3). NO redefine los eventos (eso vive en [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §3, referenciado). NO define la estrategia de migración (eso es [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md), M0–M4). NO prioriza ni detalla fichas (eso es [EVENT_MIGRATION_BACKLOG.md](./EVENT_MIGRATION_BACKLOG.md)). Un concepto, un artefacto: aquí solo la **disposición** de cada cadena.
>
> **Regla de evidencia.** Cada fila cita `archivo:línea` del repositorio. Donde el repo no demuestra una necesidad de negocio, se escribe literal **INSUFFICIENT REPOSITORY EVIDENCE**. Nunca se infiere proceso de negocio.

---

## 1. Inventario definitivo (Fase 1) — 13 cadenas, 100% derivadas del repositorio

**Hecho.** Dos sistemas coexisten (TD-21): (A) bus tipado `publish`/`subscribe` (canónico) y (B) `emit`/`on` ad-hoc (remanente de migración incompleta). Evidencia de call-sites por `git grep`.

| # | Cadena (eventType) | Sistema | Productor (evidencia) | Consumidor (evidencia) | Efecto real | Cableado en arranque | Estado runtime |
|---|---|---|---|---|---|---|---|
| 1 | **PaymentConfirmed** | Tipado | `payment-webhook.handler.ts:138` | `payment-pipeline.ts:117` | activación + notificación | ✅ `registerPaymentPipeline()` `server.ts:175` | ✅ **ACTIVO** |
| 2 | **ObservationAdded** | Tipado | `handlers.ts:129` | `event-bus.ts:273` (core subs → pipeline) | pipeline por observación | ❌ `registerCoreSubscriptions` nunca llamada | Publicado, consumidor inerte |
| 3 | **DecisionGenerated** | Tipado | `handlers.ts:203` | `event-bus.ts:289` (core subs → audit) | audit trail | ❌ misma función no cableada | Publicado, consumidor inerte |
| 4 | **PatientCreated** | Tipado | `handlers.ts:74` | — (ninguno) | — | N/A | Publicado, sin consumidor |
| 5 | **RiskScoreComputed** | Tipado | `handlers.ts:179` | — (ninguno) | — | N/A | Publicado, sin consumidor |
| 6 | **RecommendationReviewed** | Tipado | `handlers.ts:259` | — (ninguno) | — | N/A | Publicado, sin consumidor |
| 7 | **PatientModelUpdated** | Tipado | `shared/snapshot.service.ts:92` (+ dup legacy `legacy/snapshot_service.ts:95`) | — (ninguno) | — | N/A | Publicado, sin consumidor |
| 8 | **vitality.assessed** | Ad-hoc | `biological-age.service.ts:124` | `pipeline-v2.orchestrator.ts:224` (re-score) **+** `:256` (invalida caché) | re-score preventivo + cache bust | ❌ `registerPlatformEventListeners` comentada `server.ts:172` | **ROTO** (emit/on) |
| 9 | **referral.triggered** | Ad-hoc | `referral.engine.ts:212` | `pipeline-v2.orchestrator.ts:242` → `deliverReferralWebhook` | **webhook saliente a partner** | ❌ misma función comentada | **ROTO** (emit/on) |
| 10 | **referral.converted** | Ad-hoc | `quota.middleware.ts:110` | — (**ningún `.on('referral.converted')`**) | — (comentado "revenue share", sin implementación) | N/A | **ROTO + huérfano** |
| 11 | **funnel.lead.created** | Ad-hoc | `funnel.service.ts:139` | — (ninguno) | — | N/A | **ROTO + huérfano** |
| 12 | **funnel.assessment.completed** | Ad-hoc | `funnel.service.ts:208` | — (ninguno) | — | N/A | **ROTO + huérfano** |
| 13 | **funnel.booking.created** | Ad-hoc | `funnel.service.ts:259` | — (ninguno) | — | N/A | **ROTO + huérfano** |

> **Hecho clave (huérfanos):** las cadenas 10–13 son `emit` **sin ningún listener** en el repositorio (verificado: `git grep` de `referral.converted`/`funnel.*` no encuentra `.on(...)`). Emiten a la nada.
> **Hecho clave (rotos-con-consumidor):** las cadenas 8–9 sí tienen consumidores con lógica real, pero (a) usan `emit`/`on` que **no existen** en `IEventBus` (`event-bus.ts:128-135` expone solo publish/subscribe/unsubscribe) → error de compilación TD-21, y (b) su registrador está **comentado** (`server.ts:172`) → nunca se ejecutan.

---

## 2. Clasificación KEEP / MIGRATE / REMOVE (Fase 2)

**Definiciones aplicadas** (del prompt): **KEEP** = permanece exactamente como está · **MIGRATE** = migrar al modelo canónico publish/subscribe · **REMOVE** = código muerto / experimento / migración incompleta / feature abandonada / deuda técnica.

| # | Cadena | Categoría | Justificación (evidencia) |
|---|---|---|---|
| 1 | PaymentConfirmed | **KEEP** | Ya canónica, cableada y activa (`server.ts:175`). Única cadena funcional E2E. Es el ancla de regresión. **No tocar.** |
| 2 | ObservationAdded | **KEEP** *(activación pendiente)* | Evento **ya tipado/canónico**; no requiere migración emit→publish. El consumidor (`registerCoreSubscriptions`) existe y es coherente; su cableado es una **decisión de activación interna**, no una migración. Disposición: mantener el evento; decidir wiring en B-fase (interno, bajo riesgo). |
| 3 | DecisionGenerated | **KEEP** *(activación pendiente)* | Idéntico a #2 (audit trail). Evento canónico; wiring de consumidor pendiente de decisión. |
| 4 | PatientCreated | **KEEP** | Evento canónico que publica correctamente. Sin consumidor = forward-compatible (disponible para futuros suscriptores/EventBridge). Publicar es inocuo y parte del flujo tipado sano (`handlers.ts`). |
| 5 | RiskScoreComputed | **KEEP** | Igual que #4. |
| 6 | RecommendationReviewed | **KEEP** | Igual que #4. |
| 7 | PatientModelUpdated | **KEEP** | Igual que #4. **Nota:** existe un `publish.patientModelUpdated` **duplicado** en `legacy/snapshot_service.ts:95` — esto es deuda de `src/legacy/` (RC-5), gobernada por el **build-scope de legacy**, NO por esta migración de eventos. Se señala; no se actúa aquí. |
| 8 | vitality.assessed | **MIGRATE** | Feature **real e incompleta**: consumidores hacen trabajo real (re-score `runFromBiologicalAge` + invalidación de caché). No es código muerto — es una migración emit→publish a medio hacer. → migrar a `VitalityAssessed` tipado. Ficha en backlog. Activación gated en negocio. |
| 9 | referral.triggered | **MIGRATE** | Feature **real e incompleta**: consumidor entrega **webhook saliente a partner** (`deliverReferralWebhook`, comentario "to Disglobal"). Cadena de mayor valor de integración. → migrar a `ReferralTriggered` tipado. Ficha en backlog. Activación gated en negocio. |
| 10 | referral.converted | **REMOVE** | `emit` **huérfano**: ningún consumidor en el repo. Comentario dice "revenue share calculation" pero **no hay implementación**. Es deuda/migración incompleta que emite a la nada. → eliminar el `emit`. *(Si negocio requiere revenue-share por evento, se re-introduce como evento tipado nuevo — trabajo nuevo, no migración.)* |
| 11 | funnel.lead.created | **REMOVE** | `emit` huérfano, sin listener. Deuda de migración incompleta. → eliminar el `emit`. **El handler HTTP del funnel NO se toca** (solo la línea `emit` muerta). |
| 12 | funnel.assessment.completed | **REMOVE** | Igual que #11. |
| 13 | funnel.booking.created | **REMOVE** | Igual que #11. |

**Recuento:** KEEP = 7 (1–7, todos tipados) · MIGRATE = 2 (8, 9) · REMOVE = 4 (10–13). Total 13. ✔

> **Distinción explícita.**
> **Hecho:** categorías 1 (activa), 10–13 (huérfanas sin listener), 8–9 (consumidores con lógica real, no cableados) — todo verificable por `grep`.
> **Inferencia:** que 4–7 sean "forward-compatible" en lugar de "muertas" — se apoya en que publican dentro del flujo tipado sano y no rompen nada; no hay evidencia de que deban eliminarse.
> **Decisión pendiente (negocio):** si 8, 9 y el wiring de 2–3 se **activan** para el piloto (ver §3).

---

## 3. Necesidad para el piloto Disglobal (Fase 3) — solo evidencia

> El repositorio **no** codifica procesos de negocio del piloto. Se responde únicamente con lo que el código demuestra.

| Cadena | ¿Necesaria para Disglobal? | Base (evidencia / falta de evidencia) |
|---|---|---|
| PaymentConfirmed | **SÍ — demostrado** | Es el receptor de pago Disglobal→Vytalix (`payment-webhook.handler.ts`) → activación; único chain cableado y activo (`server.ts:175`). El repo demuestra que sirve el flujo pago→activación. |
| referral.triggered → webhook | **INSUFFICIENT REPOSITORY EVIDENCE** | El consumidor entrega webhook saliente a la `webhookUrl` del tenant (comentario "to Disglobal"), PERO también existe la ruta **síncrona** `/api/v2/referral`. El repo no determina si el piloto usa la vía por-evento o la síncrona. |
| vitality.assessed → re-score | **INSUFFICIENT REPOSITORY EVIDENCE** | Que el piloto requiera re-score preventivo automático post-assessment es un proceso de negocio no codificado. |
| ObservationAdded / DecisionGenerated (core subs) | **INSUFFICIENT REPOSITORY EVIDENCE** | Activar pipeline-por-observación y audit-por-decisión ahora es una decisión operativa; el repo no la demuestra. |
| referral.converted | **NO — sin evidencia** | Sin consumidor en el repo; nada demuestra necesidad. Clasificada REMOVE. |
| funnel.* (10–13) | **NO — sin evidencia** | Sin consumidores; funnel wiring comentado. Nada demuestra necesidad. Clasificadas REMOVE. |

> **Conclusión de Fase 3 (hecho):** la **única** cadena que el repositorio demuestra como necesaria-y-funcional para Disglobal es **PaymentConfirmed** (ya KEEP/activa). Toda otra necesidad de negocio → **INSUFFICIENT REPOSITORY EVIDENCE**, alineado con [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) y [EXECUTIVE_DECISION_SUMMARY.md](./EXECUTIVE_DECISION_SUMMARY.md).

---

## 4. Riesgos por categoría (resumen; detalle por-cadena en backlog)

| Categoría | Riesgo principal | Naturaleza |
|---|---|---|
| KEEP (2–3 activación) | Activar pipeline/audit cambia carga interna | Runtime interno, reversible |
| KEEP (4–7) | Ninguno (publican sin consumidor); riesgo = eliminar por error un evento forward-compatible | Bajo |
| MIGRATE (8) | Activa re-score → coste de cómputo por assessment | Runtime interno |
| MIGRATE (9) | Activa **webhook externo a partner** → efecto observable fuera de Vytalix | **Runtime externo** (el mayor) |
| REMOVE (10–13) | Eliminar un `emit` que negocio sí quería (revenue-share) | Bajo (sin listener hoy; recuperable como evento nuevo) |

---

> **STOP.** Clasificación definitiva completada: 13 cadenas, cada una en exactamente una categoría, con evidencia `archivo:línea`. Necesidad Disglobal resuelta por evidencia (solo PaymentConfirmed demostrada). Sin código/runtime/EventBus/typecheck modificados. Priorización y fichas → [EVENT_MIGRATION_BACKLOG.md](./EVENT_MIGRATION_BACKLOG.md).
