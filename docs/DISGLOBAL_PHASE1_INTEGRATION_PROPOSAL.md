# DISGLOBAL_PHASE1_INTEGRATION_PROPOSAL.md
> **Vytalix × Disglobal — Phase 1 Technical Integration Proposal (Engineering Presales)**

| Campo | Valor |
|---|---|
| Documento | **Propuesta técnica ejecutiva** para la primera sesión de integración con Disglobal |
| Audiencia | CTO · Enterprise Architect · Technical Lead · API Team · Integration Team · Product Owner |
| Autosuficiencia | Legible **sin** necesidad de leer ADRs, roadmap ni documentos de arquitectura |
| Modo | Documentación únicamente — sin código/runtime/EventBus/OpenAPI/ADR/roadmap |
| Baseline congelado (fuente de verdad) | B1 (eventos) · B2 (dominio) · B3 (integración) · [R1](./DISGLOBAL_API_READINESS_ASSESSMENT.md) · [C1](./DISGLOBAL_API_SERVICE_PORTFOLIO.md) · ROADMAP_V2 · OpenAPI · repositorio |
| Fecha | 2026-07 |

> Ninguna afirmación de este documento contradice el baseline. El detalle vive en los documentos referenciados; aquí se **sintetiza** para decisión ejecutiva, sin duplicar.

---

## 1. Executive Summary

**Vytalix Platform.** Vytalix es la **capa de infraestructura clínica inteligente**: expone como servicios API resultados clínicos y de longevidad (edad biológica, score preventivo, derivación, analítica de cohorte) más un flujo de **confirmación de pago y activación** en producción. Disglobal consume estos servicios **sin construir ni mantener lógica clínica**.

**Visión clínica.** Los algoritmos clínicos (biofísica, scoring, reglas de decisión, LOINC) permanecen como **caja negra** de Vytalix, validados por Doctor Antivejez. Hacia el exterior solo viajan **resultados** (BioAge, ageStatus, score) sobre un **sujeto pseudonimizado** (`subjectRef`), nunca la identidad clínica interna.

**Visión de negocio.** Disglobal aporta el canal de distribución y pago a escala; Vytalix aporta la inteligencia clínica consumible por API-Key, con idempotencia y aislamiento por tenant. El flujo **evaluación → pago → activación** ya existe en producción (única cadena de eventos activa).

**Por qué Disglobal.** El modelo de integración de Vytalix (`/api/v2` con `X-API-Key`, webhook de pago firmado HMAC, pseudonimización) está diseñado exactamente para un partner de marketplace/insurtech de alto volumen que necesita resultados clínicos sin asumir responsabilidad clínica.

**Estado (factual):** **`READY WITH LIMITATIONS`** — el núcleo comercial es integrable y demostrable hoy; las limitaciones (§8) son acotadas y gestionables antes de producción.

---

## 2. Phase 1 Scope

> Solo capacidades **implementadas** (verificadas en R1/C1).

**IN — dentro del alcance de Fase 1:**
- **Provisión de tenant / API Key** (`POST /admin/tenants/:id/api-keys`).
- **Biological Age Assessment** (`POST /api/v2/vitality/assess`, `GET /api/v2/vitality/:subjectRef`).
- **Preventive Score** (`POST /api/v2/preventive/score`).
- **Cohort Insights** (`GET /api/v2/insights/cohort`).
- **Referral síncrono** (`GET /api/v2/referral/:subjectRef`).
- **Engagement** (`POST /api/v2/engagement/events`).
- **Payment Confirmation + Activation** (`POST /api/v2/webhooks/payment`, HMAC → cadena activa).

**OUT — fuera del alcance de Fase 1 (con motivo):**
- **Funnel público** (`/api/funnel/*`) y `/api/exchange-rate` — **inactivos** en el servidor.
- **Clinical `/v1`** — no montado en el servidor activo.
- **`/admin/usage` en vivo** — fallo de runtime conocido (TD-20).
- **Referral asíncrono (webhook saliente)** — cadena inactiva; se ofrece la variante **síncrona**.
- **Dental Commerce** — **decisión de negocio pendiente** (implementado, alcance a confirmar).

---

## 3. Commercial API Portfolio (síntesis de C1)

El catálogo completo, con fichas por servicio, bundles y go/no-go, está en **[C1 — DISGLOBAL_API_SERVICE_PORTFOLIO.md](./DISGLOBAL_API_SERVICE_PORTFOLIO.md)** (no se duplica aquí). Resumen ejecutivo:

| Capacidad | Servicio | Readiness (C1/R1) |
|---|---|---|
| Biological Age | assess / retrieve | READY |
| Preventive Medicine | preventive/score | READY |
| Cohort Analytics | insights/cohort | READY |
| Referral (síncrono) | referral/:subjectRef | READY |
| Engagement | engagement/events | READY |
| Payment + Activation | webhooks/payment | READY WITH LIMITATIONS |
| Tenant Provisioning | admin/api-keys | READY |

Bundles recomendados Fase 1: **Assessment Suite** + **Preventive Intelligence Suite** + **Population Health Suite** + **Partner Integration Suite**.

---

## 4. Technical Integration Model (alto nivel)

Modelo de integración (detalle en **[B3 — CANONICAL_INTEGRATION_ARCHITECTURE.md](./CANONICAL_INTEGRATION_ARCHITECTURE.md)**; contextos en **[B2 — CANONICAL_DOMAIN_ARCHITECTURE.md](./CANONICAL_DOMAIN_ARCHITECTURE.md)**). Flujo ejecutivo:

```
Disglobal (Partner)
      │  HTTPS · X-API-Key · X-Idempotency-Key · X-Correlation-ID
      ▼
API Gateway  (/api/v2 — Open Host Service)
      │  autenticación + idempotencia + pseudonimización (ACL)
      ▼
Vytalix Platform  (multi-tenant · RLS)
      │
      ▼
Bounded Contexts  →  Longevity (BioAge/Preventive) · Clinical (Referral) · Commerce (Payment)
      │
      ▼
Events  →  PaymentConfirmed (única cadena de eventos ACTIVA)
      │
      ▼
Activation Pipeline  →  activación de servicio + notificación (idempotente)
```

- **Síncrono** (request/response REST) para assessment, preventive, insights, referral, engagement.
- **Asíncrono** (webhook firmado → evento → pipeline) para pago→activación.
- La identidad clínica **nunca** cruza el gateway sin pseudonimizar (`subjectRef`).

*(Se reutiliza el modelo congelado B2/B3; no se crean diagramas nuevos de arquitectura.)*

---

## 5. Security Model

| Control | Mecanismo | Evidencia |
|---|---|---|
| **API Keys** | `X-API-Key` para todo `/api/v2` (partner) | `server.ts:138`; `external-v2.handler` |
| **Tenant Isolation** | `X-Tenant-ID` + PostgreSQL **RLS** (`withTenant`) | `server.ts` (dentalTenantContext), RLS transversal |
| **HMAC** | Webhook de pago firmado `X-Disglobal-Signature` (SHA-256) verificado en **tiempo constante** (`timingSafeEqual`) | `payment-webhook.handler.ts:47-56` |
| **Correlation ID** | `X-Correlation-ID` generado/propagado y reflejado en cada respuesta (trazabilidad E2E) | `server.ts:99-104` |
| **Idempotency** | `X-Idempotency-Key` (Redis TTL 24h) en `/api/v2`; guard de webhook por `intentId` | `external-v2.handler.ts:47-51`; `payment-webhook.handler.ts:66-73` |
| **Published Language** | Contratos OpenAPI v2 + errores RFC 7807 (`type: api.vytalix.health/errors/{status}`) + **pseudonimización** (ACL clínico) | `server.ts:158-167`; `openapi/vytalix-platform-v2.yaml` |

> Invariante: Disglobal **nunca** recibe `patientId` ni el `userId` crudo — solo `subjectRef` (HMAC), resultados derivados y confirmaciones.

---

## 6. Integration Responsibilities (RACI)

> R = Responsible · A = Accountable · C = Consulted · I = Informed.

| Actividad | Disglobal | Vytalix | Shared |
|---|---|---|---|
| **Provisioning** (emisión de API Key) | I | **R/A** | — |
| **Authentication** (envío de X-API-Key / firma HMAC) | **R** | A (verifica) | C |
| **Assessment** (BioAge/Preventive/Insights) | R (invoca) | **R/A** (computa) | C |
| **Payment** (envío de webhook firmado) | **R** (emite) | A (verifica + idempotencia) | **Shared** (contrato del webhook) |
| **Activation** (post-pago) | I | **R/A** (pipeline) | — |
| **Monitoring** (health/trace) | C | **R/A** (`/liveness`, correlation) | Shared (correlación E2E) |
| **Support** (incidencias de integración) | R (su lado) | R (su lado) | **Shared** (protocolo conjunto) |

---

## 7. Implementation Plan (solo Fase 1 · máx. 5 milestones)

| # | Milestone | Objetivo | Dueño |
|---|---|---|---|
| **M1** | **Onboarding** | Emitir API Key del tenant Disglobal; entregar credenciales de staging | Vytalix |
| **M2** | **Assessment integrado** | Disglobal invoca BioAge + Preventive + Insights con idempotencia | Shared |
| **M3** | **Conversión** | Referral (síncrono) + Engagement conectados al checkout de Disglobal | Disglobal (consume) |
| **M4** | **Pago + contrato de webhook** | Integrar `POST /api/v2/webhooks/payment` (HMAC); **documentar el contrato del webhook** (cierra R1 OC-1) | Shared |
| **M5** | **Validación E2E + observabilidad** | Flujo pago→activación verificado; traza por `X-Correlation-ID`; sonda `/liveness` | Shared |

> No modifica ROADMAP_V2 ni reordena prioridades; es la secuencia de integración de Fase 1 sobre capacidades ya implementadas.

---

## 8. Known Limitations (síntesis de R1 — no se duplica el análisis)

Detalle y evidencia en **[R1 — DISGLOBAL_API_READINESS_ASSESSMENT.md](./DISGLOBAL_API_READINESS_ASSESSMENT.md)** (§4–§9). Impactos visibles al partner:

1. **Contrato OpenAPI del webhook de pago pendiente** de publicar (R1 OC-1) → se cierra en M4.
2. **`/admin/usage` no disponible en vivo** (TD-20) → reporte de uso por vía alternativa hasta el fix.
3. **Sonda de salud:** usar `/liveness` (el check `event_bus` de `/readiness` está degradado, TD-20).
4. **Referral solo síncrono** hoy (webhook async inactivo).
5. **Funnel público / exchange-rate no disponibles** aunque aparezcan en specs.

> Ninguna limitación impide el flujo central **assessment → pago → activación**.

---

## 9. Success Criteria (aceptación medible de Fase 1)

| # | Criterio | Verificación |
|---|---|---|
| SC-1 | **Assessment completado** | `POST /api/v2/vitality/assess` → 200 con BioAge/ageStatus |
| SC-2 | **Preventive score entregado** | `POST /api/v2/preventive/score` → 200 con score |
| SC-3 | **Pago validado** | webhook con firma HMAC válida → aceptado; firma inválida → rechazado |
| SC-4 | **Activación confirmada** | `PaymentConfirmed` → pipeline de activación ejecutado |
| SC-5 | **Webhook idempotente** | reenvío del mismo `intentId` → 200 sin reprocesar |
| SC-6 | **Traza disponible** | `X-Correlation-ID` presente y reflejado en toda la cadena |
| SC-7 | **Aislamiento de tenant** | datos accesibles solo dentro del `X-Tenant-ID` (RLS) |

---

## 10. Next Steps (acciones inmediatas antes de producción)

1. **Documentar el contrato OpenAPI del webhook de pago** (`/api/v2/webhooks/payment`) — prerequisito de handoff formal (M4 / R1 OC-1).
2. **Confirmar alcance del vertical Dental** en la propuesta (decisión de negocio).
3. **Intercambiar credenciales de staging** (API Key + secreto HMAC del webhook) por entorno.
4. **Acordar el protocolo de soporte conjunto** (RACI §6, fila Support).
5. **Formalizar NDA/contrato** antes de compartir endpoints productivos (solo OpenAPI hasta la firma).

> Los fixes técnicos pendientes (TD-20, activación de cadenas async) **no forman parte de esta propuesta** y requieren autorización explícita en un sprint funcional posterior.

---

## 11. Validation

| ✓ | Ítem |
|---|---|
| ✓ | Exactamente un documento nuevo (`DISGLOBAL_PHASE1_INTEGRATION_PROPOSAL.md`) |
| ✓ | Sin código / runtime / OpenAPI / ADR / EventBus / ROADMAP modificados |
| ✓ | Ningún documento canónico duplicado (B1–B3/R1/C1 **referenciados**) |
| ✓ | Toda afirmación técnica respaldada por evidencia del repositorio |
| ✓ | Propuesta consistente con R1 y C1 (mismas clasificaciones y exclusiones) |
| ✓ | Sin diagramas de arquitectura nuevos (flujo ejecutivo mínimo; detalle en B2/B3) |
| ✓ | Typecheck sin cambio (**36**) |

---

> **STOP.** Propuesta ejecutiva de integración Fase 1 producida. No se implementó nada, no se corrigieron bugs, no se activaron servicios, no se modificaron APIs ni prioridades. Baseline B1–B3 + R1 + C1 congelado. Esperando autorización explícita para el siguiente paso.
