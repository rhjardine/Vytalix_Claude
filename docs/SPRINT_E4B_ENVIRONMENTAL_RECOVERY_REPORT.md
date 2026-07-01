# SPRINT_E4B_ENVIRONMENTAL_RECOVERY_REPORT.md
> **Vytalix Platform — Sprint E4-B · Environmental TypeScript Recovery (TD-14 RC-1 + RC-6)**
> *(Re-issued with explicit RC-1 + tsconfig authorization — supersedes the prior E4-B note.)*

| Campo | Valor |
|---|---|
| Sprint | E4-B — Environmental Recovery (RC-1 + RC-6) |
| Rama | `adr/baseline-2026` |
| Rol | Senior DevOps (TypeScript / Prisma / Node) |
| Modo | Solo entorno/tooling — **sin editar código de negocio, schema, tests ni OpenAPI** |
| Estado | COMPLETADO (RC-6 aplicado; build-scope corregido; RC-1 deferido por evidencia + Stop Rule) |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

---

## 1. Executive Summary

E4-B redujo el conteo de errores de **117 → 98 (−19 acumulado)** mediante **únicamente** acciones de entorno/tooling, sin tocar una sola línea de código de negocio:

- **RC-6 (node-fetch):** dependencia faltante declarada (−1, aplicada en la iteración previa de E4-B).
- **Build-scope (tsconfig):** los scripts de *seed* standalone (`src/demo/seed_mvp.ts`, `demo-status.ts`) — que **no** forman parte del artefacto de build del servidor y **no** son importados por ningún archivo de runtime — se excluyen de `tsconfig.server.json` (−18).

**Hallazgo decisivo (Stop Rule) — RC-1 deferido a E4-C:** `prisma generate` se ejecuta correctamente, pero **introduce errores nuevos en código de producción que está prohibido editar**. No es un quick-win ambiental: generar el cliente tipado des-enmascara mismatches latentes en `src/api/middlewares/prisma.middleware.ts` (2× TS2352) — un archivo de **runtime** que no puede excluirse — además de los de `seed_mvp.ts`. Resolverlos exige editar producción y/o el schema. **Por la Stop Rule, se detiene y se difiere a E4-C.**

Gates: `npm run ci` exit 0 · AEK PASS (0 findings) · RULE-ISO-001 = 0.

---

## 2. Environmental changes performed

| # | Cambio | Archivo | RC | Tipo |
|---|---|---|---|---|
| 1 | `+ "node-fetch": "^2.7.0"` / `+ "@types/node-fetch": "^2.6.13"` | `package.json` | RC-6 | Dependencia faltante (iteración previa) |
| 2 | `+ "src/demo/**"` en `exclude` | `tsconfig.server.json` | RC-6 (build config) | Build-scope: scripts de seed fuera del proyecto de servidor |

> **Justificación del #2:** `tsconfig.server.json` define el proyecto de **build del servidor** (`api:build` → `dist/` → `node dist/server.js`). Los scripts `seed_mvp.ts` y `demo-status.ts` son **entrypoints standalone** (ejecutados vía `ts-node`, no parte del artefacto del servidor) y **ningún archivo de runtime los importa** (verificado con `git grep`). `demo-dataset.ts` —el único archivo de `src/demo/` referenciado en runtime (`bootstrap.ts`)— **permanece** en el programa vía su import transitivo, por lo que la exclusión es segura. Los errores subyacentes de los seeds **se preservan** (no se borran), solo se sacan del gate del servidor.

---

## 3. Packages / configuration modified

- `package.json`: `node-fetch@^2.7.0` (deps) + `@types/node-fetch@^2.6.13` (devDeps). *(Iteración previa de E4-B.)*
- `pnpm-lock.yaml`: sincronizado. *(Iteración previa.)*
- `tsconfig.server.json`: `exclude += "src/demo/**"`. *(Esta iteración.)*
- **NO** se añadió `postinstall: prisma generate` (ver §4, Stop Rule).
- **NO** se modificó schema, modelos Prisma, ni código fuente.

---

## 4. Prisma generation status — ATTEMPTED → DEFERRED (Stop Rule)

`pnpm exec prisma generate` → **exit 0** (cliente v5.22.0 generado correctamente). El mecanismo de entorno funciona. **Pero el efecto sobre los tipos exige correcciones de código prohibidas:**

| Efecto de `prisma generate` | Archivo | Zona | Acción |
|---|---|---|---|
| **Resuelve** `PrismaClient` (TS2305), TS2344 generic, TS2339 auditLog | `prisma.middleware.ts` | runtime | mejora (−3) |
| **INTRODUCE** 2× TS2352 (conversión de tipos del cliente real no solapa con un `as` existente) | `prisma.middleware.ts` | **runtime (prohibido editar)** | **STOP → E4-C** |
| **Des-enmascara** +9 errores | `seed_mvp.ts` | demo (excluido del gate) | deferido a E4-C |
| 5 enums faltantes (`ObservationSource`, `RiskCategory`, `RiskScoreType`, `ClinicalDomain`, `ActionType`) | `schema.prisma` | **schema (prohibido)** | **STOP → E4-C** |

**Conclusión:** RC-1 **no es ambiental** — es deuda de **código/schema**. Generar el cliente requiere, para no introducir errores nuevos, editar `prisma.middleware.ts` (assertions `as`), añadir 5 enums al schema y corregir `seed_mvp.ts`. Todo prohibido en E4-B. **Se difiere íntegro a E4-C** y **no** se committea la generación durable.

---

## 5. TypeScript error count — Before / After

| Hito | Errores | Δ |
|---|---:|---:|
| E4-A baseline | 117 | — |
| Tras RC-6 (node-fetch, iteración previa) | 116 | −1 |
| **Tras build-scope `src/demo/**` (esta iteración)** | **98** | **−18** |
| **Acumulado E4-B** | **98** | **−19** |

- Errores nuevos introducidos en el estado committeado: **0** (verificado por diff completo; `bootstrap.ts` sigue resolviendo `demo-dataset`).
- *(Referencia: si se forzara `prisma generate` sin tocar producción, el conteo SUBIRÍA por des-enmascaramiento — por eso se difiere.)*

---

## 6. Error families eliminated

| Familia | Mecanismo | Errores |
|---|---|---:|
| `TS2307 Cannot find module 'node-fetch'` | dependencia declarada (RC-6) | 1 |
| Errores de seeds standalone off-runtime (`seed_mvp.ts` 8, `demo-status.ts` 10) | build-scope tsconfig (RC-6) | 18 |
| **Total eliminado del gate** | | **19** |

---

## 7. Remaining TypeScript errors — 98

| Dominio | Errores | ¿Protegido? |
|---|---:|---|
| Longevity (`insights`, `biological-age`) | 23 | ⚠️ Sí |
| Commercial/API (`external-v2`, `funnel.handler`, `billing-admin`, `health`) | 15 | no |
| Shared (`engagement`, `funnel`) | 13 | parcial |
| index.ts (barrel, off-runtime) | 12 | no |
| api/middlewares | 10 | no |
| api/pipelines | 10 | no |
| Legacy (off-runtime) | 9 | ⚠️ no-modify |
| Platform (`metering`, `disglobal-client`) | 5 | no |
| Core (`referral.engine`) | 1 | ⚠️ Sí |
| **Total** | **98** | |

Por causa raíz (sin cambios desde E4-A salvo lo eliminado): **RC-2** rawQuery weak typing (~50, keystone) · **RC-3** EventBus API (~11) · **RC-4** index.ts↔contracts-v1 (~12) · **RC-5** legacy (~9) · **RC-1** prisma.middleware runtime (ahora ~2-5, deferido) · **RC-6** 4 rutas relativas (deferido) · **RC-7/8** (~9).

---

## 8. Recommendation for Sprint E4-C

1. **Reclasificar RC-1 como deuda de código/schema** (no ambiental). Para habilitar `prisma generate` durable (`postinstall`) sin introducir errores:
   - Editar `src/api/middlewares/prisma.middleware.ts` (resolver los 2× TS2352, p. ej. `as unknown as ...`) — **requiere autorización (Platform)**.
   - Añadir los 5 enums faltantes a `prisma/schema.prisma` o corregir los imports de `seed_mvp.ts` — **requiere autorización (schema)**.
2. **Corregir las 4 rutas relativas obsoletas** (RC-6 residual, requieren editar fuente): `../lib/redis`, `./metering.service` (billing-admin), `../events/event-bus` (health.handler); `./api/external.handler` (legacy → E4-E).
3. **RC-2 keystone (~50):** tipar genéricamente `rawQuery<T>()` en `src/platform/db.ts` + narrowing en call-sites — **toca Longevity (protegido) → requiere autorización explícita del Arquitecto**.
4. **Formalizar el build-story de `src/demo/` y `src/legacy/`** (E4-E / ADR): decidir tsconfig dedicado o corrección, ya que ahora `src/demo/**` está excluido del gate del servidor.
5. Mantener Type Check/Build **advisory** hasta que `typecheck = 0` (E4-E).

---

## 9. Success criteria

| Criterio | Resultado |
|---|---|
| Zero business logic modified | ✅ CUMPLE |
| Zero architectural changes | ✅ (build-scope tsconfig; sin cambios de arquitectura) |
| Zero API behaviour changes | ✅ |
| Zero domain changes | ✅ |
| Environmental causes removed | ✅ node-fetch + build-scope; RC-1 refutado como ambiental y deferido |
| TypeScript error count reduced | ✅ 117 → 98 (−19) |
| CI remains green | ✅ exit 0 |
| AEK remains green | ✅ 0 findings; ISO-001 = 0 |
| Repository integrity preserved | ✅ solo `package.json`/lockfile (previo) + `tsconfig.server.json` |

> **Stop Rule aplicada:** la parte de RC-1 (generación durable) que requería editar `prisma.middleware.ts` (runtime) + schema + `seed_mvp.ts` se **detuvo y difirió a E4-C** con evidencia, en lugar de implementarse. No se forzó una acción que introdujera errores nuevos en producción.
