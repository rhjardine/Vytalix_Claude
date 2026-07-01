# SPRINT_E4D7_RC3_EVENTBUS_REPORT.md
> **Vytalix Platform — Sprint E4-D7 · RC-3 EventBus Consolidation (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-D7 — RC-3 (EventBus) |
| Rama | `adr/baseline-2026` |
| Modo | Solo consolidación EventBus probada, runtime-neutral |
| Estado | COMPLETADO — **CERTIFIED ZERO** (0 fixes: todos requieren rediseño de EventBus o son scope Logger) |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Resultado disciplinado: tras inspección canónica (Fases 1–4), **ningún** error RC-3 puede resolverse como un rename/anotación type-only runtime-neutral. Los 9 errores `emit`/`on` exigen **rediseñar EventBus** (añadir tipos de evento / API) y **cambian runtime**; los 2 restantes son llamadas al helper **Logger** `clinicalLog` (scope prohibido). Conforme al STOP RULE, **documentados y omitidos**. Cero cambios de código; typecheck permanece en 36.

---

## 1. Before / After

| Hito | Errores |
|---|---:|
| Entrada E4-D7 | 36 |
| **Salida E4-D7** | **36** |
| **Δ** | **0** (certified zero) |

## 2. Inventario exacto (Fase 1) — 11 candidatos RC-3

| # | Archivo | Línea | TS | API actual | Grupo |
|---|---|---|---|---|---|
| 1 | `api/middlewares/quota.middleware.ts` | 110 | 2339 | `eventBus.emit('referral.converted', …)` | A (emit) |
| 2 | `core/referral.engine.ts` | 212 | 2339 | `eventBus.emit('referral.triggered', …)` | A |
| 3 | `longevity/biological-age.service.ts` | 124 | 2339 | `eventBus.emit('vitality.assessed', …)` | A |
| 4 | `shared/funnel.service.ts` | 139 | 2339 | `eventBus.emit('funnel.lead.created', …)` | A |
| 5 | `shared/funnel.service.ts` | 208 | 2339 | `eventBus.emit('funnel.assessment.completed', …)` | A |
| 6 | `shared/funnel.service.ts` | 259 | 2339 | `eventBus.emit('funnel.booking.created', …)` | A |
| 7 | `api/pipelines/pipeline-v2.orchestrator.ts` | 224 | 2339 | `eventBus.on('vitality.assessed', …)` | B (on) |
| 8 | `api/pipelines/pipeline-v2.orchestrator.ts` | 242 | 2339 | `eventBus.on('referral.triggered', …)` | B |
| 9 | `api/pipelines/pipeline-v2.orchestrator.ts` | 256 | 2339 | `eventBus.on('vitality.assessed', …)` | B |
| 10 | `shared/funnel.service.ts` | 138 | 2339 | `clinicalLog.funnelLead(…)` | C (Logger) |
| 11 | `longevity/biological-age.service.ts` | 133 | 2339 | `clinicalLog.assessmentCompleted?.(…)` | C (Logger) |

## 3. Root cause

**Existen dos sistemas de eventos conceptualmente distintos:**
1. **Bus tipado `VytalixEvent`** (canónico): `IEventBus.publish/subscribe/unsubscribe`, con tipos `PatientCreated`, `ObservationAdded`, `PatientModelUpdated`, `DecisionGenerated`, `RiskScoreComputed`, `RecommendationReviewed`, `PaymentConfirmed`.
2. **Sistema ad-hoc estilo EventEmitter** (Grupos A/B): usa `eventBus.emit(name, payload)` / `eventBus.on(name, handler)` con nombres de string **no tipados** (`'vitality.assessed'`, `'referral.triggered'`, `'funnel.*'`, `'referral.converted'`).

El `eventBus` canónico es `LocalEventBus implements IEventBus`, con un `emitter` **privado** y **sin métodos públicos `emit`/`on`**. Por tanto los Grupos A/B están **rotos en compilación Y runtime** (`eventBus.emit`/`.on` son `undefined` → `TypeError` al ejecutarse).

Grupo C: `clinicalLog` es el helper de **logging** (`platform/logger.ts`), con métodos `observationIngested/riskCalculated/decisionGenerated/…`. `funnelLead`/`assessmentCompleted` **no existen** en él.

## 4. Canonical EventBus API (evidencia)

`src/platform/event-bus.ts`:
```ts
export interface IEventBus {
  publish<T extends VytalixEvent>(event: Omit<T,'eventId'|'occurredAt'|'version'>): void
  subscribe<T extends VytalixEvent>(eventType: T['eventType'], handler: (e: T)=>Promise<void>): void
  unsubscribe(eventType: VytalixEventType, handler): void
}
class LocalEventBus implements IEventBus { private emitter = new EventEmitter(); publish(){…}; subscribe(){…}; unsubscribe(){…}; subscribeAll(){…} }
export const eventBus = busInstance      // : IEventBus  (sin emit/on públicos)
export const publish = { patientCreated, observationAdded, patientModelUpdated, decisionGenerated, riskScoreComputed, recommendationReviewed, paymentConfirmed }
```

### Tabla de compatibilidad

| Llamada actual | ¿Equivalente canónico? | ¿Behavior idéntico? | Evidencia |
|---|---|---|---|
| `eventBus.emit('vitality.assessed', p)` | `eventBus.publish<T>({eventType,…})` **solo si** el evento está en la unión | **NO** | `'vitality.assessed'` ∉ VytalixEvent; publish inyecta `eventId/occurredAt/version` y emite `'*'`; payload envuelto ≠ payload plano |
| `eventBus.emit('referral.*'/'funnel.*'/'referral.converted', p)` | idem | **NO** | ninguno es VytalixEvent type |
| `eventBus.on(name, h)` | `eventBus.subscribe<T>(eventType, h)` | **NO** | subscribe envuelve el handler en async try/catch; requiere VytalixEventType; `.on` no existe en runtime |
| `clinicalLog.funnelLead/assessmentCompleted` | — | — | son métodos inexistentes en el helper Logger (scope prohibido) |

## 5. Semantic verification (Fase 3) — por qué se omite cada uno

Para Grupos A/B, convertir `emit`/`on` → `publish`/`subscribe` **falla** múltiples requisitos:
1. **Payload shape:** ❌ publish envuelve el evento (`+eventId/occurredAt/version/eventType`) — distinto del payload plano de emit.
2. **Event name:** ❌ los nombres ad-hoc no son VytalixEventType; requeriría **añadirlos a la unión** (rediseño, prohibido).
3. **Timing/emisión:** ❌ publish emite además `'*'`.
4. **Listener semantics:** ❌ subscribe envuelve el handler en async try/catch.
5. **Observable runtime:** ❌ hoy `emit`/`on` lanzan `TypeError`; corregir cambia de "lanza" a "entrega eventos".

Cualquiera de estos activa el **STOP RULE**. Además, hacer que `emit`/`on` funcionen exige **rediseñar EventBus** (añadir tipos/API) — explícitamente prohibido ("Never redesign EventBus", "No new interface", "No new EventBus").

Grupo C: scope **Logger** prohibido.

## 6. Dependency analysis (Fase 4)

Sin cambios (0 ediciones). Grafo de dependencias intacto. Sin ciclos nuevos, sin imports nuevos, sin reemplazo de módulos.

## 7. Files modified

**Ninguno.**

## 8. Backward compatibility

100% — no se modificó nada.

## 9. Runtime-neutrality proof

Certificada por ausencia de cambios. La razón del skip es preservar la neutralidad de runtime: convertir `emit`/`on` a `publish`/`subscribe` cambiaría payloads, añadiría emisión `'*'`, envolvería handlers y convertiría llamadas que hoy lanzan en entregas de evento reales.

## 10. Validation gates

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | 36 (sin cambio) |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings |
| RULE-ISO-001 | ✅ 0 |
| Dependency graph | ✅ sin cambios (0 ediciones) |

## 11. Technical debt update

`TECHNICAL_DEBT_REGISTER.md`: **RC-3 reclasificado → TD-21.** No es un rename type-only; es una **desconexión arquitectónica**: el sistema de eventos ad-hoc (`emit`/`on` con nombres string) está separado del bus tipado `VytalixEvent` y **ambos extremos (emisores y listeners) están rotos**. Reconciliar requiere una **decisión de arquitectura de EventBus** (o bien añadir los eventos ad-hoc como VytalixEvent tipados + helpers publish/subscribe, o bien exponer una API EventEmitter). Grupo C (clinicalLog `funnelLead`/`assessmentCompleted`) es deuda de Logger (métodos faltantes) — scope separado.

## 12. Remaining distribution (36)

Sin cambios: RC-3→TD-21 (9 emit/on) · Logger (2, funnelLead/assessmentCompleted) · RC-5 legacy (9) · RC-8→TD-19 (7) · TD-18 funnel `.rows` (5) · RC-6→TD-20 (3) · residual legacy (1).

## 13. Recommendation for next sprint

- **RC-3 (TD-21) requiere una ADR/decisión de arquitectura de EventBus**, NO un sprint type-only. Opciones a decidir por el arquitecto:
  - **Opción 1:** promover los eventos ad-hoc (`vitality.assessed`, `referral.triggered`, `funnel.*`, `referral.converted`) a `VytalixEvent` tipados con helpers `publish.*` y migrar emisores/listeners a `publish/subscribe`. (Cambio de runtime + rediseño → sprint funcional autorizado.)
  - **Opción 2:** exponer una API `emit/on` en `IEventBus`/`LocalEventBus` (delegando al `emitter` interno). (Rediseño de EventBus.)
  - Debe validarse con tests de runtime; `registerPlatformEventListeners` está **comentado en `server.ts`** (los listeners `.on` nunca se registran hoy).
- **Grupo C (Logger, 2)** — sprint Logger (añadir `funnelLead`/`assessmentCompleted` a `clinicalLog`, o eliminar las llamadas). Scope Logger.
- Restantes: RC-5 (legacy, build-scope/ADR), TD-18 (funnel `.rows`), TD-19 (RC-8 política), TD-20 (RC-6 funcional).

Mantener Type Check/Build **advisory** hasta `typecheck = 0`. Ninguno de los remanentes es un fix type-only runtime-neutral simple — todos requieren decisiones de arquitectura/política o cambios de runtime autorizados.

---

## Disciplina

De 11 candidatos RC-3: 9 exigen rediseño de EventBus + cambian runtime (STOP RULE), 2 son scope Logger (prohibido). **Se corrigieron 0**, todos documentados con evidencia canónica. Prefiero dejar los errores sin resolver antes que rediseñar EventBus o cambiar runtime bajo un mandato de consolidación runtime-neutral.
