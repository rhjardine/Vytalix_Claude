# DISGLOBAL_API_SERVICE_PORTFOLIO.md
> **Vytalix Platform — Sprint C1 · Commercial API Service Portfolio (Disglobal)**

| Campo | Valor |
|---|---|
| Sprint | C1 — Commercial API Portfolio Baseline |
| Rol del documento | **Catálogo comercial de servicios API** — "si Disglobal integra la próxima semana, ¿qué puede ofrecer Vytalix HOY?" |
| Audiencia | Equipo técnico y comercial de Disglobal (sesión de integración técnica) |
| Modo | **Documentación únicamente** — sin código/runtime/EventBus/OpenAPI/ADR/roadmap |
| Baseline congelado | B1 (eventos) · B2 (dominio) · B3 (integración) · **R1 (readiness)** — autoritativos, no se modifican |
| Fuente de verdad | El repositorio. Cada afirmación comercial cita `archivo:línea`. |
| Fecha | 2026-07 |

> **Fidelidad:** solo se cataloga lo **implementado**. Ninguna capacidad planificada, conceptual o de roadmap se ofrece como disponible. Clasificaciones consistentes con [DISGLOBAL_API_READINESS_ASSESSMENT.md](./DISGLOBAL_API_READINESS_ASSESSMENT.md) (R1). Detalle técnico en R1 / [CANONICAL_INTEGRATION_ARCHITECTURE.md](./CANONICAL_INTEGRATION_ARCHITECTURE.md) (referenciados, no duplicados).
>
> **Categorías (nunca se mezclan):** **Implementado** · **Implementado con limitaciones** · **Planificado** · **Conceptual**. Este catálogo ofrece comercialmente **solo** las dos primeras.

---

## 1. Executive Summary

- **Readiness comercial actual:** Vytalix puede ofrecer **hoy** un núcleo de servicios API de salud/longevidad consumibles por Disglobal: **evaluación de edad biológica, medicina preventiva, analítica de cohortes, derivación clínica (síncrona), engagement y confirmación de pago (cadena productiva activa)**. Todo sobre `/api/v2` con `X-API-Key`, idempotencia y pseudonimización.
- **Madurez de plataforma:** el núcleo de assessment está **implementado y funcional**; la cadena de pago `PaymentConfirmed` es la **única cadena de eventos en producción activa** (`server.ts:175`). Superficies secundarias (billing en vivo, funnel público) están limitadas o inactivas y **se excluyen** de la oferta.
- **Posicionamiento comercial:** Vytalix es la **capa de infraestructura clínica inteligente** — Disglobal consume resultados (BioAge, score preventivo, derivación) **sin construir ni mantener lógica clínica**; la IP clínica (algoritmos, biofísica) permanece como caja negra; la identidad del usuario nunca cruza sin pseudonimizar.
- **Perfil de integración objetivo:** marketplace/insurtech con alto volumen de puntos de venta, consumo por API-Key + idempotencia, y confirmación de pago vía webhook firmado (HMAC).

**Veredicto de portfolio: `READY WITH LIMITATIONS`** — núcleo comercial ofertable hoy; limitaciones acotadas y gestionables (§7).

---

## 2. API Portfolio Overview (por capacidad de negocio — solo implementadas)

| Grupo de capacidad | Servicios | Estado comercial |
|---|---|---|
| **Biological Age Assessment** | `POST /api/v2/vitality/assess`, `GET /api/v2/vitality/:subjectRef` | **READY** |
| **Preventive Medicine** | `POST /api/v2/preventive/score` | **READY** |
| **Cohort Analytics** | `GET /api/v2/insights/cohort` | **READY** |
| **Referral** | `GET /api/v2/referral/:subjectRef` (síncrono) | **READY** |
| **Engagement** | `POST /api/v2/engagement/events` | **READY** |
| **Payment** | `POST /api/v2/webhooks/payment` (HMAC, cadena activa) | **READY WITH LIMITATIONS** |
| **Partner Provisioning** | `POST /admin/tenants/:id/api-keys` | **READY** |
| **Dental** | `/api/v2/dental/commerce/*` (catálogo, vouchers, bookings) | **READY WITH LIMITATIONS** (alcance a confirmar) |

> **Excluidos (no ofrecidos):** Funnel público (`/api/funnel/*`) y `/api/exchange-rate` (inactivos, comentados `server.ts:134-135`); Clinical `/v1` (no montado); `/admin/usage` en vivo (import roto TD-20); Referral async saliente (cadena inactiva).

---

## 3. Individual Service Sheets

### 3.1 · Biological Age Assessment · **READY**
- **Commercial Name:** Vytalix BioAge API (Doctor Antivejez)
- **Business Purpose:** calcular la edad biológica y el diferencial vs edad cronológica de un sujeto.
- **Problem Solved:** Disglobal ofrece un resultado clínico de valor sin construir motores biofísicos.
- **Target Consumer:** marketplace/insurtech (segmentos de salud/longevidad).
- **Repository Evidence:** `external-v2.handler.ts:160` (assess) + `:193` (retrieve); `longevity/biological-age.service.ts`, `biophysics-engine.ts`.
- **Endpoint(s):** `POST /api/v2/vitality/assess` · `GET /api/v2/vitality/:subjectRef`.
- **Authentication:** `X-API-Key` + `X-Idempotency-Key`.
- **Tenant Isolation:** contexto de API-Key (tenant-scoped) + RLS.
- **Current Status:** Implementado.
- **Commercial Readiness:** **READY** (OpenAPI consistente `platform-v2.yaml:387,445`).
- **Dependencies:** algoritmo biofísico, cache de resultado.
- **Technical Limitations:** ninguna material (resultado numérico; imágenes no se almacenan).
- **Expected Consumer Value:** resultado clínico diferenciador por sujeto en una llamada.
- **Implementation Confidence:** **Alta.**

### 3.2 · Preventive Medicine · **READY**
- **Commercial Name:** Vytalix Preventive Score API
- **Business Purpose:** score de riesgo preventivo (proxy Framingham).
- **Problem Solved:** priorización preventiva/actuarial sin lógica clínica propia.
- **Target Consumer:** insurtech, programas preventivos.
- **Repository Evidence:** `external-v2.handler.ts:211`; `longevity/preventive-score.service.ts`; LOINC en `core/decision.engine.ts:223-225`.
- **Endpoint(s):** `POST /api/v2/preventive/score`.
- **Authentication:** `X-API-Key` + idempotency. **Tenant:** API-Key ctx + RLS.
- **Current Status:** Implementado. **Commercial Readiness:** **READY** (`platform-v2.yaml:465`).
- **Technical Limitations:** score derivado (no diagnóstico).
- **Expected Consumer Value:** señal de riesgo accionable para pricing/derivación.
- **Implementation Confidence:** **Alta.**

### 3.3 · Cohort Analytics · **READY**
- **Commercial Name:** Vytalix Cohort Insights API
- **Business Purpose:** insights agregados de cohorte (población de un tenant).
- **Problem Solved:** visión poblacional sin data-warehouse propio.
- **Target Consumer:** gestión de programas, insurtech.
- **Repository Evidence:** `external-v2.handler.ts:298`; `longevity/insights.service.ts`.
- **Endpoint(s):** `GET /api/v2/insights/cohort`. **Auth:** `X-API-Key`. **Tenant:** ctx + RLS.
- **Current Status:** Implementado. **Commercial Readiness:** **READY** (`platform-v2.yaml:556`).
- **Technical Limitations:** datos agregados (nunca PHI cruda).
- **Expected Consumer Value:** métricas poblacionales para decisiones de programa.
- **Implementation Confidence:** **Alta.**

### 3.4 · Referral · **READY** (síncrono)
- **Commercial Name:** Vytalix Clinical Referral API
- **Business Purpose:** derivación clínica (CTA) pseudonimizada por sujeto.
- **Problem Solved:** convertir señal clínica en acción/derivación.
- **Target Consumer:** marketplace (conversión a servicio clínico).
- **Repository Evidence:** `external-v2.handler.ts:234`; `core/referral.engine.ts`.
- **Endpoint(s):** `GET /api/v2/referral/:subjectRef` (**síncrono**). **Auth:** `X-API-Key`. **Tenant:** ctx + RLS.
- **Current Status:** Implementado (variante síncrona). **Commercial Readiness:** **READY** (`platform-v2.yaml:497`).
- **Technical Limitations:** el **webhook saliente async NO se ofrece** (cadena inactiva, `server.ts:171`); usar la consulta síncrona.
- **Expected Consumer Value:** CTA de derivación integrable en el checkout del partner.
- **Implementation Confidence:** **Alta** (síncrono).

### 3.5 · Engagement · **READY**
- **Commercial Name:** Vytalix Engagement Events API
- **Business Purpose:** registrar eventos de engagement/conversión por sujeto.
- **Problem Solved:** tracking de embudo/conversión atribuible.
- **Target Consumer:** marketplace, revenue-share.
- **Repository Evidence:** `external-v2.handler.ts:278`; `shared/engagement.service.ts`.
- **Endpoint(s):** `POST /api/v2/engagement/events`. **Auth:** `X-API-Key` + idempotency. **Tenant:** ctx + RLS.
- **Current Status:** Implementado. **Commercial Readiness:** **READY** (nota: `TD-19` es **type-only**, runtime OK; `platform-v2.yaml:516`).
- **Technical Limitations:** ninguna material en runtime.
- **Expected Consumer Value:** base para conversión y revenue-share.
- **Implementation Confidence:** **Alta.**

### 3.6 · Payment · **READY WITH LIMITATIONS**
- **Commercial Name:** Vytalix Payment Confirmation Webhook
- **Business Purpose:** recibir confirmación de pago (Disglobal→Vytalix) y activar el servicio.
- **Problem Solved:** activación automática post-pago con idempotencia y firma.
- **Target Consumer:** el sistema de checkout de Disglobal.
- **Repository Evidence:** `payment-webhook.handler.ts:165`; firma HMAC `:47-56` (`timingSafeEqual`); idempotency `:66-73`; **cadena ACTIVA** `publish.paymentConfirmed`→`payment-pipeline.ts:117` (`server.ts:175`).
- **Endpoint(s):** `POST /api/v2/webhooks/payment`. **Auth:** **HMAC `X-Disglobal-Signature`**. **Tenant:** scope por `intentId`.
- **Current Status:** **Implementado + ACTIVO** (única cadena de eventos en producción).
- **Commercial Readiness:** **READY WITH LIMITATIONS.**
- **Technical Limitations:** el **contrato OpenAPI del webhook falta** en `platform-v2.yaml` (el insurtech documenta un path distinto, `vytalix_insurtech_v1.yaml:73`) → documentar antes del handoff formal (R1 OC-1/RR-4).
- **Expected Consumer Value:** activación fiable y replay-safe (reintentos de Disglobal no duplican).
- **Implementation Confidence:** **Alta en runtime**; media en contrato (falta doc).

### 3.7 · Partner Provisioning · **READY**
- **Commercial Name:** Vytalix Tenant Provisioning API
- **Business Purpose:** emitir la `X-API-Key` de un tenant (onboarding de Disglobal).
- **Repository Evidence:** `billing-admin.handler.ts:44`. **Auth:** JWT (interno). **Tenant:** path `tenantId`.
- **Current Status:** Implementado. **Commercial Readiness:** **READY** (`platform-v2.yaml:598`).
- **Technical Limitations:** operación interna/administrada por Vytalix (no expuesta al partner).
- **Expected Consumer Value:** onboarding controlado del tenant partner.
- **Implementation Confidence:** **Alta.**

### 3.8 · Dental Commerce · **READY WITH LIMITATIONS** (alcance a confirmar)
- **Commercial Name:** Vytalix Dental Commerce API
- **Business Purpose:** catálogo, vouchers y reservas dentales (máquina de estados).
- **Repository Evidence:** `dental/routers/dental-commerce.router.ts:45-362` (catalog/vouchers/bookings + confirm/check-in/complete/cancel); `dental-api-v2.yaml`.
- **Endpoint(s):** `/api/v2/dental/commerce/*`. **Auth:** `dentalTenantContext` (`X-Tenant-ID` + `X-User-ID`). **Tenant:** header + RLS.
- **Current Status:** Implementado (vertical). **Commercial Readiness:** **READY WITH LIMITATIONS** — **decisión de negocio:** confirmar si el vertical dental entra en el alcance de la propuesta Disglobal.
- **Technical Limitations:** vertical separado (barrel-isolated, AEK ADR-002); autenticación por header (JWT upstream en producción).
- **Expected Consumer Value:** reserva y comercio dental listos si el vertical se incluye.
- **Implementation Confidence:** **Alta** (implementación); alcance comercial **pendiente**.

### 3.9 · NOT OFFERED (excluidos, con evidencia)
| Servicio | Motivo | Evidencia |
|---|---|---|
| Funnel público (`/api/funnel/*`) | **Inactivo** (comentado) + bug `.rows` (TD-18) | `server.ts:134`; funnel.handler |
| `/api/exchange-rate` | Inactivo | `server.ts:135` |
| Clinical `/v1/*` | No montado en server activo | grep mount `/v1` vacío |
| `/admin/usage` (en vivo) | Import roto → 500 (TD-20) | `billing-admin.handler.ts:118` |
| Referral webhook saliente (async) | Cadena inactiva | `server.ts:171` comentado |

---

## 4. Commercial Bundles (combinaciones de APIs existentes — sin inventar)

| Bundle | Composición (solo implementadas) | Estado |
|---|---|---|
| **Assessment Suite** | BioAge (assess + retrieve) + Preventive Score | **READY** |
| **Preventive Intelligence Suite** | Preventive Score + Referral (síncrono) + Engagement | **READY** |
| **Population Health Suite** | Cohort Insights + Engagement | **READY** |
| **Partner Integration Suite** | Tenant Provisioning + Payment Webhook + Engagement | **READY WITH LIMITATIONS** (contrato webhook, §7) |
| **Dental Suite** | Dental Commerce (catálogo/vouchers/bookings) | **READY WITH LIMITATIONS** (alcance) |

> Todos los bundles son **combinaciones de servicios ya implementados**; no añaden capacidades.

---

## 5. Recommended Integration Journey (Disglobal)

Orden por madurez + valor de negocio (solo implementadas):

```
Tenant Provisioning (API Key)
        ↓
BioAge Assessment  →  Preventive Score
        ↓
Cohort Insights
        ↓
Referral (síncrono)
        ↓
Engagement Events
        ↓
Payment Confirmation (webhook HMAC)
        ↓
Activation (PaymentConfirmed → pipeline)   ← cadena productiva ACTIVA
```

Invariantes en toda la jornada: `subjectRef` pseudonimizado (nunca `patientId`/`userId`), `X-Tenant-ID` + RLS, `X-Idempotency-Key`, `X-Correlation-ID`.

---

## 6. Commercial Value Proposition (factual, sin marketing)

| Capacidad | Business outcome | Operational benefit | Time-to-value | Healthcare impact | Partner benefit |
|---|---|---|---|---|---|
| BioAge | Resultado clínico diferenciador por sujeto | Sin motor clínico propio | 1 llamada API | Señal de longevidad | Producto de valor listo |
| Preventive Score | Priorización preventiva/actuarial | Sin lógica de scoring propia | 1 llamada | Prevención temprana | Pricing/derivación informados |
| Cohort Insights | Visión poblacional | Sin data-warehouse | 1 llamada | Gestión de programa | Analítica sin infraestructura |
| Referral (sync) | Conversión a servicio clínico | CTA integrable | 1 llamada | Acceso a cuidado | Conversión en checkout |
| Engagement | Atribución de conversión | Base de revenue-share | Inmediato | — | Medición de embudo |
| Payment + Activation | Activación automática post-pago | Idempotente, firmado | Webhook | Continuidad de servicio | Flujo pago→servicio confiable |

---

## 7. Technical Constraints (impacto visible al partner — resumen de R1)

1. **Webhook de pago sin contrato OpenAPI publicado** → debe documentarse antes del handoff formal de contrato (R1 OC-1/RR-4).
2. **`/admin/usage` no disponible en vivo** (fallo de runtime TD-20) → el reporte de uso se entrega por vía alternativa hasta el fix.
3. **Sonda de salud:** usar `/liveness` (el check `event_bus` de `/readiness`/`/health` está degradado, TD-20).
4. **Referral solo síncrono** hoy (el webhook saliente async está inactivo).
5. **Funnel público y exchange-rate no disponibles** (inactivos) aunque aparezcan en specs.
6. **Fragmentación de specs OpenAPI** → se declara `vytalix-platform-v2.yaml` como contrato único para el core Disglobal.

> Ninguna de estas restricciones impide el flujo comercial central (assessment → pago → activación).

---

## 8. Demonstration Flow (clímax = pago productivo)

> Solo capacidades implementadas. Termina en la **cadena de pago productiva activa**.

1. **Provisión** — `POST /admin/tenants/:id/api-keys` → entregar `X-API-Key`.
2. **BioAge** — `POST /api/v2/vitality/assess` (`X-API-Key` + `X-Idempotency-Key`) → edad biológica.
3. **Preventivo** — `POST /api/v2/preventive/score` → riesgo preventivo.
4. **Insights** — `GET /api/v2/insights/cohort` → visión poblacional.
5. **Derivación** — `GET /api/v2/referral/:subjectRef` → CTA clínico (síncrono).
6. **Engagement** — `POST /api/v2/engagement/events` → conversión.
7. **CLÍMAX — Pago productivo:**
   ```
   POST /api/v2/webhooks/payment  (firmado HMAC X-Disglobal-Signature)
            ↓
   PaymentConfirmed event  (publish.paymentConfirmed)
            ↓
   Activation Pipeline  (payment-pipeline.ts → activación + notificación)
            ↓
   Idempotent Replay  (reenviar el webhook → 200 sin reprocesar)
   ```
   *Este es el momento comercial: pago real → activación real → idempotencia demostrable.* Sonda de salud del demo: `/liveness`.

---

## 9. Go / No-Go Matrix

| API | Commercial Availability | Production Readiness | Demo Readiness | Integration Recommendation | Comentarios |
|---|---|---|---|---|---|
| BioAge (assess/retrieve) | ✅ Disponible | ✅ Alta | ✅ Sí | **GO** | Núcleo del portfolio |
| Preventive Score | ✅ | ✅ | ✅ | **GO** | — |
| Cohort Insights | ✅ | ✅ | ✅ | **GO** | Agregado, sin PHI |
| Referral (sync) | ✅ | ✅ | ✅ | **GO** | Solo síncrono |
| Engagement | ✅ | ✅ (TD-19 type-only) | ✅ | **GO** | Runtime OK |
| Payment Webhook | ✅ | ✅ activo | ✅ | **GO con salvedad** | Documentar contrato (OC-1) |
| Tenant Provisioning | ✅ | ✅ | ✅ | **GO** | Operado por Vytalix |
| Dental Commerce | ⚠️ Condicional | ✅ | ✅ | **GO si en alcance** | Decisión de negocio |
| `/admin/usage` (live) | ❌ | ❌ (TD-20) | ❌ | **NO-GO** | Fix requerido |
| Funnel / exchange-rate | ❌ | ❌ inactivo | ❌ | **NO-GO** | Excluir |
| Clinical `/v1` | ❌ | ❌ no montado | ❌ | **NO-GO** | Fuera de alcance |
| Referral async webhook | ❌ | ❌ inactivo | ❌ | **NO-GO** | Ofrecer síncrono |

---

## 10. Executive Recommendation

- **Overall readiness:** **READY WITH LIMITATIONS** — el núcleo comercial es ofertable e demostrable hoy.
- **Commercial confidence:** **Alta** para Assessment/Preventive/Insights/Referral(sync)/Engagement/Provisioning; **Media-alta** para Payment (runtime activo; falta doc de contrato).
- **Alcance recomendado Fase 1:** **Assessment Suite** + **Preventive Intelligence Suite** + **Population Health Suite** + **Partner Integration Suite (con documentación del webhook)**. Dental Suite **opcional** según decisión de negocio.
- **Capacidades excluidas intencionalmente:** Funnel público, `/api/exchange-rate`, Clinical `/v1`, `/admin/usage` en vivo, Referral async — por estar inactivas o con fallo de runtime (evidencia §3.9/§9).
- **Próximo milestone recomendado (requiere autorización, NO en este sprint):** (1) documentar el contrato OpenAPI del webhook de pago; (2) corregir TD-20 (`/usage`, health, revocación); (3) activar las cadenas async (migración EventBus B1) para habilitar referral-webhook y re-score. Todo pendiente de autorización explícita.

---

## 11. Validation Checklist

| ✓ | Ítem |
|---|---|
| ✓ | Exactamente un documento nuevo (`DISGLOBAL_API_SERVICE_PORTFOLIO.md`) |
| ✓ | Ninguna documentación existente modificada |
| ✓ | Sin cambios de código / OpenAPI / Roadmap / ADR / arquitectura |
| ✓ | Sin diagramas nuevos |
| ✓ | Portfolio basado exclusivamente en capacidades **implementadas** del repo |
| ✓ | Cada afirmación comercial con evidencia `archivo:línea` |
| ✓ | Clasificaciones READY / READY WITH LIMITATIONS **consistentes con R1** |
| ✓ | Categorías Implementado/Limitado/Planificado/Conceptual nunca mezcladas |
| ✓ | Typecheck sin cambio (**36**) |

---

> **STOP.** Catálogo comercial de servicios API producido y validado. No se propone implementación, no se corrigen bugs, no se activan servicios inactivos. Baseline B1–B3 + R1 congelado. Esperando autorización explícita antes de iniciar Sprint C2.
