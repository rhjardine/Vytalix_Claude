# EVENT_MODEL_EXECUTIVE_SUMMARY.md
> **Vytalix Platform — Executive Summary: Canonical Event Model & Contract (A2 + A3)**

| Campo | Valor |
|---|---|
| Sprint | A2 — Canonical Event Model · **A3 — Canonical Event Contract** |
| Modo | Análisis/consolidación; **cero cambios de código** |
| Fecha | 2026-06/07 |

> Documento canónico: [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) — ahora catálogo (§1–§7) **+ contrato semántico** (§8) + trazabilidad (§9). Este es el único executive summary del modelo/contrato (no duplica el de plataforma [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)).

---

## Resultado en una frase

**El modelo canónico de eventos de Vytalix YA existe en el código** (`src/platform/event-bus.ts`: 7 eventos `VytalixEvent` tipados sobre un `BaseEvent` con eventId/tenantId/correlationId/occurredAt/version). A2 lo **consolidó** por primera vez en un único catálogo semántico sin duplicar los documentos de A1.

## 1. Artefactos existentes reutilizados (referenciados, no recreados)
- `src/platform/event-bus.ts` — **fuente de verdad**.
- `EVENTBUS_CURRENT_ARCHITECTURE.md` (arquitectura), `ADR_EVENTBUS.md` (decisión), `ARCHITECTURE_DEPENDENCY_GRAPH.md` (Event Flow Map), `EVENTBUS_OPTION_ANALYSIS.md`, `EVENTBUS_MIGRATION_PLAN.md`.

## 2. Artefactos existentes actualizados
- Ninguno de contenido (solo referencias). *(No fue necesario modificar docs existentes.)*

## 3. Artefactos nuevos creados
- `CANONICAL_EVENT_MODEL.md` (catálogo canónico) + este executive summary. **Total: 2** (máximo permitido).

## 4. Duplicados evitados
- No se recreó arquitectura/decisión/flujo/opciones/migración (ya existen en A1).
- No se creó una segunda matriz, ADR, gobernanza ni roadmap.
- No se colisionó con `EXECUTIVE_SUMMARY.md` (plataforma) — este es event-model-specific.

## 5. Fuente canónica seleccionada
**`src/platform/event-bus.ts`** (unión `VytalixEvent`). El código gana sobre cualquier documento.

## 6. Estado del modelo (evidencia)
- **Fortalezas:** tipado y discriminado; multi-tenant (tenantId); trazable (correlationId/eventId/occurredAt); **LOINC-aware** (`ObservationAdded.loincCode`); **pseudonimizado** (`PaymentConfirmed.subjectRef`); **transport-agnostic** (publish/subscribe idéntico Local↔EventBridge); aislamiento de fallos.
- **Cadena activa:** solo **PaymentConfirmed** (payment-webhook→payment-pipeline, `server.ts:175`). Los otros 6 eventos se publican pero sus consumidores (`registerCoreSubscriptions`) no están cableados.

## 7. Gaps semánticos remanentes (clasificados)
| Nivel | Gaps |
|---|---|
| Important | `causationId`, `producer`/`source`, versioning por-evento + deprecación, `aggregateId` formal, cableado de consumidores tipados |
| Optional | CloudEvents envelope, OpenTelemetry traceId/spanId, SNOMED, FHIR refs |
| Future | event store/replay/at-least-once, schema registry, encryption boundaries (transporte de red) |

Ninguno bloquea la única cadena activa (PaymentConfirmed).

## 8. Recomendación para el próximo sprint de implementación
1. **Primero decidir wiring** (registerCoreSubscriptions + cadenas ad-hoc) según [ADR_EVENTBUS.md](./ADR_EVENTBUS.md) + input de negocio.
2. **Luego** añadir los gaps *Important* mínimos: `causationId` + `producer` en `BaseEvent` (auditoría/EventBridge) — cambio de contrato gobernado por ADR.
3. Diferir Optional/Future hasta el ADR de transporte de producción (EventBridge).

Prerequisito inalterado (de A1): **confirmación de negocio** del alcance por-cadena del piloto Disglobal antes de cualquier implementación de eventos.

---

## Validation checklist

| Ítem | Estado |
|---|---|
| Zero documentos duplicados | ✅ (1 canónico + 1 summary; resto referenciado) |
| Zero ADRs duplicados | ✅ |
| Zero gobernanza duplicada | ✅ |
| Zero cambios de runtime | ✅ (typecheck 36 sin cambio) |
| Zero rediseño de EventBus | ✅ |
| Evidencia de repositorio citada | ✅ (`event-bus.ts` file:line) |
| Una fuente canónica identificada | ✅ (`src/platform/event-bus.ts`) |
| Cada recomendación trazable a evidencia | ✅ |

---

## A3 addendum — Canonical Event Contract (la constitución semántica)

**En una frase:** A3 formalizó, **desde el código** y sin crear ningún documento nuevo, las reglas semánticas que todo evento Vytalix debe obedecer — extendiendo el artefacto canónico existente ([CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §8) en vez de duplicarlo.

**Las 9 áreas del contrato (§8.1–§8.9):** Filosofía (hechos pasados inmutables, desacople productor↔consumidor) · Semántica de dominio (un evento = un bounded context + un agregado) · Naming (**PascalCase past-tense** obligatorio; `dot.lowercase` prohibido) · Envelope (`BaseEvent`; el bus sella id/tiempo/version, el emisor provee tenant/correlation/payload) · Privacidad (`tenantId` frontera dura; `subjectRef` pseudónimo hacia afuera; ids internos, nunca PHI cruda) · Versionado (`version` desde el día uno; evolución aditiva + deprecación gobernada) · Confiabilidad (síncrono in-process best-effort; aislamiento de fallos; **idempotencia en el consumidor por `eventId`**) · Interoperabilidad (**transport-agnostic = invariante fundacional**; `emit/on` prohibido; objetivo CloudEvents/EventBridge/OTel/FHIR) · Gobernanza (código > doc; un concepto/un artefacto; cambios por ADR).

Cada regla se etiqueta **[R]** normativa-hoy (presente en el código) / **[+]** recomendada (requiere ADR) / **[F]** futura (transporte durable). Las reglas [R] son candidatas a enforcement por AEK.

**North Star (integración):** la invariante transport-agnostic (`event-bus.ts:4-5`), la pseudonimización de frontera (`subjectRef`) y la estabilidad de nombres son precisamente lo que habilita la fase Disglobal/partners/clínica sin tocar el core.

## Sección final requerida (A3) — reutilizado / actualizado / intacto / creado / duplicados / evidencia / B1

| Ítem | Resultado A3 |
|---|---|
| **Reutilizado** | `src/platform/event-bus.ts` (fuente de verdad, leído/citado, sin tocar). |
| **Actualizado** | `CANONICAL_EVENT_MODEL.md` (+§8 contrato, +§9 trazabilidad) y este summary (+addendum A3). |
| **Intacto (referenciado)** | `ADR_EVENTBUS.md`, `EVENTBUS_CURRENT_ARCHITECTURE/OPTION_ANALYSIS/MIGRATION_PLAN`, `ARCHITECTURE_DEPENDENCY_GRAPH`, `EXECUTIVE_DECISION_SUMMARY`. |
| **Nuevos creados** | **Cero.** Búsqueda previa (`git grep` event contract/naming/philosophy/governance) → sin artefacto equivalente → se extendió el canónico. |
| **Duplicados evitados** | No `CANONICAL_EVENT_CONTRACT.md` separado; no nuevo ADR/roadmap/matriz/gobernanza; repo **más simple** (un artefacto = catálogo + contrato). |
| **Evidencia por regla** | Cada [R] cita `event-bus.ts:línea` en §8; anti-patrón naming verificado por `git grep` de `emit(` ad-hoc. |
| **Recomendaciones B1** | (1) input de negocio por-cadena (bloqueante); (2) renombrar/eliminar `dot.lowercase`; (3) añadir `causationId`+`producer` al `BaseEvent` por ADR; (4) cablear consumidores idempotentes por `eventId`; (5) diferir CloudEvents/OTel/FHIR/event-store al ADR de transporte. |

## Validation checklist (A3)

| Ítem | Estado |
|---|---|
| Zero producción/código modificado | ✅ (solo 2 docs) |
| Zero cambios de runtime (typecheck 36) | ✅ |
| Zero rediseño de EventBus | ✅ |
| Zero documentación duplicada | ✅ (0 docs nuevos; se extendió el canónico) |
| Un solo contrato semántico autoritativo | ✅ (§8, 9 áreas) |
| Repositorio más simple que antes | ✅ (catálogo+contrato en 1 artefacto) |
| Cada regla trazable a evidencia de repo | ✅ (`event-bus.ts:línea` por [R]) |
| Facilita fase de integración (North Star) | ✅ (reglas *(→ integración)* anotadas) |

---

---

## B1.5 addendum — Event Domain Architecture (arquitectura de dominio semántico)

**En una frase:** B1.5 definió, **desde el código** y sin crear ningún documento nuevo, la arquitectura de dominio permanente que todo evento futuro debe seguir — extendiendo el artefacto canónico ([CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §10) con taxonomía, matriz de campos, matriz de privacidad, interoperabilidad, escalabilidad y evolución.

**Salida requerida (12 puntos):**

1. **Evidencia de repositorio:** LOINC nativo (`handlers.ts:131`, `decision.engine.ts:223-225`); FHIR solo en `src/legacy/` (`ingestion_service.ts:60`); EventBridge stub (`event-bus.ts:205-223`); 7 eventType PascalCase (`event-bus.ts:34-110`); insurtech OpenAPI (`openapi/vytalix_insurtech_v1.yaml`).
2. **Artefactos reutilizados:** `CANONICAL_EVENT_MODEL.md` (extendido §10), `ADR_EVENTBUS.md`, `EVENTBUS_*`, `EVENT_CHAIN_CLASSIFICATION/BACKLOG`, `ROADMAP_V2.md` (referenciados).
3. **NO duplicados intencionalmente:** no nuevo ADR, no nueva gobernanza, no nuevos docs de EventBus, no nuevo Roadmap, no segundo Canonical Event Model, no `EVENT_DOMAIN_ARCHITECTURE.md` separado (se extendió el canónico).
4. **Nuevas decisiones arquitectónicas:** (a) 6 dominios raíz; (b) capa de *namespace de dominio* `dot.lowercase` **ortogonal** al `eventType` PascalCase (resuelve el conflicto de naming sin renombrar código); (c) `privacyClassification` como campo Recommended que hace ejecutable la matriz de privacidad; (d) namespaces reservados.
5. **Taxonomía semántica:** `clinical · commerce · identity · platform · intelligence · analytics` (6 raíces); los 23 candidatos evaluados → merge/split/absorb/reserve (§10.2). Un evento = exactamente un dominio.
6. **Naming convention:** `eventType`=`<Aggregate><PastVerb>` PascalCase (código manda); namespace=`vytalix.<raíz>.<subdominio>` lowercase-dotted singular; prohibidos y extensibilidad definidos (§10.3).
7. **Contrato canónico:** matriz de 18 campos → Mandatory (6, en código) / Recommended (causationId, producer, aggregateId/Type, privacyClassification) / Optional / Forbidden / Future (§10.4).
8. **Modelo de privacidad:** matriz dominio×clase×tránsito; qué nunca viaja, qué se hashea, qué se cifra, qué puede recibir Disglobal (§10.5).
9. **Interoperabilidad:** CloudEvents (alta), EventBridge (diseñado-para), LOINC (nativa), FHIR (parcial/legacy), OTel (media), HL7/SNOMED (futuras) — solo compatibilidad semántica (§10.6).
10. **Escalabilidad:** 11 modalidades futuras (genomics, wearables, imaging, insurance, AI agents…) absorbidas **sin rediseño** bajo raíces/subdominios existentes (§10.7).
11. **Riesgos:** ver tabla abajo.
12. **Próximo sprint de implementación:** ver recomendación abajo.

**Reconciliación clave (código > documentación):** el enunciado ejemplificaba `dot.lowercase` como estándar de nombre; el código usa PascalCase. Se resolvió **sin regresión**: PascalCase permanece como `eventType`; `dot.lowercase` se adopta como *namespace de dominio* (eje ortogonal para EventBridge/routing/privacidad). Ningún evento renombrado.

### Riesgos (B1.5)

| Riesgo | Naturaleza | Mitigación |
|---|---|---|
| Interpretar la capa namespace como rename de `eventType` | Regresión de A3/código | §10.1 lo declara ortogonal; eventType inmutable |
| Añadir campos de envelope (`causationId`/`privacyClassification`) sin ADR | Cambio de contrato no gobernado | Todo cambio de `BaseEvent` pasa por ADR (§8.9/§10.4) |
| Reservar namespaces que luego no se usen | Entropía menor | Reserva es barata; previene colisiones |
| Confundir `payload.sourceSystem` (provenance) con `producer` (evento) | Modelado erróneo | §10.4 los separa explícitamente |

### Próximo sprint de implementación recomendado

**Ninguna implementación en B1.5.** El siguiente sprint funcional (con autorización de runtime + input de negocio) debe, en este orden: **(1)** ejecutar el backlog de migración ([EVENT_MIGRATION_BACKLOG.md](./EVENT_MIGRATION_BACKLOG.md)) W1→W4; **(2)** un ADR de envelope que promueva `causationId`+`producer`+`aggregateId`+`privacyClassification` de Recommended a Mandatory; **(3)** el ADR de transporte de producción (EventBridge) que active el mapeo namespace→`source` y el enforcement de privacidad. Todo gated en autorización explícita.

## Sección final requerida (B1.5) — validación

| Ítem | Estado | Evidencia |
|---|---|---|
| Sin documentación duplicada | ✅ | 0 docs nuevos; se extendió `CANONICAL_EVENT_MODEL.md` §10 |
| Sin ADR duplicado | ✅ | `ADR_EVENTBUS.md` referenciado, no recreado |
| Sin gobernanza duplicada | ✅ | ninguna tocada |
| Sin docs de EventBus duplicados | ✅ | `EVENTBUS_*` referenciados |
| Sin Roadmap duplicado | ✅ | `ROADMAP_V2.md` referenciado |
| Sin Canonical Event Model duplicado | ✅ | **es** el canónico, extendido |
| Sin cambios de runtime/código/tipos | ✅ | typecheck **36** sin cambio; solo 2 `.md` |
| Sin implementación de EventBus / eventos nuevos | ✅ | 0 código |
| Sin regresiones arquitectónicas | ✅ | PascalCase eventType preservado (§10.1) |
| Repo byte-idéntico salvo documentación | ✅ | `git status`: solo `docs/*.md` |

---

> **STOP.** Consolidación A2+A3+B1.5 completada. Modelo **+ contrato + arquitectura de dominio** en un único artefacto canónico. Sin implementación; toda recomendación de runtime/eventos/APIs queda documentada esperando autorización explícita.
