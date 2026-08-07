# EVENTBUS_OPTION_ANALYSIS.md
> **Vytalix Platform — Sprint A1 · Phase 4 · EventBus Architectural Options**

| Campo | Valor |
|---|---|
| Sprint | A1 — ADR-EventBus |
| Modo | Análisis comparativo; sin implementación |
| Fecha | 2026-06 |

> Base: [EVENTBUS_CURRENT_ARCHITECTURE.md](./EVENTBUS_CURRENT_ARCHITECTURE.md). Decisión final: [ADR_EVENTBUS.md](./ADR_EVENTBUS.md).

---

## Opciones evaluadas

- **A — Migración completa al EventBus tipado.** Promover los eventos ad-hoc (`vitality.assessed`, `referral.triggered`, `referral.converted`, `funnel.*`) a `VytalixEvent` tipados + helpers `publish.*`; migrar `emit`→`publish` y `on`→`subscribe`; cablear `registerCoreSubscriptions` y los listeners de plataforma en `server.ts`.
- **B — Restaurar la API EventEmitter.** Exponer `emit`/`on` en `IEventBus`/`LocalEventBus` (delegando al `emitter` privado). Mantener los call-sites ad-hoc.
- **C — Capa de compatibilidad híbrida.** Añadir un adaptador `emit`/`on` que traduzca a `publish`/`subscribe`. Coexisten ambos modelos.
- **D — Eliminar las rutas ad-hoc muertas.** Remover los `emit`/`on` y sus listeners comentados; aceptar que esas cadenas nunca se implementaron. Conservar solo el bus tipado.

## Matriz comparativa

| Criterio | A (migrar a tipado) | B (restaurar emit/on) | C (híbrido) | D (eliminar ad-hoc) |
|---|---|---|---|---|
| Ventajas | Un solo modelo tipado; alineado con diseño y ADR-007/002; EventBridge-ready | Bajo costo de call-sites | Transición sin tocar call-sites | Mínimo costo/riesgo; elimina deuda muerta |
| Desventajas | Costo medio-alto; activa cadenas inertes (cambio de runtime) | Rompe invariante "publish/subscribe idéntico en ambos transportes"; reintroduce eventos string no tipados | Perpetúa dos modelos; adaptador extra | Pierde funcionalidad prevista (webhook referral, re-score, funnel tracking) |
| Riesgo técnico | Medio | **Alto** (regresión arquitectónica) | Medio-alto | Bajo |
| Riesgo operacional | Medio (activa comportamiento) | Medio | Medio | Bajo |
| Costo de migración | Medio-alto | Bajo | Medio | Muy bajo |
| Complejidad | Media | Baja | Media-alta | Muy baja |
| Compatibilidad (EventBridge) | ✅ Alta (interfaz transport-agnostic) | ❌ `emit/on` no mapea a EventBridge (`event-bus.ts:4-5,221`) | ⚠️ parcial | ✅ Alta |
| Escalabilidad futura | Alta | Baja | Media | Alta (para lo tipado) |
| Impacto clínico | Neutral (trazabilidad tipada preservada) | Reduce tipado/trazabilidad | Neutral | Neutral |
| Impacto negocio | Habilita cadenas del piloto (si se requieren) | Igual pero frágil | Igual | **Desactiva** cadenas del piloto |
| Alineación con arquitectura actual | ✅ Máxima (es el diseño documentado) | ❌ Contradice el diseño | ⚠️ Parcial | ✅ Alta |
| Mantenibilidad | Alta | Baja (dos estilos) | Baja | Alta |
| Testabilidad | Alta (eventos tipados) | Media | Media | Alta |
| Observabilidad/auditabilidad | Alta (BaseEvent: correlationId/tenantId) | Baja (payloads planos) | Media | Alta |

## Scoring (1–5, mayor = mejor; ponderación implícita en alineación arquitectónica + riesgo)

| Criterio | A | B | C | D |
|---|---:|---:|---:|---:|
| Alineación arquitectónica | 5 | 1 | 3 | 4 |
| Riesgo (inverso) | 3 | 2 | 2 | 5 |
| Costo/complejidad (inverso) | 3 | 4 | 2 | 5 |
| Escalabilidad/EventBridge | 5 | 1 | 3 | 4 |
| Observabilidad/trazabilidad | 5 | 2 | 3 | 5 |
| Preserva funcionalidad de negocio | 5 | 4 | 4 | 1 |
| Mantenibilidad | 5 | 2 | 2 | 4 |
| **Total (35 máx)** | **31** | **16** | **19** | **28** |

## Lectura de los resultados

- **A (31)** es la opción mejor alineada con el diseño documentado del bus (transport-agnostic, tipado) y con ADR-002/007; su principal costo es activar cadenas hoy inertes (requiere confirmación de negocio + tests).
- **D (28)** es la más segura y barata, pero **desactiva** funcionalidad prevista (webhook de referral a Disglobal, re-score) — solo válida si el negocio confirma que están fuera de alcance.
- **B (16)** se **rechaza**: exponer `emit/on` contradice el invariante "publish/subscribe idéntico en Local y EventBridge" (`event-bus.ts:4-5`) — EventBridge no tiene semántica `emit/on` (`event-bus.ts:221`), rompiendo la ruta a producción; además reintroduce eventos string no tipados (pierde correlación/trazabilidad tipada).
- **C (19)** se **rechaza** como destino: perpetúa dos modelos y añade un adaptador; solo aceptable como paso transitorio, innecesario dado que los call-sites ad-hoc pueden migrarse directamente (A) o eliminarse (D).

## Síntesis

**A es la arquitectura canónica recomendada.** La decisión *por-cadena* entre **migrar (A)** o **eliminar (D)** cada evento ad-hoc depende de una **entrada de negocio** sobre qué cadenas requiere el piloto Disglobal (ver [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) §Recomendación y [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md)).

> **INSUFFICIENT REPOSITORY EVIDENCE** para determinar si el piloto Disglobal *requiere* la ruta de eventos (webhook de referral / re-score automático) vs. el endpoint síncrono `/api/v2/referral`. Esto es una decisión de negocio, no derivable del repositorio.
