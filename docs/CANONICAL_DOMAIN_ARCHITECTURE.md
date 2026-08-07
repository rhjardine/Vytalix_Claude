# CANONICAL_DOMAIN_ARCHITECTURE.md
> **Vytalix Platform — Canonical Domain Architecture (single authoritative business-domain model)**

| Campo | Valor |
|---|---|
| Rol | **Modelo de dominio canónico** (DDD estratégico + táctico) que gobierna EventBus, APIs, bounded contexts, agregados, comandos, eventos, read models, orquestación IA, multi-tenancy, integraciones y futura descomposición en microservicios |
| Estado | ACTIVO — modelo de dominio canónico |
| Sprint | B2 — Domain Context Architecture |
| Modo | **Arquitectura/análisis únicamente** — sin código/runtime/EventBus/DTO/API/tests |
| Fecha | 2026-07 |

> **Fuente de verdad: el código fuente** (`src/**`). Toda afirmación cita `archivo`/`archivo:línea`. Este documento **no duplica**: los eventos viven en [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) (referenciado, no recreado); las cadenas en [EVENT_CHAIN_CLASSIFICATION.md](./EVENT_CHAIN_CLASSIFICATION.md); la deuda en [ARCHITECTURE_BASELINE_REPORT.md](./ARCHITECTURE_BASELINE_REPORT.md); el flujo en [ARCHITECTURE_DEPENDENCY_GRAPH.md](./ARCHITECTURE_DEPENDENCY_GRAPH.md); la decisión de EventBus en [ADR_EVENTBUS.md](./ADR_EVENTBUS.md). Aquí solo el **modelo de dominio de negocio** (contextos, agregados, mapa de contextos), que no tenía ubicación canónica previa.

---

## 0. Executive Summary

**En una frase:** las capacidades de Vytalix, descubiertas desde `src/**`, se organizan en **7 bounded contexts** (Clinical Core · Longevity · Commerce/Partner · Dental · Identity & Access · Growth/Funnel · Platform) con **~11 agregados**; los 7 eventos canónicos se mapean a su contexto dueño; el mapa de contextos revela **Identity y Platform como Shared Kernels** y **Commerce como Anti-Corruption Layer + Open Host** frente a Disglobal. El modelo absorbe todas las evoluciones futuras (insurance, genomics, wearables, IA, FHIR, microservicios) **sin rediseño**. **No cambia el roadmap** (§8). Cero implementación.

**Bounded contexts (evidencia de módulo):**

| BC | Módulo(s) fuente | Rol estratégico |
|---|---|---|
| **Clinical Core** | `src/core`, `src/shared/{snapshot,ingestion,risk-scoring,timeline,explainability}.service` | Core domain (registro + razonamiento clínico) |
| **Longevity** | `src/longevity/*` | Core domain (bio-age/preventivo — Doctor Antivejez) |
| **Commerce / Partner** | `src/platform/{disglobal-client,metering}.service`, `src/api/handlers/{external-v2,payment-webhook,billing-admin}`, `src/shared/engagement.service`, referral (partner side) | Frontera de partner (Disglobal) |
| **Dental / Odontology** | `src/dental/*` (vía barrel) | Vertical de comercio dental |
| **Identity & Access** | `server.ts` (X-Tenant-ID, withTenant, RLS), `src/api/middlewares/quota.middleware`, `src/shared/middleware` | Multi-tenancy, auth, aislamiento |
| **Growth / Funnel** | `src/shared/funnel.service`, `src/api/handlers/funnel.handler` (**desmontado**) | Captación pública (inactivo) |
| **Platform** | `src/platform/{event-bus,logger,notification,db,prisma,redis}` | Subdominio genérico/soporte |

---

## 1. Phase 1 — Domain Discovery (capacidades desde el código)

**Hecho.** Capacidades de negocio respaldadas por `src/**` (no se infiere ninguna inexistente):

| # | Capacidad | Evidencia (archivo) | Contexto |
|---|---|---|---|
| 1 | Gestión de pacientes | `api/handlers/handlers.ts:74` (patientCreated) | Clinical Core |
| 2 | Ingesta de observaciones (LOINC) | `handlers.ts:129`, `shared/ingestion.service.ts`, `core/loinc-registry.ts` | Clinical Core |
| 3 | Snapshot / modelo de paciente | `shared/snapshot.service.ts:92` | Clinical Core |
| 4 | Decisión clínica | `core/decision.engine.ts`, `handlers.ts:203` | Clinical Core |
| 5 | Risk scoring (Framingham) | `shared/risk-scoring.service.ts`, `handlers.ts:179` | Clinical Core |
| 6 | Revisión de recomendación | `handlers.ts:259` | Clinical Core |
| 7 | Timeline / explainability | `shared/{timeline,explainability}.service.ts` | Clinical Core (read model) |
| 8 | Edad biológica / biofísica | `longevity/biological-age.service.ts`, `biophysics-engine.ts` | Longevity |
| 9 | Score preventivo | `longevity/preventive-score.service.ts` | Longevity |
| 10 | Análisis facial | `longevity/facial-analysis.service.ts` | Longevity (soporte) |
| 11 | Insights de cohorte | `longevity/insights.service.ts` | Longevity (analytics read model) |
| 12 | Referral / derivación | `core/referral.engine.ts:212` | Clinical→Commerce (straddle, §7) |
| 13 | Pago (webhook) | `api/handlers/payment-webhook.handler.ts:138`, `api/pipelines/payment-pipeline.ts` | Commerce/Partner |
| 14 | Metering / revenue-share | `platform/metering.service.ts`, `quota.middleware.ts:110` | Commerce (Billing) |
| 15 | Cliente Disglobal (SDK) | `platform/disglobal-client.ts` (pseudonymize) | Commerce/Partner (ACL) |
| 16 | Engagement tracking | `shared/engagement.service.ts`, `external-v2.handler.ts` | Commerce/Partner |
| 17 | Identidad / tenant / RLS | `server.ts` (withTenant), `shared/db` | Identity & Access |
| 18 | Quota / rate-limit | `api/middlewares/quota.middleware.ts` | Identity & Access |
| 19 | Notificación | `platform/notification.service.ts` | Platform |
| 20 | Orquestación de pipelines | `api/pipelines/pipeline-v2.orchestrator.ts` | Platform (Workflow) |
| 21 | EventBus / logging / persistencia | `platform/{event-bus,logger,db,prisma,redis}.ts` | Platform |
| 22 | Auditoría | `dental/services/audit.service.ts`, DecisionGenerated→audit | Platform (Audit) |
| 23 | Funnel público (leads/assessment/booking) | `shared/funnel.service.ts`, `funnel.handler.ts` (**desmontado**) | Growth/Funnel |
| 24 | Comercio dental (booking) | `dental/engines/dental-commerce.engines.ts` | Dental |

> `src/legacy/` y `src/demo/` se **excluyen** del modelo (no se ejecutan; RC-5 legacy, gobernado por build-scope).

---

## 2. Phase 2 — Bounded Contexts

### BC-1 · Clinical Core *(Core Domain)*
- **Propósito / responsabilidad:** registro clínico y razonamiento clínico (pacientes, observaciones, snapshots, decisiones, riesgo, recomendaciones).
- **Ubiquitous Language:** Patient, MRN, Observation, LOINC, Snapshot, Decision, Recommendation, Rule, Urgency, Risk Category, Decision Trace.
- **Agregados primarios:** Patient · Observation · PatientModel(Snapshot) · ClinicalDecision(Recommendation) · RiskScore.
- **Entidades/VO:** MRN (VO), LoincCode (VO), Value+Unit (VO), RuleId, DecisionTraceId.
- **Domain services:** `decision.engine`, `risk-scoring.service`, `snapshot.service`, `ingestion.service`, `loinc-registry`, `algorithm-registry`.
- **Policies:** una observación pertenece a un paciente tenant-scoped; una decisión es trazable a regla+snapshot.
- **External interfaces:** API `/v1/*` (JWT + X-Tenant-ID).
- **Internal deps:** Identity (tenant), Platform (EventBus/persistencia).

### BC-2 · Longevity *(Core Domain — producto Doctor Antivejez)*
- **Propósito:** edad biológica y scoring preventivo de longevidad.
- **Ubiquitous Language:** Biological Age, Differential Age, Age Status, Biophysics, Vitality, Preventive Score.
- **Agregados:** BiologicalAgeAssessment · PreventiveScore · (soporte) FacialAnalysis · (read model) CohortInsight.
- **Domain services:** `biological-age.service`, `biophysics-engine`, `preventive-score.service`, `facial-analysis.service`, `insights.service`.
- **External interfaces:** `/api/v2/vitality`, `/api/v2/preventive`.
- **Internal deps:** Clinical Core (Shared Kernel: identidad Patient), Platform, Identity.
- **Relación:** *Customer* de Clinical Core; *Supplier* de scores derivados a Commerce.

### BC-3 · Commerce / Partner *(frontera Disglobal)*
- **Propósito:** frontera comercial y de integración con el partner externo (Disglobal): pago, billing/metering, referral-handoff, engagement.
- **Ubiquitous Language:** subjectRef, tenantSecret, Payment Intent, Payment Confirmation, Revenue Share, Referral, Engagement, Webhook, API Key.
- **Agregados:** PaymentConfirmation · MeteringRecord/RevenueShare · ReferralHandoff · EngagementEvent · **SubjectRef (VO pseudónimo)**.
- **Domain services:** `disglobal-client` (`pseudonymize`, `batchAssessSegment`), `metering.service`, `engagement.service`.
- **External interfaces:** API `/api/v2/*` (X-API-Key), receptor de webhook de pago, webhook saliente de referral.
- **Patrones DDD:** **Anti-Corruption Layer** (pseudonimización protege la identidad clínica), **Open Host Service** (`/api/v2`), **Published Language** (OpenAPI v2).
- **Internal deps:** Clinical (referral), Longevity (scores), Identity (API key), Platform.

### BC-4 · Dental / Odontology *(vertical)*
- **Propósito:** comercio dental (booking con máquina de estados, commerce engine).
- **Ubiquitous Language:** Booking, Slot, Check-in, Commerce, REQUESTED→CONFIRMED→CHECKED_IN→COMPLETED.
- **Agregados:** DentalBooking · DentalCommerceOrder.
- **Domain services:** `dental-commerce.engines`, `dental/services/audit.service`.
- **External interfaces:** `/api/v2/dental/*` **solo vía barrel** `src/dental/index.ts` (aislamiento AEK ADR-002).
- **Patrón:** vertical aislado (Conformist/Separate Ways).

### BC-5 · Identity & Access *(Shared Kernel transversal)*
- **Propósito:** multi-tenancy, autenticación, autorización, aislamiento (RLS), quota.
- **Ubiquitous Language:** Tenant, X-Tenant-ID, RLS, withTenant, API Key, JWT, Scope, Quota.
- **Agregados:** Tenant · ApiKey · (futuro/reservado) Consent.
- **Domain services:** `withTenant`, `quota.middleware`, auth middleware.
- **Patrón:** **Shared Kernel** — `tenantId` es compartido por **todos** los contextos; enforcement por RLS.

### BC-6 · Growth / Funnel *(inactivo)*
- **Propósito:** captación pública (leads, vitality assessment, booking).
- **Agregados:** FunnelLead · FunnelAssessment · FunnelBooking.
- **Estado (hecho):** **desmontado** — router funnel comentado en `server.ts` (ARCHITECTURE_BASELINE_REPORT §TD-18); emits `funnel.*` huérfanos (EVENT_CHAIN_CLASSIFICATION #11–13, clasificados REMOVE).
- **Observación:** contexto presente en código pero inactivo; candidato a reactivación o retiro (decisión de negocio).

### BC-7 · Platform *(Generic/Supporting Subdomain)*
- **Propósito:** habilitadores técnicos — EventBus, logging, notificación, persistencia, observabilidad, workflow.
- **Servicios:** `event-bus`, `logger`, `notification.service`, `db/prisma/redis`, `pipeline-v2.orchestrator`, `metering` (compartido con Commerce).
- **Patrón:** **Shared Kernel técnico** + **Open Host Service** (EventBus publish/subscribe).

> **Contextos reservados (sin código hoy):** Intelligence (AI/ML), Analytics (dedicado), Insurance, Laboratory, Genomics — alineados con los namespaces reservados de [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §10.8.

---

## 3. Phase 3 — Aggregate Mapping (conceptual)

| Agregado | Root | Entidades/VO propias | Frontera de consistencia | Invariantes | Eventos producidos | Command handler | Read models | API dueña |
|---|---|---|---|---|---|---|---|---|
| **Patient** | Patient | MRN(VO), OrganizationId(VO) | 1 paciente | MRN único por org; tenant-scoped | PatientCreated | `handlers.ts:74` | Snapshot, Timeline | `/v1/patients` |
| **Observation** | Observation | LoincCode(VO), Value+Unit(VO), sourceSystem | 1 observación | LOINC válido; pertenece a paciente; tenant-scoped | ObservationAdded | `handlers.ts:129` | Timeline, Snapshot | `/v1/observations` |
| **PatientModel** | PatientSnapshot | snapshotVersion, updatedFields | 1 snapshot | versión monótona; derivado de observaciones | PatientModelUpdated | `snapshot.service.ts:92` | Snapshot read | interno |
| **ClinicalDecision** | Recommendation | ruleId, urgency, category, decisionTraceId | 1 recomendación | trazable a regla+snapshot; revisable | DecisionGenerated, RecommendationReviewed | `decision.engine`, `handlers.ts:259` | Decision list | `/v1/recommendations` |
| **RiskScore** | RiskScore | scoreType, riskCategory, valuePercent | 1 score | derivado de snapshot; tipado | RiskScoreComputed | `handlers.ts:179` | Risk read | `/v1/risk` |
| **BiologicalAgeAssessment** | Assessment | biologicalAge, differentialAge, ageStatus, algorithmVersion | 1 assessment | derivado de biofísica; cacheado | *(futuro)* VitalityAssessed | `biological-age.service` | CohortInsight | `/api/v2/vitality` |
| **PaymentConfirmation** | Payment | subjectRef(VO), amount, currency, product | 1 pago | idempotente por intentId; subjectRef pseudonimizado | PaymentConfirmed | `payment-webhook.handler.ts:138` | Activation record | `/api/v2/webhooks/payment` |
| **ReferralHandoff** | Referral | referralType, urgency, triggerCode | 1 referral | derivado de decisión clínica; pseudonimizado saliente | *(futuro)* ReferralTriggered | `referral.engine.ts:212` | Referral read | `/api/v2/referral` |
| **MeteringRecord** | MeteringRecord | eventType, unitPrice, revenueShare | batch/stream | non-blocking; revenue-share calculado | *(ninguno tipado)* | `metering.service` | Usage read | `/usage` |
| **DentalBooking** | Booking | Slot(VO), status(state machine) | 1 booking | lock atómico de slot; transiciones válidas | *(ninguno tipado)* | `dental-commerce.engines` | Booking read | `/api/v2/dental` |
| **Tenant** | Tenant | ApiKey, webhookUrl/Secret(VO) | 1 tenant | aislamiento RLS; id único | *(ninguno)* | `withTenant` | Tenant config | interno |

> **Observación (Phase 7):** varios agregados son **row-in-Prisma + logic-in-service** (transaction-script) más que agregados ricos; se anota como propiedad estructural, no defecto.

---

## 4. Phase 4 — Event Ownership

> Mapea los eventos canónicos a su contexto dueño. **No** renombra, **no** cambia payloads, **no** toca EventBus. Definición de eventos: [CANONICAL_EVENT_MODEL.md](./CANONICAL_EVENT_MODEL.md) §3/§10 (referenciada).

| Evento | Contexto dueño | Agregado productor | Consumidores | Clase de privacidad | Visibilidad externa | Elegibilidad de integración |
|---|---|---|---|---|---|---|
| PatientCreated | Clinical Core | Patient | — | PHI-adyacente | No | Interno |
| ObservationAdded | Clinical Core | Observation | core subs→pipeline *(no cableado)* | PHI clínica | No | Interno |
| PatientModelUpdated | Clinical Core | PatientModel | — | Clinical-derived | No | Interno |
| DecisionGenerated | Clinical Core | ClinicalDecision | core subs→audit *(no cableado)* | Clinical-derived | No | Interno (audit) |
| RiskScoreComputed | Clinical Core | RiskScore | — | Clinical-derived | Solo score derivado | Partner: derivado |
| RecommendationReviewed | Clinical Core | ClinicalDecision | — | Clinical-derived | No | Interno |
| **PaymentConfirmed** | **Commerce/Partner** | PaymentConfirmation | payment-pipeline **(ACTIVO)** | Financial+Pseudonymized | **Sí** (subjectRef) | **Partner ✓** |
| *(futuro)* VitalityAssessed | Longevity | BiologicalAgeAssessment | orchestrator re-score+cache | Clinical-derived | Solo derivado | Partner: derivado |
| *(futuro)* ReferralTriggered | **Commerce/Partner** *(producido en Clinical)* | ReferralHandoff | deliverReferralWebhook | Pseudonymized | **Sí** (pseudónimo) | **Partner ✓** |

> **Cross-context (gap, §7):** `ReferralTriggered` se **produce** en `core/referral.engine` (Clinical) pero su **significado** es partner-handoff (Commerce). Propiedad de dominio dividida.

---

## 5. Phase 5 — Context Relationship Map

```
                 ┌───────────────────────────────────────────────┐
                 │  IDENTITY & ACCESS  (Shared Kernel: tenantId)  │  ← upstream de TODOS (RLS)
                 └───────────────────────────────────────────────┘
                 ┌───────────────────────────────────────────────┐
                 │  PLATFORM (Shared Kernel técnico + Open Host)  │  ← EventBus publish/subscribe
                 └───────────────────────────────────────────────┘
   Supplier                         Customer/Supplier                     Downstream
┌───────────────┐   clinical facts ┌───────────────┐  derived scores  ┌────────────────────┐
│ CLINICAL CORE │ ────────────────►│   LONGEVITY   │ ────────────────►│  COMMERCE / PARTNER │
│ (Core Domain) │                  │ (Core Domain) │                  │  ACL + OHS + Pub Lang│
└───────┬───────┘   referral (straddle) ──────────────────────────────►│  (pseudonymize)     │
        │                                                              └──────────┬─────────┘
        │                                                       Published Language │ (OpenAPI v2)
        ▼                                                                          ▼
┌───────────────┐        ┌───────────────┐                              ┌────────────────────┐
│ GROWTH/FUNNEL │ ······►│    DENTAL      │  (Conformist / barrel)       │  DISGLOBAL (extern) │
│  (inactivo)   │        │  (vertical)    │                              │  Conformist a Pub L │
└───────────────┘        └───────────────┘                              └────────────────────┘
```

| Relación | Patrón DDD | Evidencia |
|---|---|---|
| Identity → todos | **Shared Kernel** (tenantId) | `withTenant`/RLS en todos los contextos |
| Platform → todos | **Shared Kernel** técnico + **Open Host Service** | `event-bus.ts` publish/subscribe |
| Clinical → Longevity | **Customer/Supplier** (+ Shared Kernel: identidad Patient) | Longevity consume patientId |
| Clinical/Longevity → Commerce | **Customer/Supplier** | referral + scores fluyen a partner |
| Commerce ↔ Disglobal | **ACL** (pseudonymize) + **Open Host** (`/api/v2`) + **Published Language** (OpenAPI) | `disglobal-client.pseudonymize` |
| Disglobal → Commerce | **Conformist** al Published Language de Vytalix | contratos v2 |
| Dental | **Separate Ways / Conformist** (barrel-isolated) | AEK ADR-002 |
| Growth → Commerce | upstream de conversión (**inactivo**) | funnel desmontado |

- **Dependencias síncronas:** Identity (RLS por-request), Clinical→Snapshot (in-request), llamadas API `/v1`,`/v2`.
- **Dependencias asíncronas (Event Collaboration):** PaymentConfirmed→activación **(activa)**; *(futuras)* ObservationAdded→pipeline, VitalityAssessed→re-score, ReferralTriggered→webhook.
- **Futuras fronteras de servicio (microservicios):** cada BC es candidato; los seams naturales son **Clinical Core · Longevity · Commerce/Partner · Dental**; Identity/Platform quedan como infraestructura compartida (sidecar/shared).

---

## 6. Phase 6 — Future Architecture (soporte a evolución, sin implementación)

| Evolución futura | Encaje en el modelo | Patrón | ¿Rediseño? |
|---|---|---|---|
| **Disglobal** (profundizar) | Commerce/Partner (ACL+OHS+Published Language ya presentes) | EventBridge async | **No** |
| **Insurance** | Nuevo BC bajo paraguas Commerce (`openapi/vytalix_insurtech_v1.yaml` ya existe) | Customer de Clinical/Risk | **No** |
| **Marketplace** | Nuevo BC bajo Commerce | Open Host | **No** |
| **Odontology** (escala) | BC Dental existente (ya aislado) | — | **No** |
| **Laboratory** | Nuevo BC **Supplier→Clinical** (alimenta ObservationAdded) | Supplier | **No** |
| **Genomics** | Nuevo BC / sub-contexto Clinical (omics observations) | Supplier→Clinical | **No** |
| **Wearables** | Alimenta Observation (`payload.sourceSystem` ya existe) | Supplier→Clinical | **No** |
| **AI Agents** | BC **Intelligence** (reservado) consume eventos | Open Host / Event Collaboration | **No** |
| **Clinical Research** | BC **Research/Analytics** downstream | Downstream consumer | **No** |
| **Hospital Integration** | **ACL + FHIR gateway** hacia Clinical | Conformist/ACL | **No** |
| **FHIR** | ACL en la frontera de Clinical (legacy ya tiene ingesta FHIR-like) | Published Language mapping | **No** |
| **EventBridge / Kafka** | Platform Open Host (bus transport-agnostic listo) | Transporte async | **No** |
| **Microservicios** | Los seams de BC = fronteras de servicio | Descomposición por BC | **No** |

> **Conclusión (Phase 6):** el modelo de contextos absorbe **todas** las evoluciones sin rediseño — cada capacidad nueva es un BC nuevo o un Supplier que alimenta agregados existentes, usando patrones ya presentes (ACL, OHS, Published Language, Event Collaboration, Shared Kernel).

---

## 7. Phase 7 — Gap Analysis (estructural, sin recomendaciones de implementación)

> Solo gaps **estructurales** (hechos del código). Ninguna recomendación requiere implementación aquí.

| # | Gap | Tipo | Evidencia |
|---|---|---|---|
| G1 | `referral.engine` (Clinical Core, `src/core`) **produce** un evento de significado Commerce (partner handoff) | **Ownership impropio / cross-context coupling** | `core/referral.engine.ts:212` → webhook partner |
| G2 | `quota.middleware` (Identity/Access) **emite** `referral.converted` (Commerce/Billing) | **Boundary leaking** (middleware produce evento de otro contexto) | `quota.middleware.ts:110` |
| G3 | Billing/Metering sin evento ni agregado tipado (revenue-share es `referral.converted` **huérfano**) | **Anemic / concepto sin dueño** | `metering.service` + EVENT_CHAIN_CLASSIFICATION #10 (REMOVE) |
| G4 | `PatientModelUpdated` producido en `shared/snapshot.service.ts:92` **y** `legacy/snapshot_service.ts:95` | **Duplicate concept** | dos productores del mismo evento |
| G5 | BC Growth/Funnel **desmontado** (router comentado; emits huérfanos) | **Detached context** (código presente, inactivo) | `server.ts` funnel comentado; `funnel.*` REMOVE |
| G6 | `tenantId` (Identity) y EventBus (Platform) son Shared Kernels **de-facto no declarados** | **Shared Kernel implícito** (riesgo de acoplamiento no gobernado) | uso transversal sin contrato explícito |
| G7 | Frontera Clinical↔Longevity ambigua (comparten identidad Patient, módulos separados) | **Boundary ambiguity** | `src/longevity` separado, referencia patientId |
| G8 | Lógica en services + datos en rows Prisma (transaction-script) | **Anemic domain (tendencia)** | agregados = rows; lógica = `*.engine`/`*.service` |

> Todos son **observaciones estructurales**. Su resolución (si se autoriza) sería trabajo de sprints funcionales posteriores, no de B2.

---

## 8. Phase 8 — Roadmap Impact

**Assessment (hecho):** el modelo de dominio **no cambia las prioridades** de [ROADMAP_V2.md](./ROADMAP_V2.md). La ruta crítica vigente (input de negocio → B1 migración EventBus W1–W4 → typecheck→0 → gates) permanece; el modelo de contextos aporta el **marco de fronteras** para ese trabajo pero no reordena nada. Los seams de BC informan la **futura** descomposición en microservicios, que el roadmap ya ubica en fase Futuro/Fase 2.

**Decisión:** **ROADMAP_V2 se deja SIN CAMBIOS** (disciplina: "never rewrite unnecessarily"). Los gaps G1–G8 se registran aquí como insumo estructural para priorización futura; no crean sprints nuevos hasta autorización.

---

## 9. Validación (obligatoria)

| ✓ | Ítem | Evidencia |
|---|---|---|
| ✓ | Repositorio inspeccionado primero | `ls src/**`, lectura de módulos antes de escribir |
| ✓ | Artefactos existentes reutilizados | CANONICAL_EVENT_MODEL, EVENT_CHAIN_CLASSIFICATION, ARCHITECTURE_BASELINE_REPORT, DEPENDENCY_GRAPH, ADR_EVENTBUS (referenciados) |
| ✓ | Sin documentación duplicada | 1 doc nuevo (concepto sin ubicación previa) + exec summary embebido; eventos/deuda/flujo NO recreados |
| ✓ | Código fuente prevaleció sobre docs | contextos/agregados derivados de `src/**` con `archivo:línea` |
| ✓ | Cero código de producción modificado | solo este `.md` |
| ✓ | Cero cambios de runtime | — |
| ✓ | Cero cambios de EventBus | `event-bus.ts` intacto |
| ✓ | Cero cambios de API | — |
| ✓ | Cero cambios de DTO | — |
| ✓ | Cero tests modificados | — |
| ✓ | Typecheck sin cambio | **36** |
| ✓ | Solo arquitectura | sin implementación |

---

> **STOP.** Modelo de dominio canónico completado (7 bounded contexts · ~11 agregados · mapa de contextos · gaps estructurales). No se inició implementación, no se modificó EventBus, no se refactorizaron contextos, no se crearon servicios/agregados en código, no se migraron eventos. Roadmap sin cambios. Esperando autorización explícita para Sprint B3.
