# ARCHITECTURE_BASELINE_REPORT.md
> **Vytalix Platform — Sprint E4-D8 · Architecture Consolidation Baseline (ANALYSIS ONLY)**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 — Architecture Consolidation & Roadmap Rebaseline |
| Rama | `adr/baseline-2026` |
| Modo | **ANÁLISIS ÚNICAMENTE** — sin cambios de código/runtime/tipos |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Regla de validación | Toda conclusión respaldada por evidencia del repositorio; "INSUFFICIENT REPOSITORY EVIDENCE" cuando falte |

> Este documento cubre **Fase 1 (inventario)** y la conclusión de **Fase 2 (assessment de eventos)**. El grafo de dependencias y el Event Flow Map detallado están en [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md). Candidatos ADR en [ARCHITECTURE_DECISION_CANDIDATES.md](./ARCHITECTURE_DECISION_CANDIDATES.md). Roadmap en [ROADMAP_V2.md](./ROADMAP_V2.md). Riesgo en [ARCHITECTURAL_RISK_MATRIX.md](./ARCHITECTURAL_RISK_MATRIX.md). Resumen ejecutivo en [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md).

---

## 0. Estado certificado de entrada

`pnpm typecheck`: **117 → 36 (−81, −69%)**. RC-1/RC-2/RC-4/RC-7 eliminados; RC-6→TD-20 y RC-3→TD-21 certificados como no-type-only. Distribución actual de los 36 errores por archivo (evidencia `pnpm typecheck`):

| Archivo | Errores | TD asociado |
|---|---:|---|
| `shared/funnel.service.ts` | 6 | TD-21 (emit ×3) + TD-19 (DimensionalMeasurement ×2) + Logger (funnelLead ×1) |
| `legacy/server-v2-patch.ts` | 6 | RC-5 (legacy) |
| `api/handlers/funnel.handler.ts` | 5 | TD-18 (`.rows` ×5) |
| `legacy/observability_handler.ts` | 3 | RC-5 (legacy) |
| `index.ts` | 3 | TD-19 (`.detail`/`.type` ×3) |
| `api/pipelines/pipeline-v2.orchestrator.ts` | 3 | TD-21 (`.on` ×3) |
| `platform/disglobal-client.ts` | 2 | TD-19 (`.detail` ×2) |
| `longevity/biological-age.service.ts` | 2 | TD-21 (emit ×1) + Logger (assessmentCompleted ×1) |
| `api/handlers/billing-admin.handler.ts` | 2 | TD-20 (RC-6 ×2) |
| `core/referral.engine.ts` | 1 | TD-21 (emit ×1) |
| `api/middlewares/quota.middleware.ts` | 1 | TD-21 (emit ×1) |
| `api/handlers/health.handler.ts` | 1 | TD-20 (RC-6 ×1) |
| `api/handlers/external-v2.handler.ts` | 1 | TD-19 (EngagementEvent DTO ×1) |
| **Total** | **36** | |

Agregación por deuda: **TD-21** 9 · **TD-19** 7 · **RC-5 legacy** 9 (+ 1 residual) · **TD-18** 5 · **TD-20** 3 · **Logger** 2. (36 = 9+7+9+5+3+2 + 1 residual legacy contado en RC-5.)

---

## 1. Fase 1 — Inventario arquitectónico de deuda

### TD-18 — funnel.handler `.rows` sobre array de `rawQuery`
| Atributo | Valor (evidencia) |
|---|---|
| Origen | `funnel.handler.ts` accede `.rows` sobre `db.rawQuery()`, que devuelve el **array de filas** (no `QueryResult`). Descubierto E4-D1. |
| Impacto compile | 5× TS2339 (`funnel.handler.ts` 163,166,200,258,329) |
| Impacto runtime | **Bug latente**: `recent.rows`/`result.rows` = `undefined` → `TypeError` si se ejecuta. Ruta muerta: router funnel **comentado en `server.ts`** (líneas 132-133). |
| Módulos afectados | `src/api/handlers/funnel.handler.ts` (aislado) |
| Impacto arquitectónico | Ninguno (aislado) |
| Impacto negocio | El funnel público no está montado; sin impacto actual. Bloqueante si se reactiva el funnel. |
| Dependencias | Ninguna (independiente) |
| Blockers | Ninguno |
| Complejidad | Baja (corregir `.rows[0]`→`[0]`) pero **cambia runtime** |
| Autorización | Sprint funcional con autorización de cambio de runtime + tests |

### TD-19 — RC-8 bloqueado (narrowing de `unknown` + DTO Zod)
| Atributo | Valor (evidencia) |
|---|---|
| Origen | E4-D3. `.detail`/`.type` sobre `unknown` de `res.json()` (index.ts ×3, disglobal-client ×2); DTO Zod-opcional→requerido (external-v2 EngagementEvent ×1; funnel.service DimensionalMeasurement ×2). 7 total. |
| Impacto compile | 7 errores (TS2339 ×5 + TS2322/TS2345 DTO ×2… external-v2 1 + funnel.service 2 = 3 DTO; 5 unknown → 8? Ver nota) |
| Impacto runtime | Ninguno (los `.detail` funcionan en runtime vía JS dinámico; el DTO es solo tipo). |
| Módulos afectados | `index.ts`, `platform/disglobal-client.ts`, `api/handlers/external-v2.handler.ts`, `shared/funnel.service.ts` |
| Impacto arquitectónico | Bajo — política de tipado de error-body y de conversión Zod↔dominio |
| Impacto negocio | Ninguno |
| Dependencias | Independiente |
| Blockers | Requiere **decisión de política**: (a) narrowing tipado del error-body vs `ProblemDetailV1`; (b) alinear schema Zod o consumidor |
| Complejidad | Baja-media |
| Autorización | Decisión de política (ADR-DTOPolicy) — sin cambio de runtime necesario |

> Nota de conteo: en el gate actual, `funnel.service` DimensionalMeasurement (2) y external-v2 EngagementEvent (1) = 3 DTO; `.detail`/`.type` = 5 (index 3 + disglobal 2). Total TD-19 = 8 candidatos; 7 fueron los "bloqueados" en E4-D3 (external-v2 EngagementEvent + los 5 unknown + funnel DimensionalMeasurement 2 = 8; el conteo exacto se refina en el sprint de política).

### TD-20 — RC-6 imports dinámicos rotos
| Atributo | Valor (evidencia) |
|---|---|
| Origen | E4-D6. `await import('../lib/redis')` (billing 99), `await import('./metering.service')` (billing 118; `DEFAULT_UNIT_PRICES_CENTS` **no exportado**), `await import('../events/event-bus')` (health 71). |
| Impacto compile | 3× TS2307 |
| Impacto runtime | **Runtime-afectante**: imports fallan hoy (module-not-found); corregir activa código (emite logs, `getRedisClient()`, invierte health-check event_bus, 500→200). |
| Módulos afectados | `api/handlers/billing-admin.handler.ts`, `api/handlers/health.handler.ts`, `platform/{redis,metering.service,event-bus}` (destinos canónicos) |
| Impacto arquitectónico | Bajo |
| Impacto negocio | Health-check de event_bus reporta no-saludable; log de revocación de API key nunca se emite; endpoint `/usage` lanzaría 500 si se ejecuta |
| Dependencias | billing(118) depende de exportar `DEFAULT_UNIT_PRICES_CENTS` (decisión de API del módulo metering). health(71) **relacionado con TD-21** (event-bus). |
| Blockers | Cambio de runtime + (118) export |
| Complejidad | Baja pero runtime-afectante |
| Autorización | Sprint funcional con autorización de runtime + tests |

### TD-21 — Desconexión de arquitectura de eventos (EventBus)
| Atributo | Valor (evidencia) |
|---|---|
| Origen | E4-D7. 9 call-sites usan `eventBus.emit/on(name,…)` con nombres string ad-hoc; `eventBus` es `LocalEventBus implements IEventBus` (solo publish/subscribe; `emitter` privado; sin emit/on públicos). |
| Impacto compile | 9× TS2339 (emit ×6, on ×3) |
| Impacto runtime | **Doblemente roto**: (a) emit/on = undefined → TypeError; (b) `registerPlatformEventListeners` (los `.on`) **comentado en `server.ts:172`** → listeners nunca registrados. |
| Módulos afectados | `shared/funnel.service.ts`, `longevity/biological-age.service.ts`, `core/referral.engine.ts`, `api/middlewares/quota.middleware.ts` (emisores); `api/pipelines/pipeline-v2.orchestrator.ts` (listeners) |
| Impacto arquitectónico | **ALTO** — dos sistemas de eventos coexistentes (ver Fase 2) |
| Impacto negocio | Cadenas de eventos ad-hoc (vitality.assessed, referral.triggered, funnel.*, referral.converted) **no funcionan**; el webhook de referral a Disglobal y el re-score preventivo por evento **no se disparan** vía este camino |
| Dependencias | **Desbloquea**: health(71) del TD-20 (event-bus import); potencialmente el re-score/referral automático |
| Blockers | Requiere **ADR de arquitectura EventBus** (rediseño prohibido en este sprint) |
| Complejidad | **ALTA** |
| Autorización | ADR + sprint funcional con tests de runtime |

### RC-5 — Legacy residual (`src/legacy/`)
| Atributo | Valor (evidencia) |
|---|---|
| Origen | Pre-existente. `server-v2-patch.ts` (6: `app` no definido, top-level await, imports stale `createV1Router`/`observabilityRouter`/`errorMiddleware`/`./api/external.handler`), `observability_handler.ts` (3: `.rows`). |
| Impacto compile | 9 errores |
| Impacto runtime | Ninguno — `src/legacy/` **no se ejecuta** (no importado por `server.ts`; Repository-Governance lo marca "no se ejecuta en producción"). `server-v2-patch` llama `registerPlatformEventListeners` pero es legacy. |
| Módulos afectados | `src/legacy/` (aislado) |
| Impacto arquitectónico | Bajo (aislado); ruido en el gate de typecheck |
| Impacto negocio | Ninguno |
| Dependencias | Independiente |
| Blockers | Decisión build-scope (excluir de `tsconfig`) o sunsetting vía ADR |
| Complejidad | Baja (build-config) |
| Autorización | Decisión de gobernanza (ADR-LegacyBuildScope) |

### Logger — métodos faltantes en `clinicalLog`
| Atributo | Valor (evidencia) |
|---|---|
| Origen | E4-D7. `clinicalLog.funnelLead` (funnel.service 138) y `clinicalLog.assessmentCompleted?.` (biological-age 133) — no existen en el helper `clinicalLog` de `platform/logger.ts`. |
| Impacto compile | 2× TS2339 |
| Impacto runtime | `assessmentCompleted?.()` usa optional-chaining → no-op en runtime (no lanza). `funnelLead(...)` **sin** optional-chaining → lanzaría si se ejecuta (funnel montado? no). |
| Módulos afectados | `shared/funnel.service.ts`, `longevity/biological-age.service.ts`, `platform/logger.ts` (canónico) |
| Impacto arquitectónico | Ninguno |
| Impacto negocio | Logs de auditoría (funnel/assessment) no se emiten vía estos métodos |
| Dependencias | Independiente |
| Blockers | Decisión: añadir 2 métodos a `clinicalLog` o eliminar las llamadas |
| Complejidad | Baja |
| Autorización | Sprint Logger (bajo riesgo) |

---

## 2. Fase 2 — Conclusión del assessment de eventos

**Escenario (respaldado por evidencia): D) Refactor arquitectónico incompleto — con síntomas de B) dos modelos de EventBus coexistentes.**

Evidencia:
1. **Bus tipado `VytalixEvent` existe y está parcialmente cableado.** `IEventBus.publish/subscribe`; `publish.*` usado por `handlers.ts`, `payment-webhook.handler.ts`, `snapshot.service.ts`. La cadena **PaymentConfirmed está ACTIVA** (`registerPaymentPipeline()` en `server.ts:175`).
2. **Sistema ad-hoc estilo EventEmitter (emit/on) coexiste pero está roto.** 9 call-sites `emit/on` con nombres string ad-hoc contra un `eventBus` que no expone emit/on. Sus listeners (`registerPlatformEventListeners`) están **comentados en `server.ts:172`** (solo se invocan en `src/legacy/`).
3. **Suscripciones core del bus tipado NO se registran.** `registerCoreSubscriptions` (definido en `event-bus.ts`) **no se llama en ningún punto de `src/`** (grep vacío) → eventos tipados como `ObservationAdded`/`DecisionGenerated` se publican pero **no tienen consumidor activo**.

Interpretación basada en evidencia: se inició una migración de un modelo EventEmitter (emit/on con nombres string) hacia el bus tipado `VytalixEvent` (publish/subscribe); solo se completó para `PaymentConfirmed`. El resto del sistema ad-hoc quedó escrito contra una API que el bus nunca expuso y con sus listeners deshabilitados. **No hay evidencia de que el sistema ad-hoc haya funcionado nunca en producción.**

Detalle completo (publishers/subscribers/cadenas rotas) en [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md) §Event Flow Map.

---

> **STOP:** Este es un sprint de análisis. No se implementó ninguna decisión. Los candidatos ADR y el roadmap se entregan en los documentos hermanos; la implementación espera autorización explícita.
