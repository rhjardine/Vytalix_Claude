# EVENTBUS_MIGRATION_PLAN.md
> **Vytalix Platform — Sprint A1 · Phase 6 · EventBus Migration Strategy (DESIGN ONLY)**

| Campo | Valor |
|---|---|
| Sprint | A1 · Fase 6 |
| Modo | **Diseño únicamente** — sin implementación |
| Decisión de base | [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) (Opción A: bus tipado como único modelo) |
| Fecha | 2026-06 |

> Esta es la estrategia de migración de la decisión ADR-EventBus. No implementa nada. Ejecución sujeta a autorización (sprint funcional con cambio de runtime) + confirmación de negocio del alcance por-cadena.

---

## Precondiciones (bloqueantes)
1. **ADR-EventBus ACCEPTED.**
2. **Confirmación de negocio** por cadena (migrar A vs eliminar D): `referral.triggered` (webhook Disglobal), `vitality.assessed` (re-score), `referral.converted`, `funnel.*`, suscripciones core.
3. **Autorización de cambio de runtime** (activa cadenas hoy inertes).

## Fases de migración (diseño)

### M0 — Especificación de eventos (documentación)
- Para cada cadena a MIGRAR, definir el `VytalixEvent` tipado (eventType, payload, base) a añadir a la unión — **gobernado por ADR** (cambio de contrato de eventos). Cadenas a ELIMINAR se listan para borrado.
- Salida: spec de eventos + mapa emisor/subscriber destino.

### M1 — Suscripciones core (bajo riesgo)
- Decidir y cablear `registerCoreSubscriptions()` en `server.ts` (o eliminarla si ObservationAdded→pipeline/DecisionGenerated→audit no se activan).
- Son eventos YA tipados; sin nuevos types. Riesgo: activa el pipeline por observación.

### M2 — Migración por-cadena (una por sprint funcional)
Por cada cadena confirmada como MIGRAR:
- Añadir el `VytalixEvent` type + helper `publish.xxx()`.
- Reemplazar `eventBus.emit('name', p)` → `publish.xxx({tenantId, correlationId}, payload)` en el emisor.
- Reemplazar `eventBus.on('name', h)` → `eventBus.subscribe<T>('EventType', h)` en el listener; cablear el registro en `server.ts` (des-comentar/crear el registrador idempotente).
- Cadenas a ELIMINAR: borrar los `emit`/`on` y sus listeners comentados.

### M3 — Cableado de arranque
- Sustituir el bloque comentado `registerPlatformEventListeners` (`server.ts:172`) por registros idempotentes (patrón `payment-pipeline.ts` `registered` flag) para las cadenas migradas.

### M4 — Limpieza
- Eliminar remanentes ad-hoc, `funnel.*` si el funnel sigue desmontado, y actualizar TD-21→resuelto.

## Dependencias
- **M1/M2/M3 tocan `server.ts`, `event-bus.ts`, `funnel.service`, `biological-age.service`, `referral.engine`, `quota.middleware`, `pipeline-v2.orchestrator`.**
- **Serializar** con: sprint Logger (funnel.service/biological-age — mismos archivos) y sprint DTO/TD-19 (funnel.service). Nunca en paralelo.
- Desbloquea TD-20 health(71) (import event-bus) → resolver DESPUÉS de fijar el modelo.

## ADRs requeridos
- ADR-EventBus (esta) — ACCEPTED.
- ADR de "nuevos VytalixEvent types" (cambio de contrato de eventos) por cada cadena migrada — o cubierto por ADR-EventBus si se enumeran explícitamente.

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Activar cadenas cambia comportamiento (webhook a Disglobal se dispara) | Feature-flag / confirmación de negocio; validar en sandbox/staging |
| Regresión de PaymentConfirmed | Tests de regresión de la cadena activa antes/después |
| Doble emisión (emit + publish transitorio) | Migrar emisor y listener en el mismo sprint por cadena |
| Orden de registro en arranque | Registro idempotente; test de arranque determinista |

## Estrategia de validación / testing
- **Unit:** cada `publish.xxx` produce el evento tipado correcto.
- **Integración:** emisor→subscribe→efecto por cadena (p. ej. `PaymentConfirmed`, `referral.triggered`→webhook).
- **Regresión:** sandbox 49/49; AEK 0 findings; RULE-ISO-001=0.
- **Runtime:** verificar health-check event_bus, webhook delivery, re-score.
- **Typecheck:** −9 (TD-21) al completar; sin nuevos errores.

## Estrategia de deployment
- Por-cadena, detrás de flag donde el efecto sea externo (webhook Disglobal).
- Mantener EventBridge stub comentado hasta un ADR de transporte de producción separado.

## Criterios de aceptación
- Cada cadena definida funciona end-to-end o está eliminada; `registerCoreSubscriptions`/listeners cableados o removidos explícitamente.
- TD-21 = 0 errores; PaymentConfirmed sin regresión; gates verdes.

## Métricas de éxito
- `typecheck` TD-21 −9; 0 nuevos errores.
- 100% de cadenas ad-hoc resueltas (migradas o eliminadas), 0 `emit`/`on` sobre `eventBus`.
- Cobertura de integración por cadena migrada.

## Rollback
- Por-cadena: revert del commit de esa cadena → vuelve al estado actual (emit/on rotos, listener comentado). PaymentConfirmed no afectado (cadena independiente).

---

> **STOP:** diseño de migración documentado. Ejecución pendiente de ADR ACCEPTED + input de negocio + autorización de runtime.
