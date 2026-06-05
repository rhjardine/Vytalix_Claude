# DISGLOBAL_READY_FOR_PILOT.md
> Vytalix Platform — Estado de readiness comercial para piloto Disglobal  
> Actualizado: 2026-06-04 | Versión: 0.9.0-demo | Sprint 3 (Commercial Readiness)

---

## Resumen ejecutivo

La plataforma Vytalix está **lista para piloto externo con Disglobal** bajo las condiciones descritas en este documento.
El núcleo clínico, las APIs v2, la autenticación, el metering y la trazabilidad están implementados y verificados.
Los ítems pendientes son de infraestructura operacional (deploy, DNS, certificados TLS) y no bloquean el piloto en entorno controlado.

---

## Estado por componente

### 1. APIs Externas v2 (`/api/v2/*`)

| Endpoint | Estado | Scope requerido | Notas |
|----------|--------|-----------------|-------|
| `POST /api/v2/vitality/assess` | ✅ LISTO | `vitality:write` | Motor biofísico determinista, idempotencia, inputSnapshot |
| `GET  /api/v2/vitality/:subjectRef` | ✅ LISTO | `vitality:read` | Retorna último resultado por pseudónimo |
| `POST /api/v2/preventive/score` | ✅ LISTO | `preventive:write` | Score compuesto 4 componentes, clasificación por tier |
| `GET  /api/v2/referral/:subjectRef` | ✅ LISTO | `referral:read` | Triggers T1-T4, prioridad, CTA URL determinista |
| `POST /api/v2/engagement/events` | ✅ LISTO | `engagement:write` | Hasta 50 eventos por lote |
| `GET  /api/v2/insights/cohort` | ✅ LISTO | `insights:read` | Mínimo 50 pacientes (privacy threshold) |

### 2. Autenticación y Seguridad

| Componente | Estado | Detalle |
|-----------|--------|---------|
| API Key auth (`X-API-Key`) | ✅ LISTO | Hash SHA-256, nunca en texto plano, cache Redis 5min |
| Scope enforcement | ✅ LISTO | Matriz de permisos JSONB por key, wildcard support |
| Rate limiting (sliding window) | ✅ LISTO | STANDARD: 100/min · PROFESSIONAL: 1000/min · ENTERPRISE: ilimitado |
| Brute force protection | ✅ LISTO | 20 fallos/min por IP → bloqueo 60s |
| Idempotency (`X-Idempotency-Key`) | ✅ LISTO | TTL 24h, replay exacto de response |
| Correlation ID (`X-Correlation-ID`) | ✅ LISTO | Forward o auto-generate, siempre en response header |
| HMAC webhook signature | ✅ LISTO | SHA-256, replay prevention (±5 min) |
| PII scrubber en logs | ✅ LISTO | Campos sensibles → [REDACTED] automáticamente |
| Security headers (Helmet) | ✅ LISTO | CSP, X-Frame-Options, Referrer-Policy, Cache-Control |
| Multi-tenant RLS (PostgreSQL) | ✅ LISTO | SET LOCAL en transacción explícita, variable unificada |

### 3. SDK Disglobal (`disglobal-client.ts`)

| Feature | Estado | Detalle |
|---------|--------|---------|
| `assessBioAge(input, correlationId?)` | ✅ LISTO | Mapeo ES→EN, pseudonimización HMAC-SHA256, CTA opcional |
| `trackEvent(userId, type, payload, correlationId?)` | ✅ LISTO | Eventos de engagement con correlationId propagado |
| `trackCtaClick(userId)` | ✅ LISTO | Funnel de conversión |
| `trackConversion(userId, valueUsd)` | ✅ LISTO | Revenue share trigger |
| `batchAssessSegment(users)` | ✅ LISTO | Batches de 10, Promise.allSettled |
| `checkConnectivity()` | ✅ LISTO | Consulta `/readiness` antes de iniciar batch |
| `X-Correlation-ID` propagado | ✅ LISTO | Todos los HTTP calls incluyen correlationId |
| Pseudonimización longitudinal | ✅ LISTO | HMAC-SHA256 con `tenantSecret` estable |
| Fallback `apiKey` deprecado | ⚠️ ADVERTENCIA | Logger.warn visible; Fase 2: `tenantSecret` obligatorio |

### 4. Metering y Billing

| Componente | Estado | Detalle |
|-----------|--------|---------|
| Eventos de metering (fire-and-forget) | ✅ LISTO | Redis stream → DB flush cada 60s, nunca bloquea request |
| Precios por operación | ✅ LISTO | VITALITY_ASSESS: $0.15, PREVENTIVE_SCORE: $0.10, etc. |
| Quota mensual (soft/hard) | ✅ LISTO | Warning al 80%, bloqueo al 100% (configurable por tenant) |
| Revenue share 70/30 | ✅ LISTO | Configurable por tenant, `computeRevenueShare()` |
| Fallback DB si Redis falla | ✅ LISTO | `getMonthlyUsageFromDb()` automático |

### 5. Observabilidad

| Endpoint | Estado | Uso |
|----------|--------|-----|
| `GET /liveness` | ✅ NUEVO | k8s livenessProbe — no I/O, siempre rápido |
| `GET /readiness` | ✅ NUEVO | k8s readinessProbe + Disglobal batch guard — DB + Redis |
| `GET /health` | ✅ LISTO | Alias de /readiness — Docker HEALTHCHECK, compatibilidad |
| `GET /metrics` | ✅ MEJORADO | p50/p95/p99, error_rate, DB counters, billing_events |
| Structured logging (pino) | ✅ LISTO | JSON en prod, pretty en dev, correlationId en cada entrada |
| `apiCallLog.request/response` | ✅ NUEVO | Traceability por operación para piloto Disglobal |
| `clinicalLog.*` | ✅ LISTO | Eventos clínicos auditables (observation, risk, decision) |
| Audit trail DB (`audit_logs`) | ✅ LISTO | Cada fallo de auth escrito en DB |

### 6. Lógica Clínica

| Motor | Estado | Algoritmo | Tests |
|-------|--------|-----------|-------|
| `BiophysicsEngine` | ✅ LISTO | `daaa-biophysics-v2.1.0` | 42 tests ✅ |
| `PreventiveScoreService` | ✅ LISTO | `preventive-composite-v1.0.0` | 49 tests ✅ |
| `ReferralEngine` | ✅ LISTO | `referral-engine-v1.1.0` | 37 tests ✅ |
| Trazabilidad clínica | ✅ LISTO | `algorithmVersion` + `inputSnapshot` en todos los resultados |
| Determinismo | ✅ VERIFICADO | PIN tests — mismos inputs → exactamente mismo output |

---

## Contrato de Integración

### Request de ejemplo: `POST /api/v2/vitality/assess`

```http
POST https://api.vytalix.health/api/v2/vitality/assess
Content-Type: application/json
X-API-Key: vyx_dis_k1_AbCdEfGhIjKlMnOpQrStUvWx
X-Idempotency-Key: disg-session-20260604-001
X-Correlation-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890

{
  "subjectRef": "DISG-Xk2mR9pLqN8vTz",
  "chronologicalAge": 42,
  "biologicalSex": "MALE",
  "isAthlete": false,
  "measurements": {
    "fatPercentage": 22.5,
    "bmi": 25.8,
    "digitalReflexes": { "high": 1.1, "long": 14.2, "width": 8.3 },
    "visualAccommodation": 2.8,
    "staticBalance": { "high": 10.5, "long": 25.0, "width": 7.2 },
    "skinHydration": 44.0,
    "systolicPressure": 128.0,
    "diastolicPressure": 82.0
  }
}
```

### Response `200 OK`

```json
{
  "assessmentId": "550e8400-e29b-41d4-a716-446655440000",
  "biologicalAge": 39.5,
  "differentialAge": -2.5,
  "ageStatus": "REJUVENECIDO",
  "partialAges": {
    "fatAge": 40.0, "bmiAge": 41.5, "reflexesAge": 38.0,
    "visualAge": 36.5, "balanceAge": 37.0, "hydrationAge": 40.5,
    "systolicAge": 38.0, "diastolicAge": 42.0
  },
  "algorithmVersion": "daaa-biophysics-v2.1.0",
  "assessedAt": "2026-06-04T23:00:00.000Z"
}
```

### Response `422 Unprocessable Entity` (validación fallida)

```json
{
  "type": "https://api.vytalix.health/errors/422",
  "title": "Validation Failed",
  "status": 422,
  "detail": "Validation failed",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "errors": [
    { "field": "measurements.fatPercentage", "message": "Required", "code": "invalid_type" }
  ]
}
```

### Response `429 Too Many Requests`

```json
{
  "type": "https://api.vytalix.health/errors/429",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded for tier STANDARD. Limit: 100 req/min.",
  "correlationId": "a1b2c3d4-..."
}
```
_Headers:_ `Retry-After: 60`, `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: 0`

---

## Checklist de dependencias para piloto

### Infraestructura (responsabilidad Vytalix/DevOps)

- [ ] **PostgreSQL 15+** con extensiones `uuid-ossp`, `pgcrypto`, `pg_row_level_security` habilitadas
- [ ] **Migraciones ejecutadas**: `migration_rls.sql` + Prisma migrations
- [ ] **Redis 7+** (`REDIS_URL` configurado en entorno)
- [ ] **Baremos clínicos seeded**: `biophysics_boards` con datos de Doctor Antivejez
- [ ] **TLS/HTTPS** habilitado en endpoint de producción
- [ ] **ALLOWED_ORIGINS** configurado para dominio Disglobal
- [ ] **LOG_LEVEL=info** en producción, `pino-pretty` solo en desarrollo

### Aprovisionamiento Disglobal (responsabilidad operaciones)

- [ ] **Crear API Key Disglobal** (una sola por tenant inicial):
  ```sql
  INSERT INTO api_keys (id, "tenantId", name, "keyHash", permissions, "rateLimitTier")
  VALUES (
    gen_random_uuid(),
    '<disglobal_tenant_uuid>',
    'Disglobal Pilot Key',
    sha256('<key_plain>'),
    '{"vitality":["read","write"],"preventive":["write"],"referral":["read"],"engagement":["write"],"insights":["read"]}'::jsonb,
    'PROFESSIONAL'
  );
  ```
- [ ] **Configurar `tenantSecret`** en Disglobal (distinto de `apiKey`, estable, ≥ 32 bytes)
- [ ] **Validar conectividad** con `client.checkConnectivity()` antes del primer batch
- [ ] **Smoke test** end-to-end con un usuario de prueba

### Validación técnica previa al piloto

- [ ] `GET /readiness` → `200 { "status": "ready" }`
- [ ] `GET /health` → `200 { "status": "ok" }`
- [ ] `POST /api/v2/vitality/assess` con datos de prueba → `200` con `biologicalAge` válida
- [ ] `GET /api/v2/referral/DISG-test` → `200 { "eligible": true/false }`
- [ ] `GET /api/v2/insights/cohort` con cohort ≥ 50 → datos agregados
- [ ] Verificar `X-Correlation-ID` en response headers de todas las llamadas
- [ ] Verificar que rate limiting retorna `Retry-After` correctamente
- [ ] Verificar que idempotency replay retorna `X-Idempotent-Replayed: true`

---

## Riesgos del piloto

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| DB indisponible → todos los endpoints fallan | BAJA | ALTO | `/readiness` check antes de batches; retry con backoff |
| Redis indisponible → metering degradado, rate limiting falla abierto | MEDIA | MEDIO | Degradación graceful; DB fallback para uso mensual |
| Fallback `apiKey` para pseudonimización usado indefinidamente | MEDIA | MEDIO | Logger.warn activo; Fase 2 (próximo sprint): `tenantSecret` obligatorio |
| Cohort < 50 pacientes en `/insights/cohort` durante piloto | ALTA | BAJO | Endpoint retorna `cohortTooSmall: true`, no es un error |
| Token de CTA URL no es HMAC firmado (solo base64) | BAJA | BAJO | Fase 2: reemplazar con HMAC-SHA256; aceptable para piloto |
| `biophysics_boards` vacíos → fallback a defaults hardcoded | MEDIA | MEDIO | Verificar seed antes del piloto; baremos femeninos como offset |
| Baremos femeninos con offset hardcoded (+7pp grasa) no versionados en DB | BAJA | BAJO | Documentado en `CLINICAL_ARCHITECTURE.md`; migrar en Fase 3 |
| Sin Prometheus/alertas automáticas en piloto | ALTA | BAJO | Monitoreo manual vía `/metrics`; Fase 4: Prometheus |

---

## Siguiente paso recomendado

> **Recomendación: Piloto controlado (Fase 1) — 2 semanas, 1 tenant Disglobal, datos reales bajo supervisión**

### Secuencia de activación

```
Semana 1 (Técnica):
  1. Deploy backend Vytalix en entorno staging
  2. Ejecutar migration_rls.sql + seed baremos
  3. Crear API Key Disglobal (PROFESSIONAL tier)
  4. Entregar API Key + tenantSecret a equipo Disglobal de forma segura
  5. Disglobal ejecuta checkConnectivity() → valida readiness
  6. Smoke test con 5 usuarios de prueba

Semana 2 (Piloto real):
  7. Disglobal integra SDK en flujo de assessments de marketplace
  8. Monitorear /metrics cada 2h
  9. Revisar audit_logs diariamente
  10. Evaluar revenue share report al final de la semana
```

### Criterios de éxito del piloto

- `POST /api/v2/vitality/assess` con latencia p95 < 500ms
- 0 errores 5xx no explicados
- Al menos 1 conversión registrada en `referral_events`
- `X-Correlation-ID` trazable en todos los logs del flujo
- Metering preciso: billing_events == número real de llamadas exitosas

---

## No incluido en este Sprint (deuda técnica documentada)

| Ítem | Sprint objetivo |
|------|----------------|
| `/metrics/prometheus` (Prometheus text format) | Sprint 4 |
| Alertas automáticas (PagerDuty / Grafana) | Sprint 4 |
| `tenantSecret` obligatorio (deprecar fallback apiKey) | Sprint 4 |
| Webhooks outbound desde Vytalix hacia Disglobal | Sprint 4 |
| Token CTA URL → HMAC-SHA256 firmado | Sprint 4 |
| Baremos femeninos versionados en DB | Sprint 4 |
| `outputSnapshot` en preventive score persistence | Sprint 4 |
| Endpoint `POST /api/v2/consent` para registro de consentimiento | Sprint 5 |
| Portal de autoservicio para API keys (sin SQL manual) | Sprint 5 |
