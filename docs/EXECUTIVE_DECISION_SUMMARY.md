# EXECUTIVE_DECISION_SUMMARY.md
> **Vytalix Platform — Sprint A1 · Executive Decision Summary: EventBus Architecture**

| Campo | Valor |
|---|---|
| Sprint | A1 — ADR-EventBus |
| Decisión | **PROPOSED** — pendiente de aceptación + input de negocio |
| Modo | Análisis/decisión; **cero cambios de código** |
| Fecha | 2026-06 |

---

## La decisión en una frase

**Vytalix tendrá UN solo sistema de eventos: el bus tipado `publish`/`subscribe` (`IEventBus`/`VytalixEvent`), transport-agnostic (Local hoy → EventBridge en producción). No se expondrá `emit`/`on` crudo. Los call-sites `emit`/`on` rotos se migrarán a `publish`/`subscribe` o se eliminarán, por cadena, según necesidad de negocio.**

Detalle: [ADR_EVENTBUS.md](./ADR_EVENTBUS.md).

## Por qué (evidencia)

- El bus **ya está diseñado** como publish/subscribe transport-agnostic (`event-bus.ts:4-5`). La única cadena que funciona hoy (**PaymentConfirmed**) usa este modelo.
- El sistema `emit`/`on` (TD-21) es un **remanente de una migración incompleta**: `emit`/`on` nunca existieron en el bus (EventEmitter encapsulado, `event-bus.ts:142`) y sus listeners están **comentados** (`server.ts:172`). No hay evidencia de que funcionara nunca.
- Exponer `emit`/`on` (la alternativa de menor esfuerzo) **rompería** la ruta a EventBridge y la trazabilidad tipada → rechazada.

## Qué se decidió vs qué queda pendiente

| Aspecto | Estado |
|---|---|
| Modelo canónico de eventos (tipado publish/subscribe) | ✅ **DECIDIDO** (Opción A) |
| Rechazo de `emit/on` crudo (Opción B) e híbrido (C) | ✅ **DECIDIDO** |
| Migrar vs eliminar **cada cadena** ad-hoc | ⏳ **PENDIENTE — requiere input de negocio** |
| Ejecución (implementación) | ⏳ **PENDIENTE — sprint funcional con autorización de runtime** |

## Decisión de negocio requerida (bloqueante)

El repositorio **no puede** determinar (INSUFFICIENT REPOSITORY EVIDENCE) si el piloto Disglobal requiere las cadenas de eventos hoy inactivas. Se necesita confirmar, por cadena:

| Cadena | Efecto si se activa | Pregunta al negocio |
|---|---|---|
| `referral.triggered` → webhook Disglobal | Envío de derivación al partner por evento | ¿El piloto usa webhook de referral por evento, o la ruta síncrona `/api/v2/referral`? |
| `vitality.assessed` → re-score + cache | Re-cálculo preventivo automático post-assessment | ¿Se requiere re-score automático? |
| `referral.converted` → revenue share | Tracking de conversión por evento | ¿Necesario para facturación del piloto? |
| `funnel.*` | Tracking del funnel público | Probablemente NO (funnel comentado en server.ts) |
| Core subs (ObservationAdded→pipeline, DecisionGenerated→audit) | Pipeline por observación + audit | ¿Se activan ahora? |

## Impacto

- **Técnico:** resuelve TD-21 de forma definitiva (migración/eliminación); alinea con ADR-002/007; mantiene EventBridge-ready.
- **Negocio:** determina si funcionalidad del piloto (webhook/re-score) se activa. Riesgo de "fallo silencioso" hoy (las cadenas parecen existir pero no se ejecutan).
- **Runtime:** la ejecución cambiará comportamiento observable (activa cadenas) → requiere tests + posible feature-flag.

## Próximos pasos

1. **Aceptar ADR-EventBus** (arquitecto).
2. **Obtener input de negocio** del alcance por-cadena (tabla arriba).
3. **Autorizar Sprint B1** (funcional, runtime + tests) para ejecutar [EVENTBUS_MIGRATION_PLAN.md](./EVENTBUS_MIGRATION_PLAN.md) por-cadena.

Roadmap actualizado: [ROADMAP_V2.md](./ROADMAP_V2.md) §A1 UPDATE.

---

> **STOP.** Decisión de arquitectura documentada. Sin implementación. Esperando aceptación del ADR + input de negocio + autorización de runtime.
