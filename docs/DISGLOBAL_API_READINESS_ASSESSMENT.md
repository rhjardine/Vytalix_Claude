# DISGLOBAL_API_READINESS_ASSESSMENT.md
> **Vytalix Platform — Sprint R1 · Disglobal API Readiness Assessment (evidence-driven)**

| Campo | Valor |
|---|---|
| Sprint | R1 — Disglobal API Readiness Assessment |
| Modo | **Assessment únicamente** — sin código/runtime/EventBus/DTO/API/roadmap |
| Baseline | **B1–B3 CONGELADO** (no se crean vistas nuevas de arquitectura) |
| Fuente de verdad | El repositorio (`src/**`, `openapi/**`). Cada conclusión cita `archivo:línea`. |
| Fecha | 2026-07 · ventana de decisión: 96h |

> **Regla:** nunca inferir. Cada estado (implementado / parcial / prototipo / deprecado / inactivo / documentado-solo) referencia evidencia. Docs de contexto (referenciados, no duplicados): [CANONICAL_INTEGRATION_ARCHITECTURE.md](./CANONICAL_INTEGRATION_ARCHITECTURE.md), [CANONICAL_DOMAIN_ARCHITECTURE.md](./CANONICAL_DOMAIN_ARCHITECTURE.md), [ARCHITECTURE_BASELINE_REPORT.md](./ARCHITECTURE_BASELINE_REPORT.md), [EVENT_CHAIN_CLASSIFICATION.md](./EVENT_CHAIN_CLASSIFICATION.md).

---

## 1. Executive Summary

**Veredicto: `READY WITH LIMITATIONS`.**

El **núcleo comercial** que la propuesta Disglobal necesita —evaluación de vitalidad/edad biológica, score preventivo, derivación clínica, tracking de engagement, insights de cohorte y **confirmación de pago (webhook activo)**— está **implementado y funcional hoy** sobre `/api/v2` con `X-API-Key` + idempotencia + pseudonimización. La cadena **PaymentConfirmed es la única cadena de eventos ACTIVA** end-to-end (`server.ts:175`), lo que cubre el "momento del dinero" del flujo. Esto es suficiente para una propuesta y demo convincentes.

**Limitaciones que acotan la oferta (no bloquean el core):**
- El **webhook de pago activo `/api/v2/webhooks/payment`** **no está en el contrato OpenAPI de plataforma** (mismatch; §4).
- **Billing `/usage` y revocación de API key** tienen imports dinámicos rotos (TD-20) → riesgo de 500 en runtime (§5).
- El check `event_bus` de **observabilidad `/health`** está roto (TD-20 health:71) → `/readiness` puede reportar no-saludable (guard de batch de Disglobal).
- **Funnel público** (`/api/funnel/*`) y `/api/exchange-rate` están **documentados en OpenAPI pero inactivos** (comentados en `server.ts:134-135`) → **no ofrecer**.
- Las **cadenas async** (webhook de referral saliente, re-score) están **inactivas**; ofrecer solo las variantes **síncronas** hoy.

**Readiness score (por superficie):**

| Superficie | Estado | Score |
|---|---|---|
| Assessment v2 (vitality/preventive/referral/engagement/insights) | Implementado, runtime-OK | **95 / 100** |
| Payment webhook (entrante, HMAC) | Implementado + ACTIVO; falta contrato OpenAPI | **80 / 100** |
| Billing admin (API keys, usage, revenue-share) | Parcial (TD-20 en usage/revocación) | **60 / 100** |
| Observability | Implementado; check event_bus roto | **70 / 100** |
| Dental commerce | Implementado (vertical; ¿alcance Disglobal?) | **85 / 100** |
| Funnel público / exchange-rate | Inactivo (comentado) | **0 / 100 (no ofrecer)** |
| Clinical `/v1` | No montado en server activo | **N/A (fuera de propuesta)** |
| **Global ponderado (superficie Disglobal core)** | **READY WITH LIMITATIONS** | **≈ 78 / 100** |

---

## 2. API Inventory (superficies expuestas externamente)

**Montadas hoy (`server.ts:127-155`):** `/api/v2/*` (X-API-Key), `/api/v2/webhooks/payment` (HMAC), `/api/v2/dental/{admin,commerce,core}` (tenant ctx), `/admin` (JWT), observabilidad (público). **Inactivas:** `/api/funnel/*`, `/api/exchange-rate` (comentadas). **No montada:** clinical `/v1`.

---

## 3. Implementation Matrix

> Owner = bounded context (CANONICAL_DOMAIN_ARCHITECTURE). Auth/tenant por `server.ts`. Estado con evidencia.

| Endpoint | Estado | Evidencia | Auth | Tenant | OpenAPI | Business owner | Technical owner |
|---|---|---|---|---|---|---|---|
| `POST /api/v2/vitality/assess` | **Implementado** | `external-v2.handler.ts:160` + `biological-age.service` | X-API-Key + idempotency | X-API-Key ctx | ✓ `platform-v2.yaml:387` | Longevity | Commerce/Partner |
| `GET /api/v2/vitality/:subjectRef` | **Implementado** | `external-v2.handler.ts:193` | X-API-Key | ✓ | ✓ `:445` | Longevity | Commerce/Partner |
| `POST /api/v2/preventive/score` | **Implementado** | `external-v2.handler.ts:211` + `preventive-score.service` | X-API-Key + idempotency | ✓ | ✓ `:465` | Longevity | Commerce/Partner |
| `GET /api/v2/referral/:subjectRef` | **Implementado (síncrono)** | `external-v2.handler.ts:234` + `referral.engine` | X-API-Key | ✓ | ✓ `:497` | Clinical→Commerce | Commerce/Partner |
| `POST /api/v2/engagement/events` | **Implementado** *(TD-19 type-only)* | `external-v2.handler.ts:278` + `engagement.service` | X-API-Key + idempotency | ✓ | ✓ `:516` | Commerce | Commerce/Partner |
| `GET /api/v2/insights/cohort` | **Implementado** | `external-v2.handler.ts:298` + `insights.service` | X-API-Key | ✓ | ✓ `:556` | Longevity/Analytics | Commerce/Partner |
| `POST /api/v2/webhooks/payment` | **Implementado + ACTIVO** | `payment-webhook.handler.ts:165`; HMAC `:47-56`; idempotency `:66-73`; publish→`payment-pipeline.ts:117` (`server.ts:175`) | **HMAC X-Disglobal-Signature** | intentId scope | **✗ ausente (mismatch §4)** | Commerce/Partner | Commerce/Partner |
| `POST /admin/tenants/:id/api-keys` | **Implementado** | `billing-admin.handler.ts:44` | JWT | path tenantId | ✓ `:598` | Commerce (Billing) | Commerce |
| `DELETE /admin/tenants/:id/api-keys/:keyId` | **Parcial (runtime)** | `billing-admin.handler.ts:85`; import roto `redis` `:99` (**TD-20**) | JWT | path | — | Commerce | Commerce |
| `GET /admin/tenants/:id/usage` | **Parcial (runtime)** | `billing-admin.handler.ts:110`; import roto `metering` `:118` (**TD-20**) | JWT | path | ✓ `:638` | Commerce | Commerce |
| `GET /admin/tenants/:id/revenue-share` | **Implementado** | `billing-admin.handler.ts:140` | JWT | path | — | Commerce | Commerce |
| `POST /admin/tenants/:id/quota` | **Implementado** | `billing-admin.handler.ts:154` | JWT | path | — | Identity/Commerce | Commerce |
| `GET /admin/billing/export` | **Implementado** | `billing-admin.handler.ts:169` | JWT | — | — | Commerce | Commerce |
| `POST /api/v2/dental/commerce/*` (catalog/vouchers/bookings + state machine) | **Implementado** | `dental-commerce.router.ts:45-362` | dentalTenantContext | X-Tenant-ID | `dental-api-v2.yaml` | Dental | Dental |
| `/liveness /readiness /health /metrics` | **Implementado** *(check event_bus roto)* | `server.ts:127-131`; health import roto `health.handler.ts:71` (**TD-20**) | público | — | ✓ `/health` | Platform | Platform |
| `/api/funnel/*` (leads/vitality/facial/booking) | **INACTIVO** | `server.ts:134` **comentado**; `funnel.handler` TD-18 `.rows` | — | — | ⚠ documentado `:208-329` | Growth | Growth |
| `/api/exchange-rate` | **INACTIVO** | `server.ts:135` comentado | — | — | ⚠ documentado `:360` | Growth | Growth |
| Clinical `/v1/*` | **No montado** | grep mount `/v1` vacío (salvo `demo/`) | — | — | — | Clinical Core | Clinical Core |

---

## 4. OpenAPI Consistency (mismatches contrato ↔ implementación)

| # | Hallazgo | Tipo | Evidencia |
|---|---|---|---|
| OC-1 | **Webhook de pago activo `/api/v2/webhooks/payment` NO está en `vytalix-platform-v2.yaml`**; el spec insurtech documenta un path **distinto** `/webhooks/disglobal/payment-confirmed` | **Contrato faltante / path divergente** | `payment-webhook.handler.ts:165` vs `openapi/vytalix_insurtech_v1.yaml:73` |
| OC-2 | `/api/funnel/*` y `/api/exchange-rate` **documentados** en `platform-v2.yaml:208-360` pero **inactivos** en runtime | **Documentado-solo** | `server.ts:134-135` comentado |
| OC-3 | `/api/v2` assessment endpoints (vitality/preventive/referral/engagement/insights) | **Consistente ✓** | paths `:387-556` = rutas `external-v2.handler` |
| OC-4 | `/admin/tenants/{id}/{api-keys,usage}` documentados; `revenue-share`/`quota`/`billing/export` **implementados pero no en el spec** | **Sub-documentado** | `billing-admin.handler.ts:140-169` sin path OpenAPI |
| OC-5 | Múltiples specs solapados (`openapi.yaml`, `vytalix-platform-v2.yaml`, `dental-api-v2.yaml` + `_synced`, `vertical2/OPENAPI-v2-commerce.yaml`, `insurtech`) | **Fragmentación de contrato** (riesgo de fuente-única) | `wc -l openapi/*` (6 specs) |

> **Consistencia del core Disglobal (OC-3): correcta.** Los mismatches se concentran en el webhook (OC-1, alto para handoff de contrato) y en superficies fuera del core (OC-2/OC-4).

---

## 5. Integration Readiness

| Área | Estado | Evidencia | Nota |
|---|---|---|---|
| **Payment** | ✅ **Listo (activo)** | webhook HMAC + idempotency + `publish.paymentConfirmed` → pipeline (activación+notificación); única cadena ACTIVA | falta contrato OpenAPI (OC-1) |
| **Assessment** (bio-age/preventive) | ✅ **Listo** | `external-v2` → `biological-age.service`/`preventive-score.service`; idempotency + pseudonymize | core comercial |
| **Referral** | ⚠️ **Listo solo síncrono** | `GET /api/v2/referral/:subjectRef` implementado; el **webhook saliente async está inactivo** (listener comentado `server.ts:171`) | ofrecer la ruta síncrona |
| **Dental** | ✅ Implementado | booking state-machine `dental-commerce.router` | ¿en alcance de la propuesta Disglobal? (decisión de negocio) |
| **Billing** | ⚠️ **Parcial** | keys/revenue-share/quota/export OK; **`/usage` + revocación con imports rotos (TD-20)** | evitar demostrar `/usage` en vivo |
| **Observability** | ⚠️ Parcial | `/liveness`/`/readiness` OK; **check `event_bus` roto (TD-20 health:71)** | `/readiness` (guard de batch) puede reportar no-saludable |

---

## 6. Risk Register (solo riesgos técnicos)

| ID | Riesgo | Prob. | Impacto | Mitigación (sin implementar en R1) |
|---|---|---|---|---|
| RR-1 | `/admin/usage` lanza 500 (import `metering` roto, TD-20) | **Alta** | Medio | No demostrar `/usage` en vivo; corregir en sprint funcional autorizado |
| RR-2 | Revocación de API key no emite log / falla (import `redis` roto, TD-20) | Alta | Medio | Evitar en demo; fix TD-20 |
| RR-3 | `/readiness` reporta event_bus no-saludable (health:71 roto) | Media | Medio | Usar `/liveness` como probe de demo; fix TD-20 |
| RR-4 | Webhook de pago sin contrato OpenAPI (OC-1) | Alta | **Alto** (handoff de contrato) | Documentar el path en `platform-v2.yaml` antes de firmar contrato |
| RR-5 | Ofrecer funnel/exchange-rate por estar en OpenAPI (OC-2) | Media | Alto | Excluir explícitamente de la propuesta |
| RR-6 | Referral async no dispara webhook a Disglobal (cadena inactiva) | Media | Medio | Ofrecer ruta síncrona; async pendiente de B1 migración |
| RR-7 | Fragmentación de specs OpenAPI (OC-5) | Media | Medio | Declarar `vytalix-platform-v2.yaml` como contrato único para Disglobal |
| RR-8 | `engagement/events` DTO type-mismatch (TD-19) | Baja | Bajo | Type-only; runtime OK; no bloquea |

---

## 7. Commercial Readiness

**Seguro de ofrecer HOY (implementado + runtime-OK + contrato consistente):**
- `POST /api/v2/vitality/assess` · `GET /api/v2/vitality/:subjectRef` — **edad biológica (Doctor Antivejez).** *Justificación: implementado, OpenAPI consistente, idempotente, pseudonimizado.*
- `POST /api/v2/preventive/score` — **score preventivo.** *Mismo respaldo.*
- `GET /api/v2/referral/:subjectRef` — **derivación clínica (síncrona).** *Implementado; solo variante síncrona.*
- `POST /api/v2/engagement/events` — **tracking de conversión.** *Implementado (TD-19 es type-only).*
- `GET /api/v2/insights/cohort` — **analytics de cohorte.** *Implementado.*
- `POST /api/v2/webhooks/payment` — **confirmación de pago.** *Implementado + ACTIVO; ofrecer con la salvedad de documentar el contrato (RR-4).*
- `POST /admin/tenants/:id/api-keys` — **provisión de tenant/API key.** *Implementado.*

**NO incluir en la propuesta (justificado):**
- `/api/funnel/*` y `/api/exchange-rate` — **inactivos** (comentados `server.ts:134-135`); documentados en OpenAPI pero no ejecutables (RR-5).
- `GET /admin/usage` (en vivo) — **runtime roto** (TD-20, RR-1); ofrecer solo tras fix.
- Clinical `/v1/*` — **no montado**; fuera del alcance externo.
- **Referral async (webhook saliente)** — cadena inactiva; ofrecer solo la ruta síncrona.

---

## 8. Recommended Demo Flow (solo capacidades implementadas)

> Secuencia más fuerte, usando el flujo real pago→activación (la única cadena async ACTIVA).

1. **Provisión** — `POST /admin/tenants/:id/api-keys` → entregar `X-API-Key` al tenant Disglobal.
2. **Edad biológica** — `POST /api/v2/vitality/assess` (con `X-API-Key` + `X-Idempotency-Key`) → BioAge/ageStatus. *(Doctor Antivejez, IP clínica como caja negra.)*
3. **Score preventivo** — `POST /api/v2/preventive/score` → riesgo preventivo.
4. **Derivación** — `GET /api/v2/referral/:subjectRef` → CTA clínico (síncrono).
5. **Engagement** — `POST /api/v2/engagement/events` → tracking de conversión.
6. **Pago (clímax)** — `POST /api/v2/webhooks/payment` **firmado HMAC** → `PaymentConfirmed` → **activación + notificación** (cadena real activa). *Mostrar idempotencia: reenviar el webhook → 200 sin reprocesar.*
7. **Analítica** — `GET /api/v2/insights/cohort` → insights de cohorte.

Todo el flujo mantiene: `subjectRef` pseudonimizado (nunca `patientId`/`userId` crudo), `X-Tenant-ID` (RLS), `X-Correlation-ID` (trazabilidad). **Probe de salud en demo: usar `/liveness`** (no `/readiness`, por RR-3).

---

## 9. Critical Blockers (solo lo que comprometería la propuesta)

| # | Blocker | ¿Bloquea el core demo? | Acción |
|---|---|---|---|
| CB-1 | Webhook de pago sin contrato OpenAPI (OC-1/RR-4) | **No** al demo; **Sí** al handoff de contrato formal | Documentar path antes de firmar |
| CB-2 | `/admin/usage` 500 (TD-20/RR-1) | Solo si se demuestra billing en vivo | No incluir en demo; fix autorizado |
| CB-3 | `/readiness` event_bus no-saludable (RR-3) | Solo si se usa como probe | Usar `/liveness` |

> **No existe blocker que impida el flujo core assessment→pago→activación.** Los blockers son de *contrato* (CB-1) y de *superficies secundarias* (CB-2/CB-3), gestionables por exclusión/uso alternativo en la ventana de 96h.

---

## 10. Decision

# `READY WITH LIMITATIONS`

**Justificación (evidencia):** el núcleo comercial (assessment + score + referral síncrono + engagement + insights + **pago activo**) está **implementado y funcional**, con OpenAPI consistente (OC-3) y la única cadena de eventos ACTIVA cubriendo el flujo de pago. Las limitaciones son acotadas y **evitables dentro de la ventana de 96h** sin implementación: excluir funnel/exchange-rate/`/v1` (inactivos), no demostrar `/usage` en vivo (TD-20), usar `/liveness` como probe, y documentar el contrato del webhook antes del handoff formal. No hay blocker que comprometa el flujo demostrable central.

---

## 11. Validación

| ✓ | Ítem |
|---|---|
| ✓ | Repositorio inspeccionado primero (server, handlers, routers, middleware, pipelines, openapi) |
| ✓ | Implementación cruzada contra documentación (OpenAPI ↔ rutas) |
| ✓ | Cada conclusión con evidencia `archivo:línea`; sin inferencia |
| ✓ | Un solo documento generado (`DISGLOBAL_API_READINESS_ASSESSMENT.md`) |
| ✓ | Baseline B1–B3 congelado; sin vistas nuevas de arquitectura |
| ✓ | Cero código/runtime/EventBus/DTO/API/roadmap/ADR/diagramas |
| ✓ | Typecheck sin cambio (**36**) |

---

> **STOP.** Assessment de readiness producido. Veredicto: **READY WITH LIMITATIONS**. No se inició implementación. Esperando autorización explícita antes de cualquier cambio (fix TD-20, documentación de contrato del webhook, activación de cadenas async).
