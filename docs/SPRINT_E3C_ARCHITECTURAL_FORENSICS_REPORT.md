# SPRINT_E3C_ARCHITECTURAL_FORENSICS_REPORT.md
> **Vytalix Platform — Sprint E3-C · Architectural Knowledge Recovery (Vertical2 Forensics)**

| Campo | Valor |
|---|---|
| Sprint | E3-C — Architectural Forensics (recuperación de conocimiento) |
| Rama | `adr/baseline-2026` |
| Modo | Investigación pura (READ-ONLY) — sin código, sin restauración, sin commit |
| Estado | COMPLETADO |
| Fecha | 2026-06 |

> **Convención de rigor:** cada afirmación se etiqueta como **[HECHO]** (verificable en el repositorio), **[INFERENCIA]** (deducción sólida a partir de hechos) o **[HIPÓTESIS]** (plausible, no demostrada). Los criterios de éxito exigen priorizar evidencia sobre suposiciones.

---

## 1. Executive Summary

Vertical2 fue introducido en **un único commit** —`bdfaa8f` "Feac Vertical2 Dental CFE" (*Antivejez Bot*, 2026-06-08)— como un entregable coherente de **3.052 líneas / 8 archivos**: un contrato OpenAPI completo (674 líneas), documentación de arquitectura, una guía de integración para partners, scaffolding (`app.ts`, `db.ts`) y **1.499 líneas de tests** **[HECHO]**.

El dominio que describía es **"Longevity Commerce"**: una capa de productización comercial que convierte servicios/productos/programas de Doctor Antivejez en productos digitales vendibles vía partners (Disglobal), con flujo catálogo → pricing → voucher → reserva → fulfillment → grant de acceso **[HECHO]**.

La evidencia decisiva: **su capacidad ya fue realizada en producción, pero dental-scoped**. `src/dental/engines/dental-commerce.engines.ts` declara operar *"within the existing Vytalix commerce infrastructure"* reutilizando *"the same cryptographic patterns as Sprint 1 VoucherEngine"* **[HECHO]**. Los engines genéricos que Vertical2 especificaba (`VoucherEngine`, `BookingEngine`, …) **nunca existieron como archivos**; se implementaron como `DentalVoucherEngine`/`DentalBookingEngine` **[HECHO/INFERENCIA]**.

**Conclusión:** lo eliminado en E3-B era scaffolding muerto; el **conocimiento arquitectónico sobrevive intacto** en `docs/vertical2/` y en la realización dental. Vertical2 **no fue un experimento desechable** — fue el **blueprint de un bounded context Commerce genérico**, hoy realizado parcialmente y de forma dental-específica. **Valoración: MEDIA. Recomendación: Recuperar parcialmente.**

---

## 2. Reconstrucción histórica (Fase 1)

| Pregunta | Respuesta | Evidencia | Tipo |
|---|---|---|---|
| ¿Cuándo apareció? | 2026-06-08 | `git log bdfaa8f --date=short` | HECHO |
| ¿Quién lo introdujo? | Autor git **"Antivejez Bot"** | `git show bdfaa8f --format=%an` | HECHO |
| ¿En qué commit? | `bdfaa8f` "Feac Vertical2 **Dental CFE**" — un solo commit, 8 archivos, 3.052 inserciones | `git show --stat bdfaa8f` | HECHO |
| ¿Por qué apareció? | Como capa comercial ("Longevity Commerce") para vender servicios de Doctor Antivejez vía Disglobal | `docs/vertical2/ARCHITECTURE.md` L1–9 | HECHO |
| ¿Qué problema resolvía? | Monetizar/distribuir servicios clínicos a escala sin que el partner construya lógica clínica | `DISGLOBAL_QUICKSTART.md` "Modelo de operación" | HECHO |
| ¿Qué evolución tuvo? | El nombre del commit ("Vertical2 **Dental CFE**") vincula la capa al esfuerzo Dental CFE; la capacidad se realizó dentro de `src/dental/` (Sprints 5/6) | mensaje de commit + cabecera `dental-commerce.engines.ts` ("Sprint 6") | INFERENCIA |
| ¿Por qué quedó incompleto? | Solo `app.ts`+`db.ts` aterrizaron en `src/`; los engines genéricos nunca se escribieron como archivos — la implementación se desvió al dominio Dental | `git show --stat bdfaa8f` (sin `catalog/`, `voucher/`, etc.) | INFERENCIA |
| ¿Por qué se eliminó? | E3-B (`c66217c`) lo retiró como prototipo huérfano no compilable (TD-01) | `git show c66217c` | HECHO |

> **[HIPÓTESIS]** El equipo diseñó primero un Commerce *genérico* (Vertical2) y luego, por urgencia del piloto dental, implementó la capacidad *dentro* del satélite Dental, dejando el genérico como documentación + tests sin engines. No hay evidencia documental que lo confirme explícitamente, pero el patrón de archivos y los nombres lo respaldan fuertemente.

## 3. Línea Temporal

```
2026-06-08  bdfaa8f  Antivejez Bot — "Feac Vertical2 Dental CFE"
                     + docs/vertical2/{ARCHITECTURE, DISGLOBAL_QUICKSTART, OPENAPI-v2-commerce}
                     + src/vertical2/{app.ts, db.ts}
                     + tests/vertical2{,-integration,-extended}.test.ts
                     (8 archivos, 3.052 inserciones — engines NUNCA incluidos)
   │
   ├─ (Dental Sprints 5/6) — Realización dental-scoped en src/dental/:
   │     DentalVoucherEngine, DentalBookingEngine, dentalCommerceRouter
   │     "operate within the existing Vytalix commerce infrastructure"
   │
2026-06-27  c66217c  E3-B — DELETE src/vertical2/{app.ts,db.ts} (TD-01)
   │
2026-06     E3-C — Forensics (este informe)
```

## 4. Inventario completo de evidencia (Fase 4 — estado de implementación)

| # | Artefacto | LoC | Estado | Sobrevive |
|---|---|---:|---|---|
| 1 | `docs/vertical2/OPENAPI-v2-commerce.yaml` | 674 | **Únicamente documentado** (contrato exhaustivo) | ✅ |
| 2 | `docs/vertical2/ARCHITECTURE.md` | 206 | **Únicamente documentado** | ✅ |
| 3 | `docs/vertical2/DISGLOBAL_QUICKSTART.md` | 344 | **Únicamente documentado** | ✅ |
| 4 | `src/vertical2/app.ts` | 198 | **Prototipo** (scaffolding, no compilaba) | ❌ (eliminado E3-B) |
| 5 | `src/vertical2/db.ts` | 131 | **Prototipo** (infra scaffolding) | ❌ (eliminado E3-B) |
| 6 | `tests/vertical2.test.ts` | 472 | **Parcial** (spec ejecutable de engines inexistentes) | ✅ (huérfano, TD-15) |
| 7 | `tests/vertical2-integration.test.ts` | 633 | **Parcial** (spec E2E) | ✅ (huérfano) |
| 8 | `tests/vertical2-extended.test.ts` | 394 | **Parcial** (Access/Analytics) | ✅ (huérfano) |
| — | `CatalogEngine, PricingEngine, VoucherEngine, BookingEngine, FulfillmentEngine, AccessGrantService, CommercialAnalyticsService` | — | **Idea conceptual** (especificados por tests/OpenAPI, nunca escritos como archivos) | parcialmente, vía Dental |
| 9 | `src/dental/engines/dental-commerce.engines.ts` | — | **Completamente implementado** (Voucher+Booking, dental-scoped) | ✅ producción |
| 10 | `src/dental/routers/dental-commerce.router.ts` | — | **Completamente implementado** | ✅ producción |

## 5. Reconstrucción del dominio (Fase 2)

- **Bounded context:** **Longevity Commerce** — capa de productización sobre el core clínico **[HECHO]**.
- **Responsabilidades:** catálogo comercial, resolución de precios, emisión/canje de vouchers, reserva de agenda, fulfillment de productos físicos, grants de acceso, analítica comercial **[HECHO]** (`ARCHITECTURE.md`).
- **Agregados aparentes:** `CatalogItem`, `PricingRule`, `Voucher` (+`RedemptionEvent`), `Booking` (+`AvailabilitySlot`), `FulfillmentOrder` (+items), `AccessGrant`, `Partner` **[HECHO/INFERENCIA]** (10 tablas `commerce_*`).
- **Servicios de dominio:** 5 engines + `AccessGrantService` + `CommercialAnalyticsService` **[HECHO]**.
- **Capacidades empresariales:** venta multi-partner (API Key `vx2_`, scopes `commerce:*`), idempotencia por `correlationId`, anti-overbooking (`FOR UPDATE`), token 256-bit HMAC+QR, ACL clínico (`ClinicalIntegrationPort`), eventing fire-and-forget **[HECHO]**.

### Mapa conceptual del dominio

```
LONGEVITY COMMERCE (bounded context)
  Partner (Disglobal) ──[API Key vx2_, scopes commerce:*]──► /api/v2/commerce/*
        │
   Catalog → Pricing → Voucher → Booking → Fulfillment → AccessGrant → Analytics
        │
   ── ClinicalIntegrationPort (ACL): verifyServiceExists · getServiceSummary · checkUserConsent
   ── CommerceEventPublisher (fire-and-forget): BookingConfirmed · VoucherRedeemed
        │
   Persistencia: 10 tablas commerce_* con RLS · append-only en commerce_redemption_events
        │
   REALIZACIÓN ACTUAL (dental-scoped): DentalVoucherEngine · DentalBookingEngine ·
                                       dentalCommerceRouter · QuoteOrchestrator
```

## 6. Análisis estratégico (Fase 3 — ¿qué dominios representaba?)

| Dominio candidato | ¿Aplica? | Evidencia | Tipo |
|---|---|---|---|
| **Commerce** | ✅ Sí (núcleo) | 5 engines, OpenAPI commerce, "productización" | HECHO |
| **Marketplace** | ✅ Sí | consumo multi-partner, API Key `vx2_`, tier STRATEGIC | HECHO |
| **Partner Platform** | ✅ Sí | onboarding, scopes por tier, `partnerMiddleware` | HECHO |
| **Voucher** | ✅ Sí | VoucherEngine, token 256-bit, redención idempotente | HECHO |
| **Catalog** | ✅ Sí | CatalogEngine, `commerce_catalog_items` | HECHO |
| **Pricing** | ✅ Sí | PricingEngine, 6 tipos de regla | HECHO |
| **Multi-tenant** | ✅ Sí | RLS en 10 tablas, `withTenant()` | HECHO |
| **Billing** | ⚠️ Parcial | pricing/quote sí; settlement/facturación no aparece | INFERENCIA |
| **Subscription** | ❌ No | sin evidencia de suscripciones | HECHO |
| **Identity** | ❌ No | reutiliza pseudonimización del core, no gestiona identidad | INFERENCIA |

**Conclusión [INFERENCIA]:** Vertical2 = **Commerce/Marketplace + Partner Platform**, multi-tenant, con sub-capacidades Catalog/Pricing/Voucher. No es Subscription, Billing completo ni Identity.

## 7. Relación con la arquitectura actual (Fase 5)

| Bounded context actual | Relación con Vertical2 | Evidencia |
|---|---|---|
| **Dental** | **Duplica/absorbe** la capacidad commerce (Voucher, Booking, Pricing vía QuoteOrchestrator) — dental-scoped | `dental-commerce.engines.ts`, barrel `index.ts` |
| **Core / Longevity** | **Independiente** — Vertical2 nunca contiene lógica clínica; solo la consume vía ACL | `ARCHITECTURE.md` "lo que commerce NUNCA puede conocer" |
| **Platform** | **Complementa** — reutiliza `withTenant()`, RLS, eventing, pseudonimización | `db.ts` re-export, `app.ts` tenantSecret resolver |
| **Shared** | **Complementa** — `shared/types/domain` (`Money`, `Voucher`…) | imports de tests |

**Veredicto:** respecto a Dental, Vertical2 **duplica** (la versión genérica) lo que Dental ya **realizó** (versión específica). Respecto a Core/Longevity, **permanece independiente**. Respecto a Platform/Shared, **complementa**.

> **Vacío funcional remanente [INFERENCIA]:** Dental realizó Voucher+Booking+Pricing, pero **NO** hay en producción: `FulfillmentEngine` (envío de productos físicos), `AccessGrantService` (entitlements genéricos), `Catalog` genérico cross-vertical, ni `CommercialAnalyticsService`. Esas capacidades de Vertical2 siguen **sin realizar**.

## 8. Compatibilidad con la arquitectura actual (Fase 6)

| Eje | Veredicto | Justificación |
|---|---|---|
| Arquitectura Hexagonal | **Compatible** | Engines puros (core) + ports (ClinicalIntegrationPort, EventPublisher) + adapters (routers, repos) |
| DDD | **Compatible** | Bounded context explícito, agregados, ACL, lenguaje ubicuo (voucher/redemption/grant) |
| ADR-001 (API-First) | **Compatible** | OpenAPI commerce completo precede a la implementación |
| ADR-002 (Domain Isolation) | **Compatible con ajustes** | Requiere añadir "Commerce" a la matriz de bounded contexts y reglas AEK |
| ADR-003 (RLS) | **Compatible** | 10 tablas `commerce_*` con RLS + `withTenant()` |
| ADR-004 (engines puros) | **Compatible** | Engines sin I/O, reciben client scoped |
| ADR-005 (OpenAPI único) | **Compatible** | Contrato versionado v2 |
| ADR-006 (append-only) | **Compatible** | `commerce_redemption_events` append-only |
| ADR-007 (Dental satélite) | **Compatible con ajustes** | Debe generalizarse a "satélites comerciales" o declarar Commerce como kernel compartido |
| ADR-008 (jerarquía de verdad) | **Compatible** | Sin conflicto |
| AEK | **Compatible con ajustes** | RULE-ISO/DI aplican; se añadiría una regla de aislamiento Commerce |
| Repository Topology | **Compatible con ajustes** | Reclasificar de "experimental" a "Architectural Reference / Deferred Domain" |
| Architecture Baseline BC-1 | **Compatible** | No altera el núcleo certificado; es aditivo y aislado |

## 9. Recuperación del conocimiento (Fase 7 — qué preservar, no código)

1. **Decisión arquitectónica:** Commerce como bounded context separado del core clínico, conectado solo por un **ACL de 3 operaciones** (`ClinicalIntegrationPort`).
2. **Invariante:** Commerce **nunca** lee tablas clínicas; solo referencia `clinicalServiceReferenceId` opaco.
3. **Límite de dominio:** Commerce desconoce assessments, scores, diagnósticos (fail-safe-deny sin consentimiento).
4. **Modelo conceptual del voucher:** token 256-bit + QR (base64url) + HMAC-`tenantSecret` + redención idempotente atómica.
5. **Contrato de alto nivel:** OpenAPI `/api/v2/commerce/*` como plantilla reutilizable para futuras verticales.
6. **Responsabilidades:** catálogo, pricing, voucher, booking (anti-overbooking), fulfillment, access grant, analítica.
7. **Patrón de eventing:** fire-and-forget Commerce→Core (`BookingConfirmed`, `VoucherRedeemed`).

---

## Respuestas a las Preguntas Obligatorias

1. **¿Propósito funcional?** Productización comercial: vender servicios/productos de Doctor Antivejez como productos digitales (catálogo→voucher→reserva→fulfillment) vía partners. **[HECHO]**
2. **¿Problema de negocio?** Monetizar y distribuir a escala (Disglobal/45k puntos) sin exponer ni duplicar la lógica clínica. **[HECHO]**
3. **¿Bounded context?** Commerce/Marketplace multi-tenant, aislado del core por ACL. **[HECHO]**
4. **¿Nuevo dominio o extensión del Platform?** **Nuevo dominio** (Commerce ⊥ Platform): Platform aporta infraestructura (RLS, eventing), pero Commerce es un dominio de negocio propio. Hoy, sin embargo, **no es independiente**: vive como sub-capacidad del satélite Dental. **[INFERENCIA]**
5. **¿Qué se implementó?** Solo scaffolding `app.ts`/`db.ts` (prototipo) + la realización dental-scoped (Voucher/Booking). **[HECHO]**
6. **¿Qué quedó solo documentado?** OpenAPI commerce, ARCHITECTURE, QUICKSTART, y los 5 engines genéricos (idea conceptual/spec). **[HECHO]**
7. **¿Información suficiente para reconstruir la arquitectura?** **Sí, completamente** — OpenAPI (674 L) + ARCHITECTURE + QUICKSTART + 1.499 L de tests-como-spec. **[HECHO]**
8. **¿Qué conocimiento preservar?** Las 7 piezas de la Fase 7 (decisiones/invariantes/límites/contratos). **[HECHO]**
9. **¿Recuperar en el roadmap oficial?** → **Parcialmente.** El 80% del valor ya está en producción (dental); recuperar el genérico solo se justifica con una 2ª vertical comercial. Reimplementar ahora = duplicación. **[INFERENCIA]**

### Arquitectura moderna propuesta (solo diseño, si se recupera)
- **NO** recrear `src/vertical2/`. Extraer un bounded context `commerce/` (hexagonal): core = engines puros genéricos (`Catalog/Pricing/Voucher/Booking/Fulfillment`) generalizando los `Dental*Engine`; ports = `ClinicalIntegrationPort` + `CommerceEventPort`; adapters = routers `/api/v2/commerce/*` (OpenAPI-first, ADR-005), repos RLS (ADR-003), append-only (ADR-006).
- Dental pasa a ser un **adapter/configuración** del commerce genérico (no un duplicado).
- **Gobernanza ejecutable:** nueva regla AEK de aislamiento Commerce (WARNING→ERROR tras estabilizar); RULE-ISO-001 ya protege zonas no productivas.

---

## Architect Decision Package

### A. Dependencias (ADRs a modificar si Vertical2 regresa)
| ADR | Clasificación | Acción |
|---|---|---|
| ADR-001, 003, 004, 005, 006, 008 | **Compatible** | Sin cambios |
| **ADR-002** (Domain Isolation) | **Requiere actualización** | Añadir "Commerce" a la matriz de bounded contexts + reglas de import |
| **ADR-007** (Dental satélite) | **Requiere actualización** | Generalizar a "satélites comerciales" / declarar Commerce kernel compartido |
| — | **Incompatible** | Ninguno |

### B. Solapamientos (¿absorbido o vacío?)
| Capacidad Vertical2 | ¿Absorbida? | Por |
|---|---|---|
| Voucher, Booking, Pricing, Catalog (dental) | ✅ Absorbida | **Dental** (DentalVoucher/Booking, QuoteOrchestrator) |
| Infra (RLS, eventing, tenantSecret) | ✅ Absorbida | **Platform / Shared** |
| **Fulfillment** (productos físicos) | ❌ **Vacío** | — |
| **AccessGrant** (entitlements genéricos) | ❌ **Vacío** | — |
| **Catalog genérico cross-vertical** | ❌ **Vacío** | — |
| **Commercial Analytics** | ❌ **Vacío** | — |

→ **Existe un vacío funcional parcial** (fulfillment/access/catalog genérico/analytics) no cubierto por ningún dominio actual.

### C. Coste de recuperación: **MEDIO**
Los engines base ya existen (dental-scoped) → generalizarlos a un kernel `commerce/` + añadir las 4 capacidades del vacío + extraer ports/adapters es esfuerzo **moderado**. Recuperación *completa* como Platform Domain standalone sería **Alto**.

### D. Riesgo de NO recuperarlo
| Dimensión | Nivel | Justificación |
|---|---|---|
| Técnico | **Bajo** | Dental cubre la necesidad comercial actual; el conocimiento está en docs |
| Negocio | **Medio** | Si emergen ventas de productos Longevity / multi-vertical, faltaría fulfillment/catalog genérico |
| Estratégico | **Medio** | La visión "marketplace de Doctor Antivejez" quedaría limitada a dental |

### E. Recomendación para el Roadmap (una sola)
> **Recuperarlo parcialmente.**

Justificación: el valor central ya está realizado (dental) y el conocimiento está completo en `docs/vertical2/`. Recuperación parcial significa: (1) **preservar `docs/vertical2/` como Architectural Reference** (reclasificar, no borrar); (2) **emitir un ADR** que documente formalmente la decisión "Commerce como bounded context compartido" (subsume la opción "ADR histórico"); (3) **recuperar el kernel `commerce/` genérico solo cuando una 2ª vertical comercial lo justifique**, generalizando los engines dentales. Descartar definitivamente perdería una visión estratégica válida; recuperar completamente ahora sería duplicación sin demanda.

---

## Valoración arquitectónica final: **MEDIA**

Idea de dominio: ALTA · Código eliminado: BAJA (muerto) · Urgencia: BAJA · **Ponderada: MEDIA**.

## Recomendación final

Vertical2 **fue una pieza estratégica real, no un experimento desechable**, pero su valor ya está **capturado (dental) y preservado (docs)**. La eliminación de E3-B fue correcta y **no destruyó conocimiento**. El dominio Commerce queda como **abstracción diferida recuperable parcialmente**.

## Próximos pasos propuestos para el Roadmap

1. **Reclasificar `docs/vertical2/`** en `REPOSITORY_TOPOLOGY.md` como *Architectural Reference / Deferred Domain* (sprint de gobernanza).
2. **Emitir ADR** "Commerce como bounded context compartido" (ADR ≥ 009) documentando la decisión y el vacío funcional (fulfillment/access/catalog/analytics).
3. **Decidir TD-15** (tests `vertical2*` huérfanos): retirar o reactivar junto con la decisión de commerce.
4. **▶ Continuar con Sprint E4-A — TypeScript Recovery Assessment:** diagnóstico exhaustivo de los 117 errores TypeScript (TD-14), clasificación por causa raíz, priorización por impacto/esfuerzo y orden óptimo de corrección. *(Es la prioridad inmediata del plan; Vertical2 no la bloquea.)*

---

> **Restricciones respetadas:** sin código, sin restaurar `src/vertical2/`, sin tocar producción/tests/OpenAPI/Prisma/frontend/AEK, sin modificar documentación existente (solo se creó este informe), **sin commits ni PR**.
