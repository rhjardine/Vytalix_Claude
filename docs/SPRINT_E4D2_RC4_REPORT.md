# SPRINT_E4D2_RC4_REPORT.md
> **Vytalix Platform — Sprint E4-D2 · RC-4 Barrel Synchronization (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-D2 — RC-4 (barrel `src/index.ts` ↔ `contracts-v1`) |
| Rama | `adr/baseline-2026` |
| Modo | Solo sincronización de barrel — **runtime byte-idéntico** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Single-domain. Solo re-exports del barrel. Sin redesign, sin renombrar APIs, sin wrappers, sin alias, sin cambios de runtime. No se tocó contracts-v1, implementaciones, EventBus, Prisma, SQL, tests, CI, package.json ni tsconfig.

---

## 1. Inventario RC-4 (Fase 1)

Todos los errores RC-4 estaban en el barrel `src/index.ts`, en el bloque `export type { … } from './shared/contracts-v1'`. Clasificación por causa:

| Línea | Símbolo | Código | Clasificación RC-4 |
|---|---|---|---|
| 20 | `AssessBioAgeResponse` | TS2305 | **Export obsoleto** (sin fuente canónica en src/) |
| 21 | `ComputePreventiveScoreResponse` | TS2305 | **Export obsoleto** |
| 22 | `EvaluateReferralResponse` | TS2305 | **Export obsoleto** |
| 23 | `RecordEngagementResponse` | TS2305 | **Export obsoleto** |
| 24 | `CohortInsightsResponse` | TS2305 | **Export obsoleto** |
| 25 | `BiophysicsMeasurements` | TS2305 | **Re-export path incorrecto** (vive en `longevity/biophysics-engine`) |
| 26 | `DimensionalMeasurement` | TS2305 | **Re-export path incorrecto** (idem) |
| 30 | `ReferralType` | TS2305 | **Export obsoleto** (no es contrato; enum Prisma) |
| 32 | `ProblemDetail` | TS2724 | **Símbolo renombrado** (canónico: `ProblemDetailV1`) |

**Errores NO-RC-4 detectados y omitidos (Stop Rule):**
- `index.ts(306/307/320)` TS2339 `.detail`/`.type` on unknown → **RC-8** (manejo de errores en catch). NO tocados.
- `legacy/server-v2-patch.ts(55/57/58)` TS2305 → **RC-5** (legacy stale refs). NO tocados.

### Grafo de dependencia (antes)
```
src/index.ts  ──(export type, 13 nombres)──►  src/shared/contracts-v1.ts
  ├─ 4 resuelven  : AgeStatus, ScoreTier, EngagementTier, Urgency        ✓
  ├─ 2 mal ubicados: BiophysicsMeasurements, DimensionalMeasurement → realmente en longevity/biophysics-engine
  └─ 7 obsoletos/renombrados: 5 *Response, ReferralType, ProblemDetail   ✗
```

## 2. Fase 2 — fuente canónica (verificada, no inferida)

`git grep "export … <símbolo>"` sobre `src/**`:

| Símbolo | Fuente canónica real |
|---|---|
| AgeStatus, ScoreTier, EngagementTier, Urgency | `shared/contracts-v1.ts` ✓ (sin cambio) |
| BiophysicsMeasurements | `longevity/biophysics-engine.ts:33` |
| DimensionalMeasurement | `longevity/biophysics-engine.ts:27` |
| 5× `*Response`, `ReferralType` | **no existe export en `src/`** → obsoletos |
| ProblemDetail | `contracts-v1` exporta `ProblemDetailV1` (no `ProblemDetail`) |

Verificado además que **ninguno** de los 9 símbolos se define ni se usa localmente en `index.ts` (debajo del bloque de re-export) → re-exports puros, eliminables/corregibles con seguridad.

## 3. Fase 3 — acciones aplicadas (solo barrel)

```ts
// ANTES (1 bloque, 13 nombres, 9 rotos)
export type { AssessBioAgeResponse, …, BiophysicsMeasurements,
  DimensionalMeasurement, AgeStatus, ScoreTier, EngagementTier,
  ReferralType, Urgency, ProblemDetail } from './shared/contracts-v1'

// DESPUÉS (2 bloques, solo nombres canónicos)
export type { AgeStatus, ScoreTier, EngagementTier, Urgency } from './shared/contracts-v1'
export type { BiophysicsMeasurements, DimensionalMeasurement } from './longevity/biophysics-engine'
```

| Acción | Símbolos |
|---|---|
| ✓ Remover export obsoleto | `AssessBioAgeResponse`, `ComputePreventiveScoreResponse`, `EvaluateReferralResponse`, `RecordEngagementResponse`, `CohortInsightsResponse`, `ReferralType`, `ProblemDetail` |
| ✓ Corregir re-export path | `BiophysicsMeasurements`, `DimensionalMeasurement` → `./longevity/biophysics-engine` |
| ✓ Mantener (canónico) | `AgeStatus`, `ScoreTier`, `EngagementTier`, `Urgency` |

> **ProblemDetail:** existe canónicamente como `ProblemDetailV1`. Re-exportarlo bajo ese nombre añadiría un nombre nuevo a la superficie del SDK (no es alias ni renombrado permitido); se **removió el nombre obsoleto** por disciplina de alcance. Nota para sprint futuro: si se desea exponer problem-detail en el SDK, hacerlo bajo el nombre canónico `ProblemDetailV1`.

## 4. Before / After

| Hito | Errores |
|---|---:|
| Entrada E4-D2 | 54 |
| **Salida E4-D2** | **45** |
| **Δ RC-4** | **−9** |
| Δ acumulado (E4-A→E4-D2) | **117 → 45 (−72, −62%)** |

- `src/index.ts`: 12 → 3 (los 3 restantes son RC-8 `.detail`/`.type`, renumerados de 306/307/320 a 304/305/318 por el −2 neto de líneas; **byte-idénticos en mensaje**, NO tocados).
- **Errores genuinamente nuevos: 0.**

## 5. Files modified

| Archivo | Cambio |
|---|---|
| `src/index.ts` | Bloque de re-export de tipos sincronizado (remover 7 obsoletos, corregir path de 2) |

(Solo un archivo de código. + este informe + `TECHNICAL_DEBT_REGISTER.md`.)

## 6. Per-file explanation

**`src/index.ts`** (barrel del SDK Disglobal): el bloque `export type {…}` listaba 13 nombres desde `contracts-v1`; 9 no resolvían. Se eliminaron 7 que no tienen fuente canónica (5 `*Response` inexistentes, `ReferralType` que no es un contrato, `ProblemDetail` renombrado a `ProblemDetailV1`), y se corrigió el path de los 2 que sí existen pero en `longevity/biophysics-engine`. Los 4 nombres válidos de `contracts-v1` se mantienen. Cero símbolos definidos/usados localmente afectados.

## 7. Backward compatibility

- Los 7 re-exports removidos **nunca compilaban** → no formaban parte de la API pública funcional (un consumidor que los importara obtenía un error de build del paquete). Removerlos **preserva la API pública funcional idéntica**.
- Los 2 corregidos conservan **el mismo nombre** (`BiophysicsMeasurements`, `DimensionalMeasurement`), ahora resolviendo desde su fuente real → pasan de rotos a funcionales (mejora sin cambio de nombre).
- Los 4 válidos: sin cambio.
- **100% compatible** con cualquier consumidor real (el barrel ahora compila; antes no).

## 8. Runtime byte-identical

`export type { … }` es **type-only**: se borra completamente en compilación (no emite JS). El cambio solo afecta nombres de tipo re-exportados y su path de origen. **Cero código de runtime modificado**; ninguna importación de valor, ningún SQL, ninguna lógica. `npm run ci` (sandbox 49/49) confirma comportamiento sin cambios.

## 9–10. Gates

| Gate | Resultado |
|---|---|
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, **0 findings** (el nuevo edge `index→longevity/biophysics-engine` no viola DI/ISO) |
| RULE-ISO-001 | ✅ 0 |
| Governance health | 82/100 (sin cambios) |

## 11. Technical Debt Register

`TECHNICAL_DEBT_REGISTER.md` (TD-14) actualizado: RC-4 RESUELTO; progreso 54 → 45.

## 12. Remaining RC distribution (45)

| Dominio | Errores | Causa raíz |
|---|---:|---|
| api/handlers | 10 | TD-18 funnel `.rows` (5) + RC-6 paths (3: billing×2, health×1) + RC-8 external-v2 (2) |
| legacy | 9 | RC-5 (off-runtime) |
| shared (funnel.service) | 6 | RC-3 EventBus (4) + RC-8 DimensionalMeasurement (2) |
| longevity | 3 | RC-7 Logger (1) + RC-3 EventBus (2) |
| index.ts | 3 | RC-8 (`.detail`/`.type` on unknown) |
| platform (disglobal-client) | 2 | RC-8 (`.detail` on unknown) |
| api/middlewares (quota) | 1 | RC-3 EventBus |
| core (referral.engine) | 1 | RC-3 EventBus |

Por causa: **RC-3** EventBus (~8) · **RC-5** legacy (9) · **RC-6** paths (3) · **RC-7** Logger (1) · **RC-8** (~9) · **TD-18** funnel `.rows` (5). RC-1/RC-2/RC-4 = **ELIMINADOS**.

## Stop Rule

Aplicada: RC-8 (index.ts `.detail`/`.type`), RC-5 (legacy), y todos los demás RC **documentados y NO tocados**. Sin expansión de alcance.

## Recomendación para el siguiente sprint

- **RC-8** (~9, incl. los 3 de index.ts ya adyacentes) — tipado de errores en `catch` (`unknown`→narrowing) + decl `apiKeyCtx` + DTO. Bajo riesgo, runtime-neutral.
- **RC-3** (EventBus, ~8) — alinear `emit/on`→`publish/subscribe` (requiere autorización EventBus).
- **RC-5** (legacy, 9) + **RC-6/RC-7** + **TD-18** — sprints dedicados/build-scope.

Mantener Type Check/Build advisory hasta `typecheck = 0`.
