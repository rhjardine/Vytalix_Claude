# CANONICAL_EVENT_MODEL.md
> **Vytalix Platform — Canonical Event Model (single architectural reference)**

| Campo | Valor |
|---|---|
| Rol | **Referencia arquitectónica única** del modelo de eventos de Vytalix |
| Estado | ACTIVO — catálogo canónico |
| Sprint | A2 — Canonical Event Model Discovery & Consolidation |
| Modo | **Análisis únicamente** — sin cambios de código/runtime/EventBus |
| Fecha | 2026-06 |

> **Fuente de verdad canónica: el código fuente `src/platform/event-bus.ts`** (la unión `VytalixEvent`). Toda afirmación cita `archivo:línea`. Documentos de soporte (no se recrean aquí): arquitectura actual → [EVENTBUS_CURRENT_ARCHITECTURE.md](./EVENTBUS_CURRENT_ARCHITECTURE.md); decisión → [ADR_EVENTBUS.md](./ADR_EVENTBUS.md); flujo de eventos → [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md) §Event Flow Map.

---

## 1. Fuente de verdad (Phase 2)

Ranking de fuentes (evidencia):
1. **Código fuente `src/platform/event-bus.ts`** ← **AUTORIDAD ÚNICA** (unión `VytalixEvent`, `IEventBus`, `publish` helpers).
2. ADR_EVENTBUS.md (decisión arquitectónica — soporte).
3. EVENTBUS_CURRENT_ARCHITECTURE.md (descripción de implementación — soporte).
4. Reportes/roadmaps (contexto).

Regla: si un documento contradice `event-bus.ts`, **gana el código**.

> **Discovery (Phase 1):** no existía ningún "Event Catalog/Event Model" consolidado; los docs de A1 cubren arquitectura/decisión/flujo pero **no** un catálogo semántico de eventos. Este documento lo consolida por primera vez, sin duplicar los de A1.

---

## 2. Envelope canónico — `BaseEvent` (`event-bus.ts:26-32`)

Todo evento tipado hereda:

| Campo | Tipo | Propósito | Presente |
|---|---|---|---|
| `eventId` | string | Identidad única del evento (randomUUID en publish, `event-bus.ts:154`) | ✅ |
| `tenantId` | string | Aislamiento multi-tenant | ✅ |
| `correlationId` | string | Trazabilidad de request across pipeline | ✅ |
| `occurredAt` | string (ISO-8601 UTC) | Timestamp de publicación | ✅ |
| `version` | `'1.0'` (literal) | Versión de esquema del evento | ✅ (fija) |
| `eventType` | discriminador string | Tipo (por evento) | ✅ |
| `payload` | objeto tipado | Datos del evento (por evento) | ✅ |

Inyección en `publish()` (`event-bus.ts:152-157`): `eventId`, `occurredAt`, `version` se añaden en publicación; el emisor provee `tenantId`/`correlationId`/`payload`.

---

## 3. Inventario de eventos (Phase 3) — 7 eventos tipados (evidencia `event-bus.ts:34-110`)

| # | eventType | Payload (campos) | Aggregate (de-facto) | Bounded context | Producer (evidencia) | Consumer (evidencia) | Runtime status |
|---|---|---|---|---|---|---|---|
| 1 | `PatientCreated` | patientId, organizationId, mrn | Patient | Core Clinical | `handlers.ts:74` | — (registerCoreSubscriptions no cablea este) | **publicado sin consumir** |
| 2 | `ObservationAdded` | observationId, patientId, **loincCode**, valueNumeric, unit, observedAt, sourceSystem | Observation/Patient | Core Clinical | `handlers.ts:129` | `registerCoreSubscriptions`→pipeline (`event-bus.ts:273`) | **consumer NO cableado** (registerCoreSubscriptions nunca llamado) |
| 3 | `PatientModelUpdated` | patientId, snapshotVersion, updatedFields, triggeredByObservationId | Patient snapshot | Core Clinical | `snapshot.service.ts:92` | — | **publicado sin consumir** |
| 4 | `DecisionGenerated` | recommendationId, patientId, ruleId, urgency, category, **decisionTraceId** | Recommendation | Core Clinical | `handlers.ts:203` | `registerCoreSubscriptions`→audit (`event-bus.ts:289`) | **consumer NO cableado** |
| 5 | `RiskScoreComputed` | riskScoreId, patientId, scoreType, riskCategory, valuePercent | RiskScore | Core Clinical | `handlers.ts:179` | — | **publicado sin consumir** |
| 6 | `RecommendationReviewed` | recommendationId, patientId, physicianId, action, rationaleCode | Recommendation | Core Clinical | `handlers.ts:259` | — | **publicado sin consumir** |
| 7 | `PaymentConfirmed` | intentId, **subjectRef** (pseudónimo), amount, currency, product, metadata | Payment/Service | Partner/Commercial | `payment-webhook.handler.ts:138` | `payment-pipeline.ts:117` (`registerPaymentPipeline` en `server.ts:175`) | ✅ **ACTIVO** |

**Lifecycle (todos):** publicación síncrona in-process (`emitter.emit`, `event-bus.ts:165`) → entrega a listeners registrados en orden de registro → sin persistencia/replay. Aislamiento de fallos: handler envuelto en try/catch (`event-bus.ts:176-185`).

> Eventos ad-hoc (`vitality.assessed`, `referral.triggered`, `referral.converted`, `funnel.*`) **NO son parte del modelo canónico** — son `emit`/`on` con nombres string no tipados, rotos (TD-21). No se catalogan como eventos válidos; su destino (migrar a tipado o eliminar) lo decide [ADR_EVENTBUS.md](./ADR_EVENTBUS.md).

---

## 4. Evaluación semántica (Phase 4) — propiedades presentes vs ausentes (evidencia)

| Dimensión | Propiedad | Estado | Evidencia |
|---|---|---|---|
| **Trazabilidad** | eventId | ✅ | BaseEvent |
| | occurredAt | ✅ | BaseEvent (ISO-8601) |
| | version | ⚠️ fija `'1.0'` | `event-bus.ts:32` |
| | correlationId | ✅ | BaseEvent |
| | tenantId | ✅ | BaseEvent |
| | causationId | ❌ ausente | no en BaseEvent |
| | aggregateId (estándar) | ❌ ausente (patientId es de-facto, no formalizado) | payloads |
| | producer/source | ❌ ausente | no en BaseEvent |
| **Idempotencia** | idempotency key a nivel de evento | ⚠️ `eventId` existe pero el bus no lo usa; idempotencia a nivel de **handler** | `payment-pipeline.ts` guard |
| **Ordering** | garantía de orden | ⚠️ orden de registro, síncrono; sin garantía cross-async | `event-bus.ts:165` |
| **Replay** | event store / re-entrega | ❌ ausente (in-process EventEmitter, sin persistencia) | `event-bus.ts:142` |
| **Audit chain** | cadena causal | ⚠️ parcial (`decisionTraceId` en DecisionGenerated; DecisionGenerated→audit **no cableado**) | `event-bus.ts:66-76,289` |
| **Privacidad** | aislamiento tenant | ✅ tenantId en todo evento | BaseEvent |
| | minimización PHI | ✅ payloads usan ids internos (patientId), no PHI cruda | payloads |
| | pseudonimización partner | ✅ `subjectRef` (HMAC) en PaymentConfirmed, no userId crudo | `PaymentConfirmedEvent` |
| | encryption boundaries | N/A in-process (futuro EventBridge) | stub `event-bus.ts:205` |
| **Interop** | LOINC | ✅ `ObservationAdded.loincCode` | `event-bus.ts:47` |
| | FHIR | ❌ ids internos, no referencias FHIR | payloads |
| | SNOMED | ❌ ausente | payloads |
| | OpenTelemetry (traceId/spanId) | ❌ ausente (correlationId ≈ trace, no estándar) | BaseEvent |
| | CloudEvents (envelope) | ⚠️ parcial: eventType/eventId/occurredAt ≈ type/id/time; faltan `specversion`/`source`/`datacontenttype`/`subject` | BaseEvent |
| | EventBridge | ⚠️ interfaz transport-agnostic diseñada; stub mapea eventType→DetailType, event→Detail | `event-bus.ts:205-223` |
| **Escalabilidad** | transport independence | ✅ publish/subscribe idéntico Local↔EventBridge | `event-bus.ts:4-5` |
| | versioning por-evento | ⚠️ solo `version:'1.0'` global, sin estrategia | `event-bus.ts:32` |
| | backward/forward compat | ⚠️ readonly; sin política de evolución | tipos |
| | deprecation / schema governance | ❌ ausente | — |

---

## 5. Gap Analysis (Phase 5) — capacidades SEMÁNTICAS ausentes (no implementación)

> Solo propiedades semánticas faltantes, clasificadas. **No se implementa nada.**

### Critical
- *(Ninguna que bloquee la única cadena activa PaymentConfirmed.)* — Ver nota: para un sistema clínico con auditoría (ADR-006), la **ausencia de replay/event-store** y de **causationId** se eleva a *Important* fuerte, no *Critical* bloqueante hoy (el bus in-process es MVP-aceptable por diseño, `event-bus.ts:5,138`).

### Important
1. **`causationId`** — cadena causal para auditoría clínica (ADR-006). Hoy solo `correlationId` + `decisionTraceId` parcial.
2. **`producer`/`source`** — requerido para CloudEvents/EventBridge (`source`) y observabilidad.
3. **Versioning por-evento + política de deprecación** — hoy `version:'1.0'` global sin gobernanza de esquema.
4. **`aggregateId` formalizado** — patientId funciona de-facto; formalizarlo habilita replay/particionado.
5. **Cableado de consumidores tipados** — `registerCoreSubscriptions` (ObservationAdded/DecisionGenerated) nunca se llama → eventos publicados sin consumir (esto es *implementación/wiring*, gobernado por ADR-EventBus, no una propiedad del modelo; se lista por completitud).

### Optional
6. **CloudEvents envelope** (`specversion`/`datacontenttype`/`subject`) — mapeo estándar.
7. **OpenTelemetry** (traceId/spanId) — mapear correlationId a trace context.
8. **SNOMED code fields** — extensibilidad de codificación clínica (LOINC ya presente).
9. **FHIR resource references** — interoperabilidad EMR.

### Future
10. **Event store / replay / at-least-once** — requiere transporte durable (EventBridge/SQS), ya anticipado en el stub comentado.
11. **Schema registry / contract governance** — para evolución gobernada.
12. **Encryption boundaries** — al migrar a transporte de red.

---

## 6. Consolidación (Phase 6)

- **Documento canónico creado:** este (`CANONICAL_EVENT_MODEL.md`) — único catálogo semántico de eventos.
- **No se recreó:** arquitectura (EVENTBUS_CURRENT_ARCHITECTURE), decisión (ADR_EVENTBUS), flujo (ARCHITECTURE_DEPENDENCY_GRAPH), opciones (EVENTBUS_OPTION_ANALYSIS), migración (EVENTBUS_MIGRATION_PLAN) — se **referencian**.
- **Fuente de verdad única declarada:** `src/platform/event-bus.ts`.

---

## 7. Recomendación para el siguiente sprint de implementación

El modelo de eventos es **sólido para el MVP** (tipado, tenant-isolated, LOINC-aware, pseudonimizado, transport-agnostic) con **1 cadena activa (PaymentConfirmed)** y gaps semánticos bien acotados. El siguiente sprint de implementación (tras ADR-EventBus ACCEPTED + input de negocio) debe:

1. **Cablear/decidir consumidores** (registerCoreSubscriptions, cadenas ad-hoc) según [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) y [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md) — antes de añadir propiedades semánticas.
2. **Añadir `causationId` + `producer`** al `BaseEvent` (gap Important) — es el mínimo para auditoría/EventBridge; cambio de contrato de eventos gobernado por ADR.
3. Diferir CloudEvents/OTel/FHIR/replay (Optional/Future) hasta el ADR de transporte de producción (EventBridge).

> Todo lo anterior son **recomendaciones de gap**, no implementación. Ejecución pendiente de autorización.

---

> **STOP.** Modelo canónico consolidado desde el código fuente. Sin cambios de runtime/EventBus. Un solo documento canónico + un executive summary ([EVENT_MODEL_EXECUTIVE_SUMMARY.md](./EVENT_MODEL_EXECUTIVE_SUMMARY.md)).
