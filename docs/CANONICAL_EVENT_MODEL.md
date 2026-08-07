# CANONICAL_EVENT_MODEL.md
> **Vytalix Platform — Canonical Event Model & Contract (single architectural reference)**

| Campo | Valor |
|---|---|
| Rol | **Referencia arquitectónica única** del modelo de eventos de Vytalix: catálogo semántico (§1–§7) **+ contrato canónico** (§8) **+ arquitectura de dominio semántico** (§10) |
| Estado | ACTIVO — catálogo + contrato + arquitectura de dominio |
| Sprint | A2 (modelo) · **A3 (contrato, §8)** · **B1.5 (arquitectura de dominio semántico, §10)** |
| Modo | **Análisis/arquitectura únicamente** — sin cambios de código/runtime/EventBus/tipos |
| Fecha | 2026-06/07 |

> **Fuente de verdad canónica: el código fuente `src/platform/event-bus.ts`** (la unión `VytalixEvent`). Toda afirmación cita `archivo:línea`. Documentos de soporte (no se recrean aquí): arquitectura actual → [EVENTBUS_CURRENT_ARCHITECTURE.md](./EVENTBUS_CURRENT_ARCHITECTURE.md); decisión → [ADR_EVENTBUS.md](./ADR_EVENTBUS.md); flujo de eventos → [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md) §Event Flow Map.
>
> **Este documento tiene dos capas:** §1–§7 **describen** el modelo tal como existe en el código (catálogo, A2). §8 **prescribe** el Contrato Canónico de Eventos — las reglas semánticas que todo evento Vytalix debe obedecer (constitución, A3). El contrato es la extensión natural del catálogo: **un concepto, un artefacto canónico.** No se creó un segundo documento (ver §9, anti-duplicación).

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

# 8. Canonical Event Contract — La constitución semántica (Sprint A3)

> **Qué es esto:** las reglas semánticas que **todo** evento de Vytalix debe obedecer. No es implementación, no rediseña el EventBus, no reescribe el ADR. Formaliza — desde la evidencia del código — el contrato que gobierna nombres, envelope, privacidad, versionado, confiabilidad e interoperabilidad.
>
> **Cómo leer cada regla:** cada área marca sus cláusulas como
> **[R] Repository-supported** (invariante ya presente en el código — normativa hoy, romperla es una regresión),
> **[+] Recommended** (regla que el contrato adopta pero que requiere un cambio gobernado por ADR para hacerse cumplir),
> **[F] Future** (regla que aplicará al migrar a transporte durable/red, EventBridge).
>
> **North Star:** cada regla se elige para **facilitar la fase de integración** (Disglobal, partners externos, módulos clínicos, interoperabilidad futura). Donde una regla habilita esa fase, se anota *(→ integración)*.

## 8.1 Event Philosophy — por qué existen los eventos

- **[R] Los eventos son hechos de dominio, no comandos.** Todo eventType es un hecho pasado e inmutable (`PatientCreated`, `PaymentConfirmed`); nunca una orden imperativa (`CreatePatient`). Evidencia: los 7 eventType son past-tense (`event-bus.ts:34-110`).
- **[R] Un evento describe algo que YA ocurrió y no puede deshacerse.** El publisher no espera respuesta ni acuse; la entrega es fire-and-forget con aislamiento de fallos (`event-bus.ts:176-185`). Un consumidor que falla no revierte el hecho.
- **[R] El desacople productor↔consumidor es intencional.** El productor no conoce a sus consumidores (`emitter.emit(eventType)` + `'*'`, `event-bus.ts:165-166`); añadir/quitar consumidores no cambia al productor. *(→ integración: un partner nuevo se suscribe sin tocar el core.)*
- **[+] Los eventos son la única frontera de integración entre bounded contexts.** Cruce de contexto (Clinical → Commercial → Partner) debe ocurrir por evento, no por llamada directa a servicios internos, preservando la "caja negra" clínica.
- **Anti-regla:** un evento **no** transporta lógica de presentación, ni PHI cruda hacia afuera, ni el estado completo de un agregado (solo el delta del hecho).

## 8.2 Domain Semantics — qué significa cada evento

- **[R] Cada evento pertenece a exactly-one bounded context.** Contextos canónicos (evidencia §3): **Core Clinical** (PatientCreated, ObservationAdded, PatientModelUpdated, DecisionGenerated, RiskScoreComputed, RecommendationReviewed) y **Partner/Commercial** (PaymentConfirmed). El contexto es propiedad semántica, no de transporte.
- **[R] Cada evento tiene un agregado de-facto identificado por su clave de dominio.** `patientId` es el agregado en los 6 eventos clínicos; `subjectRef` (pseudónimo) en PaymentConfirmed (`event-bus.ts:34-110`). El agregado es la unidad de consistencia y de futuro particionado.
- **[R] La evidencia clínica se codifica con estándares, no con texto libre.** `ObservationAdded.loincCode` (LOINC) es normativo para observaciones (`event-bus.ts:47`); `DecisionGenerated` porta `ruleId`+`decisionTraceId` para trazabilidad de la decisión (`event-bus.ts:66-76`).
- **[+] Todo evento clínico que alimente una decisión debe ser reconstruible** (evento → decisión → recomendación → revisión). La cadena `ObservationAdded → PatientModelUpdated → DecisionGenerated → RecommendationReviewed` es el eje semántico; hoy los consumidores no están cableados (`registerCoreSubscriptions` nunca llamado, §3) — el contrato exige que, al cablearse, se preserve esta cadena causal.
- **Registro canónico de significado:** la tabla de §3 es el diccionario semántico autoritativo (producer/consumer/aggregate/context por evento). Ningún evento nuevo entra al sistema sin una fila equivalente.

## 8.3 Event Naming Rules — cómo se nombra un evento

- **[R] `PascalCase` + past-tense.** Regla derivada de los 7 eventType canónicos: `PatientCreated`, `ObservationAdded`, `PatientModelUpdated`, `DecisionGenerated`, `RiskScoreComputed`, `RecommendationReviewed`, `PaymentConfirmed`. **Ningún otro estilo es válido.**
- **[R] Prohibido `dot.lowercase` estilo canal.** Los nombres ad-hoc `funnel.assessment.completed`, `funnel.booking.created`, `funnel.lead.created`, `referral.converted`, `referral.triggered`, `vitality.assessed` (rotos, TD-21) **quedan formalmente fuera del contrato**: son un anti-patrón de la migración incompleta, no eventos. Al migrarlos (ADR-EventBus) deben renombrarse a PascalCase past-tense (p.ej. `vitality.assessed` → `VitalityAssessed`, `referral.triggered` → `ReferralTriggered`).
- **[R] Nombre = `<Agregado><VerboPasado>`.** El sujeto es el agregado de dominio, el verbo el hecho: `Patient`+`Created`, `Payment`+`Confirmed`. Sin prefijos de servicio ni de transporte.
- **[+] El eventType es global y estable; nunca se renombra un evento en producción.** Renombrar rompe suscriptores externos; un cambio de significado se modela como evento nuevo + deprecación (ver §8.6). *(→ integración: partners dependen de nombres estables.)*
- **[+] `eventType` (discriminador) es idéntico al nombre del tipo TS y a la clave de despacho** (`emitter.emit(event.eventType)`, `event-bus.ts:165`). Un solo nombre, tres usos: tipo, discriminador, canal de despacho.

## 8.4 Event Envelope Rules — la forma obligatoria

- **[R] Todo evento hereda `BaseEvent`** (`event-bus.ts:26-32`): `eventId`, `tenantId`, `correlationId`, `occurredAt`, `version` + `eventType` (discriminador) + `payload` tipado. Envelope y payload están separados: metadatos transversales arriba, hecho de dominio dentro de `payload`.
- **[R] El bus — no el emisor — sella la identidad y el tiempo.** `eventId` (`randomUUID`), `occurredAt` (ISO-8601 UTC) y `version` se inyectan en `publish()` (`event-bus.ts:152-157`). El emisor **nunca** fabrica su propio eventId/timestamp: garantiza unicidad y monotonía de origen.
- **[R] El emisor provee y es responsable de `tenantId`, `correlationId` y `payload`.** `tenantId` es obligatorio en cada evento (aislamiento, §8.5); `correlationId` propaga la traza del request.
- **[R] `occurredAt` es ISO-8601 UTC string**, no epoch ni Date local — estable para serialización cross-transport y para EventBridge.
- **[+] El payload es un delta inmutable y mínimo:** solo los campos del hecho, `readonly`, sin objetos anidados de estado completo del agregado. Regla derivada de que los 7 payloads son planos y acotados (§3).
- **[+] Campos de envelope faltantes que el contrato reserva (gap Important, §5):** `causationId` (evento que causó a este), `producer`/`source` (servicio de origen). Se **añadirán al `BaseEvent`** por ADR antes de la fase de integración, no ad-hoc por evento. *(→ integración: `source` es requerido por CloudEvents/EventBridge, §8.8.)*

## 8.5 Privacy Rules — qué nunca puede salir

- **[R] `tenantId` en todo evento = frontera dura de aislamiento.** Ningún consumidor puede actuar sobre un evento fuera de su tenant; se alinea con RLS multi-tenant. Es campo de envelope obligatorio (`event-bus.ts:29`).
- **[R] Los eventos hacia el exterior usan pseudónimo, nunca identidad cruda.** `PaymentConfirmed.subjectRef` es un pseudónimo HMAC-SHA256 (`pseudonymize()`, disglobal-client), **no** el `userId` de Disglobal ni el `patientId` interno (`event-bus.ts:98-108`). Determinista pero unidireccional sin el secreto de tenant.
- **[R] Los eventos clínicos internos referencian por id interno, no por PHI.** Los payloads clínicos portan `patientId`/`observationId`/`recommendationId`, nunca nombre, MRN legible como PHI cruda, ni datos demográficos identificables. Minimización de PHI por diseño (§4).
- **[+] Separación de espacios de identidad por contexto:** `patientId` (Core Clinical) **nunca** aparece en un evento de contexto Partner; `subjectRef` (Partner) nunca se resuelve a `patientId` en un payload de evento. El mapeo vive detrás de la frontera clínica, no en el bus. *(→ integración: Disglobal nunca deduce identidad clínica desde eventos.)*
- **[F] Encryption boundaries** aplican al cruzar a transporte de red (EventBridge): payload cifrado/rubricado en tránsito; hoy N/A por ser in-process (§4).
- **Anti-regla:** está prohibido añadir a un payload cualquier campo que permita re-identificar a un sujeto fuera de su tenant sin el secreto de pseudonimización.

## 8.6 Versioning Rules — cómo evoluciona un contrato

- **[R] Todo evento porta `version`** (hoy literal `'1.0'`, `event-bus.ts:32`) — el versionado es parte del envelope desde el día uno, no un añadido posterior.
- **[+] Versión **por evento**, no global.** La versión debe pasar de un `'1.0'` compartido a un versionado independiente por eventType (un cambio en `PaymentConfirmed` no re-versiona `ObservationAdded`). Gap Important §5.
- **[+] Evolución solo aditiva y compatible hacia atrás dentro de una major.** Añadir campos opcionales = compatible (misma major). Quitar/renombrar/cambiar tipo = **nueva major** + nuevo eventType o `version:'2.0'`, con período de deprecación. Los tipos son `readonly` (§4), lo que favorece esta disciplina.
- **[+] Deprecación explícita y gobernada:** un evento/campo deprecado se marca, se anuncia y coexiste con su reemplazo hasta que todos los consumidores migren; nunca se elimina en caliente. Hoy **ausente** (gap, §5) — el contrato lo exige antes de exponer eventos a partners. *(→ integración: partners externos no pueden absorber breaking changes silenciosos.)*
- **[F] Schema registry / contract governance** como fuente ejecutable de versiones cuando haya productores/consumidores fuera del monorepo.

## 8.7 Reliability Rules — qué garantiza (y qué no) la entrega

- **[R] Entrega síncrona, in-process, best-effort.** `publish` → `emitter.emit` entrega a los listeners en orden de registro dentro del mismo proceso (`event-bus.ts:165`). Esto es MVP-aceptable **por diseño** (`event-bus.ts:5,138`), no un defecto.
- **[R] Aislamiento de fallos del consumidor.** Cada handler se envuelve en try/catch; un consumidor que lanza **no** propaga el fallo al productor ni a otros consumidores (`event-bus.ts:176-185`). El hecho ya ocurrió; un consumidor caído no lo revierte.
- **[R] Sin persistencia ni replay hoy.** El bus es un `EventEmitter` sin event store (`event-bus.ts:142`); un evento no entregado (proceso caído) se pierde. Contrato explícito: **no** asumir durabilidad en la capa Local.
- **[R] Idempotencia en el consumidor, no en el bus.** El bus no deduplica por `eventId`; la única cadena activa protege su efecto con un guard de idempotencia propio (`payment-pipeline.ts`). Regla: **todo consumidor con efectos secundarios debe ser idempotente** (asumir at-least-once).
- **[+] `eventId` es la clave de idempotencia estándar.** Los consumidores deben deduplicar por `eventId` (ya presente en el envelope) en lugar de claves ad-hoc. *(→ integración: reintentos de partners/webhooks son inevitables.)*
- **[F] At-least-once + event store + replay** llegan con transporte durable (EventBridge/SQS), ya anticipado por el stub comentado (`event-bus.ts:205-223`). La invariante que lo permite —`publish/subscribe` idéntico entre transportes— ya está garantizada (§8.8).

## 8.8 Interoperability Principles — cómo se conecta con el mundo

- **[R] Transport-agnostic por diseño: la invariante fundacional.** `publish`/`subscribe` es idéntico en Local y en EventBridge (`event-bus.ts:4-5`); el código de dominio nunca conoce el transporte. **Esta es la regla que hace posible toda la fase de integración** — se migra el transporte sin tocar productores/consumidores. *(→ integración: núcleo.)*
- **[R] `emit`/`on` crudo está prohibido en el contrato público.** El `EventEmitter` es un detalle **privado** de `LocalEventBus` (`event-bus.ts:142`); `IEventBus` expone solo `publish`/`subscribe`/`unsubscribe` (`event-bus.ts:128-135`). Exponer `emit/on` rompería la invariante transport-agnostic → rechazado por [ADR_EVENTBUS.md](./ADR_EVENTBUS.md).
- **[R] El mapeo a EventBridge ya está definido:** `eventType → DetailType`, `event → Detail` (stub `event-bus.ts:205-223`). El contrato adopta este mapeo como canónico para el transporte de producción.
- **[+] Alineación CloudEvents.** El envelope ya cubre `type`/`id`/`time` (eventType/eventId/occurredAt); el contrato adopta CloudEvents como estándar-objetivo añadiendo `source` (= `producer`, §8.4) y `specversion`/`datacontenttype`/`subject` al mapear a la frontera externa. *(→ integración: partners esperan un envelope estándar.)*
- **[+] Correlación observabilidad.** `correlationId` se mapea a trace context (OpenTelemetry traceId/spanId) en la frontera de integración; no se inventa un estándar propio.
- **[F] Interop clínica (FHIR/SNOMED).** Referencias FHIR y códigos SNOMED se añaden como extensión (LOINC ya presente, §8.2) cuando exista intercambio con EMRs externos.
- **Principio rector:** en cada frontera externa, Vytalix **adopta el estándar existente** (CloudEvents, EventBridge, LOINC/FHIR, OTel) en lugar de exponer su forma interna — la forma interna es un detalle, el estándar es el contrato.

## 8.9 Governance Rules — quién custodia el contrato

- **[R] La fuente de verdad es el código, no este documento.** Si `event-bus.ts` (la unión `VytalixEvent`) contradice al contrato, **gana el código** (§1). Este documento describe y prescribe; el tipo TS ejecuta.
- **[R] Un concepto, un artefacto canónico.** Existe **un** modelo+contrato de eventos (este archivo) y **un** executive summary ([EVENT_MODEL_EXECUTIVE_SUMMARY.md](./EVENT_MODEL_EXECUTIVE_SUMMARY.md)). Crear un segundo documento que describa "el modelo/contrato de eventos" es una violación de gobernanza (RULE-DOC, AEK v1.1) — ver §9.
- **[+] Todo cambio al contrato de eventos pasa por ADR.** Añadir un eventType, cambiar el `BaseEvent` (p.ej. `causationId`/`producer`), o alterar reglas de nombres/versionado es un cambio de arquitectura gobernado por un ADR (patrón [ADR_EVENTBUS.md](./ADR_EVENTBUS.md)), no un commit suelto.
- **[+] Todo evento nuevo debe registrarse en §3** (fila: eventType/payload/aggregate/context/producer/consumer/status) **antes** de publicarse. El catálogo es la puerta de entrada; un evento sin fila no existe para el contrato.
- **[+] El contrato es enforceable por AEK.** Las reglas [R] son candidatas a chequeo automatizado (naming PascalCase-past-tense, herencia de `BaseEvent`, prohibición de `emit/on` público) — hoy WARNING-only, promovibles cuando la fase de integración lo exija.
- **Custodio:** el Lead Architect es responsable del contrato; los cambios se proponen por ADR y se certifican contra el código.

---

# 9. Trazabilidad de consolidación (Sprint A3) — anti-duplicación

> Sección obligatoria del contrato: qué se reutilizó, actualizó, dejó intacto, y por qué **no** se creó ningún documento nuevo.

## 9.1 Artefactos existentes reutilizados / actualizados / intactos

| Artefacto | Acción A3 | Justificación |
|---|---|---|
| `src/platform/event-bus.ts` | **Reutilizado** (leído, citado, sin tocar) | Fuente de verdad; el contrato se deriva de él. **Cero cambios de código.** |
| `docs/CANONICAL_EVENT_MODEL.md` (este) | **Actualizado** (se le añadió §8 contrato + §9) | El contrato es la capa prescriptiva del **mismo** concepto que el catálogo. Extender = un concepto, un artefacto. |
| `docs/EVENT_MODEL_EXECUTIVE_SUMMARY.md` | **Actualizado** (addendum A3) | Único executive summary del modelo/contrato; se le añade el cierre A3. |
| `docs/ADR_EVENTBUS.md` | **Intacto** (referenciado) | Decisión (Opción A); el contrato la asume, no la reescribe. |
| `EVENTBUS_CURRENT_ARCHITECTURE / OPTION_ANALYSIS / MIGRATION_PLAN`, `ARCHITECTURE_DEPENDENCY_GRAPH` | **Intactos** (referenciados) | Arquitectura/opciones/migración/flujo ya existen; el contrato no los duplica. |

## 9.2 Documentos nuevos creados

**Cero.** No se creó ningún archivo. El contrato se consolidó dentro del artefacto canónico existente. *(Búsqueda previa: `git grep` de "event contract/naming/convention/philosophy/governance" en `docs/`, `README.md`, `src/**/docs/` → sin artefacto equivalente; por tanto se extendió el canónico en vez de crear `CANONICAL_EVENT_CONTRACT.md`, que habría sido un segundo "documento del modelo de eventos".)*

## 9.3 Duplicados evitados (decisión explícita)

- **No** se creó `CANONICAL_EVENT_CONTRACT.md` separado → habría sido dos documentos para "el modelo/contrato de eventos" (violación de §8.9 / RULE-DOC).
- **No** se creó nuevo ADR, roadmap, matriz ni paquete de gobernanza (fuera de alcance A3).
- **No** se recreó arquitectura/decisión/flujo/opciones/migración (existen desde A1).
- Resultado: el repositorio queda **más simple** — un solo artefacto ahora cubre catálogo **y** contrato, en lugar de dispersar reglas.

## 9.4 Evidencia de repositorio por regla

Cada cláusula [R] cita `event-bus.ts:línea` (o el archivo del call-site) en §8. Resumen de anclas: filosofía/naming → `event-bus.ts:34-110,165`; envelope → `:26-32,152-157`; privacidad → `:29,98-108` + `pseudonymize()`; confiabilidad → `:142,165,176-185` + `payment-pipeline.ts`; interoperabilidad → `:4-5,128-135,205-223`; gobernanza → §1 (código > doc) + §3 (catálogo). Naming anti-patrón (dot.lowercase) verificado por `git grep` de los call-sites `emit(` ad-hoc.

## 9.5 Recomendaciones para Sprint B1 (implementación, requiere autorización)

1. **Prerequisito bloqueante (sin cambios):** input de negocio sobre el alcance por-cadena del piloto Disglobal (ver [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) y [EXECUTIVE_DECISION_SUMMARY.md](./EXECUTIVE_DECISION_SUMMARY.md)). El repositorio **no puede** decidirlo (INSUFFICIENT REPOSITORY EVIDENCE).
2. **Renombrar-o-eliminar** los nombres ad-hoc `dot.lowercase` según §8.3 al ejecutar la migración TD-21 (a PascalCase past-tense si se conservan).
3. **Añadir `causationId` + `producer`/`source` al `BaseEvent`** (§8.4/§8.6) como primer cambio de contrato gobernado por ADR — mínimo para auditoría clínica y para `source` de CloudEvents/EventBridge.
4. **Cablear consumidores** (`registerCoreSubscriptions`) preservando la cadena causal clínica de §8.2, con consumidores idempotentes por `eventId` (§8.7).
5. **Diferir** CloudEvents completo / OTel / FHIR / event-store al ADR de transporte de producción (EventBridge), no antes.

---

# 10. Event Domain Architecture — La arquitectura de dominio semántico (Sprint B1.5)

> **Qué es esto.** La arquitectura semántica **permanente** que todo evento futuro debe seguir — el contrato de dominio para cada bounded context, integración, microservicio, componente de IA, partner externo y transporte EventBridge. Extiende (no duplica) el contrato §8: §8 fija las *reglas* (naming, envelope, privacidad); §10 fija la *estructura de dominio* (taxonomía, matriz de campos, matriz de privacidad, escalabilidad, evolución).
>
> **Principio rector:** el código fuente prevalece. Los `eventType` canónicos son PascalCase past-tense **en el código** (`event-bus.ts:34-110`); esta sección **no los renombra**. Introduce una capa **ortogonal** de *namespace de dominio* (dot.lowercase) para clasificación/routing/EventBridge, que convive con el `eventType` sin cambiarlo.

## 10.1 Reconciliación de naming (resolución de conflicto)

Existen **dos ejes de nombre ortogonales**, no uno:

| Eje | Formato | Ejemplo | Autoridad | Uso |
|---|---|---|---|---|
| **`eventType`** (discriminador wire) | **PascalCase past-tense** | `ObservationAdded` | **Código** (`event-bus.ts`) — inmutable | tipo TS, discriminador, clave `emitter.emit` (§8.3) |
| **Domain namespace** (clasificación) | **`vytalix.<dominio>.<subdominio>`** lowercase-dotted | `vytalix.clinical.observation` | Esta arquitectura | EventBridge `source`, routing, ownership, privacidad |

> **Decisión (B1.5):** las convenciones `dot.lowercase` del enunciado (`observation.ingested`, `risk.score.computed`) se adoptan como **namespace de dominio**, NO como `eventType`. El `eventType` permanece PascalCase porque el código manda. Ningún evento se renombra. Esto **no regresa** la regla A3 §8.3 (que prohíbe `dot.lowercase` *como eventType*): sigue prohibido como eventType; se usa solo como namespace de clasificación.

## 10.2 Event Domain Taxonomy (Phase 2) — 6 dominios raíz canónicos

**Método:** un *dominio* es un contexto de **significado** (no de código), con un dueño único, una clase de privacidad dominante y un agregado natural. Se evaluaron los ~23 candidatos del enunciado; se consolidan en **6 raíces** con subdominios. Fragmentar en 23 raíces destruiría la cohesión (Patient/Observation/Decision comparten `patientId` y PHI → mismo dominio).

**Raíces canónicas:** `clinical` · `commerce` · `identity` · `platform` · `intelligence` · `analytics`.

| Candidato (enunciado) | Decisión | Destino canónico | Justificación (evidencia) |
|---|---|---|---|
| Clinical | **KEEP raíz** | `clinical` | Dominio núcleo; 6 de 7 eventos actuales. |
| Patient | **MERGE** | `clinical.patient` | Agregado `patientId` (`handlers.ts:74`); facet del registro clínico. |
| Observation | **MERGE** | `clinical.observation` | LOINC-coded (`event-bus.ts:47`, `handlers.ts:131`); facet clínico. |
| Decision Support | **MERGE** | `clinical.decision` | `DecisionGenerated`/`RecommendationReviewed` (`handlers.ts:203,259`). |
| Risk | **MERGE** | `clinical.risk` | `RiskScoreComputed` derivado clínico (`handlers.ts:179`). |
| Longevity | **MERGE** | `clinical.longevity` | Bio-age derivado clínico (`biological-age.service.ts`); comparte `patientId`+PHI. |
| Payment | **KEEP** | `commerce.payment` | Único chain activo (`payment-webhook.handler.ts:138`); frontera partner. |
| Billing | **MERGE** | `commerce.billing` | Metering/revenue-share (`metering.service.ts`); mismo boundary comercial. |
| Referral | **MERGE** | `commerce.referral` | Handoff partner-facing (webhook a Disglobal, `orchestrator.ts:242`). |
| Partner Integration | **DISAPPEAR (absorbe)** | raíz `commerce` | La raíz `commerce` **es** la frontera de partner; no es un dominio aparte. |
| AI | **MERGE** | `intelligence` (reservado) | Sin eventos hoy; ciclo de modelo/inferencia. |
| ML | **MERGE** | `intelligence` (reservado) | Mismo dominio que AI; no se separan. |
| Workflow | **MERGE** | `platform.workflow` | Orquestación = concern de plataforma (`pipeline-v2.orchestrator.ts`). |
| Notification | **MERGE** | `platform.notification` | Mecanismo de entrega, no dominio de significado. |
| Identity | **KEEP raíz** | `identity` (reservado) | Frontera de confianza (tenant/user). |
| Consent | **MERGE** | `identity.consent` | Mismo dominio de confianza. |
| Security | **SPLIT** | authz→`identity`; audit→`platform.audit` | Dos significados distintos. |
| Audit | **MERGE** | `platform.audit` | Cross-domain; referencia eventos de otros dominios. |
| Analytics | **KEEP raíz** | `analytics` (reservado) | Eventos derivados/agregados (cohortes, `orchestrator.ts:256`). |
| Infrastructure | **DISAPPEAR (absorbe)** | raíz `platform` | Concern técnico transversal. |
| Operational | **DISAPPEAR (absorbe)** | raíz `platform` | Igual que Infrastructure. |
| Telemetry | **MERGE** | `platform.telemetry` | Observabilidad. |
| Platform | **KEEP raíz** | `platform` | Raíz transversal técnica. |

**Mapeo de los 7 eventos canónicos actuales → dominio:**

| eventType | Domain namespace | Dominio raíz |
|---|---|---|
| `PatientCreated` | `vytalix.clinical.patient` | clinical |
| `ObservationAdded` | `vytalix.clinical.observation` | clinical |
| `PatientModelUpdated` | `vytalix.clinical.patient` | clinical |
| `DecisionGenerated` | `vytalix.clinical.decision` | clinical |
| `RiskScoreComputed` | `vytalix.clinical.risk` | clinical |
| `RecommendationReviewed` | `vytalix.clinical.decision` | clinical |
| `PaymentConfirmed` | `vytalix.commerce.payment` | commerce |

> **Regla invariante:** **un evento pertenece a exactamente un dominio (leaf).** El dominio determina dueño, clase de privacidad y elegibilidad de tránsito a partner (§10.5).

## 10.3 Event Naming Standard (Phase 3)

- **`eventType`** = `<Aggregate><PastTenseVerb>`, PascalCase (código manda). Verbos **solo pasado**: Created/Added/Updated/Generated/Computed/Reviewed/Confirmed/Assessed/Triggered.
- **Namespace** = `vytalix.<raíz>.<subdominio>` lowercase-dotted, **singular** (`observation`, no `observations`), máx. 3 niveles. `vytalix` es el root reverse-DNS que habilita namespaces de partner futuros (`disglobal.*` — que Vytalix **nunca** emite).
- **Tense:** pasado (hecho inmutable). **Pluralización:** sustantivo de agregado en singular.
- **Ownership por bounded context:** `clinical.*`→Core Clinical; `commerce.*`→Partner/Commercial; `platform.*`→Platform; `identity.*`→Identity; `intelligence.*`/`analytics.*`→reservados.
- **Nombres prohibidos:** (a) `dot.lowercase` como *eventType* (los rotos `funnel.assessment.completed` etc., §3); (b) verbos imperativos/presente/gerundio (`CreatePatient`, `PatientCreates`, `Creating`); (c) genéricos sin agregado (`Event`, `Update`, `Changed`); (d) prefijo de servicio/transporte (`ApiPatientCreated`, `KafkaX`).
- **Extensibilidad futura:** nuevos subdominios bajo raíces existentes sin nuevo eje (`clinical.genomics`, `commerce.insurance`).

## 10.4 Canonical Contract — matriz de campos (Phase 4)

**Estado actual (hecho, `event-bus.ts:26-32`):** el envelope tiene 6 campos + `eventType` + `payload`. Clasificación de los campos evaluados:

| Campo | Clasificación | En código hoy | Justificación |
|---|---|---|---|
| `eventId` | **Mandatory** | ✅ | Identidad + idempotencia; sellado por el bus (`:154`). |
| `eventType` | **Mandatory** | ✅ | Discriminador (§8.3). |
| `version` / `schemaVersion` | **Mandatory (unificados)** | ✅ (`version`) | Un solo campo; **no** duplicar `schemaVersion` (evitar dos versiones). |
| `tenantId` | **Mandatory** | ✅ | Frontera de aislamiento dura (§8.5). |
| `correlationId` | **Mandatory** | ✅ | Traza de request. |
| `occurredAt` | **Mandatory** | ✅ | ISO-8601 UTC (§8.4). |
| `causationId` | **Recommended** (por ADR) | ❌ | Cadena causal para auditoría clínica (gap Important §5). |
| `producer` / `sourceSystem`(evento) | **Recommended** (por ADR) | ❌ | `source` de CloudEvents/EventBridge (§10.6). *(Distinto de `ObservationAdded.payload.sourceSystem`, que es provenance del dato clínico, no del evento.)* |
| `aggregateId` | **Recommended (formalizar)** | ⚠️ de-facto (`patientId`/`subjectRef`) | Habilita partición/replay durable. |
| `aggregateType` | **Recommended** | ❌ | Compañero de `aggregateId` (`'Patient'`,`'Payment'`); routing. |
| `subjectRef` | **Contextual** | ✅ en `PaymentConfirmed` | **Mandatory** en eventos de frontera partner (pseudónimo HMAC); **Forbidden como id crudo** en clínicos internos (usan `patientId`). |
| `privacyClassification` | **Recommended (nuevo)** | ❌ | Etiqueta de privacidad legible por máquina en el envelope → el transporte aplica redacción/routing automático en la frontera Disglobal (§10.5). Alto valor de integración. |
| `clinicalClassification` | **Optional/Future** | ⚠️ (`loincCode` en payload) | Flag clínico-vs-derivado; hoy vive en payload (LOINC). Opcional en envelope. |
| `traceId` (OTel) | **Future** | ❌ | Mapear `correlationId`→traceId en la frontera de observabilidad. |
| `partitionKey` | **Future** | ❌ | Para transporte durable (EventBridge/Kinesis); derivar de `aggregateId`+`tenantId`. |
| `idempotencyKey` | **Optional (= `eventId`)** | ⚠️ | Usar `eventId` como clave de idempotencia (§8.7); campo separado redundante salvo clave provista por partner. |

**Forbidden en cualquier evento:** `userId` crudo de Disglobal; PHI cruda (nombre/DOB/MRN legible) en envelope; datos de presentación; estado completo del agregado.

> Todo cambio a esta matriz (añadir `causationId`/`producer`/`aggregateId`/`privacyClassification` al `BaseEvent`) es **cambio de contrato gobernado por ADR** (§8.9). **No se implementa en B1.5.**

## 10.5 Privacy Architecture (Phase 5)

**Clases:** PHI · PII · Financial · Clinical-derived · Operational · Pseudonymized · Anonymous.

| Dominio / evento | Clase dominante | ¿Sale del tenant? | ¿Partner (Disglobal) puede recibir? | Transformación obligatoria |
|---|---|---|---|---|
| `clinical.patient` (`PatientCreated`: patientId, mrn, orgId) | PHI-adyacente (mrn) + id interno | **No** | **No** | `mrn`/`patientId` nunca salen |
| `clinical.observation` (loincCode, valueNumeric) | **PHI clínica** | **No** | **No** (crudo) | solo derivados/agregados salen |
| `clinical.risk` / `clinical.longevity` / `clinical.decision` | **Clinical-derived** | interno crudo | **Solo score derivado** (bioAge, riskCategory) sobre sujeto pseudonimizado | hash del sujeto |
| `commerce.payment` (`subjectRef`, amount) | **Financial + Pseudonymized** | `subjectRef` cruza | **Sí** (subjectRef, amount, product) | `subjectRef` = HMAC-SHA256 |
| `commerce.referral` (`ReferralTriggered`) | Pseudonymized clínico-adyacente | cruza como pseudónimo | **Sí** (pseudonimizado; tipo/urgencia) | HMAC subjectRef; **sin** patientId |
| `platform.audit` | Operational (referencia ids) | **No** | **No** | interno |

**Reglas de tránsito:**
- **Nunca viaja:** `patientId`, `mrn`, PHI cruda (nombre/DOB), `userId` crudo de Disglobal, valores de observación crudos hacia el partner.
- **Debe hashearse:** identidad de sujeto que cruza al partner → `subjectRef = HMAC-SHA256(userId, tenantSecret)` (evidencia: `disglobal-client.pseudonymize()`).
- **Debe cifrarse (Future):** cualquier evento sobre transporte de red (EventBridge) → límite de cifrado de payload.
- **Se queda en el tenant:** todo payload `clinical.*` crudo; `tenantId` lo garantiza (§8.5).
- **El partner puede recibir:** `subjectRef` pseudonimizado + scores derivados + confirmación de pago + tipo/urgencia de referral. **Nada de detalle clínico crudo.**

> **Habilitador de integración:** el campo `privacyClassification` (§10.4, Recommended) haría estas reglas **ejecutables por el transporte** — el bus/EventBridge redacta o bloquea automáticamente según la etiqueta antes de cruzar a Disglobal. Es la pieza que convierte esta matriz de política en enforcement.

## 10.6 Interoperability — compatibilidad semántica (Phase 6)

> Solo compatibilidad semántica; **sin forzar implementación.**

| Estándar | Compatibilidad | Evidencia | Alineación futura (sin impl) |
|---|---|---|---|
| **CloudEvents** | **Alta** | `eventType≈type`, `eventId≈id`, `occurredAt≈time` | añadir `producer`=`source`, `specversion`, `subject`(=subjectRef) en la frontera |
| **AWS EventBridge** | **Diseñado-para** | stub `eventType→DetailType`, `event→Detail` (`event-bus.ts:205-223`); publish/subscribe transport-agnostic (`:4-5`) | mapear namespace de dominio → `source`; `aggregateType`→routing |
| **OpenTelemetry** | Media | `correlationId≈trace` (no traceId/spanId) | mapear `correlationId`→`traceId` en boundary |
| **LOINC** | **Nativa/presente** | `ObservationAdded.loincCode` (`event-bus.ts:47`); decision.engine cita LOINC 2089-1/2085-9/2345-7 (`decision.engine.ts:223-225`) | ya alineado para observaciones |
| **FHIR R4** | **Parcial/legacy** | FHIR-like solo en `src/legacy/` (`ingestion_service.ts:60` "FHIR R4 types", `external.handler.ts:113` `fhirResourceId`); **NO** en eventos tipados | Future: refs FHIR como extensión `clinical.*`; `ObservationAdded`→FHIR Observation |
| **HL7 v2** | Baja | no en código | solo gateway futuro |
| **SNOMED** | Ausente | no en código | extensión de codificación clínica futura |

> **Hecho:** LOINC ya es nativo del modelo (código); FHIR es **aspiracional/legacy** (solo `src/legacy`), no parte del contrato de eventos canónico. El namespace de dominio (§10.2) es el mapeo natural a `source` de CloudEvents/EventBridge.

## 10.7 Scalability — absorción de modalidades futuras (Phase 7)

**Prueba:** ¿la taxonomía absorbe cada modalidad futura **sin rediseño** (mismo envelope, mismo naming, nuevo subdominio)?

| Modalidad futura | Encaja en | ¿Rediseño? |
|---|---|---|
| Genomics / Epigenetics / Proteomics / Metabolomics | `clinical.genomics`, `clinical.omics.*` (nuevo subdominio) | **No** |
| Digital Twins | `clinical.patient` (extiende `PatientModelUpdated`) | **No** |
| Medical Devices / Wearables | `clinical.observation` (device-sourced; `payload.sourceSystem` ya existe) o `clinical.device` | **No** — provenance ya anticipada |
| Imaging | `clinical.imaging` | **No** |
| Dentistry | `clinical.dental` (`src/dental` ya existe) | **No** |
| Nutrition | `clinical.nutrition` | **No** |
| Precision Medicine | `clinical.*` + `intelligence.*` | **No** |
| AI Agents | `intelligence.agent` (reservado) | **No** |
| Research / Clinical Trials | `analytics.research`, `clinical.trial` | **No** |
| Insurance | `commerce.insurance` (`openapi/vytalix_insurtech_v1.yaml` ya existe) | **No** — `commerce` absorbe |
| Marketplace | `commerce.marketplace` | **No** |

> **Conclusión (Phase 7):** las 6 raíces + subdominios + namespaces reservados absorben **todas** las modalidades listadas sin rediseño. El envelope es agnóstico de modalidad; `payload.sourceSystem` ya anticipa dispositivos/wearables; `commerce` ya tiene evidencia de insurtech. La taxonomía es **future-proof por construcción**.

## 10.8 Semantic Evolution Strategy (Phase 8)

- **Conceptos estables (nunca cambian):** las 6 raíces de dominio; los 6 campos Mandatory del envelope; `eventType` PascalCase past-tense; aislamiento por `tenantId`; pseudonimización `subjectRef`; invariante transport-agnostic publish/subscribe.
- **Extensiones futuras probables:** subdominios `clinical.omics/imaging/device`; activación de `intelligence.*` y `analytics.*`; `commerce.insurance/marketplace`; campos de envelope `causationId`/`producer`/`aggregateId`/`privacyClassification`.
- **Namespaces reservados (reclamados ahora, vacíos):** `intelligence.*`, `analytics.*`, `identity.*`, `clinical.genomics.*`, `clinical.imaging.*`, `clinical.device.*`, `commerce.insurance.*`, `commerce.marketplace.*`. Reservar previene colisiones de nombres.
- **Estrategia de deprecación** (referencia §8.6, no se repite): aditiva dentro de major; deprecar-no-borrar; coexistencia old+new hasta migrar todos los consumidores; versión **por-evento**.
- **Evolución de versión:** añadir campos = misma major; quitar/retipar = nueva major (nuevo eventType o `version:'2.0'`).
- **Reglas de compatibilidad:** consumidores **ignoran** campos desconocidos (forward-compat); productores **nunca** quitan campos dentro de una major (backward-compat); un `eventType` **nunca** se renombra en producción.

---

> **STOP.** Modelo (§1–§7) **+ contrato** (§8) **+ arquitectura de dominio semántico** (§10) consolidados en un único artefacto canónico, derivados del código fuente. Cero código/runtime/EventBus/tipos/eventos modificados (typecheck 36 sin cambio). Cero documentos nuevos; se extendió el canónico. Toda recomendación que requiera runtime/implementación/nuevos eventos/APIs queda **documentada, no implementada**, esperando autorización explícita.
