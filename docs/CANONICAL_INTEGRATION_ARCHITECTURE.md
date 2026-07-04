# CANONICAL_INTEGRATION_ARCHITECTURE.md
> **Vytalix Platform — Canonical Integration Architecture (single authoritative integration view)**

| Campo | Valor |
|---|---|
| Rol | **Arquitectura de integración canónica**: cómo cada bounded context colabora, comunica e intercambia información (estilos, transportes, patrones, ownership, ciclo de vida de interacción, integraciones externas) |
| Estado | ACTIVO — vista de integración canónica |
| Sprint | B3 — Canonical Integration Architecture |
| Modo | **Arquitectura/análisis únicamente** — sin código/runtime/EventBus/API/DTO/tests |
| Fecha | 2026-07 |

> **Fuente de verdad: el código fuente** (`src/**`, `openapi/**`). Toda afirmación cita `archivo:línea`. **No duplica:** el modelo de dominio/contextos → [CANONICAL_DOMAIN_ARCHITECTURE.md](./CANONICAL_DOMAIN_ARCHITECTURE.md) (referenciado; aquí se añade la capa de *transporte y comunicación*, no se re-describen los contextos); los eventos → [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md); el flujo/grafo → [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md); la decisión EventBus → [ADR_EVENTBUS.md](./ADR_EVENTBUS.md); las cadenas → [EVENT_CHAIN_CLASSIFICATION.md](./EVENT_CHAIN_CLASSIFICATION.md). Este es un concepto sin ubicación canónica previa: la **vista de integración**.

---

## 0. Executive Summary

**En una frase:** Vytalix integra sus 7 contextos mediante **REST síncrono** (`/api/v2`, `/admin`, dental) para el plano externo/comando, **EventBus in-process publish/subscribe** para colaboración async (solo la cadena **PaymentConfirmed** activa), **webhooks HMAC** bidireccionales con Disglobal (entrante activo, saliente inactivo), y **Redis** para idempotencia + streaming de metering. La seguridad de integración se ancla en `X-Tenant-ID` (RLS), `X-API-Key` (partner), firma **HMAC-SHA256 con `timingSafeEqual`** (webhooks) y **pseudonimización** (ACL clínico). `X-Correlation-ID` atraviesa todo (seam de trazabilidad). Patrones DDD presentes: **ACL, Published Language (OpenAPI + RFC 7807), Shared Kernel (tenantId/EventBus), Open Host, Customer/Supplier, Conformist, Event Collaboration, Process Manager, Ports & Adapters**. **Ausentes (gaps): Outbox y Saga/compensación.**

**Superficie de integración montada hoy (`server.ts:127-155`, evidencia):**

| Ruta | Auth / transporte | Router | Contexto dueño |
|---|---|---|---|
| `/liveness` `/readiness` `/health` `/metrics` `/metrics/prometheus` | público, sin auth | observability.handler | Platform |
| `/api/v2/*` | **X-API-Key** (Disglobal + partners) | external-v2.handler | Commerce/Partner |
| `/api/v2/webhooks/payment` | **HMAC X-Disglobal-Signature** (entrante) | payment-webhook.handler | Commerce/Partner |
| `/api/v2/dental/{admin,commerce,core}` | `dentalTenantContext` (X-Tenant-ID + X-User-ID) | dental routers | Dental |
| `/admin` | **JWT** (interno) | billing-admin.handler | Commerce (Billing) |
| `/api/funnel` `/api/exchange-rate` | **COMENTADO** (`server.ts:134-135`) | — | Growth/Funnel (inactivo) |

> **Hecho notable:** el API clínico `/v1` (patient/observation en `handlers.ts`) **no está montado** en el `server.ts` activo (grep de mount `/v1` vacío salvo `demo/`). Ver Gap GI-6.

---

## 1. Repository Evidence (discovery-first)

| Mecanismo de integración | Evidencia (archivo:línea) |
|---|---|
| REST externo v2 (Open Host) | `server.ts:138` `app.use('/api/v2', createExternalV2Router())` |
| Webhook de pago entrante (HMAC) | `payment-webhook.handler.ts:47-56` `verifySignature` + `crypto.timingSafeEqual`; `:116` gate |
| Idempotencia webhook (Redis) | `payment-webhook.handler.ts:66-73` `webhook:idempotency:{intentId}` TTL 86 400s |
| Pipeline post-pago (Process Manager) | `payment-pipeline.ts:26` `ACTIVATION_GUARD_TTL 24h`; `:117` subscribe PaymentConfirmed; registrado `server.ts:175` |
| Idempotencia API v2 (Redis) | `external-v2.handler.ts:47-51` `idempotency:{tenantId}:{key}`; middleware `:163,214` |
| Webhook saliente a partner (HMAC) | `pipeline-v2.orchestrator.ts:300-301` `sha256=HMAC(timestamp.body)`; lee `webhookUrl/webhookSecret` `:283-284` **(listeners comentados `server.ts:171`)** |
| Cliente saliente Disglobal (Adapter/Gateway) | `platform/disglobal-client.ts` (fetch, `pseudonymize`, `batchAssessSegment`, X-Idempotency-Key) |
| Segunda vía HMAC (hardening) | `hardening.middleware.ts:159-191` `X-Vytalix-Signature: sha256=<hex>` + `timingSafeEqual` |
| Metering streaming + batch | `metering.service.ts:87` `redis.xadd(METER_STREAM_KEY,'*',…)`; flush `server.ts:178` `setInterval(flushMeterStream, 60_000)` |
| Correlación distribuida | `server.ts:99-104` genera/forwarda `X-Correlation-ID`, echo en respuesta |
| Published Language de error | `server.ts:158-167` RFC 7807 `type: https://api.vytalix.health/errors/{status}` |
| EventBus (Ports & Adapters) | `event-bus.ts:128-135` `IEventBus` (puerto) + `LocalEventBus`/EventBridge stub (adapters) |
| Shared Kernel tenant (RLS) | `server.ts` `dentalTenantContext`; `withTenant`/RLS (todos los contextos) |
| Contratos publicados | `openapi/{openapi,vytalix-platform-v2,dental-api-v2,vytalix_insurtech_v1}.yaml`, `docs/vertical2/OPENAPI-v2-commerce.yaml` |

---

## 2. Integration Principles (derivados de la evidencia)

1. **El plano externo es síncrono y contractual; el interno tiende a asíncrono por evento.** `/api/v2` (comando/consulta partner) es REST; la colaboración cross-context es EventBus (§4).
2. **Toda frontera externa lleva Published Language.** OpenAPI (contratos) + RFC 7807 (errores) + contrato de evento (§CANONICAL_EVENT_MODEL). Ningún formato interno se expone crudo.
3. **La identidad clínica nunca cruza sin ACL.** `pseudonymize()` (HMAC) protege al partner de la identidad interna; el `subjectRef` es la única forma de sujeto hacia Disglobal.
4. **Aislamiento por tenant es transversal (Shared Kernel).** `X-Tenant-ID` + RLS gobiernan cada interacción; sin tenant, no hay operación.
5. **Idempotencia en la frontera, no en el bus.** `X-Idempotency-Key` (v2) y `webhook:idempotency:{intentId}` (webhook) son guards de frontera (Redis TTL 24h); el bus in-process no deduplica (ver A3 §8.7).
6. **Trazabilidad universal.** `X-Correlation-ID` se propaga y se refleja en toda respuesta → seam natural para OpenTelemetry (§6).
7. **Los webhooks se firman y se verifican en tiempo constante.** HMAC-SHA256 + `timingSafeEqual` en ambas direcciones.

---

## 3. Communication Matrix (estilos de comunicación)

| Estilo | ¿Presente? | Dónde (evidencia) | Estado |
|---|---|---|---|
| **Síncrono Request/Response** | ✅ | `/api/v2`, `/api/v2/dental/*`, `/admin`, observability (`server.ts:127-155`) | Activo |
| **Asíncrono Event-driven** | ✅ | EventBus publish/subscribe (`event-bus.ts`); PaymentConfirmed | **Solo PaymentConfirmed activo**; resto inactivo (`server.ts:171` comentado) |
| **Pipeline (Process Manager)** | ✅ | `payment-pipeline.ts` (PaymentConfirmed→activación→notificación); `pipeline-v2.orchestrator.ts` | payment-pipeline activo; orchestrator inactivo |
| **Webhook entrante** | ✅ | `payment-webhook.handler.ts` (HMAC) | **Activo** (Disglobal→Vytalix) |
| **Webhook saliente** | ✅ (código) | `pipeline-v2.orchestrator.ts:300` `deliverReferralWebhook` | **Inactivo** (listener comentado) |
| **Batch** | ✅ | `disglobal-client.batchAssessSegment` (concurrency 10); `flushMeterStream` cada 60s | Activo (metering) |
| **Streaming** | ✅ | Redis stream `metering.service.ts:87` `xadd` | Activo |

---

## 4. Interaction Matrix — ciclo de vida por capacidad (Phase 6 del scope)

> Para cada capacidad mayor: Trigger · Caller · Receiver · Transport · Contract · Persistence · Read Model · Observability · Failure · Compensation.

### IM-1 · Payment Confirmation *(ACTIVO)*
Trigger: pago en Disglobal · Caller: **Disglobal** · Receiver: `payment-webhook.handler` · Transport: **HTTPS webhook + HMAC** (`X-Disglobal-Signature`) · Contract: firma + body (intentId/subjectRef/amount) · Persistence: Redis idempotency `webhook:idempotency:{intentId}` + activation guard 24h · Read model: activation record · Observability: `X-Correlation-ID` + metrics · **Failure:** firma inválida→rechazo; replay→idempotente (200 sin reprocesar) · **Compensation:** ninguna (Disglobal reintenta). → luego `publish.paymentConfirmed` → `payment-pipeline` (activación + notificación).

### IM-2 · Vitality / Preventive Assessment *(síncrono, activo)*
Trigger: request partner · Caller: **Disglobal/partner** · Receiver: `external-v2.handler` → `longevity/biological-age.service` · Transport: **REST `/api/v2` + X-API-Key + X-Idempotency-Key** · Contract: OpenAPI v2 · Persistence: cache de resultado · Read model: CohortInsight (`insights.service`) · Observability: correlationId · **Failure:** idempotency replay (`idempotency:{tenantId}:{key}`) · **Compensation:** ninguna.

### IM-3 · Referral Handoff *(async saliente, INACTIVO)*
Trigger: decisión clínica (`referral.engine.ts:212`) · Caller: `referral.engine` · Receiver: `orchestrator.deliverReferralWebhook` → **partner** · Transport: **webhook saliente HMAC** `sha256=HMAC(timestamp.body)` · Contract: tenant `webhookUrl`/`webhookSecret` · Persistence: `persistReferral` · Read model: referral read · Observability: log · **Failure:** `catch → log` (sin retry/DLQ) · **Compensation:** ninguna. → **estado: inactivo** (evento ad-hoc roto, EVENT_MIGRATION_BACKLOG W4).

### IM-4 · Metering / Revenue Share *(streaming+batch, activo)*
Trigger: evento medible · Caller: servicios · Receiver: `metering.service` · Transport: **Redis stream (`xadd`) + flush batch 60s** · Contract: interno · Persistence: billing record · Read model: `/usage` (billing-admin) · Observability: `logger.debug({flushed})` · **Failure:** non-blocking (no bloquea la operación) · **Compensation:** N/A.

### IM-5 · Dental Booking *(síncrono, activo)*
Trigger: request · Caller: cliente vía `/api/v2/dental/commerce` · Receiver: `dental-commerce.engines` · Transport: **REST + `dentalTenantContext`** · Contract: dental OpenAPI · Persistence: booking (Prisma, `dental/repositories`) · Read model: booking read · Observability: `dental/services/audit.service` · **Failure:** lock atómico de slot · **Compensation:** transición de estado.

### IM-6 · Core Clinical publish *(publicado, consumidor inerte)*
Trigger: create patient/observation (`handlers.ts:74,129`) · Caller: clinical handler · Receiver: `registerCoreSubscriptions` (**no cableado**, `event-bus.ts:273,289`) · Transport: EventBus publish · **Failure/Compensation:** N/A (sin consumidor activo).

---

## 5. Context Collaboration Map (capa de transporte)

> La relación **DDD** (Shared Kernel/ACL/Customer-Supplier/Conformist) está en [CANONICAL_DOMAIN_ARCHITECTURE.md](./CANONICAL_DOMAIN_ARCHITECTURE.md) §5 — **no se repite**. Aquí se añade el **transporte** de cada arista.

| Origen → Destino | Transporte | Síncrono/Async | Estado | Evidencia |
|---|---|---|---|---|
| Disglobal → Commerce (comando/consulta) | REST `/api/v2` + X-API-Key | Sync | Activo | `server.ts:138` |
| Disglobal → Commerce (pago) | Webhook HMAC | Async (push) | **Activo** | `payment-webhook.handler` |
| Commerce → (activación/notificación) | EventBus → pipeline | Async | **Activo** | `payment-pipeline.ts` |
| Clinical → Commerce (referral) | Webhook saliente HMAC | Async (push) | **Inactivo** | `orchestrator.ts:300` |
| Longevity → (re-score/cache) | EventBus (vitality.assessed) | Async | **Inactivo** | `orchestrator.ts:224` |
| Commerce → Disglobal (SDK saliente) | HTTPS fetch + X-Idempotency-Key + pseudonymize | Sync | Activo (batch) | `disglobal-client.ts` |
| Identity → todos | X-Tenant-ID + RLS (in-request) | Sync | Activo | `withTenant` |
| Platform → todos | EventBus (Open Host) + Redis + logger | Ambos | Activo | `event-bus.ts`, `redis.ts` |
| Dental → cliente | REST `/api/v2/dental` (barrel-isolated) | Sync | Activo | `server.ts:146-152` |
| Growth/Funnel → Commerce | — | — | **Desmontado** | `server.ts:134` comentado |

---

## 6. Integration Ownership & External Integration Architecture

### 6.1 Ownership (quién inicia / consume / controla contrato y consistencia)

| Interacción | Inicia | Consume | Dueño del contrato | Dueño de consistencia |
|---|---|---|---|---|
| `/api/v2` Open Host | Partner | Commerce | Commerce (OpenAPI v2 + RFC 7807) | Commerce + Identity (tenant) |
| Payment webhook | Disglobal | Commerce | Commerce (HMAC + schema) | Idempotency guard (Redis) |
| EventBus | Productores | Suscriptores | Platform (`VytalixEvent` / ADR_EVENTBUS) | Consumidor (idempotente) |
| Tenant/RLS | Todo request | Todos | Identity | Identity (RLS) |
| Referral webhook (saliente) | Clinical (referral.engine) | Partner | Commerce (formato webhook) | ninguno (sin retry) — gap |
| Dental API | Cliente | Dental | Dental (barrel + OpenAPI) | Dental |

### 6.2 External Integration Architecture

**Disglobal (única integración externa con evidencia activa):**
- **Entrante:** `/api/v2` (X-API-Key) + webhook de pago (HMAC `X-Disglobal-Signature`, `timingSafeEqual`).
- **Saliente:** `disglobal-client` (fetch, X-Idempotency-Key, `pseudonymize` HMAC, `batchAssessSegment` cap 10) + webhook de referral (HMAC, **inactivo**).
- **Patrón:** **Open Host Service** (`/api/v2`) + **Published Language** (OpenAPI v2) + **Anti-Corruption Layer** (pseudonimización) + **Conformist** del lado Disglobal.

**Integraciones futuras (conceptuales, evidencia mínima):**

| Externo | Evidencia en repo | Patrón de encaje |
|---|---|---|
| Insurance | `openapi/vytalix_insurtech_v1.yaml` + `docs/INTEGRATION_CONTRACT_v1.1.md` | Open Host bajo Commerce |
| FHIR | FHIR-like solo en `src/legacy/ingestion_service.ts:60` | **ACL** hacia Clinical (no nativo) |
| Laboratory | — (conceptual) | **Supplier → Observation** |
| Wearables | `payload.sourceSystem` en ObservationAdded | Supplier → Observation |
| AI / futura | namespace reservado `intelligence.*` (EVENT_MODEL §10.8); `facial-analysis.service` | Event Collaboration / Open Host |
| Marketplace | reservado (`commerce.marketplace`) | Open Host |

> Todo lo futuro es **conceptual**; no se modela ni se crean documentos (Architecture Evolution Rule).

---

## 7. Future-readiness

- **EventBridge/Kafka:** el puerto `IEventBus` + stub EventBridge (`event-bus.ts:205-223`) permiten cambiar de transporte sin tocar productores/consumidores (Ports & Adapters ya presente). El `X-Correlation-ID` mapea a trace context.
- **Microservicios:** los seams de BC (CANONICAL_DOMAIN_ARCHITECTURE §5) son las fronteras; las aristas de §5 (aquí) ya distinguen sync (REST) vs async (evento) → guía de descomposición.
- **Durabilidad:** requiere **Outbox** (ausente, gap GI-1) antes de garantizar entrega en transporte de red.

---

## 8. Architectural Gaps (integración — estructural, sin implementación)

| # | Gap | Tipo | Evidencia |
|---|---|---|---|
| GI-1 | **Sin Outbox** — el bus in-process pierde eventos en crash | Durabilidad | `event-bus.ts:142` EventEmitter sin persistencia |
| GI-2 | **Sin Saga/compensación** — flujo pago→activación→booking→notificación sin compensación de fallo parcial | Consistencia | `payment-pipeline.ts` (sin rollback cross-step) |
| GI-3 | Webhook saliente de referral **sin retry/DLQ** (solo `catch→log`) | Confiabilidad | `orchestrator.ts:250-252` |
| GI-4 | **Dos vías HMAC** de firma de webhook (payment `X-Disglobal-Signature` + hardening `X-Vytalix-Signature`) | Duplicación/consistencia | `payment-webhook.handler.ts:47` vs `hardening.middleware.ts:166` |
| GI-5 | Cadenas async **inactivas** (listeners comentados) → integración diseñada, no cableada | Wiring | `server.ts:171`; EVENT_CHAIN_CLASSIFICATION |
| GI-6 | API clínico **`/v1` no montado** en `server.ts` activo | Superficie | grep mount `/v1` vacío (salvo `demo/`) |
| GI-7 | Idempotencia **por-endpoint** (Redis), no unificada a nivel de bus | Consistencia | `external-v2` + `payment-webhook` guards separados |

> Todos son observaciones estructurales. Su resolución (si se autoriza) es trabajo de sprints funcionales posteriores.

---

## 9. Architectural Evidence for Future Enterprise Modeling *(record-only, sin modelar)*

> Por la *Architecture Evolution Rule*: se **registra** evidencia que soporta modelado enterprise futuro; **no** se modela ni se crean documentos.

| Dominio enterprise futuro | Evidencia presente (semilla) |
|---|---|
| **Enterprise Domains** | 7 BCs + reservados (Insurance/Genomics/Lab/AI) — CANONICAL_DOMAIN_ARCHITECTURE §2 |
| **Capability Mapping** | 24 capacidades inventariadas (DOMAIN §1) |
| **Information Model** | `BaseEvent` envelope + agregados + LOINC + `subjectRef` (EVENT_MODEL §10.4) |
| **Knowledge Architecture** | `core/loinc-registry`, `core/algorithm-registry`, reglas de `decision.engine` |
| **AI Architecture** | namespace `intelligence.*` reservado; `facial-analysis.service`; `batchAssessSegment` |

---

## 10. Roadmap Impact

**Assessment (hecho):** la vista de integración **no cambia las prioridades** de [ROADMAP_V2.md](./ROADMAP_V2.md). Refuerza la prioridad existente de **B1 (migración EventBus)** — las cadenas async están diseñadas pero inactivas (GI-5) — y sitúa **Outbox/Saga** (GI-1/GI-2) en la fase de transporte de producción (EventBridge), ya prevista como Futuro. Ningún reordenamiento objetivo.

**Decisión:** **ROADMAP_V2 sin cambios.** Los gaps GI-1..GI-7 quedan registrados como insumo estructural.

---

## 11. Validación (obligatoria)

| ✓ | Ítem | Evidencia |
|---|---|---|
| ✓ | Repositorio inspeccionado primero | `server.ts`, handlers, middlewares, pipelines, `openapi/**` leídos antes de escribir |
| ✓ | Repositorio = fuente de verdad | cada afirmación con `archivo:línea` |
| ✓ | Sin documentación duplicada | 1 doc nuevo (vista sin ubicación previa); dominio/eventos/flujo referenciados, no recreados |
| ✓ | Solo un doc canónico nuevo justificado | integración ≠ dominio (B2) ≠ flujo (DEPENDENCY_GRAPH) |
| ✓ | Cero código de producción modificado | solo este `.md` |
| ✓ | Cero runtime / EventBus / API / DTO / tests | — |
| ✓ | ROADMAP modificado solo si cambian prioridades | **sin cambios** (§10) |
| ✓ | Typecheck sin cambio | **36** |

---

> **STOP.** Arquitectura de integración canónica completada (principios · matrices de comunicación e interacción · mapa de colaboración con transporte · ownership · integración externa Disglobal · gaps GI-1..GI-7 · evidencia enterprise record-only). No se inició implementación, no se refactorizó, no se migraron integraciones, no se cambió EventBus, no se crearon APIs ni contextos. Roadmap sin cambios. Esperando autorización explícita para Sprint B4.
