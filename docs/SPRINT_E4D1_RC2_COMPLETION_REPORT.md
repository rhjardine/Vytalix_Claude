# SPRINT_E4D1_RC2_COMPLETION_REPORT.md
> **Vytalix Platform — Sprint E4-D1 · RC-2 Completion (outside Longevity)**

| Campo | Valor |
|---|---|
| Sprint | E4-D1 — RC-2 Completion |
| Rama | `adr/baseline-2026` |
| Modo | Solo typing en compile-time — **runtime byte-idéntico** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Reutilizó la infraestructura genérica de E4-C2 (`rawQuery<T>()`, `rawQueryOne<T>()`) y los ya-genéricos `queryOne<T>`/`queryMany<T>`. Sin redesign, sin wrappers, sin SQL, sin cambios de comportamiento. No se tocó Longevity, EventBus, Prisma, Contracts, OpenAPI, tests, CI, package.json ni tsconfig.

---

## 1. Inventario de ubicaciones RC-2 (Fase 1)

De los 75 errores de entrada, en los módulos autorizados (`api/handlers`, `api/middlewares`, `platform`, `shared`, `core`) se clasificó cada error por causa raíz (Fase 2):

| Archivo | Errores | Clasificación |
|---|---|---|
| `api/middlewares/api-key.middleware.ts` | 5 | **RC-2** (rawQueryOne untyped → ApiKeyContext) |
| `platform/metering.service.ts` | 3 | **RC-2** (rawQueryOne untyped → number/arith) |
| `api/middlewares/consent.guard.ts` | 1 | **RC-2** (queryOne `RETURNING id`) |
| `api/handlers/external-v2.handler.ts` | 7 | **5 RC-2** (queryOne untyped) + 2 NO-RC-2 |
| `shared/engagement.service.ts` | 7 | **RC-2** (queryOne/queryMany untyped) |
| `api/handlers/funnel.handler.ts` | 5 | **RC-2-síntoma → SKIP** (ver §7) |
| `api/handlers/billing-admin.handler.ts` | 2 | RC-6 (paths) — SKIP |
| `api/handlers/health.handler.ts` | 1 | RC-6 (path) — SKIP |
| `api/middlewares/quota.middleware.ts` | 1 | RC-3 (EventBus) — SKIP |
| `core/referral.engine.ts` | 1 | RC-3 (EventBus) — SKIP |
| `platform/disglobal-client.ts` | 2 | RC-8 (`.detail` on unknown) — SKIP |
| `shared/funnel.service.ts` | 6 | RC-3 (4) + RC-8 (2) — SKIP |
| `external-v2` (44, 299) | 2 | RC-8 (decl dup / DTO) — SKIP |

**RC-2 puro y corregible por typing: 21 errores en 5 archivos.**

## 2. Reducción exacta de errores

| Hito | Errores |
|---|---:|
| Entrada E4-D1 (post E4-C2) | 75 |
| **Salida E4-D1** | **54** |
| **Δ** | **−21** |
| Δ acumulado (E4-A→E4-D1) | **117 → 54 (−63, −54%)** |

**Errores nuevos introducidos: 0** (verificado por diff completo del set).

Per-file: api-key 5→0 · metering 3→0 · consent 1→0 · engagement 7→0 · external-v2 7→2 (los 2 restantes NO-RC-2).

## 3. Archivos modificados

| Archivo | Call-sites tipados |
|---|---|
| `src/api/middlewares/api-key.middleware.ts` | 1 (`rawQueryOne`) |
| `src/platform/metering.service.ts` | 2 (`rawQueryOne`) |
| `src/api/middlewares/consent.guard.ts` | 1 (`queryOne`) |
| `src/api/handlers/external-v2.handler.ts` | 5 (`queryOne`) |
| `src/shared/engagement.service.ts` | 4 (`queryOne`×3, `queryMany`×1) |

## 4. Explicación de cada RowType introducido

| Call-site | RowType | Por qué |
|---|---|---|
| api-key `resolveKey` | `{ id; tenantId; name; permissions: Record<string,string[]>; rateLimitTier: 'STANDARD'\|'PROFESSIONAL'\|'ENTERPRISE' }` | Coincide 1:1 con los campos de `ApiKeyContext` |
| metering `getTenantQuotaConfig` | `{ monthlyApiLimit: number }` | `monthlyLimit: row?.monthlyApiLimit` → number |
| metering `computeRevenueShare` | `{ revenueShareRatio: number }` | `shareRatio` y aritmética de cents |
| consent `grantConsent` | `{ id: string }` | `RETURNING id` → `return id.id: string` |
| external-v2 bioAge | `{ differentialAge: number }` | `referralEng.evaluate({ differentialAge })` |
| external-v2 riskScore (×2) | `{ riskCategory: string }` | `cvRiskCategory: string` |
| external-v2 engagement | `{ tier: string }` | `engagementTier: string` |
| external-v2 `resolveSubjectRef` | `{ id: string }` | `return patient.id: string` |
| engagement `getScore` | `EngagementScoreSnapshot` | `return row ?? null` (tipo de retorno existente) |
| engagement `recomputeScore` events | `{ eventType: string; eventDate: string }` | índice `EVENT_WEIGHTS[evt.eventType]`, `new Date(eventDate)` |
| engagement totalEvents | `{ total: number }` | `persistScore(..., totalEvents)` espera number |
| engagement testStats | `{ completed: number; started: number }` | aritmética `completed/started` |

Tipos derivados **directamente de las columnas SQL** (`::float`/`::int`/text) y del uso aguas abajo. Cero `any`, cero `unknown` casts añadidos.

## 5. Backward compatibility

- `rawQuery<T>`/`rawQueryOne<T>`/`queryOne<T>`/`queryMany<T>` ya tenían default `Record<string, unknown>` → todos los call-sites NO migrados se comportan exactamente igual.
- Solo se **añadieron parámetros de tipo** a llamadas existentes; ninguna firma pública cambió.
- 100% compatible: 0 callers rotos, 0 errores nuevos.

## 6. Runtime impact

**Nulo.** Un parámetro de tipo genérico (`<RowType>`) es borrado en compilación (type erasure). El SQL, los parámetros, el control de flujo y los valores devueltos son **byte-idénticos**. `npm run ci` (sandbox 49/49) confirma comportamiento sin cambios.

## 7. Risk assessment

| Ítem | Severidad | Estado |
|---|---|---|
| RowTypes incorrectos → nuevos errores | — | 0 nuevos (verificado) |
| Cambio de runtime | — | Nulo (type erasure) |
| `funnel.handler.ts` `.rows` (5) — **NO corregido** | MEDIO | **Stop Rule**: `db.rawQuery()` devuelve el array de filas; el código accede a `.rows` sobre el array → bug latente que **lanza en runtime si se ejecuta**. El router funnel está **comentado en `server.ts`** (ruta muerta). Corregirlo exige cambiar la expresión de acceso (`.rows[0]`→`[0]`) = **cambio de semántica de runtime**, prohibido. Tipar `rawQuery<T>` NO lo resuelve. → registrado como **TD-18** (bug latente, no typing). |

## 8. Updated TD-14 status

`117 → 54 (−63, −54%)`. **RC-2 (typing) eliminado en todos los módulos autorizados** (Longevity en E4-C2; api/handlers·middlewares·platform·shared·core en E4-D1). RC-2 remanente: solo `funnel.handler.ts` `.rows` (reclasificado como TD-18, bug latente, no typing).

Remanentes (54) por causa: RC-4 index barrel (12, off-runtime) · RC-5 legacy (9, off-runtime) · RC-3 EventBus (~7: funnel.service, quota, referral.engine, biological-age) · RC-8 (~8: external-v2 dup/DTO, disglobal `.detail`, funnel.service DimensionalMeasurement) · RC-6 paths (~3) · RC-7 Logger (~1) · TD-18 funnel `.rows` (5) · RC-1 residual seed_mvp (excluido).

## 9. Stop Rule

Activada para `funnel.handler.ts` (`.rows` — semántica de runtime) y respetada para todos los errores RC-3 (EventBus), RC-6 (paths), RC-7 (Logger), RC-8 (DTO/decl). **Ninguno se tocó**; todos documentados.

---

## Criterios de éxito

| Criterio | Resultado |
|---|---|
| RC-2 eliminado fuera de Longevity | ✅ (typing); `.rows` reclasificado TD-18 |
| Sin cambios de runtime | ✅ type erasure |
| Sin errores TS nuevos | ✅ 0 |
| Sin expansión de alcance | ✅ solo 5 archivos autorizados |
| Sin fixes no relacionados | ✅ RC-3/6/7/8 intactos |
| `npm run ci` | ✅ exit 0 (49/49) |
| AEK | ✅ 0 findings |
| ISO | ✅ RULE-ISO-001 = 0 |

## Recomendación para E4-D2 / E4-E

1. **RC-4** (index.ts barrel, 12, off-runtime) — resincronizar con `contracts-v1`.
2. **RC-3** (EventBus, ~7) — alinear `emit/on`→`publish/subscribe` (requiere autorización EventBus).
3. **RC-8** (~8) — decl `apiKeyCtx`, DTO EngagementEvent, `.detail` en catch, DimensionalMeasurement.
4. **TD-18** (`funnel.handler.ts` `.rows`, 5) — corregir el bug latente (cambio de runtime → sprint dedicado con el router aún desmontado).
5. **RC-5/RC-7** (legacy 9 / Logger 1) — build-scope (E4-E/ADR) + ajuste de tipos del logger.
