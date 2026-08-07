# EVENT_MIGRATION_BACKLOG.md
> **Vytalix Platform — Sprint B1 · Backlog priorizado de migración de eventos + fichas técnicas**

| Campo | Valor |
|---|---|
| Sprint | B1 — EventBus Migration Preparation (Analysis Only) |
| Rol | **Capa de EJECUCIÓN**: orden determinista + ficha técnica por cadena MIGRATE |
| Modo | **Análisis únicamente** — sin código/runtime/EventBus/typecheck |
| Fecha | 2026-07 |

> **Qué es / qué NO es.** Este backlog **operacionaliza** la estrategia [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md) (M0–M4) en items priorizados y ejecutables; **no la reemplaza ni la duplica**. Toma la disposición de [EVENT_CHAIN_CLASSIFICATION.md](./EVENT_CHAIN_CLASSIFICATION.md) (no re-clasifica) y las definiciones de evento de [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §3/§8 (no re-define). Aquí solo: **orden** (Fase 4) + **fichas profundas de las 2 cadenas MIGRATE** (Fase 5). Las cadenas KEEP/REMOVE aparecen solo como waves de trabajo, sin ficha.
>
> **Nada de esto se implementa.** Es un backlog listo para un sprint funcional posterior con autorización de runtime.

---

## 1. Orden óptimo de migración (Fase 4) — 4 waves deterministas

**Principio de ordenamiento** (del prompt): minimizar *riesgo, impacto, cambios simultáneos, regresiones*; maximizar *estabilidad, aislamiento, verificabilidad, rollback simple*. Traducción operativa: **primero lo irreversible-seguro y sin efecto de runtime; el efecto externo, al final y detrás de flag.** Una sola preocupación por wave. Cada wave revertible por sí sola. **PaymentConfirmed (KEEP) permanece intacto como ancla de regresión durante todo el proceso.**

| Wave | Trabajo | Cadenas | Efecto runtime | Riesgo | Rollback | Δ typecheck (TD-21) |
|---|---|---|---|---|---|---|
| **W1** | **REMOVE** `emit` huérfanos (sin listener) | 10 `referral.converted`, 11–13 `funnel.*` | **Ninguno** (nadie escucha) | **Mínimo** | Trivial (revert de líneas) | **−4** |
| **W2** | **Decidir wiring** de core subs (activar o diferir explícito) | 2 ObservationAdded, 3 DecisionGenerated | Interno (pipeline/audit) si se activa | Bajo | Revert de wiring; eventos ya se publican | 0 (ya tipados) |
| **W3** | **MIGRATE** `vitality.assessed` → `VitalityAssessed` | 8 | Interno (re-score + cache) | Medio | Revert commit de cadena → inerte | **−? (nuevo type)** |
| **W4** | **MIGRATE** `referral.triggered` → `ReferralTriggered` | 9 | **Externo** (webhook a partner) | **Alto** | Flag + staged; efectos externos no auto-revertibles | **−? (nuevo type)** |

**Por qué este orden (justificación de aislamiento):**
1. **W1 primero** — eliminar `emit` huérfanos no cambia comportamiento (no hay listeners) pero **resta 4 errores TD-21** y simplifica el árbol antes de tocar nada vivo. Riesgo cero, máxima verificabilidad (typecheck baja, sandbox intacto).
2. **W2 después** — el wiring de core subs es **interno** (pipeline/audit), sin partner externo; los eventos ya son tipados (sin nuevos types). Aísla la decisión de activación de la mecánica de migración.
3. **W3 antes que W4** — `vitality.assessed` produce efecto **interno** (cómputo); `referral.triggered` produce efecto **externo** (llamada saliente al partner). Migrar primero lo interno permite validar el patrón emit→publish end-to-end **sin** exponer efectos a Disglobal.
4. **W4 al final** — la cadena de mayor riesgo (webhook externo) se hace de última, detrás de feature-flag, con confirmación de negocio y regresión de PaymentConfirmed ya blindada. Si algo falla, el blast-radius está contenido a una sola cadena ya aislada.

> **Nota:** W2/W3/W4 **requieren confirmación de negocio** (¿activar?) y **autorización de runtime**. W1 es el único wave sin dependencia de negocio (eliminar código muerto), pero también requiere autorización de cambio (borra líneas de producción) y debe serializarse con los sprints Logger/DTO que tocan `funnel.service`/`biological-age.service` (ver [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md) §Dependencias).

---

## 2. Fichas técnicas de cadenas MIGRATE (Fase 5)

> Solo las 2 cadenas clasificadas **MIGRATE**. Cada campo es requerido por el prompt. Toda afirmación cita `archivo:línea`. **Sin código.**

### FICHA M-8 — `vitality.assessed` → `VitalityAssessed`

| Campo | Detalle (evidencia) |
|---|---|
| **Productor** | `src/longevity/biological-age.service.ts:124` (`eventBus.emit('vitality.assessed', {...})`) |
| **Consumidor(es)** | **DOS** sobre el mismo evento: `pipeline-v2.orchestrator.ts:224` → `orchestrator.runFromBiologicalAge(...)` (**re-score preventivo + evaluación de referral**); y `pipeline-v2.orchestrator.ts:256` → invalidación de caché `cohort:{tenantId}:*` en Redis. |
| **Evento actual** | `emit('vitality.assessed', payload)` — string no tipado; `emit` **no existe** en `IEventBus` (`event-bus.ts:128-135`) → error TD-21. |
| **Evento canónico** | `publish.vitalityAssessed(meta, payload)` (nuevo helper) → `eventBus.subscribe<VitalityAssessedEvent>('VitalityAssessed', handler)`. Nombre PascalCase past-tense por contrato ([CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §8.3). |
| **Payload actual** | `{ tenantId, patientId, biologicalAge, differentialAge, ageStatus, correlationId }` (`biological-age.service.ts:124-131`). Consumidor 1 espera exactamente esos campos (`orchestrator.ts:224-231`); consumidor 2 solo `{ tenantId }` (`:256`). |
| **Payload objetivo** | Envelope `BaseEvent` (eventId/tenantId/correlationId/occurredAt/version, sellados por el bus) + `payload: { patientId, biologicalAge, differentialAge, ageStatus }`. `tenantId`/`correlationId` **suben al envelope** (§8.4). |
| **Breaking changes** | (1) Añadir `VytalixEvent` type `VitalityAssessedEvent` a la unión → **cambio de contrato gobernado por ADR** (§8.9). (2) Firma de ambos handlers cambia de `payload` crudo a `event.payload` tipado. (3) **Dos** suscriptores al mismo eventType deben re-registrarse ambos (re-score **y** cache). |
| **Impacto runtime** | Activa el re-score preventivo + invalidación de caché **tras cada assessment** (hoy inerte). **Cambia comportamiento observable** (coste de cómputo por assessment, latencia). Requiere **feature-flag**. |
| **Estrategia de pruebas** | *Unit:* `publish.vitalityAssessed` produce el evento tipado correcto. *Integración:* assess → re-score ejecutado + caché `cohort:*` limpiada. *Regresión:* latencia del endpoint de assessment; PaymentConfirmed intacto; **sandbox 49/49**; AEK 0 findings; RULE-ISO-001=0. |
| **Estrategia rollback** | Revert del commit de la cadena → vuelve a `emit`/`on` inerte (estado actual). PaymentConfirmed no afectado (cadena independiente). Efecto puramente interno → rollback limpio. |
| **Dependencias** | `registerPlatformEventListeners` (`orchestrator.ts:218`, comentado en `server.ts:172`). **Serializar** con el sprint Logger: `biological-age.service.ts` también usa `clinicalLog.assessmentCompleted?.` (`:133`) — mismo archivo. |
| **Prerequisitos** | ADR-EventBus ACCEPTED · ADR de nuevo `VytalixEvent` type · **confirmación de negocio: ¿re-score automático requerido?** [INSUFFICIENT REPOSITORY EVIDENCE] · autorización de runtime. |
| **Complejidad** | **Media** — 2 consumidores, nuevo type, wiring idempotente. |
| **Criticidad** | **Media** — efecto interno (cómputo); sin partner externo. |

### FICHA M-9 — `referral.triggered` → `ReferralTriggered`

| Campo | Detalle (evidencia) |
|---|---|
| **Productor** | `src/core/referral.engine.ts:212` (`eventBus.emit('referral.triggered', {...})`) |
| **Consumidor** | `pipeline-v2.orchestrator.ts:242` → `deliverReferralWebhook(payload)` (`:274`): carga `webhookUrl`/`webhookSecret` del tenant y entrega **webhook HTTP saliente** al partner. Comentario del código: "send outbound webhook to tenant's configured URL" / "to Disglobal" (`referral.engine.ts:211`). |
| **Evento actual** | `emit('referral.triggered', payload)` — string no tipado; `emit` inexistente en `IEventBus` → error TD-21. |
| **Evento canónico** | `publish.referralTriggered(meta, payload)` → `eventBus.subscribe<ReferralTriggeredEvent>('ReferralTriggered', handler)`. |
| **Payload actual** | Productor emite `{ tenantId, patientId, referralType, urgency, triggerCode, correlationId }` (`referral.engine.ts:212-219`). **Consumidor espera** `{ tenantId, patientId, referralType, urgency, correlationId }` (`orchestrator.ts:242-248`) — **NO** incluye `triggerCode`. **⚠ Mismatch: el productor envía `triggerCode` que el consumidor ignora.** |
| **Payload objetivo** | Envelope `BaseEvent` + `payload: { patientId, referralType, urgency, triggerCode }`. **Decisión requerida:** conservar `triggerCode` en el type (el productor ya lo provee y puede ser útil al partner) o descartarlo (el consumidor no lo usa hoy). Recomendación: **conservarlo** (aditivo, forward-compatible, §8.6). |
| **Breaking changes** | (1) Nuevo `ReferralTriggeredEvent` en la unión → **ADR**. (2) Reconciliar el campo `triggerCode` (productor↔consumidor↔type). (3) **Contrato de webhook saliente hacia el partner** (Disglobal): firma HMAC, formato del body, URL — **contrato externo** que debe confirmarse con el partner antes de activar. |
| **Impacto runtime** | Activa una **llamada HTTP saliente al partner** por cada referral. **Efecto observable FUERA de Vytalix** (Disglobal recibe la derivación). El mayor impacto del backlog. Requiere **feature-flag + staged rollout + confirmación de negocio**. |
| **Estrategia de pruebas** | *Unit:* evento tipado correcto. *Integración:* trigger → `deliverReferralWebhook` con firma HMAC verificada contra un partner **mock** (nunca el real en test). *Regresión:* PaymentConfirmed intacto; sandbox 49/49; verificar que ningún webhook real se dispara sin flag. |
| **Estrategia rollback** | Revert del commit → cadena inerte. **PERO** si el partner ya recibió webhooks, los efectos externos **no son auto-revertibles** → mitigación por **feature-flag** (apagar sin revert) + **staged rollout** (1 tenant → N). PaymentConfirmed no afectado. |
| **Dependencias** | Config de tenant `webhookUrl`/`webhookSecret` (`orchestrator.ts:282-287`); `deliverReferralWebhook` (mismo archivo). `registerPlatformEventListeners` (comentado `server.ts:172`). **No** comparte archivos con Logger/DTO. |
| **Prerequisitos** | ADR-EventBus ACCEPTED · ADR de nuevo type · **confirmación de negocio: ¿el piloto usa webhook por-evento o la ruta síncrona `/api/v2/referral`?** [INSUFFICIENT REPOSITORY EVIDENCE] · **confirmación del contrato de webhook con el partner** · autorización de runtime. |
| **Complejidad** | **Media-Alta** — contrato externo, HMAC, mismatch de payload a reconciliar. |
| **Criticidad** | **Alta** — cara al partner (Disglobal); efecto externo irreversible sin flag. |

---

## 3. Items no-MIGRATE en el backlog (referencia, sin ficha)

Para completitud del orden de ejecución (no son cadenas MIGRATE, no llevan ficha):

| Item | Cadenas | Acción | Ubicación en waves |
|---|---|---|---|
| **REMOVE huérfanos** | 10, 11, 12, 13 | Eliminar líneas `emit` muertas (handlers HTTP intactos) | W1 |
| **Wiring core subs (decisión)** | 2, 3 | Activar `registerCoreSubscriptions` o diferir explícito | W2 |
| **KEEP intactas** | 1, 4, 5, 6, 7 | No acción (1 activa; 4–7 forward-compatible) | — |
| **Deuda legacy (fuera de alcance)** | dup `publish.patientModelUpdated` `legacy/snapshot_service.ts:95` | Gobernada por build-scope de legacy, **no** por esta migración | — |

---

## 4. Métrica de cierre del backlog

**Hecho.** Al completar W1–W4: 0 `emit`/`on` sobre `eventBus`; TD-21 resuelto; PaymentConfirmed sin regresión; cada cadena migrada validada por integración; typecheck sin nuevos errores (ver métricas de [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md)).

---

> **STOP.** Backlog completamente priorizado: 4 waves deterministas + 2 fichas MIGRATE con todos los campos requeridos. La implementación puede comenzar en un sprint posterior **sin incertidumbre técnica adicional** — solo resta la confirmación de negocio (marcada INSUFFICIENT REPOSITORY EVIDENCE) y la autorización de runtime. Sin código/runtime/EventBus/typecheck modificados.
