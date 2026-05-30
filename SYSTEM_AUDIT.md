# Vytalix — System Audit Report
## Bloque A: Scope Freeze

Fecha: 2024-11-10
Estado: FROZEN — no se agregan features después de este documento.

---

## Módulos existentes (inventario completo)

### Core clínico
| Módulo | Archivo canónico | Estado |
|--------|-----------------|--------|
| Ingestion service | `src/ingestion/ingestion.service.ts` | ✅ completo |
| LOINC registry | `src/ingestion/loinc-registry.ts` | ✅ completo |
| Pipeline orchestrator | `src/pipeline/orchestrator.ts` | ✅ completo |
| Risk scoring (Framingham) | `src/pipeline/risk-scoring.service.ts` | ✅ completo |
| Snapshot service | `src/pipeline/snapshot.service.ts` | ✅ completo |
| Decision engine | `src/decision/decision.engine.ts` | ✅ canónico |
| Explainability service | `src/explainability/explainability.service.ts` | ✅ completo |
| Timeline service | `src/api/timeline.service.ts` | ✅ completo |
| API handlers | `src/api/handlers.ts` | ✅ completo |

### Infraestructura
| Módulo | Archivo | Estado |
|--------|---------|--------|
| Event bus | `src/events/event-bus.ts` | ✅ completo |
| Logger | `src/lib/logger.ts` | ✅ canónico |
| Prisma client + RLS | `src/lib/prisma.ts` | ✅ completo |
| Data contracts v1 | `src/contracts/v1/index.ts` | ✅ completo |
| Data contracts v1.1 | `src/contracts/v1_1/index.ts` | ✅ completo |
| Contract mappers | `src/contracts/compat/mappers.ts` | ✅ completo |

### Demo reliability
| Módulo | Archivo | Estado |
|--------|---------|--------|
| Demo dataset (frozen) | `src/demo/demo-dataset.ts` | ✅ completo |
| Demo seeder | `src/demo/seed-demo.ts` | ✅ completo |
| Demo status endpoint | `src/demo/demo-status.ts` | ✅ completo |
| Demo check script | `scripts/demo-check.ts` | ✅ completo |

### Infraestructura de despliegue
| Artefacto | Estado |
|-----------|--------|
| docker-compose.yml | ✅ con profiles dev/full/demo/prod |
| Dockerfile (multi-stage) | ✅ completo |
| .env.example | ✅ completo |

---

## Duplicados detectados (requieren consolidación — Bloque B)

| Duplicado A | Duplicado B | Canónico a mantener |
|-------------|-------------|---------------------|
| `src/decision/decision.engine.ts` | `src/decisions/engine.ts` | `src/decision/decision.engine.ts` |
| `src/lib/logger.ts` | `src/observability/logger.ts` | `src/lib/logger.ts` |
| `src/pipeline/risk-scoring.service.ts` | `src/scoring/framingham.ts` | `src/pipeline/risk-scoring.service.ts` |
| `src/ingestion/loinc-registry.ts` | `src/ingestion/loinc-catalog.ts` | `src/ingestion/loinc-registry.ts` |
| `src/explainability/explainability.service.ts` | `src/explainability/narrative.ts` | `src/explainability/explainability.service.ts` |
| `specs/openapi.yaml` | `docs/openapi.yaml` | `specs/openapi.yaml` |

---

## Known gaps críticos (bloques B–H los cierran)

### GAP-001: Sin servidor Express entry point
- **Riesgo**: CRÍTICO — no hay `src/server.ts` que monte los handlers
- **Bloquea**: todo el sistema
- **Cierra en**: Bloque B

### GAP-002: Sin autenticación implementada
- **Riesgo**: CRÍTICO — endpoints desprotegidos
- **Detalle**: JWT está referenciado en handlers pero no existe middleware
- **Cierra en**: Bloque C

### GAP-003: Sin `make setup` / `make demo`
- **Riesgo**: ALTO — tercero no puede levantar el sistema
- **Cierra en**: Bloque B

### GAP-004: Sin middleware de autenticación Express
- **Riesgo**: CRÍTICO — `req.user` es undefined en todos los handlers
- **Cierra en**: Bloque C

### GAP-005: Sin endpoint externo de integración
- **Riesgo**: MEDIO — pregunta del partner "¿cómo entra data?"
- **Cierra en**: Bloque E

### GAP-006: Sin `GET /health` ni `GET /metrics` completos
- **Riesgo**: MEDIO — demo-status existe pero no /health estándar
- **Cierra en**: Bloque F

### GAP-007: Prisma schema no en ubicación canónica
- **Riesgo**: BAJO — schema está en fases anteriores
- **Cierra en**: Bloque B

### GAP-008: package.json sin `demo:check`, `demo:reset`
- **Riesgo**: BAJO — scripts del bloque 11 no registrados
- **Cierra en**: Bloque B

---

## Dependencias críticas entre módulos

```
server.ts
  ├── auth middleware (GAP-002)
  ├── src/api/handlers.ts
  │   ├── src/ingestion/ingestion.service.ts
  │   │   └── src/ingestion/loinc-registry.ts
  │   ├── src/pipeline/orchestrator.ts
  │   │   ├── src/pipeline/risk-scoring.service.ts
  │   │   └── src/decision/decision.engine.ts
  │   │       └── src/explainability/explainability.service.ts
  │   └── src/api/timeline.service.ts
  ├── src/events/event-bus.ts
  └── src/lib/prisma.ts (RLS enforcement)
```

---

## Riesgos técnicos activos

| ID | Riesgo | Severidad | Mitigación |
|----|--------|-----------|-----------|
| R-01 | Sin auth → demo expone datos sin protección | CRÍTICO | Bloque C: JWT middleware |
| R-02 | Duplicados generan ambigüedad de importación | ALTO | Bloque B: eliminar duplicados |
| R-03 | Sin server.ts → sistema no arranca | CRÍTICO | Bloque B: crear entry point |
| R-04 | RLS sin tenant en contexto → queries fallan | CRÍTICO | Bloque C: tenant middleware |
| R-05 | Demo seed sin idempotencia total | MEDIO | Bloque B: verificado en seed-demo.ts |

---

## Declaración de scope freeze

A partir de este audit, el sistema está congelado en feature scope.
Los bloques B–H solo cierran gaps de hardening, no agregan funcionalidad clínica nueva.

Versión congelada: `0.9.0-demo-candidate`

---

## ADDENDUM — Vytalix_Claude consolidation (FASE 0 + FASE 1)

Fecha: 2026-05-30 · Orquestador: GenSpark AI Developer

### Diagnóstico del estado recibido (FASE 0)

El repositorio contenía código de buena calidad conceptual pero **no era
ejecutable**: todos los archivos `.ts/.tsx/.sql/.prisma` estaban aplanados en la
raíz, mientras que `package.json`, los READMEs, `ARCHITECTURE.md` y **todos los
imports relativos** asumían el árbol canónico `src/...`, `prisma/...`, `tests/...`,
`scripts/...`. Resultado: imports rotos, suite de tests 100% no recolectable.

### Hallazgos y acciones

| ID | Hallazgo | Severidad | Acción tomada |
|----|----------|-----------|---------------|
| STRUCT-001 | Archivos aplanados en raíz vs. imports `src/*` | CRÍTICO | Reestructurado al árbol canónico con `git mv` (historia preservada) |
| DUP-001 | 6 duplicados (`*_service.ts`, `*_handler.ts`, `prisma_middleware.ts`, `seed_mvp.ts`) | ALTO | Eliminados los no-canónicos; uno tenía bug `tc` vs `tx` |
| GAP-DEP-001 | `db.ts` importa `pg`/`@types/pg` no declarados en `package.json` | CRÍTICO | Añadidos a deps; instalados; typecheck pasa |
| CLIN-001 | Ecuación Framingham con término `age×HDL` inexistente en el modelo masculino + `lnAge`/mean erróneos → riesgo masculino ~99% (imposible) | CRÍTICO | Corregida a constantes publicadas D'Agostino 2008 (Circulation 117:743-753), validadas contra ejemplos del paper. Hombre medio 64a → 19.5% MODERATE |
| TS-001 | `tsconfig.server.json` `rootDir: ./src` excluía `scripts/` incluidos | MEDIO | `rootDir: .` |
| TEST-001 | `risk-scoring.test.ts` mockeaba API Prisma legacy (`$tx`) en vez del raw-SQL canónico (`withTenant/tc.queryOne`) y usaba tenantId no-UUID | ALTO | Reescrito sobre la interfaz canónica con UUIDs válidos. 10/10 pasan |
| GAP-TEST-001 | `tests/integration/pipeline.test.ts` mockea ORM Prisma reemplazado por raw SQL | ALTO | `describe.skip` documentado; remediación: Postgres efímero (testcontainers). Assertions preservadas como especificación |

### Estado tras FASE 1

- TypeScript: `tsc --noEmit` → **0 errores**
- Tests: **29 passed / 13 skipped** (antes: 0 recolectables)
- Árbol canónico materializado según `ARCHITECTURE.md`
- Fuente de verdad única por módulo (sin duplicados)
