# PHASE1_DELIVERY_READINESS.md
> **Vytalix — Phase 1 MVP Delivery Readiness (verificación técnica multiagente)**

| Campo | Valor |
|---|---|
| Objetivo | Verificar la **preparación técnica real** de los servicios MVP Fase 1 comprometidos con Disglobal |
| Ventana | **72 h** hasta la sesión técnica |
| Método | Razonamiento multiagente (A–E) + consolidación Chief Software Architect; desacuerdos resueltos **solo con evidencia del repositorio** |
| Modo | **Verificación únicamente** — sin código/runtime/EventBus/OpenAPI/ADR/roadmap; baseline B1–B3/R1/C1/C2 **congelado** |
| Fuente de verdad | El repositorio. Cada estado cita `archivo:línea`. Sin inferencias. |
| Fecha | 2026-07 |

> Este es el **único** entregable. No amplía el alcance contractual; no activa componentes; no implementa nada.

---

## 0. Veredicto ejecutivo

**Go / No-Go de la demostración: `GO` sobre el subconjunto activo (con guion acotado).**

El flujo demostrable **Evaluación Preventiva → Score → Derivación → Catálogo/Reserva (dental) → Pago → Activación → Replay idempotente** está **operativo hoy**. Sin embargo, **tres servicios comprometidos NO están activos** en el repositorio (Escáner Facial, Cuestionario Preventivo, Consulta Médica online/presencial): dependen del **router de funnel comentado** (`server.ts:134`) o no existen como servicio activo. Deben **excluirse de la demostración en vivo** y presentarse como capacidades de activación posterior (sin implementarlas ahora).

| Servicio comprometido | Clasificación |
|---|---|
| Evaluación Preventiva + Score Inicial | **READY** |
| Derivación Clínica | **READY WITH LIMITATIONS** (síncrono) |
| Pago (Webhook · PaymentConfirmed · Activación · Idempotencia) | **READY WITH LIMITATIONS** (contrato OpenAPI) |
| Catálogo (dental commerce) | **READY WITH LIMITATIONS** (alcance dental) |
| Agenda / Reserva (bloqueo atómico) | **READY WITH LIMITATIONS** (lock de voucher OK; slot simplificado) |
| **Escáner Facial** | **NOT READY** (endpoint inactivo — funnel comentado) |
| **Cuestionario Preventivo** | **NOT READY** (sin servicio activo dedicado) |
| **Consulta Médica (online/presencial)** | **NOT READY** (sin servicio activo) |

---

## 1. Análisis multiagente (hallazgos por rol · evidencia de repositorio)

### Agente A — Integration Architect (endpoints, contratos, webhook)
- Superficie activa `/api/v2` montada (`server.ts:138-155`): vitality, preventive, referral, engagement, insights, webhook de pago, dental. Funnel **comentado** (`:134`); clinical `/v1` no montado.
- Webhook de pago activo (`payment-webhook.handler.ts:165`) **sin contrato OpenAPI** en `platform-v2.yaml` (R1 OC-1) — el insurtech documenta un path distinto (`vytalix_insurtech_v1.yaml:73`).
- **Conclusión A:** integración core lista; contrato de webhook a documentar antes del handoff.

### Agente B — Backend Lead (implementación, wiring, dependencias)
- **Facial:** servicio real `facial-analysis.service.ts` (mock por defecto; `aws` Rekognition requiere `@aws-sdk/client-rekognition` **no instalado** → 501). Su único endpoint (`funnel.handler.ts:280`) está en el **funnel comentado** → **no cableado**.
- **Cuestionario/Consulta:** `consultationType` + código de consulta viven en `funnel.handler.ts` (**inactivo**); no hay servicio activo dedicado. `referral.engine` menciona "consultation" solo como **trigger de derivación**, no como reserva.
- **Preventive/Score:** `external-v2.handler.ts:211/160` → `preventive-score.service`/`biological-age.service`, **cableados y activos**.
- **Pago:** `publish.paymentConfirmed` → `payment-pipeline.ts:117`, registrado (`server.ts:175`) — **única cadena de eventos activa**.
- **Conclusión B:** el núcleo está cableado; facial/cuestionario/consulta dependen de código **no ejecutado**.

### Agente C — QA Lead (escenarios, idempotencia, errores, readiness)
- **Idempotencia verificable:** `/api/v2` (`external-v2.handler.ts:47-51`, Redis 24h) y webhook (`payment-webhook.handler.ts:66-73`, `intentId` 24h) + guard de activación (`payment-pipeline.ts:26`).
- **Errores/recuperación:** firma inválida → rechazo; replay → 200 sin reprocesar; RFC 7807 en errores (`server.ts:158`).
- **Readiness probe:** usar `/liveness`; `/readiness`/`health` tiene el check `event_bus` roto (TD-20, `health.handler.ts:71`).
- **Funnel:** además de estar comentado, `funnel.handler` tiene el bug `.rows` (TD-18) → aún si se montara, fallaría.
- **Conclusión C:** el flujo core es demostrable y replay-safe; el funnel no es apto ni activándolo (bug + comentado).

### Agente D — Security Architect (HMAC, API Keys, JWT, tenant, replay)
- **API Keys:** `requireApiKey(scope)` (`api-key.middleware.ts:55`) valida `X-API-Key`, resuelve tenant, **enforce de scope** (matriz JSONB), **tier de rate-limit**, **auth audit** (`BRUTE_FORCE_BLOCKED`/`MISSING_API_KEY`). Aplicado en **todas** las rutas `/api/v2` (vitality:write/read, preventive:write, referral:read, engagement:write, insights:read).
- **HMAC:** `timingSafeEqual` en webhook (`payment-webhook.handler.ts:55`); segunda vía `X-Vytalix-Signature` (`hardening.middleware.ts`).
- **Tenant isolation:** `X-Tenant-ID` + RLS (`withTenant`).
- **Replay protection:** idempotencia Redis (arriba).
- **Conclusión D:** postura de seguridad **sólida y lista** para el core Disglobal.

### Agente E — Solution Architect (alineación con alcance contractual)
- **Tensión crítica:** el MVP comprometido incluye **Escáner Facial, Cuestionario y Consulta Médica**, pero en el repositorio esos servicios están en el **funnel inactivo** o no existen. R1/C1 ya los excluyeron por inactivos.
- **Ninguna recomendación de este documento amplía el MVP ni implementa esos servicios** (prohibido). Se reporta la brecha con honestidad y se acota la demo al subconjunto activo.
- **Conclusión E:** alcance de demo = servicios activos; facial/cuestionario/consulta = brecha declarada, no demostrable en vivo hoy.

### Consolidación — Chief Software Architect
No hay desacuerdo material entre agentes; la evidencia es consistente. El **núcleo del flujo comercial** (preventivo → score → derivación → catálogo/reserva dental → pago → activación) es **técnicamente demostrable en 72 h**. La brecha real y honesta son **facial/cuestionario/consulta** (funnel inactivo). La demo procede **GO** sobre el subconjunto activo; los tres servicios inactivos se comunican como capacidades de activación posterior, **sin** implementarlas en esta ventana.

---

## 2. Estado de preparación por servicio (evidencia exacta)

### 2.1 Evaluación Preventiva + Score Inicial — **READY**
- **Evidencia:** `external-v2.handler.ts:211` `POST /api/v2/preventive/score` (`apiKeyAuth('preventive:write')`) + `longevity/preventive-score.service.ts`; `:160` `POST /api/v2/vitality/assess` → `biological-age.service`. OpenAPI `platform-v2.yaml:387,465`.
- **Dependencias críticas:** API Key con scope; motor biofísico/preventivo; cache.
- **Riesgo demo:** ninguno material.

### 2.2 Derivación Clínica — **READY WITH LIMITATIONS**
- **Evidencia:** `external-v2.handler.ts:234` `GET /api/v2/referral/:subjectRef` (`apiKeyAuth('referral:read')`) + `core/referral.engine.ts`.
- **Limitación:** **solo síncrono**; el webhook saliente async está **inactivo** (`server.ts:171`).
- **Riesgo demo:** ninguno si se usa la ruta síncrona.

### 2.3 Pago (Webhook · PaymentConfirmed · Activación · Idempotencia) — **READY WITH LIMITATIONS**
- **Evidencia:** `payment-webhook.handler.ts:165` (HMAC `:47-56`, idempotency `:66-73`) → `publish.paymentConfirmed` → `payment-pipeline.ts:117` (activación + notificación), registrado `server.ts:175`. **Única cadena de eventos ACTIVA.**
- **Limitación:** contrato OpenAPI del webhook **no publicado** (R1 OC-1).
- **Riesgo demo:** ninguno para el flujo; documentar contrato para handoff.

### 2.4 Catálogo (terapias/productos) — **READY WITH LIMITATIONS**
- **Evidencia:** `dental-commerce.router.ts:45` `GET /api/v2/dental/commerce/catalog` + `:98` `/catalog/:code` (montado). *(Nota: `dental.handler.ts` `GET /api/v2/dental/treatments` **no está montado** en `server.ts`; el catálogo activo es el del commerce router.)*
- **Limitación:** catálogo **dental** (no existe un marketplace catalog más amplio); alcance dental es **decisión de negocio** (C1/C2).
- **Riesgo demo:** ninguno si el vertical dental entra en alcance.

### 2.5 Agenda / Reserva (bloqueo atómico, disponibilidad) — **READY WITH LIMITATIONS**
- **Evidencia:** `dental-commerce.router.ts:261` `POST /bookings` → `dentalBookingEngine.create` (`engines:244`); máquina de estados confirm/check-in/complete/cancel (`:323-362`). **Lock atómico de voucher:** `SELECT * FROM dental_vouchers WHERE token=$1 FOR UPDATE` (`engines:153`).
- **Limitación (evidencia):** el `slot_start` es **simplificado** — `new Date()` con comentario "simplified: use provided time" (`engines:259-260`); el lock atómico protege el **voucher** (anti doble-redención) pero **no** hay verificación atómica de **colisión de slot/disponibilidad**. La "reserva atómica" es parcial.
- **Riesgo demo:** bajo para un happy-path; no demostrar doble-booking concurrente de slot.

### 2.6 Escáner Facial — **NOT READY**
- **Evidencia:** servicio real `facial-analysis.service.ts` (mock por defecto; `aws` requiere SDK **no instalado**, `:52-59` → 501). Endpoint `POST /api/funnel/facial-analysis` (`funnel.handler.ts:280`) **en funnel comentado** (`server.ts:134`) + bug `.rows` TD-18.
- **Motivo NOT READY:** **sin endpoint activo**; solo mock; funnel inactivo y con bug.
- **Acción (no implementar aquí):** excluir de la demo en vivo.

### 2.7 Cuestionario Preventivo — **NOT READY**
- **Evidencia:** no existe servicio/endpoint de cuestionario dedicado (grep vacío). El formulario público vive en el **funnel inactivo**; la **puntuación** de entradas preventivas sí está activa (`/api/v2/preventive/score`).
- **Motivo NOT READY:** el cuestionario-como-formulario no está activo; solo el motor de score que lo consumiría.
- **Acción:** excluir el formulario en vivo; demostrar el **scoring** con payload provisto por el partner.

### 2.8 Consulta Médica (online / presencial) — **NOT READY**
- **Evidencia:** `consultationType` + código de consulta en `funnel.handler.ts:114,367` (**inactivo**); `referral.engine` usa "consultation" solo como **trigger**; `payment-pipeline.ts:12` solo **notifica** "appointment booking flow ready" (stub, non-blocking). No hay agenda médica online/presencial activa.
- **Motivo NOT READY:** sin servicio de consulta activo; el dental booking es de **otro dominio**.
- **Acción:** excluir de la demo; presentar como capacidad de activación posterior.

---

## 3. Dependencias críticas (transversales)

| Dependencia | Estado | Evidencia |
|---|---|---|
| PostgreSQL + RLS (aislamiento tenant) | Requerido/activo | `withTenant`, `checkDbHealth` |
| Redis (idempotencia, activación, metering) | **Requerido/activo** | `payment-webhook:70`, `external-v2:51`, `payment-pipeline:26` |
| API Key con scopes + auth audit | Activo | `api-key.middleware.ts:55` |
| Secreto HMAC del webhook | Requerido (config por entorno) | `payment-webhook.handler.ts:27` |
| `@aws-sdk/client-rekognition` (facial `aws`) | **No instalado** | `facial-analysis.service.ts:52-59` |
| Router de funnel | **Comentado (inactivo)** | `server.ts:134` |

---

## 4. Riesgos que impiden la demostración

| # | Riesgo | Prob. | Impacto | Estado |
|---|---|---|---|---|
| R-1 | Intentar demostrar **Facial/Cuestionario/Consulta** (inactivos) | Alta si se incluyen | **Alto** (fallo en vivo) | **Evitar**: excluir del guion |
| R-2 | Usar `/readiness`/`/health` como probe (check event_bus roto) | Media | Medio | Usar `/liveness` |
| R-3 | Demostrar `/admin/usage` en vivo (import roto TD-20) | Media | Medio | No incluir |
| R-4 | Mostrar el webhook sin contrato OpenAPI publicado | Media | Medio (handoff) | Documentar antes del handoff formal |
| R-5 | Demostrar doble-booking concurrente de slot dental | Baja | Medio | Limitar a happy-path |
| R-6 | Config de secreto HMAC/API Key ausente en el entorno de demo | Media | **Alto** | Provisionar credenciales de staging |

> **Ningún riesgo impide el flujo core** preventivo→pago→activación si el guion se acota al subconjunto activo.

---

## 5. Acciones mínimas indispensables antes de la sesión técnica (72 h)

> Solo lo que **contribuye directamente** a una demo exitosa. **Nada de implementación de servicios nuevos.**

1. **Acotar el guion de demo** al subconjunto activo (§6); **excluir** Facial/Cuestionario/Consulta y `/admin/usage`.
2. **Provisionar credenciales de staging:** `X-API-Key` (con scopes) + secreto HMAC del webhook por entorno.
3. **Verificar infraestructura:** PostgreSQL+RLS y Redis arriba; probe `/liveness`.
4. **Preparar payloads de demo** para `/api/v2/vitality/assess`, `/preventive/score`, `/referral/:subjectRef`, `/engagement/events`, `/dental/commerce/{catalog,bookings}`, y el **webhook de pago firmado** (+ un reenvío para el replay idempotente).
5. **Guion de handoff:** comunicar que el contrato OpenAPI del webhook y la activación de facial/cuestionario/consulta son pasos **posteriores** que requieren autorización (no parte de la demo).

---

## 6. Guion de demostración recomendado (solo servicios activos)

```
1. Provisión            POST /admin/tenants/:id/api-keys        (entregar X-API-Key)
2. Evaluación/Score     POST /api/v2/vitality/assess            → BioAge
                        POST /api/v2/preventive/score           → score
3. Derivación           GET  /api/v2/referral/:subjectRef       (síncrono)
4. Catálogo/Reserva     GET  /api/v2/dental/commerce/catalog
                        POST /api/v2/dental/commerce/bookings   (voucher FOR UPDATE)
5. Engagement           POST /api/v2/engagement/events
6. CLÍMAX — Pago        POST /api/v2/webhooks/payment  (HMAC)
                            → PaymentConfirmed → Activation Pipeline
                            → reenviar webhook → 200 sin reprocesar (idempotencia)
```
Invariantes: `subjectRef` pseudonimizado · `X-Tenant-ID`+RLS · `X-Idempotency-Key` · `X-Correlation-ID` · probe `/liveness`.

---

## 7. Go / No-Go final

# `GO` — con guion acotado al subconjunto activo

**Justificación (evidencia):** el flujo core (evaluación → score → derivación → catálogo/reserva dental → pago → activación → replay idempotente) está **implementado, cableado y activo**, con seguridad sólida (API Key scoped + HMAC + RLS + idempotencia). La sesión técnica de 72 h puede realizarse con éxito sobre este subconjunto.

**Condición del GO:** **excluir de la demo en vivo** los tres servicios NOT READY (Escáner Facial, Cuestionario Preventivo, Consulta Médica), que dependen del funnel inactivo, y las superficies con fallo de runtime (`/admin/usage`, `/readiness`). Presentarlos como activación posterior, **sin implementarlos** en esta ventana.

---

## 8. Validación

| ✓ | Ítem |
|---|---|
| ✓ | Único entregable (`PHASE1_DELIVERY_READINESS.md`); ningún otro documento creado/modificado |
| ✓ | Sin código/runtime/EventBus/OpenAPI/ADR/roadmap modificados |
| ✓ | Baseline B1–B3/R1/C1/C2 congelado; sin ampliar alcance contractual |
| ✓ | Cada estado con evidencia `archivo:línea`; sin inferencias |
| ✓ | Consistente con R1/C1 (funnel/`/v1`/`/usage` excluidos) |
| ✓ | Ningún servicio activado; ningún bug corregido; ninguna funcionalidad nueva |
| ✓ | Typecheck sin cambio (**36**) |

---

> **STOP.** Verificación de readiness Fase 1 completada. Veredicto: **GO con guion acotado**. No se implementó nada, no se activó ningún componente, no se corrigieron bugs, no se amplió el alcance. Esperando autorización explícita para cualquier acción de implementación posterior.
