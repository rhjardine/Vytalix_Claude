# SPRINT_E4B_ENVIRONMENTAL_RECOVERY_REPORT.md
> **Vytalix Platform — Sprint E4-B · Environmental TypeScript Recovery (TD-14 RC-1 + RC-6)**

| Campo | Valor |
|---|---|
| Sprint | E4-B — Environmental Recovery |
| Rama | `adr/baseline-2026` |
| Modo | Solo tooling/entorno — **sin editar código de producción, schema, tests ni OpenAPI** |
| Estado | COMPLETADO (RC-6 parcial aplicado; RC-1 deferido por evidencia) |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

---

## 1. Executive Summary

E4-B aplicó la **única corrección ambiental segura** disponible (RC-6 · dependencia `node-fetch` faltante) reduciendo **117 → 116** errores, sin introducir errores nuevos y sin tocar código de producción.

**Hallazgo crítico (evidencia sobre suposición):** la hipótesis de E4-A de que **RC-1 (`prisma generate`) era un quick-win de ~9 errores fue refutada por la evidencia.** Generar el cliente Prisma **aumenta** el conteo a **125 (+8)** porque des-enmascara errores latentes en `src/demo/seed_mvp.ts` (código de demo, fuera de runtime) que solo eran invisibles mientras el cliente estaba sin generar. Resolver RC-1 requiere editar el **schema** (5 enums faltantes) y/o `seed_mvp.ts` — **ambos prohibidos en E4-B**. Por la regla STOP, **RC-1 se difiere a E4-C**.

Todos los gates permanecen verdes: `npm run ci` exit 0, AEK PASS (0 findings), RULE-ISO-001 = 0.

---

## 2. Cambios ambientales realizados

| Cambio | Archivo | Tipo | Justificación |
|---|---|---|---|
| `+ "node-fetch": "^2.7.0"` (dependencies) | `package.json` | Dependencia faltante (RC-6) | El código (`pipeline-v2.orchestrator.ts`) importa `node-fetch` dinámicamente; la dependencia no estaba declarada. v2 = CommonJS-safe (coincide con `tsconfig module:commonjs`) |
| `+ "@types/node-fetch": "^2.6.13"` (devDependencies) | `package.json` | Tipos (RC-6) | Resuelve la declaración de módulo para `import('node-fetch')` |
| Lockfile sincronizado | `pnpm-lock.yaml` | Tooling | Resultado de `pnpm add` |

**No se realizó:** edición de código fuente, schema, modelos Prisma, tests, OpenAPI, ADR; **no** se añadió `postinstall: prisma generate` (ver §5, decisión basada en evidencia); **no** se modificó `tsconfig`.

> Nota: `node-fetch` ya se usaba con fallback a `globalThis.fetch` (`import('node-fetch').catch(() => ({ default: globalThis.fetch }))`), por lo que el runtime ya era seguro; el cambio solo satisface la resolución de tipos de `tsc`.

---

## 3. Estadísticas Before/After

### 3.1 Estado committeado (lo que ve CI — cliente Prisma sin generar)

| Hito | Errores | Δ |
|---|---:|---:|
| Baseline E4-A (committed) | 117 | — |
| **Tras RC-6 (node-fetch)** | **116** | **−1** |

- Error eliminado: `pipeline-v2.orchestrator.ts(303): TS2307 Cannot find module 'node-fetch'`.
- **Errores nuevos introducidos: 0** (verificado por diff completo del set de errores).

### 3.2 Estado real con cliente Prisma generado (corrección diagnóstica)

| Medición | Errores |
|---|---:|
| E4-A reportó (cliente sin generar) | 117 |
| **Real con `prisma generate`** | **125** |
| Delta de enmascaramiento | **+8** (todos en `src/demo/seed_mvp.ts`, off-runtime) |

> **Conclusión diagnóstica:** el "117" de E4-A era un **subconteo**. El conteo verídico con cliente generado es **125**. La diferencia son 9 errores enmascarados en demo (−1 en el archivo de runtime `prisma.middleware.ts`, que **mejora** al generar).

---

## 4. Distribución de causas raíz actualizada

| RC | Estado tras E4-B | Errores | Notas |
|---|---|---:|---|
| **RC-1** Prisma client | **DEFERIDO a E4-C** (refutado como quick-win) | +8 al generar | Genera des-enmascara demo; requiere schema/seed edits (prohibidos aquí) |
| **RC-2** `rawQuery` weak typing | Pendiente (keystone E4-C) | ~50 | Sin cambios |
| **RC-3** EventBus API | Pendiente (E4-D) | ~11 | Sin cambios |
| **RC-4** index.ts ↔ contracts-v1 | Pendiente (E4-D) | ~12 | Sin cambios |
| **RC-5** legacy stale refs | Pendiente (E4-E) | ~9 | Sin cambios |
| **RC-6** deps/paths | **PARCIAL** | node-fetch ✅ (−1); 4 paths deferidos | Ver §4.1 |
| **RC-7** pino Logger | Pendiente (E4-E) | ~3 | Sin cambios |
| **RC-8** misc | Pendiente (E4-E) | ~6 | Sin cambios |

### 4.1 RC-6 desglose
| Sub-causa | Acción | Estado |
|---|---|---|
| `node-fetch` no declarado | Añadir dependencia | ✅ **RESUELTO** (entorno) |
| `../lib/redis` (billing-admin) | Corregir path → `../../platform/redis` | ⛔ Requiere editar código → **E4-C** |
| `./metering.service` (billing-admin) | Corregir path | ⛔ Editar código → **E4-C** |
| `../events/event-bus` (health.handler) | Corregir path → `../../platform/event-bus` | ⛔ Editar código → **E4-C** |
| `./api/external.handler` (legacy) | Corregir path | ⛔ Editar código (legacy) → **E4-E** |

> Las 4 rutas relativas obsoletas son errores de **código fuente**, no de entorno; `tsconfig paths` no aplica a imports relativos. Quedan fuera del scope de E4-B.

---

## 5. Decisión basada en evidencia: por qué RC-1 NO se aplicó

E4-A asumió que `prisma generate` eliminaría ~9 errores. La ejecución real demuestra lo contrario:

1. **Medición:** `prisma generate` (exit 0) → `pnpm typecheck` pasa de **117 a 125**.
2. **Atribución:** delta por archivo = `prisma.middleware.ts` −1 (mejora, runtime) y `seed_mvp.ts` **+9** (demo, off-runtime).
3. **Causa:** con el cliente sin generar, todo lo Prisma resolvía como no-tipado y **suprimía** errores aguas abajo. Al generar, el cliente fuertemente tipado **revela** que `seed_mvp.ts` usa modelos/campos/enums que no coinciden con el schema.
4. **Bloqueo de scope:** resolver esos 9 + los 5 enums faltantes (`ObservationSource`, `RiskCategory`, `RiskScoreType`, `ClinicalDomain`, `ActionType`) exige editar **`prisma/schema.prisma`** y/o **`src/demo/seed_mvp.ts`** — prohibido en E4-B.
5. **Acción (regla STOP):** no se committeó `postinstall: prisma generate` (habría subido el conteo y violado "error count reduced" / "no new errors"). RC-1 se **difiere íntegro a E4-C**.

> Esto es un resultado de mayor valor que un quick-win: corrige el modelo mental del equipo (RC-1 es deuda de código/schema, no ambiental) y la línea base verídica (125).

---

## 6. Validación

| Gate | Resultado |
|---|---|
| `pnpm typecheck` (committed) | 117 → **116** (−1), 0 nuevos |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings; RULE-ISO-001 = 0; salud 82/100 sin cambios |
| Código de producción modificado | ✅ Ninguno |
| Archivos cambiados | `package.json`, `pnpm-lock.yaml` (+ este informe) |
| Integridad del repo | ✅ Preservada |

---

## 7. Recomendación para Sprint E4-C

E4-C debe **reclasificar RC-1 como deuda de código/schema** (no ambiental) y secuenciar con cuidado por el efecto de des-enmascaramiento:

1. **Decidir primero el destino de `src/demo/`** (off-runtime): excluirlo de `tsconfig.server.json` (decisión de gobernanza, idealmente E4-E/ADR) **antes** de habilitar la generación del cliente, para no introducir +9 errores de demo al gate. Alternativamente, corregir `seed_mvp.ts` + añadir los 5 enums al schema (requiere autorización para tocar schema/Prisma).
2. **Habilitar `prisma generate`** de forma durable (`postinstall`) **una vez** neutralizado el ruido de demo → mejora el tipado del runtime (`prisma.middleware.ts`).
3. **Corregir las 4 rutas relativas obsoletas** (RC-6 residual): `../lib/redis`, `./metering.service`, `../events/event-bus` (runtime) y `./api/external.handler` (legacy, E4-E).
4. **Proceder con RC-2** (keystone, ~50 errores) — recordando que toca `src/platform/db.ts` + call-sites en **Longevity** (zona protegida → requiere autorización explícita del Arquitecto).

**Orden sugerido E4-C:** rutas relativas (rápido) → decisión demo/schema para RC-1 → RC-2 cascada. Mantener Type Check/Build advisory hasta E4-E (`typecheck = 0`).

---

## 8. Criterios de éxito

| Criterio | Resultado |
|---|---|
| No production logic modified | ✅ CUMPLE |
| Environmental causes removed | ✅ Parcial — RC-6 node-fetch removido; RC-1 refutado y deferido con evidencia |
| TypeScript error count reduced | ✅ 117 → 116 (committed) — y **sin** subirlo (se evitó el +8 de prisma generate) |
| CI remains green | ✅ exit 0 |
| AEK remains green | ✅ 0 findings |
| Repository integrity preserved | ✅ Solo package.json + lockfile |
| No new TS errors introduced | ✅ Verificado por diff |

> **Cumplimiento de la regla STOP:** la parte de RC-1 (y las 4 rutas relativas) que requería editar código/schema de producción se **detuvo y difirió a E4-C/E4-E** con justificación basada en evidencia, en lugar de implementarse.
