# SPRINT_E3B_REPORT.md
> **Vytalix Platform — Sprint E3-B · Platform Hardening (TD-01)**

| Campo | Valor |
|---|---|
| Sprint | E3-B — Platform Hardening (resolución de TD-01) |
| Rama | `adr/baseline-2026` |
| Modo | Inventario → Clasificación → Validación de dependencias → Implementación → Validación → Verificación |
| Estado | COMPLETADO (TD-01 resuelto; hallazgos fuera de alcance diferidos) |
| Fecha | 2026-06 |

> Cambio confinado exclusivamente a la resolución de TD-01 (`src/vertical2/`). No se tocó OpenAPI, Prisma, Frontend, Sandbox, Tests, API pública, lógica clínica, Dental, Longevity, ADR-002 ni RULE-DI-001/002/003.

---

## 0. Executive Summary

TD-01 queda **completamente resuelto**: `src/vertical2/` (un prototipo huérfano no compilable de la nunca-implementada "Vertical 2 / Longevity Commerce") fue **eliminado** tras verificar exhaustivamente que ningún módulo de producción lo importa. Esto eliminó 5 errores de typecheck y deja **RULE-ISO-001 en 0 findings**, habilitando su futura promoción a gate bloqueante.

Durante la validación se descubrió que el typecheck del repositorio tiene **122 errores, de los cuales solo 5 eran de `vertical2`**; los **117 restantes están en código de producción** (fuera del alcance de TD-01 y prohibido modificar en este sprint). Conforme a la REGLA FINAL, **no se corrigieron**: se registran como **TD-14** y se difieren a un sprint de implementación dedicado.

Las puertas reales y certificadas permanecen verdes: **AEK PASS (exit 0)**, **RULE-DI-001/002/003 intactas (0 findings)**, **`npm run ci` verde y estable** (3/3 ejecuciones), **baseline BC-1 preservado**.

---

## 1. Inventario de `src/vertical2/`

| Archivo | LoC | Imports salientes | ¿Compila? | Imports entrantes |
|---|---:|---|---|---|
| `app.ts` | 199 | `express`, `crypto`, `./commerceRouter`, `./admin/adminRouter`, `./shared/middleware/partnerMiddleware`, `./shared/db/db`, `./shared/config/config` | ❌ No (5 módulos inexistentes) | **Ninguno** |
| `db.ts` | 132 | `pg`, `crypto` | ✅ Sí (autocontenido) | **Ninguno** (ni siquiera desde `app.ts`, que importa `./shared/db/db`) |

**Hallazgos del inventario:**
- `app.ts` referencia una arquitectura (`commerceRouter`, `admin/`, `shared/`) descrita en `docs/vertical2/ARCHITECTURE.md` pero **nunca implementada en `src/`**.
- `db.ts` es un duplicado autocontenido del patrón `withTenant()` de Sprint 1, **no importado por nadie**.
- El directorio contiene **solo** estos 2 archivos.

## 2. Matriz de clasificación KEEP / MOVE / DELETE / COMPLETE

| Componente | Clasificación | Acción | Justificación |
|---|---|---|---|
| `src/vertical2/app.ts` | Prototipo parcialmente integrado / código muerto | **DELETE** | No compila (5 imports inexistentes); 0 imports entrantes; nunca ejecutado; arquitectura de soporte nunca implementada. KEEP imposible (no compila); COMPLETE = nueva funcionalidad (prohibido); MOVE TO LEGACY no resuelve el error (legacy también está en el scope de `tsconfig.server.json`). |
| `src/vertical2/db.ts` | Código muerto (duplicado huérfano) | **DELETE** | Compila pero 0 imports entrantes; duplica `withTenant()` de Sprint 1; sin valor funcional. |

> Sin estados ambiguos: **ambos archivos → DELETE**. Reversible vía historial git (commit "Feac Vertical2 Dental CFE").

## 3. Validación de dependencias

| Verificación | Comando | Resultado |
|---|---|---|
| Imports entrantes (src/scripts) | `git grep -E "(from\|require\|import).*vertical2" -- src scripts` | **0** |
| Referencias en build/config | `git grep vertical2 -- tsconfig*.json package.json Dockerfile docker-compose.yml` | **0** |
| Referencias dinámicas (server/index) | `git grep vertical2 -- src/server.ts src/index.ts` | **0** |
| Tests que importan `src/vertical2/` | inspección de `tests/vertical2*.test.ts` | **0** — importan `../catalog/`, `../voucher/`… (estructura inexistente, no `src/vertical2/`) |
| Referencias residuales | `git grep vertical2` | solo comentarios CI (actualizados), reglas AEK (genéricas), docs y los tests huérfanos (TD-15) |

**Conclusión:** la eliminación de `src/vertical2/` no rompe ninguna compilación, import, ni dependencia transitiva existente. Los tests `vertical2*` estaban ya rotos de forma independiente (TD-15) y su estado **no cambia**.

## 4. Cambios realizados

| Cambio | Detalle |
|---|---|
| `git rm src/vertical2/app.ts` | Eliminado (prototipo no compilable) |
| `git rm src/vertical2/db.ts` | Eliminado (duplicado huérfano) |
| Directorio `src/vertical2/` | Eliminado (vacío tras `git rm`) |
| `.github/workflows/ci.yml` | Comentarios de Type Check/Build actualizados: la causa advisory ya no es `vertical2` sino TD-14 |
| `docs/TECHNICAL_DEBT_REGISTER.md` | TD-01 marcado **RESUELTO**; añadidos TD-14 (errores de tipo en producción), TD-15 (tests vertical2 huérfanos), TD-16 (flake de sandbox) |
| `docs/SPRINT_E3B_REPORT.md` | Este informe |

> No se modificó código de producción, OpenAPI, Prisma, frontend, sandbox, tests, ADR, ni RULE-DI/ISO.

## 5. Riesgos detectados

| Riesgo | Severidad | Estado |
|---|---|---|
| **TD-14** — 117 errores de typecheck en producción impiden Type Check/Build verdes | ALTO | Diferido (prohibido tocar producción en este sprint) |
| **TD-15** — tests `vertical2*` huérfanos (importan estructura inexistente) | MEDIO | Diferido (tests de solo lectura) |
| **TD-16** — flake transitorio en un test de sandbox (1/~5; no reproducible) | BAJO | Observado; sandbox de solo lectura |
| Eliminación de código no creado por el agente | BAJO | Mitigado: análisis confirma la descripción (huérfano/roto); reversible vía git; autorizado por el alcance del sprint |

## 6. Resultado de Type Check

```
ANTES:  122 errores (21 archivos) — incl. 5 en src/vertical2/app.ts
DESPUÉS: 117 errores (20 archivos) — 0 en src/vertical2/
```
- ✅ Contribución de TD-01 eliminada por completo (5 → 0).
- ⚠️ Type Check **no** finaliza limpio: 117 errores pre-existentes en producción (**TD-14**), fuera del alcance de TD-01 y prohibidos de modificar. **No corregidos** (REGLA FINAL).

## 7. Resultado de Build

`pnpm api:build` (usa `tsconfig.server.json`, mismo conjunto de errores que Type Check): permanece **advisory** por TD-14. La contribución de `vertical2` al fallo de build queda eliminada.

## 8. Resultado AEK

```
AEK Baseline Check — PASS
  actual findings : 0
  expected (max)  : 0
AEK_EXIT = 0
```
- ✅ RULE-DI-001/002/003: 3 reglas, **0 findings** (intactas).
- ✅ Gobernanza v1.1 ejecuta: 13 warnings (7 HYG + 6 ADR), salud overall 82/100 (OBSERVE) — sin cambios respecto a E3-A.

## 9. Resultado CI

`npm run ci` (= `sandbox:test` + `prisma validate` + `aek:check`) — **exit 0, estable en 3/3 ejecuciones**:
```
Tests  49 passed (49)
AEK Baseline Check — PASS
AEK Governance Health (advisory) — overall 82/100 (OBSERVE); 13 warning(s)
```
> Nota: una ejecución intermedia previa mostró un fallo transitorio de 1 test de sandbox (no reproducible; TD-16). Las 3 ejecuciones de confirmación finalizaron verdes.

## 10. Estado final de RULE-ISO-001

```
RULE-ISO-001 findings: 0
```
- ✅ **0 findings.** Tras eliminar `src/vertical2/`, no existe zona experimental que pueda ser importada; `src/legacy/` permanece y tampoco es importado por producción.
- La regla sigue en **WARNING** (no se promovió a ERROR — fuera del alcance de E3-B, por diseño).

### Repository Ready for RULE-ISO-001 Promotion

✅ **SÍ.** El repositorio queda listo para promover RULE-ISO-001 a política bloqueante (ERROR) en E4:
- `src/vertical2/` eliminado; `src/legacy/` aislado (0 imports entrantes de producción).
- RULE-ISO-001 = 0 findings de forma estable.
- La promoción no introduciría regresión en el gate (0 findings → seguiría PASS).

## 11. Recomendación técnica para Sprint E4

1. **Promover RULE-ISO-001 a ERROR** (bloqueante) — el repositorio ya está listo; protege el invariante de aislamiento de `legacy`.
2. **Abrir E3-C / sprint de implementación dedicado para TD-14** — los 117 errores de typecheck en producción requieren tocar `src/` y deben resolverse en un sprint con permiso explícito de modificación de producción (no en sprints de gobernanza). Hasta entonces, Type Check/Build permanecen advisory.
3. **Decidir el destino de los tests `vertical2*` huérfanos (TD-15)** — junto con la decisión sobre la Vertical 2 completa (¿se implementa la arquitectura de `docs/vertical2/` o se retiran los tests y docs?). Requiere ADR.
4. **Estabilizar el flake de sandbox (TD-16)** si reaparece en CI.

---

## 12. Criterios de éxito — verificación

| Criterio | Resultado |
|---|---|
| ✔ TD-01 completamente resuelto | **CUMPLE** — `src/vertical2/` eliminado, sin dependencias rotas |
| ✔ Ninguna regresión funcional | **CUMPLE** — 0 imports entrantes; runtime/tests sin cambio de estado |
| ✔ CI completamente verde | **CUMPLE** — `npm run ci` exit 0 (3/3). *(Type Check/Build full siguen advisory por TD-14, pre-existente y fuera de alcance.)* |
| ✔ AEK verde | **CUMPLE** — PASS, exit 0 |
| ✔ RULE-DI-001/002/003 intactas | **CUMPLE** — 3 reglas, 0 findings |
| ✔ RULE-ISO-001 = 0 findings | **CUMPLE** |
| ✔ Baseline BC-1 preservado | **CUMPLE** |
| ✔ Repositorio listo para promover RULE-ISO-001 | **CUMPLE** |

> **Transparencia (REGLA FINAL):** el criterio "Type Check / Build finalizan exitosamente" **no** se alcanza para el árbol completo, porque 117 errores residen en código de producción (TD-14) cuya corrección está prohibida en este sprint. Esto se detectó, se documentó y se difirió — no se implementó. La resolución de TD-01 en sí está 100% completa.
