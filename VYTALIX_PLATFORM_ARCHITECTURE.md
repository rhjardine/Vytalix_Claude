# Vytalix Health Intelligence Platform
## Arquitectura de Referencia — v2.0

> **Documento ejecutivo-técnico** para comité de arquitectura, negocio y Disglobal como socio estratégico.

---

## 1. Resumen Ejecutivo

Vytalix es una **plataforma API de inteligencia preventiva y longevidad** que expone capacidades clínicas como servicios reutilizables de alto valor. El sistema tiene tres actores principales:

| Actor | Rol |
|-------|-----|
| **Doctor Antivejez** | Autoridad médica. Valida algoritmos, define protocolos clínicos. |
| **Vytalix** | Motor de infraestructura. Procesa, persiste, calcula y expone vía API. |
| **Disglobal** | Canal de distribución. Consume las APIs como marketplace/insurtech. |

La decisión de diseño central es **API-first con multi-tenancy desde el día 1**: cada cliente de Vytalix (Disglobal, clínicas, aseguradoras) es un tenant aislado con RLS en PostgreSQL. No hay UI de consumo final en el backend — solo servicios consumibles.

---

## 2. Arquitectura Propuesta

### 2.1 Diagrama de capas

```
┌─────────────────────────────────────────────────────────────────┐
│  CONSUMERS                                                       │
│  Disglobal Marketplace  │  Doctor Antivejez Web  │  EMR/LIS     │
└──────────────┬──────────────────────┬────────────────────┬──────┘
               │ API Key              │ JWT                │ API Key
               ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  TRANSPORT LAYER (Express + Helmet + Rate Limiting)              │
│  /api/external/*  (API Key)  │  /v1/*  (JWT + tenant RLS)       │
│  /v2/*  (API Key + JWT)      │  /health  /metrics               │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  CROSS-CUTTING MIDDLEWARE                                        │
│  Auth  │  Tenant Resolution  │  Idempotency  │  Audit Writer    │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  APPLICATION SERVICES (Use Cases)                                │
│                                                                  │
│  VitalityService  │  PreventiveScoreService  │  EngagementSvc   │
│  ReferralEngine   │  InsightsService         │  IngestionSvc    │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  DOMAIN / CLINICAL ENGINES                                       │
│                                                                  │
│  BiophysicsEngine (Doctor Antivejez)                            │
│  FraminghamEngine (Framingham 2008 — D'Agostino)                │
│  CompositePreventiveScorer                                       │
│  DecisionEngine (5 hardened rules + protocol rules)             │
│  ExplainabilityService (deterministic, no LLM)                  │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                            │
│                                                                  │
│  PostgreSQL 15 + TimescaleDB     Redis 7 (cache + idempotency)  │
│  Row-Level Security (RLS)        EventBridge-ready EventBus     │
│  Pino structured logger          Prometheus metrics             │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Por qué esta arquitectura

**Separación Domain ↔ Transport**: los engines clínicos no conocen HTTP. Se pueden reutilizar en jobs, webhooks, o backends diferentes sin refactoring.

**RLS en PostgreSQL**: la seguridad de tenant-isolation no depende del código de aplicación. Un bug en el código no puede filtrar datos entre tenants.

**TimescaleDB para observaciones**: las observaciones clínicas son series de tiempo. TimescaleDB provee compresión automática, continuous aggregates y queries de ventana temporal a O(log n).

**Redis para idempotencia**: garantiza que requests repetidos (re-intentos de EMR) no dupliquen evaluaciones. Clave: `idempotency:{tenantId}:{key}` → TTL 24h.

**Human-in-the-loop**: el motor genera recomendaciones con estado PENDING. Un médico debe ACCEPT/REJECT. El sistema nunca actúa autónomamente sobre el paciente.

---

## 3. Estructura de Componentes

### Componentes nuevos (Sprint 2+)

| Componente | Archivo | Responsabilidad |
|-----------|---------|-----------------|
| `BiophysicsEngine` | `biological-age/biophysics-engine.ts` | Algoritmo Doctor Antivejez. Lookup de baremos, interpolación, cálculo de edad parcial por ítem. |
| `BiologicalAgeService` | `biological-age/biological-age.service.ts` | Orquesta los 4 tipos de edad biológica. Persiste assessments inmutables. |
| `PreventiveScoreService` | `preventive/preventive-score.service.ts` | Extiende Framingham. Score compuesto 0-100 con sub-scores por dominio. |
| `EngagementService` | `engagement/engagement.service.ts` | Registra eventos de bienestar. Calcula engagement score. Detecta patrones de riesgo conductual. |
| `ReferralEngine` | `referral/referral.engine.ts` | Evalúa triggers para derivación premium. Genera CTA estructurado con urgency y valor percibido. |
| `InsightsService` | `insights/insights.service.ts` | Agrega métricas anónimas por cohorte/tenant. Alimenta dashboards Disglobal. |
| `VitalityHandler` | `api/vitality.handler.ts` | Thin handler — valida con Zod, delega a BiologicalAgeService. |
| `ExternalV2Handler` | `api/external-v2.handler.ts` | Endpoint Disglobal. API Key auth. Batch ingest + score on demand. |

### Componentes existentes (conservar y extender)

| Componente | Estado |
|-----------|--------|
| `DecisionEngine` (5 hardened rules) | ✅ Producción — no modificar core |
| `RiskScoringService` (Framingham 2008) | ✅ Extender, no reemplazar |
| `PipelineOrchestrator` | ✅ Agregar Stage 4: BIOLOGICAL_AGE |
| `IngestionService` | ✅ Extender con nuevos LOINC codes |
| `prisma.ts` / `db.ts` | ✅ Usar sin cambios |
| Schema `schema.prisma` | ✅ Solo adiciones, nunca modificar tablas existentes |

---

## 4. Flujo de Datos

### 4.1 Request exitoso — evaluación de vitalidad (Disglobal)

```
Disglobal App
  │  POST /api/v2/vitality/assess
  │  X-API-Key: vyx_dis_k1_xxx
  │  Body: { subjectRef, measurements: {...} }
  │
  ▼ ExternalV2Handler
  │  1. validateApiKey(key) → tenant context
  │  2. idempotencyCheck(key, requestHash) → cache hit? return cached
  │  3. zodValidate(body) → typed VitalityAssessRequest
  │
  ▼ BiologicalAgeService
  │  4. resolvePseudonymousSubject(subjectRef, tenantId)
  │  5. BiophysicsEngine.compute(measurements, chronologicalAge, sex)
  │     → partialAges[8], biologicalAge, differentialAge
  │  6. persistAssessment(result) → biological_age_assessments (immutable)
  │  7. updatePatientSnapshot(patientId, biologicalAge)
  │
  ▼ PreventiveScoreService (async, if snapshot has lab data)
  │  8. computeCompositeScore(tenantId, patientId)
  │
  ▼ ReferralEngine (async)
  │  9. evaluateReferralTriggers(assessment, score)
  │     → referral_events if triggered
  │
  ▼ EventBus
  │  10. emit('vitality.assessed', { patientId, biologicalAge, delta })
  │
  ▼ Response (200ms p99 target)
  │  {
  │    assessmentId, biologicalAge, differentialAge,
  │    partialAges, riskSignals, referralCTA?
  │  }
  │
  ▼ Cache (Redis)
     11. set(idempotencyKey, response, TTL 24h)
     12. set(scoreCacheKey, biologicalAge, TTL 6h)
```

### 4.2 Request inválido

```
POST /api/v2/vitality/assess  →  Zod validation fails
  → HTTP 422, RFC 7807 ProblemDetail
  → log.warn({ correlationId, errors }) — no persistencia
```

### 4.3 Request no autorizado

```
POST /api/v2/* (X-API-Key ausente o inválida)
  → AuthMiddleware: HTTP 401 antes de llegar al handler
  → AuditLog: action='AUTH_FAILURE', resourceType='ApiKey'
  → No se expone detalle del error (security by obscurity)
```

### 4.4 Request idempotente

```
POST /api/v2/vitality/assess (Idempotency-Key: abc123, segunda vez)
  → IdempotencyMiddleware: Redis hit
  → HTTP 200 + X-Idempotent-Replayed: true
  → Response idéntico, sin re-procesamiento clínico
```

### 4.5 Request que dispara derivación premium

```
BiologicalAgeService.persist()
  → differentialAge > 5 años || riskScore.category = HIGH | VERY_HIGH
  → ReferralEngine.evaluate()
     → referral_events INSERT (type=PREMIUM_CONSULT, urgency=SOON)
     → response incluye: referralCTA: { type, urgencyLabel, ctaUrl, valueProposition }
  → EventBus emit('referral.triggered')
     → Disglobal webhook (configurado por tenant)
```

---

## 5. Diseño de APIs

### Nomenclatura comercial

| Nombre comercial | Ruta interna | Audiencia |
|-----------------|-------------|-----------|
| **Vytalix BioAge API** | `POST /api/v2/vitality/assess` | Disglobal, apps consumer |
| **Vytalix Preventive Score API** | `POST /api/v2/preventive/score` | Aseguradoras, HR tech |
| **Vytalix Wellness Engagement API** | `POST /api/v2/engagement/events` | Apps de bienestar |
| **Vytalix Smart Referral API** | `GET /api/v2/referral/evaluate` | Disglobal marketplace |
| **Vytalix Population Insights API** | `GET /api/v2/insights/cohort` | Analytics, B2B dashboards |

### 5.1 POST /api/v2/vitality/assess

**Propósito**: Evalúa edad biológica biofísica. Motor central de Doctor Antivejez.

**Auth**: `X-API-Key` (Disglobal) o `Bearer JWT` (clínica)

**Request**:
```json
{
  "subjectRef": "EXT-USR-00112",
  "chronologicalAge": 45,
  "biologicalSex": "MALE",
  "isAthlete": false,
  "measurements": {
    "fatPercentage": 22.5,
    "bmi": 26.1,
    "digitalReflexes": { "high": 0.8, "long": 15.2, "width": 8.1 },
    "visualAccommodation": 3.5,
    "staticBalance": { "high": 12.0, "long": 30.5, "width": 8.0 },
    "skinHydration": 42.0,
    "systolicPressure": 128.0,
    "diastolicPressure": 82.0
  }
}
```

**Response** (200):
```json
{
  "assessmentId": "uuid",
  "biologicalAge": 42,
  "differentialAge": -3,
  "ageStatus": "REJUVENECIDO",
  "partialAges": {
    "fatAge": 40.2, "bmiAge": 44.1, "reflexesAge": 38.5,
    "visualAge": 46.0, "balanceAge": 41.2, "hydrationAge": 39.8,
    "systolicAge": 43.0, "diastolicAge": 44.5
  },
  "riskSignals": [],
  "referralCTA": null,
  "assessedAt": "2024-11-15T10:00:00Z",
  "algorithmVersion": "biophysics-daaa-v2.1"
}
```

**Errores**:
- 401: API key inválida
- 422: campo faltante/inválido + detalle de campos
- 429: rate limit superado

### 5.2 POST /api/v2/preventive/score

**Propósito**: Score preventivo compuesto (0–100) combinando Framingham, edad biológica, y marcadores de longevidad.

**Request**:
```json
{
  "subjectRef": "EXT-USR-00112",
  "includeComponents": ["cardiovascular", "metabolic", "biological_age"]
}
```

**Response** (200):
```json
{
  "scoreId": "uuid",
  "compositeScore": 71,
  "tier": "MODERATE_RISK",
  "components": {
    "cardiovascular": { "score": 68, "tenYearRiskPercent": 12.4, "category": "MODERATE" },
    "metabolic": { "score": 75, "markers": ["glucose_normal", "bmi_borderline"] },
    "biologicalAge": { "score": 80, "delta": -3, "status": "REJUVENECIDO" }
  },
  "computedAt": "2024-11-15T10:00:00Z"
}
```

### 5.3 POST /api/v2/engagement/events

**Propósito**: Registra eventos de comportamiento de salud. Alimenta el engagement score.

**Request**:
```json
{
  "subjectRef": "EXT-USR-00112",
  "events": [
    { "type": "TEST_COMPLETED", "payload": { "testType": "BIOPHYSICS" } },
    { "type": "RECOMMENDATION_VIEWED", "payload": { "recommendationId": "uuid" } }
  ]
}
```

### 5.4 GET /api/v2/referral/evaluate/:subjectRef

**Propósito**: Evalúa si el sujeto califica para derivación premium.

**Response**:
```json
{
  "eligible": true,
  "referralType": "PREMIUM_CONSULT",
  "urgency": "SOON",
  "triggerReason": "biological_age_delta_exceeds_5",
  "ctaPayload": {
    "headline": "Tu edad biológica supera en 5 años a la cronológica",
    "subheadline": "Una consulta especializada puede revertir este resultado",
    "ctaLabel": "Consultar con Doctor Antivejez",
    "ctaUrl": "https://doctorantivejez.com/consulta?ref=vyx-ref-uuid",
    "urgencyLabel": "Cupos disponibles esta semana"
  }
}
```

### 5.5 GET /api/v2/insights/cohort

**Propósito**: Métricas agregadas anónimas por cohorte (tenant-scoped).

**Query params**: `ageGroup=40-50&biologicalSex=MALE&period=last_90d`

**Response**:
```json
{
  "cohortSize": 234,
  "metrics": {
    "avgBiologicalAge": 47.2,
    "avgChronologicalAge": 46.8,
    "avgDifferential": 0.4,
    "pctRejuvenecido": 38,
    "pctEnvejecido": 22,
    "topRiskSignals": ["ldl_elevated", "sedentary", "hypertension_stage1"]
  },
  "period": "2024-08-01/2024-11-15",
  "note": "Anonymized cohort data. Minimum cohort size: 50."
}
```

---

## 6. Esquema de Base de Datos

### Nuevas entidades (adición al schema.prisma existente)

#### `biological_age_assessments`
Evaluaciones inmutables de edad biológica. Una por tipo (BIOPHYSICS, BIOCHEMISTRY, etc.) por paciente por sesión.

**Campos clave**: `assessmentType`, `biologicalAge`, `differentialAge`, `partialAgesSnapshot` (JSONB), `algorithmId`, `algorithmVersion`, `inputSnapshot` (JSONB), `computedAt`.

**Invariante**: Nunca se actualiza. Si se re-evalúa, se crea un nuevo registro. Esto preserva el historial longitudinal completo.

#### `engagement_events`
Serie de tiempo de eventos de comportamiento. Hypertable de TimescaleDB.

**Campos clave**: `eventType` (TEST_COMPLETED, RECOMMENDATION_VIEWED, GOAL_SET, etc.), `payload` (JSONB), `occurredAt`.

**Uso**: Alimenta el engagement score. Identifica usuarios de alto engagement para monetización.

#### `referral_events`
Registro de derivaciones generadas y su estado de conversión.

**Campos clave**: `referralType`, `triggerReason`, `urgency`, `ctaPayload` (JSONB), `convertedAt`, `convertedValue`.

#### `api_keys`
Claves de acceso para integraciones externas (Disglobal, EMR, etc.).

**Campos clave**: `keyHash` (SHA-256, nunca el valor en claro), `permissions` (JSONB con scopes), `rateLimitTier`, `lastUsedAt`, `expiresAt`.

#### `consent_records`
Consentimiento informado para procesamiento de datos de salud. Requerido por HIPAA/GDPR.

**Campos clave**: `consentType` (DATA_PROCESSING, MARKETING, RESEARCH), `consentedAt`, `withdrawnAt`, `legalBasis`, `dataVersion`.

#### `calculation_versions`
Registro de versiones de algoritmos. Garantiza reproducibilidad histórica.

**Campos clave**: `algorithmId`, `version`, `description`, `paramsSnapshot` (JSONB), `activatedAt`, `deprecatedAt`.

---

## 7. Estrategia de Caché

### Reglas de caché por tipo de dato

| Dato | Cache? | TTL | Capa | Invalidación |
|------|--------|-----|------|-------------|
| Edad biológica computada | ✅ | 6h | Redis | On new assessment |
| Risk score (Framingham) | ✅ | 4h | Redis | On new observation |
| Baremos (scoring tables) | ✅ | 24h | Redis | On admin update |
| Perfil de paciente | ✅ | 15min | Redis | On observation ingest |
| Métricas de cohorte | ✅ | 1h | Redis | Scheduled refresh |
| Idempotency keys | ✅ | 24h | Redis | Never (TTL based) |
| Tokens JWT | ✅ | Hasta expiración | Redis | On logout/revoke |
| Datos PII crudos | ❌ | — | — | Nunca cachear |
| Audit logs | ❌ | — | — | Nunca cachear |
| DecisionTraces | ❌ | — | — | Siempre desde DB |

### Patrón de caché

```
Cache-Aside (read-through manual):
  1. Check Redis key
  2. Hit → return cached value
  3. Miss → compute from DB → cache result → return

Invalidation:
  - Event-driven: EventBus 'observation.added' → invalidate patient cache
  - TTL-based: baremos, cohorte metrics
  - Explicit: admin updates via /admin/cache/invalidate
```

### Keys de Redis

```
vitality:{tenantId}:{patientId}:latest         → última evaluación de edad biológica
risk:{tenantId}:{patientId}:cardiovascular      → último risk score Framingham
baremos:{tenantId}:biophysics                  → scoring tables para biofísica
idempotency:{tenantId}:{idempotencyKey}        → resultado cacheado de request
cohort:{tenantId}:{ageGroup}:{sex}:{period}    → métricas de cohorte
```

---

## 8. Estrategia de Seguridad y Cumplimiento

### Autenticación y autorización

```
JWT (clínicos)     → sub + tenant_id + role → RBAC interno
API Key (externos) → SHA-256 hash en DB → scopes en permissions JSONB
  Scope examples: vitality:read, vitality:write, insights:read
```

### Datos sensibles

- **PII mínimo**: en contexto Disglobal, los sujetos son referencias pseudónimas (`subjectRef`). No se almacenan nombres ni documentos.
- **Cifrado en tránsito**: TLS 1.3 obligatorio.
- **Cifrado en reposo**: PostgreSQL Transparent Data Encryption + volumen cifrado.
- **Separación de PII**: datos clínicos y datos de identidad en esquemas separados. Keyring de cifrado independiente.

### Cumplimiento regulatorio

| Regulación | Mecanismo |
|-----------|-----------|
| HIPAA (US) | Audit logs append-only, BAA con cloud provider, acceso mínimo necesario |
| GDPR (EU) | Consent records, derecho al olvido (soft-delete + purge job), DPA |
| NOM-024 (MX) | Estándares de expediente clínico digital para mercado mexicano |
| ISO 27001 | Política de acceso, gestión de vulnerabilidades, business continuity |

---

## 9. Escalabilidad y Monetización

### Tiers de producto

| Tier | Target | Precio modelo | APIs incluidas |
|------|--------|-------------|----------------|
| **BioAge Starter** | Apps consumer, HR tech | Por evaluación ($0.05–0.15 USD/call) | BioAge, Preventive Score |
| **Clinical Pro** | Clínicas, consultorios | SaaS mensual ($299–999/mes) | Todas + Dashboard |
| **Enterprise** | Hospitales, aseguradoras | Custom + Rev Share | Todas + White-label + Insights |
| **Disglobal Bundle** | Marketplace masivo | Revenue share por conversión | BioAge + Referral + Engagement |

### Modelo Disglobal

```
Disglobal envía → datos de sujeto (pseudónimo) + mediciones básicas
Vytalix retorna → BioAge + risk signals + referralCTA (si aplica)
Conversión → si usuario clickea CTA → evento 'referral.converted'
Revenue share → Disglobal: 70% / Doctor Antivejez: 30% (configurable por tenant)
```

---

## 10. Roadmap por Fases

### Fase 1 — MVP clínico (Actual: completo)
- ✅ Framingham 2008, 5 hardened rules, multi-tenancy, audit
- ✅ External API v1 (API key, LOINC ingest)
- ✅ Doctor Antivejez Next.js frontend

### Fase 2 — Vytalix BioAge API (Sprint actual)
- 🔨 BiophysicsEngine desacoplado del frontend Next.js
- 🔨 `biological_age_assessments` schema + service
- 🔨 External API v2 con `/vitality/assess`
- 🔨 Redis cache layer operativo
- 🔨 Consent records básicos

### Fase 3 — Suite Preventiva + Engagement
- 📋 PreventiveScoreService (score compuesto)
- 📋 EngagementService + events hypertable
- 📋 ReferralEngine con CTA payload
- 📋 Webhooks outbound firmados (como los actuales de decision.created)

### Fase 4 — Population Insights + Disglobal Go-Live
- 📋 InsightsService con TimescaleDB continuous aggregates
- 📋 Dashboard Disglobal (embedded iframe o API)
- 📋 Billing metering (per-call tracking)
- 📋 Self-service API key management

### Fase 5 — Expansión de dominios
- 📋 Biochemistry Age API
- 📋 Orthomolecular Score
- 📋 Genetic Age integration (3rd party lab)
- 📋 FHIR R4 full compliance

---

## 11. Riesgos y Decisiones de Diseño

| Riesgo | Mitigación |
|--------|-----------|
| Sobreingeniería prematura | APIs v2 consumen misma infraestructura RLS/Prisma existente — sin nuevo stack |
| Precisión clínica del BioAge | Posicionamiento claro: "indicador de orientación preventiva", no diagnóstico |
| Privacidad en Disglobal | Subjectores pseudónimos, sin PII. Consent record antes de primer assessment |
| Algorithm drift | `calculation_versions` table. Input snapshot inmutable en cada assessment |
| Latencia en Disglobal | Redis cache + async pipeline. Response target <300ms p99 |
| Vendor lock-in TimescaleDB | Tablas son PostgreSQL estándar. TimescaleDB es extension opcional (continuous aggregates) |

---

## 12. Conclusión Ejecutiva

Vytalix en su estado actual (MVP clínico) tiene la infraestructura de fondo correcta: multi-tenancy, RLS, Framingham implementado, 5 reglas clínicas, trazabilidad completa.

**La brecha a cerrar es la superficie de API comercial**: exponer la lógica del motor Doctor Antivejez (biophysics age) como servicio API consumible, extenderla con un score preventivo compuesto, y agregar las capas de engagement y referral que habilitan el modelo de negocio con Disglobal.

El trabajo de Fase 2 es de **6–8 semanas** para un equipo de 2 engineers. No requiere cambios al core clínico existente — es adición pura. La arquitectura soporta escalar de 10 a 10,000 tenants sin cambios estructurales.
