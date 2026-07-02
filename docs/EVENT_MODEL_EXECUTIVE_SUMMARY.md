# EVENT_MODEL_EXECUTIVE_SUMMARY.md
> **Vytalix Platform — Sprint A2 · Executive Summary: Canonical Event Model**

| Campo | Valor |
|---|---|
| Sprint | A2 — Canonical Event Model Discovery & Consolidation |
| Modo | Análisis/consolidación; **cero cambios de código** |
| Fecha | 2026-06 |

> Documento canónico: [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md). Este es el único executive summary del sprint (no duplica el de plataforma [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)).

---

## Resultado en una frase

**El modelo canónico de eventos de Vytalix YA existe en el código** (`src/platform/event-bus.ts`: 7 eventos `VytalixEvent` tipados sobre un `BaseEvent` con eventId/tenantId/correlationId/occurredAt/version). A2 lo **consolidó** por primera vez en un único catálogo semántico sin duplicar los documentos de A1.

## 1. Artefactos existentes reutilizados (referenciados, no recreados)
- `src/platform/event-bus.ts` — **fuente de verdad**.
- `EVENTBUS_CURRENT_ARCHITECTURE.md` (arquitectura), `ADR_EVENTBUS.md` (decisión), `ARCHITECTURE_DEPENDENCY_GRAPH.md` (Event Flow Map), `EVENTBUS_OPTION_ANALYSIS.md`, `EVENTBUS_MIGRATION_PLAN.md`.

## 2. Artefactos existentes actualizados
- Ninguno de contenido (solo referencias). *(No fue necesario modificar docs existentes.)*

## 3. Artefactos nuevos creados
- `CANONICAL_EVENT_MODEL.md` (catálogo canónico) + este executive summary. **Total: 2** (máximo permitido).

## 4. Duplicados evitados
- No se recreó arquitectura/decisión/flujo/opciones/migración (ya existen en A1).
- No se creó una segunda matriz, ADR, gobernanza ni roadmap.
- No se colisionó con `EXECUTIVE_SUMMARY.md` (plataforma) — este es event-model-specific.

## 5. Fuente canónica seleccionada
**`src/platform/event-bus.ts`** (unión `VytalixEvent`). El código gana sobre cualquier documento.

## 6. Estado del modelo (evidencia)
- **Fortalezas:** tipado y discriminado; multi-tenant (tenantId); trazable (correlationId/eventId/occurredAt); **LOINC-aware** (`ObservationAdded.loincCode`); **pseudonimizado** (`PaymentConfirmed.subjectRef`); **transport-agnostic** (publish/subscribe idéntico Local↔EventBridge); aislamiento de fallos.
- **Cadena activa:** solo **PaymentConfirmed** (payment-webhook→payment-pipeline, `server.ts:175`). Los otros 6 eventos se publican pero sus consumidores (`registerCoreSubscriptions`) no están cableados.

## 7. Gaps semánticos remanentes (clasificados)
| Nivel | Gaps |
|---|---|
| Important | `causationId`, `producer`/`source`, versioning por-evento + deprecación, `aggregateId` formal, cableado de consumidores tipados |
| Optional | CloudEvents envelope, OpenTelemetry traceId/spanId, SNOMED, FHIR refs |
| Future | event store/replay/at-least-once, schema registry, encryption boundaries (transporte de red) |

Ninguno bloquea la única cadena activa (PaymentConfirmed).

## 8. Recomendación para el próximo sprint de implementación
1. **Primero decidir wiring** (registerCoreSubscriptions + cadenas ad-hoc) según [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) + input de negocio.
2. **Luego** añadir los gaps *Important* mínimos: `causationId` + `producer` en `BaseEvent` (auditoría/EventBridge) — cambio de contrato gobernado por ADR.
3. Diferir Optional/Future hasta el ADR de transporte de producción (EventBridge).

Prerequisito inalterado (de A1): **confirmación de negocio** del alcance por-cadena del piloto Disglobal antes de cualquier implementación de eventos.

---

## Validation checklist

| Ítem | Estado |
|---|---|
| Zero documentos duplicados | ✅ (1 canónico + 1 summary; resto referenciado) |
| Zero ADRs duplicados | ✅ |
| Zero gobernanza duplicada | ✅ |
| Zero cambios de runtime | ✅ (typecheck 36 sin cambio) |
| Zero rediseño de EventBus | ✅ |
| Evidencia de repositorio citada | ✅ (`event-bus.ts` file:line) |
| Una fuente canónica identificada | ✅ (`src/platform/event-bus.ts`) |
| Cada recomendación trazable a evidencia | ✅ |

> **STOP.** Consolidación completada. Sin implementación; esperando ADR-EventBus ACCEPTED + input de negocio + autorización de runtime.
