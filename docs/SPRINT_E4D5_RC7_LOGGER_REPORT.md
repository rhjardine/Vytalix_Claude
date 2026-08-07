# SPRINT_E4D5_RC7_LOGGER_REPORT.md
> **Vytalix Platform — Sprint E4-D5 · RC-7 Logger Consolidation (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-D5 — RC-7 (pino Logger typing) |
| Rama | `adr/baseline-2026` |
| Modo | Solo anotación de tipo — **runtime byte-idéntico (type erasure)** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Single-domain (RC-7). Sin wrappers, sin rediseño de Logger, sin cambio de API/comportamiento/flujo, sin `any`/unknown-casts/suppressions. Sin imports nuevos → dependency graph sin cambios.

---

## 1. Inventario RC-7 (Fase 1)

3 errores, patrón idéntico (`TS2345: 'Logger<never>' no asignable a 'Logger<string>'`):

| # | Archivo | Línea | Call-site |
|---|---|---|---|
| 1 | `api/pipelines/pipeline-v2.orchestrator.ts` | 53 | `this.runStage4(…, log)` |
| 2 | `api/pipelines/pipeline-v2.orchestrator.ts` | 56 | `this.runStage5(…, log)` |
| 3 | `longevity/biological-age.service.ts` | 90 | `this.loadBoards(…, log)` |

## 2. Clasificación

Los 3 son RC-7 puro (typing de pino Logger). Ningún otro RC involucrado.

## 3. Root Cause (Fase 2 — inspección en fuente)

- **Call-site:** `const log = logger.child({...})`. El método `logger.child` de pino es **genérico**: `child<ChildCustomLevels extends string = never>(...)`. La llamada sin custom levels infiere `ChildCustomLevels = never` → **`Logger<never>`**.
- **Parámetro receptor:** las funciones `runStage4`/`runStage5`/`loadBoards` declaran `log: ReturnType<typeof logger.child>`. Al tomar `ReturnType` de una función genérica **sin instanciar** el parámetro de tipo, TypeScript lo resuelve en su **restricción** (`extends string`) → `Logger<string>`.
- **Desajuste:** `Logger<never>` (arg real) vs `Logger<string>` (param mal derivado). El `logger` canónico (`pino({...})` en `platform/logger.ts`) es `Logger<never>`.

**Causa raíz:** `ReturnType<typeof logger.child>` sobre un método genérico resuelve el genérico a su restricción (`string`), no a su default (`never`). El tipo canónico correcto del child es `Logger<never>`.

## 4. Cambios realizados

Anclar el genérico a su default con una *instantiation expression* (TS 4.7+):

```ts
// ANTES  → Logger<string>  (genérico resuelto a la restricción)
log: ReturnType<typeof logger.child>
// DESPUÉS → Logger<never>  (genérico anclado al default, = lo que child realmente devuelve)
log: ReturnType<typeof logger.child<never>>
```

Reutiliza el símbolo `logger` (ya importado en ambos archivos) → **sin import nuevo**. Es la corrección mínima que arregla exactamente la resolución del genérico.

## 5. Archivos modificados

| Archivo | Ocurrencias |
|---|---|
| `src/api/pipelines/pipeline-v2.orchestrator.ts` | 2 (líneas 117, 166 — params de `runStage4`/`runStage5`) |
| `src/longevity/biological-age.service.ts` | 1 (línea 250 — param de `loadBoards`) |

(+ este informe + `TECHNICAL_DEBT_REGISTER.md`.)

## 6. Before → After

| Hito | Errores |
|---|---:|
| Entrada E4-D5 | 39 |
| **Salida E4-D5** | **36** |
| **Δ RC-7** | **−3** |
| Δ acumulado (E4-A→E4-D5) | **117 → 36 (−81, −69%)** |

**Errores nuevos: 0** (verificado por diff completo).

## 7. Gates

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | 39 → **36** (−3), 0 nuevos |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings |
| RULE-ISO-001 | ✅ 0 |
| Dependency graph | ✅ sin cambios (sin imports nuevos; solo `<never>` en anotación existente) |

## 8. Riesgos

| Ítem | Severidad | Estado |
|---|---|---|
| `<never>` estrecha el tipo del param respecto a `<string>` | BAJO | El body de las funciones usa métodos estándar (`info`/`warn`/`error`/`child`), presentes en `Logger<never>`; verificado 0 nuevos errores |
| Instantiation expression no soportada | — | TS ^5.3.3 (tsconfig) soporta `typeof f<T>`; typecheck confirma |
| Cambio de runtime | — | Nulo (anotación de tipo, borrada en compilación) |

## 9. Backward compatibility

100%. La firma pública de las funciones no cambia en su forma de llamada (siguen recibiendo un child logger); solo se corrige el tipo del parámetro para reflejar `Logger<never>` (lo que `logger.child()` realmente produce). Ningún consumidor afectado; ningún JS emitido cambia.

## 10. Actualización TD-14

`TECHNICAL_DEBT_REGISTER.md`: **RC-7 RESUELTO** (−3). Progreso 39 → 36.

## 11. Remaining distribution (36) y recomendación

| Causa | Errores |
|---|---:|
| RC-5 legacy (off-runtime) | 9 |
| RC-3 EventBus | 8 |
| RC-8 bloqueados (TD-19) | 7 |
| TD-18 funnel `.rows` | 5 |
| RC-6 paths | 3 |
| RC-8 restante (index.ts `.detail`/`.type` incluido en TD-19) | (contado arriba) |
| (RC-1/RC-2/RC-4/RC-7 = eliminados) | 0 |

Por causa exacta de los 36: **RC-3** EventBus (8), **RC-8** bloqueados TD-19 (7: `.detail`/`.type` ×5 + DTO ×2), **RC-5** legacy (9), **TD-18** funnel `.rows` (5), **RC-6** paths (3) + 4 residuales legacy (`server-v2-patch`: `app`, top-level await).

**Recomendación objetiva para el siguiente sprint:**
- **RC-6 (paths, 3)** — imports relativos obsoletos (`../lib/redis`, `./metering.service`, `../events/event-bus`). Corregir un path de import es **type-only y runtime-neutral SI y solo si el módulo destino existe y la ruta correcta es inequívoca** (p. ej. `../../platform/redis`). Bajo riesgo, single-domain, sin autorizaciones especiales. Requiere verificar que cambiar el path no altera qué módulo se carga en runtime (STOP si ambiguo).
- **RC-3 (EventBus, 8)** — requiere autorización para EventBus (`emit/on`→`publish/subscribe`).
- **TD-19 (RC-8 bloqueados, 7)** — requiere decisión de política (narrowing de error-body vs `ProblemDetailV1`; alinear Zod↔dominio).
- **RC-5 (legacy 9) / TD-18 (5)** — sprints dedicados / build-scope (decisión de gobernanza sobre legacy).

Mantener Type Check/Build **advisory** hasta `typecheck = 0`.

---

## Disciplina

3 errores RC-7, causa raíz única, corrección type-only mínima (`<never>`), reutilizando símbolos ya importados. Cero fixes fuera de RC-7, cero especulación, cero expansión de alcance.
