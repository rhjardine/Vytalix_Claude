# SPRINT_E4C2_RC2_KEYSTONE_REPORT.md
> **Vytalix Platform — Sprint E4-C2 · RC-2 Keystone Recovery (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-C2 — RC-2 Keystone (typing del acceso a datos) |
| Rama | `adr/baseline-2026` |
| Modo | Mejora arquitectónica controlada — **runtime byte-idéntico, sin refactor funcional** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Alcance estricto respetado: solo `src/platform/db.ts` y call-sites en `src/longevity/**`. No se tocó EventBus, Contracts, OpenAPI, Prisma, CI, package, tests, Dental, Commerce, ni `rawQuery()` SQL.

---

## 1. Explicación arquitectónica (before / after)

**Antes:** la capa de acceso a datos exponía dos contratos asimétricos:
- `TenantClient.queryOne<R>` / `queryMany<R>` — **ya genéricos** (con default `Record<string, unknown>`).
- `RawDb.rawQuery` / `rawQueryOne` — **no genéricos**, devolviendo `Promise<Record<string, unknown>[]>`.

El cascade RC-2 (~50 errores) provenía de **dos hechos**, no uno:
1. `rawQuery()` sin genérico → callers que intentaban `rawQuery<T>()` fallaban (TS2558) y los demás recibían `Record<string,unknown>` → `unknown`.
2. **`src/longevity/**` no usa `rawQuery`** — usa `queryOne`/`queryMany` (ya genéricos) **sin pasar el parámetro de tipo**, por lo que los resultados quedaban como `unknown` y al asignarse a tipos concretos producían TS2322/TS2362/2363/2365.

**Después:**
- `rawQuery<T = Record<string, unknown>>()` / `rawQueryOne<T = …>()` ahora **simétricos** con `queryOne`/`queryMany` (genéricos con default → 100% backward-compatible).
- Los call-sites de Longevity **pasan el tipo de fila** a los helpers ya genéricos → `unknown` → tipos concretos → cascade colapsado.

> **Corrección de diagnóstico:** RC-2 no era únicamente "rawQuery débilmente tipado". En la zona autorizada (Longevity) el problema era **call-sites sin parámetro de tipo** sobre helpers ya genéricos. La solución por tanto combinó (a) simetrizar `rawQuery<T>` en `db.ts` (objetivo explícito del sprint) y (b) tipar los call-sites de Longevity.

---

## 2. Archivos modificados

| Archivo | Cambio | Tipo |
|---|---|---|
| `src/platform/db.ts` | `rawQuery`/`rawQueryOne` → genéricos `<T = Record<string,unknown>>`; `return res.rows as T[]`; en `rawQueryOne` cast `(await this.rawQuery(...)) as T[]` | Firma + cast (runtime idéntico) |
| `src/longevity/insights.service.ts` | 5 call-sites `queryOne<RowType>(…)` (cohort stats, 3× tenant-summary, risk-signal total) | Type args (sin lógica) |
| `src/longevity/biological-age.service.ts` | 2 call-sites `queryOne<RowType>(…)` (getLatest row, persistAssessment `{id}`) | Type args (sin lógica) |

> Documentos: este informe + actualización de `TECHNICAL_DEBT_REGISTER.md` (progreso TD-14).

---

## 3. Evolución de la firma de tipos

```ts
// ── db.ts — ANTES ──
interface RawDb {
  rawQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  rawQueryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null>
}

// ── db.ts — DESPUÉS (simétrico con queryOne<R>/queryMany<R>) ──
interface RawDb {
  rawQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  rawQueryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
}

// ── call-site Longevity — ANTES ──
const stats = await withTenant(t, tc => tc.queryOne(`SELECT … AS "cohortSize" …`))
// stats: Record<string, unknown> | null  → stats.avgBiologicalAge : unknown  (TS2322)

// ── DESPUÉS ──
const stats = await withTenant(t, tc =>
  tc.queryOne<{ cohortSize: number; avgBiologicalAge: number; /* … */ }>(`SELECT …`))
// stats.avgBiologicalAge : number  ✓
```

**Por qué `rawQuery<T>()` y no un wrapper:** se prefirió la firma genérica directa (Phase 2) — cero superficie nueva de API, simetría con los métodos `TenantClient` ya genéricos, backward-compatible por el default. Un wrapper habría añadido API y drift arquitectónico sin beneficio.

---

## 4. Análisis de backward compatibility

- **`rawQuery`/`rawQueryOne`:** el default `T = Record<string, unknown>` hace que **todo caller existente sin `<T>` se comporte exactamente igual** (mismo tipo de retorno, mismo runtime). Ningún caller fuera de alcance cambió de conteo de errores (verificado: 0 nuevos). Además, callers que ya intentaban `rawQuery<T>()` (p. ej. `auth.middleware`, `demo-status`) ahora resuelven.
- **`queryOne`/`queryMany`:** sin cambios de firma (ya eran genéricos); solo se añadieron type args en los call-sites de Longevity.
- **Runtime:** byte-idéntico. Los únicos cambios de implementación son casts de tipo (`as T[]`) que no alteran valores ni SQL.

> Compatibilidad **preservada**. No se activó ninguna Stop Rule.

---

## 5. Reducción de TypeCheck

| Hito | Errores |
|---|---:|
| Entrada E4-C2 (post E4-C1) | 95 |
| `db.ts` genérico (net-neutral, +arquitectura) | 95 |
| **Migración call-sites Longevity** | **75** |
| **Δ E4-C2** | **−20** |
| Δ acumulado (E4-A→E4-C2) | **117 → 75 (−42, −36%)** |

- `insights.service.ts`: 18 → **0**.
- `biological-age.service.ts`: 5 → **3** (los 3 restantes NO son RC-2 — ver §6).
- **Errores nuevos introducidos: 0** (verificado por diff completo).

---

## 6. Errores remanentes por familia (75)

| Dominio | Errores | Causa raíz dominante | ¿Autorizado en E4-C2? |
|---|---:|---|---|
| Commercial/API (`api/handlers`) | 15 | RC-2 (rawQuery untyped) + RC-6 paths | ❌ fuera de scope |
| Shared (`engagement`, `funnel`) | 13 | RC-2 / RC-3 | ❌ fuera de scope |
| index.ts (barrel, off-runtime) | 12 | RC-4 | ❌ |
| api/pipelines | 10 | RC-2 / RC-7 | ❌ |
| Legacy (off-runtime) | 9 | RC-5 | ❌ |
| api/middlewares | 7 | RC-2 (api-key rawQuery) | ❌ |
| Platform (`metering`, `disglobal-client`) | 5 | RC-2 (rawQuery) | ❌ (no Longevity) |
| **Longevity** | **3** | **RC-7** (Logger×1) + **RC-3** (EventBus×2) | ❌ no es RC-2 |
| Core (`referral.engine`) | 1 | RC-2 | ❌ |

Por código TS: TS2339 (24), TS2322 (19), TS2305 (11), TS2345 (6), TS2307 (4), TS2363 (2), otros (9).

> **RC-2 en la zona autorizada (Longevity) = 100% eliminado.** El RC-2 remanente (~30) vive en módulos **fuera del alcance** (api/handlers, shared, platform, middlewares, core) que usan `rawQuery`/`queryMany` sin tipo. Ahora que `rawQuery<T>()` existe, esos call-sites son migrables en E4-D **sin** volver a tocar `db.ts`.

---

## 7. Risk assessment

| Riesgo | Severidad | Estado |
|---|---|---|
| Romper callers de `rawQuery` fuera de alcance | — | Mitigado por default genérico (0 nuevos errores; verificado) |
| Tipos de fila incorrectos → nuevos errores | — | Verificado: 0 nuevos; tipos derivados de columnas SQL (`::float`/`::int`) |
| Cambio de runtime | — | Nulo (cambios solo de tipo) |
| `strict:false` ocultando null-safety | BAJO | Las filas optional-chained (`stats?.x`) colapsan a no-null bajo strict:false — comportamiento idéntico al previo |
| RC-2 remanente fuera de alcance | MEDIO | Documentado; migrable en E4-D con `rawQuery<T>` ya disponible |

---

## 8. Recomendación para E4-D

1. **Completar RC-2 fuera de Longevity** (~30 errores) migrando call-sites de `rawQuery`/`queryMany` en `api/handlers`, `shared`, `platform`, `api/middlewares`, `core` a `<RowType>`. Ya **no requiere** cambios en `db.ts` (genérico disponible). Requiere autorización para esos módulos.
2. **RC-3 (EventBus, ~11)** — incluye los 2 errores residuales de Longevity (`emit`/`assessmentCompleted`): alinear el uso al contrato `publish/subscribe`. Requiere autorización para EventBus/callers.
3. **RC-4 (index.ts barrel, 12, off-runtime)** — resincronizar con `contracts-v1`.
4. **RC-7 (pino Logger<never>, ~3)** — incluye el residual de Longevity (línea 90): ajuste de tipos del logger.
5. **RC-5 (legacy, 9)** + demo/`index` — decisión de build-scope (E4-E / ADR).

Mantener Type Check/Build **advisory** hasta `typecheck = 0`.

---

## Criterios de éxito

| Criterio | Resultado |
|---|---|
| `rawQuery<T>()` implementado | ✅ (simétrico, backward-compatible) |
| Runtime idéntico | ✅ (cambios solo de tipo) |
| RC-2 cascade sustancialmente reducido | ✅ −20 (Longevity RC-2 = 0); acumulado −42 |
| `npm run ci` pasa | ✅ exit 0 (sandbox 49/49) |
| AEK pasa | ✅ 0 findings |
| ISO pasa | ✅ RULE-ISO-001 = 0 |
| Ninguna zona prohibida modificada | ✅ solo db.ts + 2 archivos Longevity |

> **Stop Rule:** no se requirió rediseño de API/SQL, ni tocar EventBus/Prisma/Longevity-domain-redesign. Los errores no-RC-2 que aparecieron en Longevity (RC-7 Logger, RC-3 EventBus) se **documentaron y se dejaron intactos**, no se ampliaron el alcance.
