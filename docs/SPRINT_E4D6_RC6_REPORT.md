# SPRINT_E4D6_RC6_REPORT.md
> **Vytalix Platform — Sprint E4-D6 · RC-6 Canonical Import Resolution (TD-14)**

| Campo | Valor |
|---|---|
| Sprint | E4-D6 — RC-6 (import paths obsoletos) |
| Rama | `adr/baseline-2026` |
| Modo | Solo corrección de path type-only, runtime-neutral |
| Estado | COMPLETADO — **CERTIFIED ZERO** (0 fixes: todos los candidatos son runtime-afectantes → skip) |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Resultado disciplinado: tras inspección rigurosa (Fase 1/2), **ninguno** de los candidatos RC-6 es una corrección de path type-only runtime-neutral. Todos son **imports dinámicos rotos** cuya corrección **cambiaría el comportamiento en runtime** → conforme al STOP RULE ("Never modify runtime semantics"), **documentados y omitidos**. Sin cambios de código; typecheck permanece en 36.

---

## 1. Inventario RC-6

4 errores TS2307 ("Cannot find module"):

| # | Archivo | Línea | Import | ¿En alcance RC-6? |
|---|---|---|---|---|
| 1 | `api/handlers/billing-admin.handler.ts` | 99 | `await import('../lib/redis')` | Sí |
| 2 | `api/handlers/billing-admin.handler.ts` | 118 | `await import('./metering.service')` | Sí |
| 3 | `api/handlers/health.handler.ts` | 71 | `await import('../events/event-bus')` | Sí |
| 4 | `legacy/server-v2-patch.ts` | 56 | `import … from './api/external.handler'` | **NO — RC-5 (legacy)** → skip |

## 2. Root cause

Los 3 en alcance son **imports dinámicos** (`await import(pathObsoleto)`) hacia rutas que **no existen**. En runtime, un `import()` a un módulo inexistente **rechaza** (ModuleNotFound). El compilador los marca TS2307; en ejecución **fallan siempre hoy**. No son "paths que apuntan al módulo equivocado con misma carga"; son imports que **actualmente no cargan nada**.

## 3. Evidencia canónica (Fase 2) — prueba por import

Requisitos de Fase 2: (1) path actual obsoleto, (2) módulo canónico existe, (3) export idéntico, (4) semántica idéntica, (5) grafo sin cambios. **Basta que uno falle para SKIP.**

### billing-admin(99) — `../lib/redis` → `getRedisClient`
- (1) Obsoleto ✅ · (2) `platform/redis` existe ✅ · (3) exporta `getRedisClient` ✅ (línea 11).
- (4) **FALLA:** el import está en `try { … } catch (_) {}`. Hoy el import rechaza → catch lo traga → la línea `logger.info('API key revoked …')` **nunca se ejecuta**. Corregir el path haría que el import tenga éxito → `getRedisClient()` se invoca y el `logger.info` **se emite** → **cambio de runtime**.
- **Veredicto: SKIP** (runtime-afectante).

### billing-admin(118) — `./metering.service` → `DEFAULT_UNIT_PRICES_CENTS`
- (1) Obsoleto ✅ · (2) `platform/metering.service` existe ✅.
- (3) **FALLA:** `DEFAULT_UNIT_PRICES_CENTS` **NO está exportado** (línea 31 es `const`, sin `export`). Corregir el path daría TS2305 (no exported member) — **no resuelve** el error.
- (4) **FALLA:** no está en try/catch; hoy el import rechaza → el handler lanza → 500. Corregir (si el export existiera) → 200 con invoice calculada → **cambio de runtime**.
- **Veredicto: SKIP** (export inexistente + runtime-afectante).

### health.handler(71) — `../events/event-bus` → `eventBus`
- (1) Obsoleto ✅ · (2) `platform/event-bus` existe ✅ · (3) exporta `eventBus` ✅ (línea 231).
- (4) **FALLA:** dentro de un probe `checkDependency('event_bus', …)`. Hoy el import rechaza → el probe lanza → **event_bus reportado como no-saludable**. Corregir → import OK → `eventBus.listenerCount(...) >= 0` → true → **probe saludable** → el estado del health check **cambia** → **cambio de runtime**.
- **Veredicto: SKIP** (runtime-afectante — invierte el resultado del health check).

### legacy/server-v2-patch(56) — RC-5
- Zona `src/legacy/` → **RC-5**, fuera del alcance RC-6 (STOP rule). **SKIP.**

## 4. Files modified

**Ninguno.** Cero ediciones de código.

## 5. Exact changes

Ninguno. (Todos los candidatos requerían cambiar runtime → omitidos.)

## 6. Before / After

| Hito | Errores |
|---|---:|
| Entrada E4-D6 | 36 |
| **Salida E4-D6** | **36** |
| **Δ** | **0** (certified zero) |

## 7. Remaining errors (36)

Sin cambios respecto a E4-D5: RC-3 EventBus (8) · RC-5 legacy (9) · RC-8 bloqueados TD-19 (7) · TD-18 funnel `.rows` (5) · **RC-6 (3, reclasificados → TD-20)** · residual legacy (4).

## 8. Backward compatibility

100% — no se modificó nada. Runtime idéntico por definición.

## 9. Runtime neutrality

Certificada: al **no** aplicar ningún cambio, el runtime es byte-idéntico. La razón misma del skip es preservar la neutralidad de runtime (corregir habría cambiado comportamiento observable: emisión de logs, invocación de `getRedisClient()`, resultado de health check, 500→200).

## 10. Validation gates

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | 36 (sin cambio) |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings |
| RULE-ISO-001 | ✅ 0 |
| Dependency graph | ✅ sin cambios (0 ediciones) |

## 11. Technical debt update

`TECHNICAL_DEBT_REGISTER.md`: **RC-6 reclasificado → TD-20.** Los 3 imports dinámicos rotos NO son deuda de "path type-only"; son **bugs funcionales latentes** (imports que fallan en runtime) cuya corrección requiere autorización de cambio de runtime. Además billing-admin(118) requiere exportar `DEFAULT_UNIT_PRICES_CENTS` (decisión de API del módulo metering).

## 12. Recommendation for next sprint

- **RC-6 (TD-20) NO pertenece a un sprint type-only.** Requiere un **sprint de corrección funcional** con autorización explícita para cambiar runtime (los imports actualmente fallan; corregirlos activa código y cambia health-check/logs/respuestas). Debe validarse con tests de runtime, no solo typecheck.
- Según el roadmap del programa, el siguiente sprint autorizado es **E4-D7 — RC-3 EventBus Consolidation** (requiere autorización explícita, aún no otorgada).
- Mantener Type Check/Build **advisory** hasta `typecheck = 0`.

---

## Disciplina

De 4 candidatos TS2307: 1 es RC-5 (legacy, fuera de alcance); 3 son imports dinámicos rotos cuya corrección **cambia runtime** (uno además con export inexistente). Conforme a "STOP / DOCUMENT / SKIP / CONTINUE" y "Never modify runtime semantics", **se corrigieron 0** y se documentaron todos con evidencia. Prefiero dejar el error sin resolver antes que introducir un cambio de runtime bajo un mandato type-only.
