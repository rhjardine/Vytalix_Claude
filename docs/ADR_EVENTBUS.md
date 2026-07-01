# ADR_EVENTBUS.md
> **Vytalix Platform — Canonical Architecture Decision Record: Event System**

| Campo | Valor |
|---|---|
| ADR | EventBus (candidato a ADR-009+; autoridad arquitectónica del sistema de eventos) |
| Estado | **PROPOSED** (decisión de arquitectura; pendiente de aceptación + input de negocio) |
| Sprint | A1 |
| Fecha | 2026-06 |
| Fuentes | `platform/event-bus.ts`, `server.ts`, `payment-pipeline.ts`, `pipeline-v2.orchestrator.ts`, funnel/biological-age/referral/quota; [EVENTBUS_CURRENT_ARCHITECTURE.md](./EVENTBUS_CURRENT_ARCHITECTURE.md), [EVENTBUS_OPTION_ANALYSIS.md](./EVENTBUS_OPTION_ANALYSIS.md) |
| Regla | Evidencia de código sobrescribe documentos. **Sin implementación.** |

---

## Contexto (verificado)

Ver [EVENTBUS_CURRENT_ARCHITECTURE.md](./EVENTBUS_CURRENT_ARCHITECTURE.md). Resumen: existe un **bus tipado canónico** (`IEventBus` = `publish`/`subscribe`/`unsubscribe`, `LocalEventBus` con EventEmitter privado, entrega síncrona in-process, aislamiento de fallos, eventos `VytalixEvent` con `correlationId`/`tenantId`), diseñado explícitamente para ser **transport-agnostic** (Local hoy → EventBridge en producción; `event-bus.ts:4-5`). La única cadena activa es **PaymentConfirmed** (`server.ts:175`). Coexiste un **sistema ad-hoc EventEmitter** (`emit`/`on` con nombres string) que está **roto en compile y runtime** y con listeners **comentados** (TD-21).

---

## Fase 2 — Análisis de causa raíz de TD-21 (evidencia)

TD-21 (9 errores `emit`/`on`) existe por un **refactor de migración incompleto**, NO por un diseño de dos modelos:

1. **Migración parcial.** El bus está diseñado como publish/subscribe transport-agnostic (`event-bus.ts:4-5`). Solo la cadena `PaymentConfirmed` se completó con este modelo (`registerPaymentPipeline` activo). Evidencia: `payment-pipeline.ts:117`, `server.ts:175`.
2. **Divergencia arquitectónica / modelo previo.** Los call-sites `emit`/`on` (funnel/biological-age/referral/quota/pipeline-v2) asumen una API EventEmitter (`emit(name,payload)`/`on(name,handler)`) que `IEventBus` **nunca expuso** (LocalEventBus mantiene el `emitter` **privado**, `event-bus.ts:142`). Son remanentes de un modelo pre-migración.
3. **Registros faltantes.** `registerCoreSubscriptions` (suscripciones tipadas) **nunca se llama** (grep vacío). `registerPlatformEventListeners` (listeners ad-hoc) está **comentado** (`server.ts:172`), solo invocado en `legacy/`.
4. **Rutas muertas.** Ninguna cadena ad-hoc funciona: emit/on inexistentes + listeners no registrados. Sin evidencia de que hayan funcionado alguna vez.
5. **Abstracción rota.** Los nombres de evento ad-hoc (`vitality.assessed`, etc.) no son `VytalixEventType` → incluso con emit/on, no encajan en el modelo tipado sin añadirlos a la unión.
6. **Suposición oculta de runtime.** El código asumía `eventBus` como EventEmitter directo; el bus real encapsula el EventEmitter tras publish/subscribe.

**Conclusión:** TD-21 es la manifestación de una migración EventEmitter→bus-tipado que quedó al ~15% (solo PaymentConfirmed).

---

## Fase 3 — Restricciones que toda implementación futura DEBE preservar (verificadas)

| # | Restricción | Evidencia |
|---|---|---|
| C1 | **Interfaz publish/subscribe transport-agnostic** (idéntica Local↔EventBridge) | `event-bus.ts:4-5`, stub EventBridge 205-223 |
| C2 | **Entrega síncrona in-process** (comportamiento actual) hasta migrar transporte | `event-bus.ts:165` |
| C3 | **Aislamiento de fallos** — error de un handler no propaga ni tumba otros | `event-bus.ts:176-185` |
| C4 | **Trazabilidad clínica / multi-tenant** — todo evento con `correlationId`/`tenantId`/`eventId`/`occurredAt` | BaseEvent `event-bus.ts:26-32` |
| C5 | **Cadena PaymentConfirmed intacta** (Disglobal pago→activación) | `payment-webhook.handler.ts:138`, `payment-pipeline.ts:117`, `server.ts:175` |
| C6 | **Idempotencia a nivel de handler** | `payment-pipeline.ts` guard `payment:activation:guard:{intentId}` |
| C7 | **Open/Closed** — eventType desconocido se loguea y descarta | `event-bus.ts:15` |
| C8 | **Aislamiento de dominio (ADR-002/007)** — cruces dental↔core vía eventos/barrels, no imports directos | AEK RULE-DI-002/003 (0 findings) |
| C9 | **Determinismo de arranque** — registro de suscripciones una vez, idempotente | `payment-pipeline.ts:111-119` (`registered` flag) |
| C10 | **Sin exponer EventEmitter crudo** (rompería C1/EventBridge) | `event-bus.ts:142` (emitter privado) |
| C11 | **Auditabilidad / append-only (ADR-006)** — eventos pueden alimentar audit | `registerCoreSubscriptions` DecisionGenerated→audit (diseño) |

---

## Fase 4 — Opciones (resumen; detalle en [EVENTBUS_OPTION_ANALYSIS.md](./EVENTBUS_OPTION_ANALYSIS.md))

| Opción | Score | Veredicto |
|---|---:|---|
| **A** Migración completa al bus tipado | **31/35** | ✅ Recomendada (arquitectura canónica) |
| D Eliminar rutas ad-hoc muertas | 28/35 | Complemento por-cadena (si negocio confirma out-of-scope) |
| C Híbrido | 19/35 | Rechazada como destino (perpetúa 2 modelos) |
| B Restaurar emit/on | 16/35 | **Rechazada** (rompe C1/C10; incompatible con EventBridge) |

---

## Fase 5 — Recomendación del Arquitecto

### DECISIÓN: **Opción A — El EventBus tipado (`publish`/`subscribe`) es el ÚNICO modelo de eventos canónico de Vytalix.**

**Justificación (evidencia):**
1. **Es el diseño declarado.** `IEventBus` está explícitamente diseñado como interfaz transport-agnostic publish/subscribe idéntica para Local y EventBridge (`event-bus.ts:4-5`). Exponer `emit/on` (Opción B) violaría C1/C10 y la ruta a EventBridge (`event-bus.ts:221`).
2. **Es coherente con ADR-002/007** (aislamiento de dominio por eventos tipados; AEK 0 findings) y con la única cadena que funciona (PaymentConfirmed usa publish/subscribe).
3. **Preserva trazabilidad/auditoría** (C4/C11) que los eventos string planos (B) degradan.
4. **Máxima mantenibilidad/testabilidad/escalabilidad** (score 31).

**Por qué se rechazan las alternativas:**
- **B** rompe la invariante transport-agnostic (C1) y el encapsulamiento del EventEmitter (C10); no mapea a EventBridge; reintroduce eventos no tipados.
- **C** perpetúa dos modelos y añade un adaptador innecesario (los call-sites pueden migrarse directamente).
- **D** por sí sola desactiva funcionalidad prevista; es válida **solo por-cadena** cuando el negocio confirme que una cadena está fuera de alcance.

### Alcance por-cadena (requiere input de negocio)
Para cada evento ad-hoc, la implementación futura elegirá **migrar (A)** o **eliminar (D)** según necesidad de negocio:

| Cadena ad-hoc | Efecto previsto | Decisión (pendiente input negocio) |
|---|---|---|
| `vitality.assessed` → re-score preventivo + invalidar cache insights | Re-score automático post-assessment | Migrar (A) si el re-score automático es requerido |
| `referral.triggered` → `deliverReferralWebhook` (Disglobal) | Webhook de derivación al partner | Migrar (A) si el webhook por evento es parte del piloto |
| `referral.converted` → revenue share | Cálculo de conversión | Migrar (A) si se requiere tracking por evento |
| `funnel.lead.created`/`assessment.completed`/`booking.created` | Tracking del funnel público | **Probablemente D** — el router funnel está comentado en `server.ts` |
| Suscripciones core (`registerCoreSubscriptions`: ObservationAdded→pipeline, DecisionGenerated→audit) | Pipeline por observación + audit | Migrar (A) / cablear — son eventos ya tipados; decidir si se activan |

> **INSUFFICIENT REPOSITORY EVIDENCE** para fijar migrar-vs-eliminar por cadena. Requiere confirmación de negocio sobre el alcance del piloto Disglobal (webhook de referral / re-score / tracking de funnel). El repositorio provee la ruta síncrona `/api/v2/referral` como alternativa a la ruta de eventos.

---

## Decisión (statement canónico)

> **Vytalix adopta un único sistema de eventos: el bus tipado `IEventBus` (`publish`/`subscribe`/`unsubscribe`) sobre `VytalixEvent`, transport-agnostic (Local hoy, EventBridge en producción). No se expondrá una API `emit`/`on` cruda (EventEmitter permanece encapsulado). Todo evento de dominio debe ser un `VytalixEvent` tipado con `correlationId`/`tenantId`. Los call-sites `emit`/`on` existentes se migrarán a `publish`/`subscribe` (añadiendo los eventos requeridos a la unión) o se eliminarán, por cadena, según necesidad de negocio confirmada. La entrega síncrona in-process y el aislamiento de fallos actuales se preservan; la semántica es at-most-once con idempotencia a nivel de handler.**

**Consecuencias:**
- Positivas: un modelo coherente, tipado, auditable, EventBridge-ready; TD-21 resuelto por migración/eliminación; `registerCoreSubscriptions` y listeners se cablean o eliminan explícitamente.
- Costo: sprint funcional con cambio de runtime (activa cadenas hoy inertes) + tests; requiere emitir nuevos `VytalixEvent` types (cambio de contrato de eventos, gobernado por ADR).
- Riesgo: activar cadenas cambia comportamiento observable (webhook, re-score) → requiere confirmación de negocio + validación.

Estrategia de migración: [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md). Roadmap: [ROADMAP_V2.md](./ROADMAP_V2.md).

---

## Estado de aceptación

**PROPOSED.** Bloqueado por: (1) confirmación de negocio del alcance de cadenas del piloto; (2) autorización de un sprint funcional con cambio de runtime. Hasta entonces, TD-21 permanece documentado y sin implementar.
