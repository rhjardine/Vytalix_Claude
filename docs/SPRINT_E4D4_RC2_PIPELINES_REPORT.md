# SPRINT_E4D4_RC2_PIPELINES_REPORT.md
> **Vytalix Platform — Sprint E4-D4 · RC-2 Residual (api/pipelines)**

| Campo | Valor |
|---|---|
| Sprint | E4-D4 — RC-2 residual en `src/api/pipelines/**` |
| Rama | `adr/baseline-2026` |
| Modo | Solo type args en helpers ya genéricos — **runtime byte-idéntico** |
| Estado | COMPLETADO |
| Fecha | 2026-06 |
| Comando reproducible | `pnpm typecheck` |

> Single-domain. Solo `pipeline-v2.orchestrator.ts`. Reutiliza `queryOne<T>` (ya genérico desde E4-C2). Sin tocar SQL, DTOs, schemas, contracts, EventBus, middleware, Prisma, validación ni firmas. Sin `any`, sin unknown-casts, sin aserciones.

---

## 1. Inventario (Fase 1) — 10 errores en `api/pipelines`, clasificados en fuente

| Línea | Código | Causa raíz | ¿RC-2? |
|---|---|---|---|
| 53 | TS2345 | RC-7 (`Logger<never>` vs `Logger<string>`) | NO — skip |
| 56 | TS2345 | RC-7 (idem) | NO — skip |
| 102 | TS2322 | **RC-2** — `cvRisk?.riskCategory` (queryOne untyped) | **SÍ** |
| 103 | TS2322 | **RC-2** — `engagementTier?.tier` (queryOne untyped) | **SÍ** |
| 191 | TS2322 | **RC-2** — `bioAge?.differentialAge` (queryOne untyped) | **SÍ** |
| 192 | TS2322 | **RC-2** — `riskScore?.riskCategory` (queryOne untyped) | **SÍ** |
| 224 | TS2339 | RC-3 (`eventBus.on`) | NO — skip |
| 242 | TS2339 | RC-3 (`eventBus.on`) | NO — skip |
| 256 | TS2339 | RC-3 (`eventBus.on`) | NO — skip |
| 301 | TS2345 | **RC-2** — `config.webhookSecret` (queryOne untyped → `createHmac` key) | **SÍ** |

**RC-2 confirmados: 5. No-RC-2 (skip): 5 (RC-7 ×2, RC-3 ×3).**

## 2. Call-sites tipados (Fase 2) y por qué cada RowType es correcto

| Línea | Call-site | RowType | Derivación |
|---|---|---|---|
| 83 | `cvRisk` | `{ riskCategory: string }` | `SELECT "riskCategory"`; usado como `cvRiskCategory: string` en `referralEngine.evaluate` |
| 92 | `engagementTier` | `{ tier: string }` | `SELECT tier`; usado como `engagementTier: string` |
| 172 | `bioAge` | `{ differentialAge: number }` | `SELECT "differentialAge"::float` → number; usado como `differentialAge: number` |
| 180 | `riskScore` | `{ riskCategory: string }` | `SELECT "riskCategory"`; usado como `cvRiskCategory: string` |
| 283 | `config` | `{ webhookUrl: string; webhookSecret: string }` | `SELECT "webhookUrl", "webhookSecret"`; `webhookUrl` filtrado `IS NOT NULL` y usado en guard truthy; `webhookSecret` pasado a `createHmac('sha256', …)` que requiere `string` (BinaryLike) |

Todos los tipos derivan **directamente de las columnas SELECT + casts SQL + uso aguas abajo**. Sin campos inventados, sin ampliación de tipos.

## 3. Before / After

| Hito | Errores |
|---|---:|
| Entrada E4-D4 | 44 |
| **Salida E4-D4** | **39** |
| **Δ RC-2** | **−5** |
| Δ acumulado (E4-A→E4-D4) | **117 → 39 (−78, −67%)** |

**Errores nuevos: 0** (verificado por diff completo).

## 4. Files modified

| Archivo | Call-sites tipados |
|---|---|
| `src/api/pipelines/pipeline-v2.orchestrator.ts` | 5 (`queryOne<RowType>`) |

(+ este informe + `TECHNICAL_DEBT_REGISTER.md`.)

## 5. Remaining skipped errors (en api/pipelines) por RC

| Línea | RC | Razón de skip |
|---|---|---|
| 53, 56 | **RC-7** | `Logger<never>` vs `Logger<string>` (varianza pino) — fuera de RC-2 |
| 224, 242, 256 | **RC-3** | `eventBus.on` (API EventBus) — fuera de RC-2; EventBus prohibido |

## 6. Backward compatibility

100%. Solo se añadieron parámetros de tipo genéricos a `queryOne` (ya genérico). Ninguna firma pública cambió; ningún consumidor afectado.

## 7. Runtime / verificación

| Ítem | Resultado |
|---|---|
| Runtime byte-idéntico | ✅ type args borrados en compilación; SQL/control flow/valores idénticos |
| Zero new TS errors | ✅ 0 |
| `npm run ci` | ✅ exit 0 (sandbox 49/49, prisma validate OK, AEK PASS) |
| AEK | ✅ 3 reglas DI, 0 findings |
| RULE-ISO-001 | ✅ 0 |
| Dependency graph unchanged | ✅ sin imports nuevos (solo type args sobre símbolo ya importado) |

## 8. Estado RC-2

**RC-2 completamente eliminado en todo el repositorio.** (Longevity en E4-C2; api/handlers·middlewares·platform·shared·core en E4-D1; api/pipelines en E4-D4.) No quedan errores de tipado de resultados de query sin resolver.

## 9. Remaining distribution (39)

| Causa | Errores |
|---|---:|
| RC-5 legacy (off-runtime) | 9 |
| RC-3 EventBus | 8 |
| RC-8 bloqueados (TD-19) | 7 |
| TD-18 funnel `.rows` | 5 |
| RC-7 Logger | 5 |
| RC-6 paths | 3 |
| RC-1 residual seed_mvp | (excluido del gate) |

> RC-7 ahora 5 (3 previos + 2 de pipeline-v2 53/56 confirmados RC-7 en este inventario).

## 10. Recommended next sprint

- **RC-7 (Logger, 5)** — `logger.child(...)` produce `Logger<never>` donde se espera `Logger<string>`; bajo riesgo, type-only, probablemente un solo patrón. Buen candidato single-domain.
- **RC-3 (EventBus, 8)** — `emit/on`→`publish/subscribe`; requiere autorización para EventBus.
- **TD-19 (RC-8 bloqueados, 7)** — requiere decisión de política (narrowing de error-body vs `ProblemDetailV1`; alinear Zod↔dominio).
- **RC-5 (legacy 9) / RC-6 (paths 3) / TD-18 (5)** — sprints dedicados / build-scope.

Mantener Type Check/Build **advisory** hasta `typecheck = 0`.

---

## Disciplina

5 errores RC-2 confirmados en fuente y corregidos con RowTypes derivados de SQL+uso; 5 errores no-RC-2 (RC-7/RC-3) **documentados y NO tocados**. Cero fixes especulativos, cero expansión de alcance.
