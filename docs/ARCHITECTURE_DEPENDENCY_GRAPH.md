# ARCHITECTURE_DEPENDENCY_GRAPH.md
> **Vytalix Platform — Sprint E4-D8 · Debt Dependency Graph & Event Flow Map (ANALYSIS ONLY)**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 · Fase 1 (grafo de dependencias) + Fase 2 (Event Flow Map) |
| Modo | Análisis; toda relación respaldada por evidencia |
| Fecha | 2026-06 |

---

## 1. Grafo de dependencias entre deudas

```
                        ┌─────────────────────────────┐
                        │  TD-21  EventBus disconnect  │  (ALTO — arquitectónico)
                        │  9 emit/on                   │
                        └───────────┬───────────┬──────┘
                                    │ desbloquea│ comparte módulo (event-bus)
                                    ▼           ▼
                 (re-score/referral        ┌───────────────────────────┐
                  automático por evento)   │ TD-20  RC-6 dynamic imports│ (runtime-afectante)
                                           │ health(71)=event-bus  ─────┘  billing(99,118)
                                           └───────────────────────────┘
                                                     │ (118) requiere
                                                     ▼
                                           export DEFAULT_UNIT_PRICES_CENTS
                                           (decisión API módulo metering)

   INDEPENDIENTES (sin dependencias cruzadas):
   ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  ┌───────────────┐
   │ TD-18 funnel │  │ TD-19 RC-8   │  │ RC-5 legacy (9)    │  │ Logger (2)    │
   │ .rows (5)    │  │ policy (7/8) │  │ off-runtime        │  │ clinicalLog   │
   └──────────────┘  └──────────────┘  └────────────────────┘  └───────────────┘
```

### Relaciones (evidencia)
| Relación | Tipo | Evidencia |
|---|---|---|
| TD-21 → TD-20(health 71) | comparte módulo | health(71) importa `../events/event-bus` (path roto); el destino canónico `platform/event-bus` es el mismo bus de TD-21 |
| TD-20(118) → export metering | bloqueo | `DEFAULT_UNIT_PRICES_CENTS` no exportado (E4-D6) |
| TD-21 → funcionalidad referral/re-score | desbloquea | listeners `vitality.assessed`/`referral.triggered` en pipeline-v2 (comentados) alimentan re-score y webhook |
| TD-18, TD-19, RC-5, Logger | independientes | sin imports/relaciones cruzadas (evidencia: cada uno aislado a sus archivos) |

### Clasificación
- **Independientes (ejecutables en cualquier orden):** TD-18, TD-19, RC-5, Logger.
- **Debt que desbloquea otras:** TD-21 (desbloquea funcionalidad de eventos y clarifica TD-20 health(71)).
- **Nunca en paralelo:** **TD-21 y TD-20(health 71)** — ambos tocan el módulo `event-bus`/su import; ejecutarlos en paralelo arriesga conflictos sobre la misma superficie. También **TD-21 y Logger** tocan `funnel.service.ts`/`biological-age.service.ts` (mismos archivos, líneas adyacentes) → serializar para evitar conflictos de merge.

---

## 2. Event Flow Map (Fase 2)

### 2.1 Bus tipado `VytalixEvent` (canónico — `platform/event-bus.ts`)

**Publishers (evidencia `git grep publish.*`):**
| Publisher | Evento | Estado |
|---|---|---|
| `api/handlers/handlers.ts` | patientCreated, observationAdded, riskScoreComputed, decisionGenerated, recommendationReviewed | publica |
| `api/handlers/payment-webhook.handler.ts:138` | paymentConfirmed | publica |
| `shared/snapshot.service.ts:92` | patientModelUpdated | publica |
| `legacy/snapshot_service.ts:95` | patientModelUpdated | legacy |

**Subscribers:**
| Subscriber | Evento | Registro | Estado |
|---|---|---|---|
| `api/pipelines/payment-pipeline.ts:117` | `PaymentConfirmed` | `registerPaymentPipeline()` en `server.ts:175` | ✅ **ACTIVO** |
| `event-bus.ts registerCoreSubscriptions` | ObservationAdded→pipeline, DecisionGenerated→audit | **nunca llamado** (grep vacío) | ❌ **NO REGISTRADO** |

**Cadenas del bus tipado:**
- `PaymentConfirmed`: payment-webhook → publish.paymentConfirmed → subscribe (payment-pipeline) → activación de servicio + notificaciones. **✅ FUNCIONAL.**
- `ObservationAdded` / `DecisionGenerated` / otros: publicados por handlers.ts pero **sin consumidor activo** (registerCoreSubscriptions no se llama). **⚠️ PUBLICADO-SIN-CONSUMIR.**

### 2.2 Sistema ad-hoc EventEmitter (`emit`/`on` — TD-21)

**Emitters (evidencia):**
| Emitter | `eventBus.emit(name)` | Estado |
|---|---|---|
| `shared/funnel.service.ts:139,208,259` | `funnel.lead.created`, `funnel.assessment.completed`, `funnel.booking.created` | ❌ emit no existe |
| `longevity/biological-age.service.ts:124` | `vitality.assessed` | ❌ emit no existe |
| `api/middlewares/quota.middleware.ts:110` | `referral.converted` | ❌ emit no existe |
| `core/referral.engine.ts:212` | `referral.triggered` | ❌ emit no existe |

**Listeners (evidencia):**
| Listener | `eventBus.on(name)` | Registro | Estado |
|---|---|---|---|
| `pipeline-v2.orchestrator.ts:224` | `vitality.assessed` → runFromBiologicalAge | `registerPlatformEventListeners` | ❌ **comentado en `server.ts:172`** |
| `pipeline-v2.orchestrator.ts:242` | `referral.triggered` → deliverReferralWebhook | idem | ❌ no registrado |
| `pipeline-v2.orchestrator.ts:256` | `vitality.assessed` → invalidar cache insights | idem | ❌ no registrado |

**Cadenas ad-hoc (TODAS rotas):**
- `vitality.assessed`: biological-age.emit → [pipeline-v2.on: re-score + cache-invalidate]. **❌ ROTA** (emit no existe; listeners comentados).
- `referral.triggered`: referral.engine.emit → [pipeline-v2.on: webhook a Disglobal]. **❌ ROTA.**
- `referral.converted`: quota.middleware.emit → (sin listener). **❌ ROTA.**
- `funnel.*`: funnel.service.emit → (sin listener). **❌ ROTA** (+ funnel router comentado en server.ts).

### 2.3 Consumidores / listeners inalcanzables (evidencia)
- `registerPlatformEventListeners` (los 3 `.on`): **inalcanzable en producción** — solo invocado en `src/legacy/server-v2-patch.ts:25,92` (legacy, no ejecutado) y comentado en `server.ts:172`.
- `registerCoreSubscriptions`: **inalcanzable** — sin call-sites.
- `subscribeAll` (event-bus.ts): sin call-sites en `src/` (utilidad dev/test).

### 2.4 Resumen del Event Flow

| Sistema | Estado | Cadenas funcionales |
|---|---|---|
| Bus tipado `VytalixEvent` | Parcialmente cableado | 1 funcional (`PaymentConfirmed`); resto publicado-sin-consumir |
| Ad-hoc EventEmitter (emit/on) | No funcional | 0 funcionales (emit/on inexistentes + listeners comentados) |

**Conclusión:** refactor incompleto EventEmitter→bus-tipado. La única cadena de eventos operativa hoy es `PaymentConfirmed`. Toda la funcionalidad de eventos ad-hoc (re-score automático, webhook de referral, tracking de funnel/conversión por evento) está inactiva. Ver ADR-EventBus en [ARCHITECTURE_DECISION_CANDIDATES.md](./ARCHITECTURE_DECISION_CANDIDATES.md).

> **Nota de impacto de negocio (evidencia-respaldada):** dado que `registerPlatformEventListeners` está comentado y `emit/on` no existen, el webhook de referral a Disglobal por la ruta de eventos NO se dispara. (El `deliverReferralWebhook` existe pero su listener no está registrado.) Esto debe validarse contra el comportamiento esperado del piloto Disglobal en el sprint funcional.
