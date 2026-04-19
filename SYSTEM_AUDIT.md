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
