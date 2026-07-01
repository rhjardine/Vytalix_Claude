# SPRINT_E4D3_RC8_REPORT.md
> **Vytalix Platform — Sprint E4-D3 · RC-8 Consolidation (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-D3 — RC-8 (declaraciones / narrowing / DTO local) |
| Rama | `adr/baseline-2026` |
| Modo | Solo correcciones RC-8 probadas — **runtime byte-idéntico** |
| Estado | COMPLETADO (1 RC-8 corregido; 7 RC-8 bloqueados/documentados por disciplina) |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Disciplina estricta aplicada: sin `as any`, sin nuevos unknown-casts, sin `ts-ignore`, sin cambios de control flow/comportamiento, sin wrappers/alias, sin tocar EventBus/Prisma/contracts/SQL. **Cuando una corrección requería una operación prohibida → STOP, documentar, reclasificar, continuar.**

---

## 1. Inventario completo (Fase 1) — 45 errores clasificados por causa raíz

Cada error inspeccionado en fuente (sin inferencia). Clasificación:

| Causa | Errores | ¿RC-8? |
|---|---:|---|
| **RC-8** (objetivo) | **8** | — |
| RC-2 residual (pipeline-v2 query results) | 5 (102,103,191,192,301) | NO |
| RC-3 (EventBus `emit`/`on`/publish-helpers) | 8 | NO |
| RC-5 (legacy stale refs) | 9 | NO |
| RC-6 (paths obsoletos) | 3 | NO |
| RC-7 (pino `Logger<never>`) | 3 | NO |
| TD-18 (funnel `.rows`, bug latente) | 5 | NO |
| RC-1 residual seed_mvp (excluido del gate) | — | NO |

### Desglose de los 8 RC-8 (inspección en fuente)

| # | Ubicación | Código | Sub-causa RC-8 | Acción |
|---|---|---|---|---|
| 1 | `external-v2.handler.ts(44)` | TS2717 | **Declaración duplicada** de `ApiKeyContext` + augmentation de `Request` (conflicto con la canónica de `api-key.middleware.ts`) | ✅ **CORREGIDO** |
| 2 | `external-v2.handler.ts(299)` | TS2345 | DTO: `body.events` (Zod, campos opcionales) → `EngagementEvent[]` (requeridos) | ⛔ **BLOQUEADO** |
| 3 | `index.ts(304)` | TS2339 | `.detail` sobre `unknown` (`res.json()`) | ⛔ **BLOQUEADO** |
| 4 | `index.ts(305)` | TS2339 | `.type` sobre `unknown` | ⛔ **BLOQUEADO** |
| 5 | `index.ts(318)` | TS2339 | `.detail` sobre `unknown` | ⛔ **BLOQUEADO** |
| 6 | `disglobal-client.ts(287)` | TS2339 | `.detail` sobre `unknown` | ⛔ **BLOQUEADO** |
| 7 | `disglobal-client.ts(303)` | TS2339 | `.detail` sobre `unknown` | ⛔ **BLOQUEADO** |
| 8 | `funnel.service.ts(164,166)` | TS2322 | DTO: `{high?,long?,width?}` → `DimensionalMeasurement` (requeridos) | ⛔ **BLOQUEADO** |

## 2. Per-file explanation

### ✅ CORREGIDO — `src/api/handlers/external-v2.handler.ts` (línea 44, TS2717)
**Evidencia:** `external-v2.handler.ts` definía una `interface ApiKeyContext` **local** (4 campos) + una `declare global { namespace Express { interface Request { apiKeyCtx?: ApiKeyContext } } }`. La **canónica** `ApiKeyContext` (5 campos, exportada) y su augmentation viven en `api-key.middleware.ts`, que external-v2 **ya importa** (`requireApiKey`). Dos augmentations con `ApiKeyContext` distintos → TS2717.

**Acción (DECLARATION RULES — "localizar la canónica, remover ambigüedad"):** se eliminó la `interface ApiKeyContext` local y la `declare global` duplicada. `req.apiKeyCtx` y `req.correlationId` resuelven ahora vía la augmentation canónica de `api-key.middleware.ts` (ya en el programa por el import existente). `ApiKeyContext` solo se usaba en esas dos declaraciones (verificado por grep).

**Backward compat / runtime:** `interface` y `declare global` son **type-only** (borrados en compilación) → runtime byte-idéntico. **Sin import nuevo** (api-key.middleware ya importado) → dependency graph sin cambios. external-v2 solo usa `{ tenantId }` de apiKeyCtx, presente en la canónica.

### ⛔ BLOQUEADOS (documentados, NO corregidos)

**`.detail`/`.type` sobre `unknown` (index.ts ×3, disglobal-client ×2):**
`const data = await res.json()` → `res.json(): Promise<unknown>` (tipos Node/undici). El código hace `new Error(data.detail ?? fallback)` y `code: data.type`. Una corrección **byte-idéntica** exige acceder a `data.detail`/`data.type` con su semántica `?? ` original (que usa el valor si NO es nullish, sea del tipo que sea). Las únicas vías:
- `as { detail?: … }` desde `unknown` → **unknown-cast prohibido**.
- Narrowing `typeof/in` → fuerza `typeof detail === 'string'`, que **cambia comportamiento** (descarta valores no-string que el `??` original sí pasaba a `new Error`).
→ Ninguna vía respeta a la vez "sin unknown-cast" y "byte-idéntico". **STOP/documentado.**

**DTO opcional→requerido (external-v2 EngagementEvent, funnel.service DimensionalMeasurement ×2):**
El origen (tipos inferidos de Zod) tiene campos **opcionales**; el consumidor canónico (`EngagementEvent`, `DimensionalMeasurement`) los requiere. Corregir exige (a) cambiar el schema Zod/contrato (**prohibido**), (b) cambiar la firma del consumidor (**comportamiento/contrato**), o (c) validación en runtime (**control flow + comportamiento**). **STOP/documentado.**

## 3. Before / After

| Hito | Errores |
|---|---:|
| Entrada E4-D3 | 45 |
| **Salida E4-D3** | **44** |
| **Δ RC-8** | **−1** (TS2717 dedup) |
| Δ acumulado (E4-A→E4-D3) | **117 → 44 (−73, −62%)** |

**Errores genuinamente nuevos: 0.** (El error EngagementEvent pasó de línea 299 a 288 por el bloque de 11 líneas removido — mensaje byte-idéntico, intacto.)

## 4. Remaining RC distribution (44)

| Causa | Errores | Notas |
|---|---:|---|
| RC-5 legacy | 9 | off-runtime |
| RC-8 (bloqueados) | 7 | `.detail`/`.type` ×5 + DTO ×2 (requieren relajar política o cambiar schema) |
| RC-3 EventBus | 8 | requiere autorización EventBus |
| TD-18 funnel `.rows` | 5 | bug latente (ruta muerta) |
| RC-2 residual (pipeline-v2) | 5 | `api/pipelines` nunca autorizado; query results sin tipar |
| RC-7 Logger | 3 | pino `Logger<never>` |
| RC-6 paths | 3 | imports relativos obsoletos |
| index.ts (RC-8 .detail) | (incluido en RC-8 arriba) | |

## 5. Technical Debt updates

`TECHNICAL_DEBT_REGISTER.md` (TD-14): RC-8 parcialmente resuelto (1/8). Los 7 RC-8 bloqueados se documentan como **TD-19** (requieren relajación de la política "no unknown-cast / no schema change" o decisión de contrato).

## 6. Risk assessment

| Ítem | Severidad | Estado |
|---|---|---|
| Dedup de declaración rompe `req.apiKeyCtx`/`correlationId` | — | Mitigado: canónica de api-key.middleware (ya importada) cubre ambos; verificado 0 nuevos |
| Cambio de dependency graph | — | Nulo (sin import nuevo) |
| RC-8 bloqueados acumulan deuda | BAJO | Documentados (TD-19); requieren decisión de política/contrato |

## 7. Backward compatibility

100%. La única corrección elimina declaraciones de tipo duplicadas (type-only). La API pública, los contratos y las firmas no cambian. El consumidor de `req.apiKeyCtx` obtiene ahora la `ApiKeyContext` canónica (superset compatible).

## 8. Runtime impact

**Nulo.** `interface`/`declare global` se borran en compilación; no se emite JS. `npm run ci` (sandbox 49/49) confirma comportamiento idéntico.

## 9. Validation summary

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | 45 → **44** (−1), 0 nuevos |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings (dependency graph sin cambios) |
| RULE-ISO-001 | ✅ 0 |
| Governance health | 82/100 (sin cambios) |

## 10. Recommended next sprint

Los RC-8 restantes (`.detail`/`.type` y DTO) requieren una **decisión de política** que este sprint no puede tomar:
- **Opción A (recomendada):** sprint que autorice explícitamente, SOLO para parseo de respuestas de error, un narrowing tipado del cuerpo de error contra el contrato canónico `ProblemDetailV1` (decisión consciente sobre el cuerpo `res.json()`), y para los DTO Zod→dominio, alinear el schema o el consumidor.
- **RC-3 (EventBus, 8)** — sprint con autorización para EventBus (`emit/on`→`publish/subscribe`).
- **RC-2 residual pipeline-v2 (5)** — autorizar `api/pipelines` para tipar sus query results (reutiliza `rawQuery<T>`/`queryOne<T>` ya disponibles).
- **RC-5/RC-6/RC-7/TD-18** — legacy/build-scope/logger/bug-latente en sprints dedicados.

Mantener Type Check/Build **advisory** hasta `typecheck = 0`.

---

## Disciplina aplicada

De 8 errores RC-8, **solo 1 tenía una corrección probada, byte-idéntica y sin operaciones prohibidas** → corregido. Los otros 7 requerían unknown-casts, cambios de comportamiento o cambios de schema/contrato → **NO corregidos, documentados y reclasificados** (TD-19), conforme a "When uncertain: STOP, Document, Skip, Continue." Cero fixes especulativos.
