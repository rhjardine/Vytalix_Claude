# SPRINT_E4A_TYPESCRIPT_RECOVERY_ASSESSMENT.md
> **Vytalix Platform — Sprint E4-A · TypeScript Recovery Assessment (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-A — TypeScript Recovery Assessment (diagnóstico) |
| Rama | `adr/baseline-2026` |
| Modo | Diagnóstico READ-ONLY — **sin correcciones, sin refactor, sin cambios funcionales** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` (`tsc --noEmit --project tsconfig.server.json`) |

> Este sprint **no corrige** ningún error. Produce un diagnóstico priorizado para los sprints de remediación E4-B en adelante. El repositorio queda funcionalmente idéntico; el único cambio es este informe.

---

## 1. Executive Summary

`pnpm typecheck` reporta **117 errores en 20 archivos** (TD-14). Son **gaps de seguridad de tipos**, no fallos de runtime: el servidor ejecuta con `ts-node-dev --transpile-only` (sin type-check) y vitest usa esbuild, por lo que estos errores **no alteran el comportamiento en ejecución** — solo bloquean que `tsc` (Type Check / Build) pueda promoverse a gate bloqueante.

**Hallazgo central:** ~**3 causas raíz explican ~60% de los errores**, y una sola —el tipado débil del helper `getDb().rawQuery()` (`Promise<Record<string, unknown>[]>`)— origina por efecto cascada **~50 errores (~43%)**. Esto convierte la remediación en un problema tratable y secuenciable, no en 117 arreglos independientes.

**Distribución por criticidad:** **39 errores (33%) están fuera de la ruta de runtime** (`src/index.ts`, `src/demo/`, `src/legacy/` — no importados por `src/server.ts`), y **9 son puramente ambientales** (Prisma client no generado → `prisma generate` los elimina sin tocar código).

**Recomendación:** ejecutar primero **E4-B (fundación ambiental, riesgo nulo)**, luego **E4-C (cascada de tipado de datos, máximo impacto)**, y finalmente eventing/contratos y limpieza no-runtime. Reducción proyectada: 117 → ~0 en 4 sprints pequeños.

---

## 2. Inventario completo de errores

### 2.1 Por código TS (frecuencia)

| Código | Cantidad | Significado |
|---|---:|---|
| TS2322 | 35 | Type not assignable (mayoría `unknown` → tipo concreto) |
| TS2339 | 30 | Property does not exist (`.rows`, `.emit`/`.on`, `.detail`) |
| TS2305 | 20 | Module has no exported member (Prisma, contracts-v1, legacy) |
| TS2345 | 6 | Argument type not assignable |
| TS2558 | 5 | Expected 0 type arguments, but got 1 |
| TS2307 | 5 | Cannot find module (paths obsoletos + dep faltante) |
| TS2363 | 4 | RHS de operación aritmética no numérico (`unknown`) |
| TS2365 | 2 | Operador no aplicable (`unknown`) |
| TS2362 | 2 | LHS de operación aritmética no numérico |
| TS2769 / TS2740 / TS2724 / TS2717 / TS2538 / TS2344 / TS2304 / TS1378 | 1 c/u (8) | Singletons (overload, missing props, alias, decl dup, index type, generic constraint, name, top-level await) |
| **Total** | **117** | |

### 2.2 Por archivo (frecuencia)

| Archivo | Errores | Dominio | Runtime? |
|---|---:|---|---|
| `src/longevity/insights.service.ts` | 18 | Longevity (Core Clinical) | ✅ |
| `src/index.ts` | 12 | Aggregator barrel | ❌ (no importado) |
| `src/api/pipelines/pipeline-v2.orchestrator.ts` | 11 | Platform | ✅ |
| `src/demo/demo-status.ts` | 10 | Demo (dev) | ❌ |
| `src/demo/seed_mvp.ts` | 8 | Demo (dev) | ❌ |
| `src/shared/engagement.service.ts` | 7 | Shared (Core) | ✅ |
| `src/api/handlers/external-v2.handler.ts` | 7 | Commercial/API | ✅ |
| `src/shared/funnel.service.ts` | 6 | Shared (Core) | ✅ |
| `src/legacy/server-v2-patch.ts` | 6 | Legacy | ❌ |
| `src/longevity/biological-age.service.ts` | 5 | Longevity (Core) | ✅ |
| `src/api/middlewares/api-key.middleware.ts` | 5 | Platform | ✅ |
| `src/api/handlers/funnel.handler.ts` | 5 | Commercial/API | ✅ |
| `src/platform/metering.service.ts` | 3 | Platform | ✅ |
| `src/legacy/observability_handler.ts` | 3 | Legacy | ❌ |
| `src/api/middlewares/prisma.middleware.ts` | 3 | Platform | ✅ |
| `src/platform/disglobal-client.ts` | 2 | Platform | ✅ |
| `src/api/handlers/billing-admin.handler.ts` | 2 | Commercial/API | ✅ |
| `src/core/referral.engine.ts` | 1 | Core Clinical | ✅ |
| `src/api/middlewares/quota.middleware.ts` | 1 | Platform | ✅ |
| `src/api/middlewares/consent.guard.ts` | 1 | Platform | ✅ |
| `src/api/handlers/health.handler.ts` | 1 | Commercial/API | ✅ |
| **Total** | **117** | | |

> Inventario crudo reproducible: `pnpm typecheck 2>&1 | grep "error TS"`.

---

## 3. Clasificación por categorías (causa)

| Categoría | Códigos TS | Errores aprox. |
|---|---|---:|
| Datos débilmente tipados (`unknown`/`Record<string,unknown>`) | TS2322, TS2339(.rows), TS2363/2365/2362, TS2538, parte de TS2345 | **~50** |
| Módulos/exports faltantes | TS2305, TS2724, TS2307 | ~25 |
| API de EventBus desalineada | TS2339(.emit/.on), TS2339(publisher members) | ~11 |
| Dependencia/paths | TS2307 | ~5 |
| Generics de librería (pino Logger) | TS2345(Logger), TS2558 | ~8 |
| Declaraciones/overloads locales | TS2717, TS2740, TS2769, TS1378, TS2304 | ~8 |

---

## 4. Clasificación por bounded context

| Bounded context | Archivos | Errores | % | ¿Protegido? (guardrails) |
|---|---|---:|---:|---|
| **Longevity** (Core Clinical) | insights, biological-age | **23** | 20% | ⚠️ Sí (no-modify) |
| **Shared** (Core Clinical) | engagement, funnel | 13 | 11% | parcial |
| **Commercial/API** | external-v2, funnel.handler, billing-admin, health | 15 | 13% | no |
| **Platform** | pipeline-v2, api-key, prisma, metering, disglobal-client, quota, consent | 26 | 22% | no |
| **Core Clinical (engine)** | referral.engine | 1 | 1% | ⚠️ Sí |
| **Demo** (dev utility) | demo-status, seed_mvp | 18 | 15% | no |
| **Legacy** (aislado) | server-v2-patch, observability_handler | 9 | 8% | ⚠️ Sí (no-modify legacy) |
| **Aggregator** | index.ts | 12 | 10% | no |
| **Total** | | **117** | 100% | |

---

## 5. Clasificación por criticidad

| Nivel | Criterio | Errores | Detalle |
|---|---|---:|---|
| **Baja** | Fuera de la ruta de runtime (no importados por `server.ts`) | **39** | index.ts (12), demo (18), legacy (9) |
| **Media** | Runtime, pero no bloquea ejecución (transpile-only); afecta solo `tsc` | **78** | longevity, shared, api/*, platform, core |
| **Alta (bloqueante de gate)** | Impide promover Type Check/Build a gate bloqueante | **117 (todos)** | — solo en sentido de CI, no de runtime |

> **[HECHO]** `git grep` confirma que `src/server.ts` no importa `index.ts`, `demo/` ni `legacy/`, y ningún archivo importa el barrel `src/index.ts`. Por tanto esos 39 errores son seguros de aislar/posponer.

---

## 6. Causas raíz

| ID | Causa raíz | Errores aprox. | Naturaleza |
|---|---|---:|---|
| **RC-1** | **Prisma client no generado** — `@prisma/client` sin `PrismaClient` ni enums | ~9 | **Ambiental** (no es bug de código) |
| **RC-2** | **`getDb().rawQuery()` retorna `Record<string,unknown>[]`/`unknown`** — callers hacen `.rows`, asignan a tipos concretos y operan aritméticamente | **~50** | Contrato de tipado del helper de datos |
| **RC-3** | **API de EventBus desalineada** — código usa `eventBus.emit/.on`; `IEventBus` expone `publish/subscribe`; además helpers `publish.funnelLead/.assessmentCompleted` inexistentes | ~11 | Drift de API interna |
| **RC-4** | **`src/index.ts` ↔ `shared/contracts-v1` desincronizados** — barrel re-exporta tipos que ya no existen (`AssessBioAgeResponse`, `ProblemDetail`→`ProblemDetailV1`, …) | ~12 | Drift de barrel (off-runtime) |
| **RC-5** | **Legacy con referencias obsoletas** — `server-v2-patch` importa módulos/exports inexistentes; top-level await; `app` no definido | ~9 | Código legacy aislado |
| **RC-6** | **Paths obsoletos + dependencia faltante** — `../lib/redis`, `../events/event-bus`, `./metering.service`; `node-fetch` **no está en package.json** | ~5 | Paths + dep |
| **RC-7** | **Varianza de genéricos de pino** — `Logger<never>` no asignable a `Logger<string>` | ~3 | Tipado de librería |
| **RC-8** | **Tipados locales varios** — decl duplicada `apiKeyCtx`, `EngagementScoreSnapshot` incompleto, overload, `DimensionalMeasurement` parcial | ~6 | Puntuales |

> Las cantidades son **estimaciones** (algunos errores tienen causa compuesta; la atribución exacta se confirma al corregir). Suman ~105; el resto (~12) son cascada compartida entre RC-2/RC-3.

---

## 7. Análisis de efecto cascada

- **¿Cuántas causas raíz explican la mayoría?** **3** (RC-1 + RC-2 + RC-3) ≈ **70 errores ≈ 60%**.
- **¿Existe efecto cascada?** **Sí, fuerte.** RC-2 (un único helper) propaga a 4 síntomas distintos: `.rows` inexistente (TS2339), `unknown` no asignable (TS2322), aritmética sobre `unknown` (TS2363/2365/2362) e índice `unknown` (TS2538). RC-1 (Prisma) propaga a exports y a un generic constraint.
- **¿Qué % desaparece corrigiendo pocas causas?**
  - Solo **RC-1** (`prisma generate`, **sin tocar código**): ~9 (~8%).
  - **RC-1 + RC-2**: ~59 (~50%).
  - **RC-1 + RC-2 + RC-3**: ~70 (~60%).
  - **+ RC-4 + RC-5** (off-runtime): ~91 (~78%).

---

## 8. Quick Wins

| ID | Acción | Errores | Cambio de lógica | Riesgo |
|---|---|---:|---|---|
| **QW-1** | `prisma generate` (o `db:generate`) en build/CI antes de typecheck (RC-1) | ~9 | **Ninguno** (genera tipos en `node_modules`) | **Nulo** |
| **QW-2** | Declarar dependencia `node-fetch` o migrar a `fetch` nativo (Node 20) (RC-6) | ~1 (+ desbloquea pipeline-v2) | Mínimo | Bajo |
| **QW-3** | Aislar `src/demo/` y `src/legacy/` del scope de `tsconfig.server.json` (decisión de gobernanza) | ~27 | **Ninguno** (config; no toca runtime) | Bajo (requiere ADR/decisión) |

> QW-1 es el quick win por excelencia: **elimina ~9 errores sin modificar una sola línea de producción**.

---

## 9. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| RC-2 toca `src/platform/db.ts` **y call-sites en Longevity** (insights 18, biological-age 5) — zona protegida | **ALTO** | E4-C requiere autorización explícita para editar Longevity, o estrategia de narrowing solo en call-sites no protegidos primero |
| Corregir el helper genérico podría revelar errores latentes nuevos | MEDIO | Avanzar por dominio; medir delta tras cada paso |
| `tsconfig` exclude de demo/legacy "oculta" deuda en vez de resolverla | MEDIO | Documentar como decisión consciente (ADR), no como fix |
| Flake de sandbox (TD-16) podría enrojecer CI durante validación | BAJO | Re-run; aislar |
| Promesa de "Type Check verde" depende de RC-1 ambiental reproducible en CI | MEDIO | Añadir `prisma generate` como step previo fijo |

---

## 10. Orden recomendado de corrección

```
1º  RC-1  (ambiental, 0 riesgo)        → E4-B
2º  RC-6  (dep/paths, bajo riesgo)     → E4-B
3º  RC-2  (cascada máxima, keystone)   → E4-C
4º  RC-3  (eventing) + RC-4 (barrel)   → E4-D
5º  RC-5 + demo + RC-7 + RC-8 (resto)  → E4-E
```
Racional: ambiental primero (desbloquea Prisma y reduce ruido), luego la cascada de mayor impacto (RC-2) que hace desaparecer ~50 errores, después drift de eventing/contratos, y al final limpieza de zonas no-runtime y residuales.

---

## 11. Roadmap E4-B / E4-C / E4-D / E4-E

### E4-B — Environmental & Build Foundation
- **Objetivo:** eliminar RC-1 y RC-6 sin tocar lógica. `prisma generate` como step de build/CI; resolver `node-fetch` (dep o fetch nativo); reconciliar paths obsoletos (`../lib/redis`, `../events/event-bus`, `./metering.service`).
- **Riesgos:** mínimos (ambiental/paths).
- **Dependencias:** ninguna.
- **Criterios de éxito:** errores RC-1 = 0; RC-6 = 0; sin cambio de comportamiento; `npm run ci` verde.
- **Gates:** `pnpm typecheck` delta ≥ −10; AEK PASS; sandbox 49/49.

### E4-C — Data Access Typing (RC-2, keystone)
- **Objetivo:** tipar genéricamente `rawQuery<T>()`/`rawQueryOne<T>()` en `src/platform/db.ts` y narrowing en call-sites; eliminar la cascada `unknown`/`.rows`/aritmética.
- **Riesgos:** **ALTO** — toca Platform (db.ts) y call-sites en Longevity (protegido). Requiere autorización para Longevity o fase dividida (primero call-sites no protegidos).
- **Dependencias:** E4-B (Prisma generado reduce ruido).
- **Criterios de éxito:** errores TS2322/TS2339(.rows)/TS2363/2365/2362/TS2538 → ~0; comportamiento idéntico (mismas queries).
- **Gates:** typecheck delta ≥ −45; tests de regresión de las queries afectadas; AEK PASS.

### E4-D — Eventing & Contracts (RC-3 + RC-4)
- **Objetivo:** alinear uso de EventBus al contrato `publish/subscribe` (RC-3); resincronizar el barrel `src/index.ts` con `contracts-v1` (RC-4).
- **Riesgos:** MEDIO (shared/longevity para RC-3; barrel off-runtime para RC-4).
- **Dependencias:** independiente de E4-C (puede paralelizarse).
- **Criterios de éxito:** errores de `.emit/.on` y de exports del barrel → 0.
- **Gates:** typecheck delta ≥ −20; AEK PASS; sin nuevas violaciones de aislamiento.

### E4-E — Non-runtime Cleanup & Residuals (RC-5 + demo + RC-7 + RC-8)
- **Objetivo:** decidir destino de `src/legacy/` y `src/demo/` (corregir, excluir vía tsconfig, o cuarentena por ADR); resolver varianza de pino Logger y residuales puntuales.
- **Riesgos:** BAJO (zonas no-runtime).
- **Dependencias:** decisión de gobernanza sobre legacy/demo (posible ADR).
- **Criterios de éxito:** typecheck = **0**; Type Check/Build promovibles a gate bloqueante.
- **Gates:** `pnpm typecheck` exit 0; promover stages 2/3 de `ci.yml` a bloqueantes.

---

## 12. Matriz Impacto vs Esfuerzo

```
            ESFUERZO BAJO            ESFUERZO MEDIO          ESFUERZO ALTO
IMPACTO   ┌──────────────────────┬──────────────────────┬────────────────────┐
  ALTO    │ RC-1 (prisma gen, ~9)│ RC-2 (cascada, ~50)  │                    │
          │  ★ QW-1  → E4-B      │  ★ keystone → E4-C   │                    │
          ├──────────────────────┼──────────────────────┼────────────────────┤
IMPACTO   │ RC-4 (barrel, ~12)   │ RC-3 (eventing, ~11) │                    │
  MEDIO   │ RC-6 (paths, ~5)→E4-B│  → E4-D              │                    │
          ├──────────────────────┼──────────────────────┼────────────────────┤
IMPACTO   │ RC-5 (legacy, ~9)    │ RC-8 (varios, ~6)    │                    │
  BAJO    │ RC-7 (logger, ~3)    │  → E4-E              │                    │
          │  → E4-E              │                      │                    │
          └──────────────────────┴──────────────────────┴────────────────────┘
```

---

## 13. Estimación de reducción progresiva de errores

| Hito | Causas resueltas | Errores restantes (aprox.) | Δ |
|---|---|---:|---:|
| Inicio | — | **117** | — |
| Tras **E4-B** | RC-1 + RC-6 | ~103 | −14 |
| Tras **E4-C** | + RC-2 | ~53 | −50 |
| Tras **E4-D** | + RC-3 + RC-4 | ~30 | −23 |
| Tras **E4-E** | + RC-5 + RC-7 + RC-8 + demo | **0** | −30 |

> Curva dominada por E4-C (la cascada). Las cifras son objetivo; cada sprint mide el delta real con `pnpm typecheck`.

---

## 14. Recomendación final del Arquitecto

**Proceder por fases, ambiental primero.** TD-14 **no es deuda de 117 problemas independientes**: ~3 causas raíz explican el 60% y una sola (RC-2, el tipado del helper de datos) el ~43%. La remediación es **tratable y de bajo riesgo si se secuencia correctamente**.

1. **Ejecutar E4-B de inmediato** — `prisma generate` + `node-fetch`/paths elimina ~14 errores con **riesgo nulo y cero cambios de lógica**; además estabiliza el entorno de CI (Prisma generado) necesario para los siguientes sprints.
2. **E4-C es la pieza clave** — pero **requiere una decisión de gobernanza explícita**: corregir RC-2 toca `src/platform/db.ts` y call-sites en **Longevity** (zona protegida). El Arquitecto debe autorizar la edición acotada de Longevity (insights/biological-age) o aprobar una estrategia por fases.
3. **Aislar el ruido no-runtime** — 39 errores (index/demo/legacy) están fuera del runtime; pueden posponerse a E4-E o excluirse vía `tsconfig` mediante ADR, sin afectar el sistema.
4. **No promover Type Check/Build a gate bloqueante hasta E4-E** — hacerlo antes rompería CI sobre deuda aún abierta. Mantener advisory (estrategia E1) hasta `typecheck = 0`.

**Veredicto:** TD-14 es **recuperable en 4 sprints pequeños, seguros y verificables**, con la mayor parte del valor concentrada en E4-B (gratis) + E4-C (keystone). Riesgo global: **MEDIO**, concentrado en la autorización de edición de Longevity para RC-2.

---

> **Restricciones respetadas:** sin corregir errores, sin modificar producción/lógica/comportamiento, sin refactor, sin tocar OpenAPI/Prisma/Frontend/Sandbox/Dental/Longevity/AEK/ADR ni documentación existente. Único cambio: este informe. Diagnóstico 100% reproducible vía `pnpm typecheck`.
