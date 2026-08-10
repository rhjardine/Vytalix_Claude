# EVENTBUS_CURRENT_ARCHITECTURE.md
> **Vytalix Platform — Sprint A1 · Current EventBus Architecture (as implemented)**

| Campo | Valor |
|---|---|
| Sprint | A1 — ADR-EventBus (Architecture Decision) |
| Modo | **ANÁLISIS** — documenta el estado EXACTO implementado. Sin cambios. |
| Fecha | 2026-06 |
| Regla | Evidencia de código sobrescribe documentos. Cada afirmación cita `archivo:línea`. |

> Este documento describe la arquitectura ACTUAL tal como está implementada, verificada en fuente. No propone soluciones (ver [ADR_EVENTBUS.md](./ADR_EVENTBUS.md)).

---

## 1. Componentes (evidencia)

### 1.1 `IEventBus` — interfaz canónica (`platform/event-bus.ts:128-135`)
```ts
export interface IEventBus {
  publish<T extends VytalixEvent>(event: Omit<T,'eventId'|'occurredAt'|'version'>): void
  subscribe<T extends VytalixEvent>(eventType: T['eventType'], handler: (event: T)=>Promise<void>): void
  unsubscribe(eventType: VytalixEventType, handler: (...args: any[])=>void): void
}
```
- **Solo 3 métodos:** `publish`, `subscribe`, `unsubscribe`. **No** hay `emit`/`on`/`once`/`off`.
- Genérico sobre `VytalixEvent` (unión discriminada tipada).
- Intención documentada (`event-bus.ts:4-5`): *"EventEmitter in process today → AWS EventBridge in production. The public interface (publish/subscribe) is identical in both modes."*

### 1.2 `VytalixEvent` — eventos tipados (`event-bus.ts:26-122`)
- `BaseEvent`: `eventId`, `tenantId`, `correlationId`, `occurredAt` (ISO-8601), `version:'1.0'`.
- 7 eventos: `PatientCreated`, `ObservationAdded`, `PatientModelUpdated`, `DecisionGenerated`, `RiskScoreComputed`, `RecommendationReviewed`, `PaymentConfirmed`.
- `type VytalixEvent` = unión de los 7; `VytalixEventType = VytalixEvent['eventType']`.

### 1.3 `LocalEventBus implements IEventBus` (`event-bus.ts:141-198`)
- `private emitter = new EventEmitter()`; `setMaxListeners(50)`. **El EventEmitter es privado — no expuesto.**
- `publish()` (149-169): inyecta `eventId`(randomUUID)/`occurredAt`/`version`; `logger.debug`; **`emitter.emit(event.eventType, event)` síncrono** + `emitter.emit('*', event)` (wildcard).
- `subscribe()` (171-188): **envuelve el handler en `async try/catch`** (errores → `logger.error`, **no propagados**); `emitter.on(eventType, wrapped)`.
- `unsubscribe()` (190-192): `emitter.removeListener`.
- `subscribeAll()` (195-197): `emitter.on('*', …)` — utilidad dev/test.

### 1.4 Singleton (`event-bus.ts:229-231`)
```ts
const busInstance: IEventBus = new LocalEventBus()
export const eventBus = busInstance
```

### 1.5 Transporte EventBridge (`event-bus.ts:205-223`)
**Completamente comentado.** Stub para transporte de producción futuro; documenta que EventBridge usa triggers Lambda (no suscripciones in-process).

### 1.6 Helpers `publish.*` (`event-bus.ts:240-261`)
Objeto `publish` con 7 factories tipadas: `patientCreated`, `observationAdded`, `patientModelUpdated`, `decisionGenerated`, `riskScoreComputed`, `recommendationReviewed`, `paymentConfirmed`. Cada uno llama `eventBus.publish<T>({eventType, ...base, payload})`.

### 1.7 `registerCoreSubscriptions()` (`event-bus.ts:268-306`)
Suscribe `ObservationAdded`→PipelineOrchestrator.runFromObservation y `DecisionGenerated`→audit-log. **Evidencia: sin call-sites** (`git grep registerCoreSubscriptions` = solo la definición). **Nunca se ejecuta.**

---

## 2. Responsabilidades, propiedad, invariantes

| Aspecto | Estado (evidencia) |
|---|---|
| Propiedad | `src/platform/` (capa Platform). ADR-007 (event-driven), ADR-002 (aislamiento). |
| Responsabilidad | Pub/sub in-process tipado de eventos de dominio. |
| Invariante — interfaz | Solo `publish`/`subscribe`/`unsubscribe`, idéntica para Local y EventBridge (`event-bus.ts:4-5`). |
| Invariante — entrega | **Síncrona, in-process** (`emitter.emit` es síncrono, `event-bus.ts:165`). |
| Invariante — aislamiento de fallos | Handlers envueltos en try/catch; un error NO tumba al emisor ni a otros handlers (`event-bus.ts:176-185`). |
| Invariante — trazabilidad | Todo evento lleva `correlationId`/`tenantId`/`eventId`/`occurredAt` (BaseEvent). |
| Invariante — open/closed | Header (`event-bus.ts:15`): "Consumers that receive unknown eventTypes should log and discard." |
| Semántica de entrega | **At-most-once por listener registrado** (EventEmitter; sin persistencia, sin reintentos). |
| Idempotencia | **A nivel de handler**, no de bus (ej.: `payment-pipeline.ts` usa guard Redis `payment:activation:guard:{intentId}`). |
| Ordering | Listeners ejecutan en orden de registro, secuencialmente (emit síncrono). |

---

## 3. Ciclo de vida y secuencia de arranque (`server.ts`, evidencia)

```
server.ts (arranque):
  1. Express app + middleware (helmet, cors, body, correlationId, metrics, logger)
  2. Rutas: /api/v2 (external-v2), /api/v2 webhooks/payment, /api/v2/dental/*, /admin
  3. Error handler RFC-7807
  4. // registerPlatformEventListeners(platformOrchestrator)   ← COMENTADO (server.ts:172)
  5. registerPaymentPipeline()                                 ← ACTIVO (server.ts:175)
  6. setInterval(flushMeterStream, 60s)
  7. app.listen(PORT)
```
- **Único registro de suscripción activo:** `registerPaymentPipeline()` (`server.ts:175`) → `eventBus.subscribe<PaymentConfirmedEvent>('PaymentConfirmed', handlePaymentConfirmed)` (`payment-pipeline.ts:117`). Idempotente (`registered` flag, `payment-pipeline.ts:111-119`).
- `registerCoreSubscriptions`: **no importado, no llamado.**
- `registerPlatformEventListeners`: **comentado** en server.ts; solo invocado en `legacy/server-v2-patch.ts:25,92` (legacy, no ejecutado).

---

## 4. Propagación de eventos — estado runtime actual

| Cadena | Publisher | Subscriber | Estado runtime |
|---|---|---|---|
| **PaymentConfirmed** | `payment-webhook.handler.ts:138` `publish.paymentConfirmed` | `payment-pipeline.ts:117` subscribe | ✅ **ACTIVA** (registrada en server.ts:175) |
| ObservationAdded, DecisionGenerated, PatientCreated, RiskScoreComputed, RecommendationReviewed, PatientModelUpdated | `handlers.ts`, `snapshot.service.ts` `publish.*` | `registerCoreSubscriptions` | ⚠️ **PUBLICADO SIN CONSUMIR** (registerCoreSubscriptions nunca llamado) |
| vitality.assessed, referral.triggered, referral.converted, funnel.* | `biological-age`, `referral.engine`, `quota.middleware`, `funnel.service` vía `eventBus.emit(…)` | `pipeline-v2 registerPlatformEventListeners` vía `eventBus.on(…)` | ❌ **ROTA** — `emit`/`on` no existen en IEventBus/LocalEventBus (TS2339, TD-21) + listeners comentados |

---

## 5. Sistema de eventos ad-hoc (no canónico) — evidencia

**Emisores** (usan `eventBus.emit(name, payload)` — método inexistente):
- `funnel.service.ts:139,208,259` → `funnel.lead.created`/`funnel.assessment.completed`/`funnel.booking.created`
- `biological-age.service.ts:124` → `vitality.assessed`
- `quota.middleware.ts:110` → `referral.converted`
- `referral.engine.ts:212` → `referral.triggered`

**Listeners** (usan `eventBus.on(name, handler)` — método inexistente): `pipeline-v2.orchestrator.ts:224,242,256` (`registerPlatformEventListeners`, `event-bus.ts` no lo expone; función comentada en server.ts).

Ninguno de estos nombres (`vitality.assessed`, etc.) es un `VytalixEventType`. **No hay evidencia de que este sistema ad-hoc haya funcionado nunca** (emit/on nunca existieron en el bus; listeners nunca registrados).

---

## 6. Resumen del estado actual

- **Un modelo canónico tipado** (publish/subscribe) diseñado para ser transport-agnostic (Local→EventBridge), con 1 cadena activa (**PaymentConfirmed**).
- **Suscripciones core tipadas definidas pero no cableadas** (registerCoreSubscriptions).
- **Un modelo ad-hoc EventEmitter (emit/on) roto** en compile y runtime, con listeners comentados — remanente de un modelo previo.

> Análisis de causa raíz, restricciones, opciones y decisión: [ADR_EVENTBUS.md](./ADR_EVENTBUS.md). Comparación de opciones: [EVENTBUS_OPTION_ANALYSIS.md](./EVENTBUS_OPTION_ANALYSIS.md).
