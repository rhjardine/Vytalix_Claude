# SPRINT_E4C1_PRISMA_ALIGNMENT_REPORT.md
> **Vytalix Platform — Sprint E4-C1 · Prisma Alignment (TD-14 RC-1)**

| Campo | Valor |
|---|---|
| Sprint | E4-C1 — Prisma Alignment (implementación controlada) |
| Rama | `adr/baseline-2026` |
| Dominio único de cambio | Prisma (schema/client/middleware/seeds) |
| Estado | COMPLETADO — RC-1 ELIMINADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Un único dominio de cambio. Una única causa raíz (RC-1). Sin cambios funcionales. No se tocó `src/longevity/**`, `src/dental/**`, `src/platform/db.ts`, `rawQuery()`, EventBus, OpenAPI, frontend, AEK, ADR, tests ni CI.

---

## 1. Lista completa de archivos modificados

| Archivo | Cambio | Autorizado por scope |
|---|---|---|
| `package.json` | `+ "postinstall": "prisma generate"` | "configuración Prisma … indispensable" |
| `src/api/middlewares/prisma.middleware.ts` | 2 aserciones `as` → `as unknown as` (type-only) | Archivo explícitamente en scope |
| `docs/TECHNICAL_DEBT_REGISTER.md` | TD-14 RC-1 marcado resuelto + TD-17 añadido | Entregable #9 |
| `docs/SPRINT_E4C1_PRISMA_ALIGNMENT_REPORT.md` | Este informe | Entregable #10 |

> `prisma format` se ejecutó (Fase 4) pero su salida (209 líneas de re-formato puramente cosmético, 0 cambios de contenido) se **revirtió** para mantener el cambio quirúrgico — la alineación no requería modificar el contenido del schema.

---

## 2. Explicación técnica de cada modificación

### 2.1 `package.json` — `postinstall: prisma generate`
RC-1 se originó porque el cliente Prisma no se generaba. El runtime usa `transpile-only` (no typecheck), por lo que nadie generaba el cliente y `prisma.middleware.ts` no resolvía `@prisma/client`. `postinstall` hace que **cada `pnpm install` (local y CI) genere el cliente** de forma durable. Es el **único mecanismo autorizado**, dado que editar `ci.yml` está prohibido y `pnpm install` (ya presente en CI) dispara `postinstall`.

### 2.2 `src/api/middlewares/prisma.middleware.ts` — `as unknown as`
Con el cliente **sin** generar, los delegates de Prisma resolvían como tipos no-tipados y las aserciones `prisma[model] as Record<...>` pasaban. Al generar el cliente con tipos reales, TS emitió **2× TS2352** ("conversion may be a mistake … convert to unknown first") porque los tipos de delegate de Prisma y `Record<string, (...)=>Promise<unknown>>` no solapan. La corrección es exactamente la sugerida por TS — interponer `unknown`:
- L92: `prisma[model] as Record<…>` → `prisma[model] as unknown as Record<…>`
- L101: `tx[model …] as Record<…>` → `tx[model …] as unknown as Record<…>`

**Cambio solo de tipos. Cero cambio de comportamiento en runtime** (las aserciones no alteran valores; el Proxy y la lógica transaccional son idénticos).

### 2.3 schema.prisma — sin cambios de contenido
Fase 2 determinó que el schema es **internamente consistente** (`prisma validate` ✓) y que **ningún modelo referencia** los 5 enums que `seed_mvp.ts` importa. Añadirlos sería **rediseño del modelo** (prohibido). Por tanto el schema **no requiere cambios** para la alineación.

---

## 3. Errores TypeScript antes y después

| Hito | Errores |
|---|---:|
| E4-A baseline | 117 |
| Entrada a E4-C1 (committed tras E4-B) | 98 |
| **Salida E4-C1** | **95** |
| Δ E4-C1 | **−3** (los 3 errores de `prisma.middleware.ts`) |
| Δ acumulado (E4-A→E4-C1) | **−22** |

- `prisma.middleware.ts`: 3 → **0** (resueltos los TS2305/TS2344/TS2339 al generar; resueltos los 2× TS2352 con `as unknown as`).
- **Errores nuevos introducidos: 0** (verificado por diff completo contra el baseline de 98).
- El conteo es **estable y durable**: con `postinstall`, CI genera el cliente y verá 95 (no el 98 enmascarado).

---

## 4. Confirmación: ningún cambio funcional

- `prisma.middleware.ts`: cambios **solo de tipo** (`as unknown as`). El Proxy, `$tx`, `set_config` y `writeAuditLog` son byte-idénticos en lógica.
- `package.json`: `postinstall` solo afecta el paso de instalación (genera el cliente); no cambia runtime.
- Sin cambios en modelos, queries, RLS, ni comportamiento de la aplicación.

## 5. Confirmación: ninguna zona protegida modificada

| Zona prohibida | ¿Tocada? |
|---|---|
| `src/longevity/**`, `src/dental/**` | ❌ No |
| `src/platform/db.ts` / `rawQuery()` | ❌ No |
| EventBus, OpenAPI, Frontend, AEK, ADR, Tests, CI | ❌ No |
| `prisma/schema.prisma` (contenido) | ❌ No (format revertido) |

`git status` del commit: `package.json`, `src/api/middlewares/prisma.middleware.ts`, `docs/TECHNICAL_DEBT_REGISTER.md`, `docs/SPRINT_E4C1_PRISMA_ALIGNMENT_REPORT.md`.

## 6. Resultados de validación

| Gate | Resultado |
|---|---|
| `prisma validate` | ✅ "The schema … is valid 🚀" |
| `prisma generate` | ✅ Generated Prisma Client v5.22.0 |
| `pnpm typecheck` | ✅ 98 → **95** (−3), 0 nuevos |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings; RULE-ISO-001 = 0 |

## 7. Estado de RC-1: **ELIMINADO**

| Componente RC-1 | Estado |
|---|---|
| Cliente Prisma generado (durable) | ✅ `postinstall: prisma generate` |
| `prisma.middleware.ts` alineado | ✅ 0 errores |
| Schema consistente | ✅ `prisma validate` ✓ (sin cambios necesarios) |
| Seed activo (`seed-demo.ts`, `db:seed`) | ✅ 0 errores (ya consistente) |

**Justificación:** RC-1 se definió como "Prisma Client no generado / tipos/enums faltantes" que bloqueaban `prisma.middleware.ts`. Ese bloqueo está **completamente resuelto**: el cliente se genera de forma durable y el middleware está alineado con los tipos reales. El seed activo es consistente.

**Residual carve-out (no es RC-1):** `src/demo/seed_mvp.ts` es un seed **huérfano** (sin script ni imports; excluido del gate en E4-B) que referencia 5 enums ausentes del schema. Esto **no** es un "artefacto generado faltante" (definición de RC-1) sino un **drift seed↔schema en código muerto**. Resolverlo exige rediseño del modelo (prohibido) o eliminar el seed → registrado como **TD-17**, diferido a un sprint de limpieza.

## 8. Errores TypeScript remanentes: **95**

| Dominio | Errores | Causa raíz dominante |
|---|---:|---|
| Longevity | 23 | RC-2 (rawQuery) |
| Commercial/API | 15 | RC-2 / RC-6 paths |
| Shared | 13 | RC-2 / RC-3 |
| index.ts (barrel, off-runtime) | 12 | RC-4 |
| api/middlewares | 7 | RC-2 (api-key) |
| api/pipelines | 10 | RC-2 / RC-7 |
| Legacy (off-runtime) | 9 | RC-5 |
| Platform | 5 | RC-2 |
| Core (referral.engine) | 1 | RC-2 |
| **Total** | **95** | |

> `prisma.middleware.ts` ya no aparece (alineado). RC-2 (`rawQuery` weak typing, ~50) es ahora el bloque dominante y siguiente keystone.

## 9. Actualización del registro de deuda técnica

`docs/TECHNICAL_DEBT_REGISTER.md`: **TD-14** actualizado (RC-1 resuelto; progreso 117→98→95); **TD-17** añadido (seed_mvp huérfano + drift de 5 enums, P2, sprint de limpieza).

## 10. Stop Rules — no activadas

No fue necesario tocar Longevity, `rawQuery()` ni EventBus para resolver RC-1. La única dependencia inesperada (seed_mvp↔schema enums) se **documentó y se detuvo** sin ampliar el alcance (no se rediseñó el modelo).

---

## Criterios de éxito

| Criterio | Resultado |
|---|---|
| Prisma completamente consistente | ✅ validate ✓, cliente generado |
| Cliente generado correctamente | ✅ durable vía postinstall |
| Middleware alineado | ✅ 0 errores |
| Seeds consistentes | ✅ seed activo (`seed-demo.ts`) 0 errores; `seed_mvp` huérfano → TD-17 |
| Ningún cambio funcional | ✅ solo tipos + postinstall |
| Ninguna modificación fuera de alcance | ✅ |
| CI verde | ✅ exit 0 |
| AEK sin regresiones | ✅ 0 findings |
| Reducción objetiva de errores | ✅ 98 → 95 (acumulado 117 → 95) |

## Recomendación para el siguiente sprint (E4-C2)

**RC-2 (keystone, ~50 errores)** — tipar genéricamente `rawQuery<T>()` en `src/platform/db.ts` + narrowing en call-sites. **Requiere autorización explícita** para editar `src/platform/db.ts` (hoy prohibido) y `src/longevity/**` (call-sites, zona protegida). Sin esa autorización, E4-C2 no puede abordar el bloque dominante de los 95 restantes.
