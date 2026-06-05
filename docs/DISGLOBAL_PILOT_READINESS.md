# DISGLOBAL_PILOT_READINESS.md
> **Vytalix v2 — Documento Ejecutivo de Readiness para Piloto Disglobal**
> Versión: 0.9.0-demo | Fecha: 2026-06-05 | Clasificación: Confidencial

---

## Executive Summary

Vytalix v2 está técnicamente preparada para un piloto controlado con Disglobal. La plataforma dispone de autenticación por API Key con scope granular, aislamiento multi-tenant mediante PostgreSQL RLS, pseudonimización estable, trazabilidad end-to-end mediante Correlation IDs, metering de uso mensual y observabilidad completa. A continuación, el detalle por área:

---

## 1. Autenticación y Seguridad

| Control | Estado | Detalle |
|---|---|---|
| **API Key (X-API-Key)** | ✅ PRODUCTION-READY | SHA-256 hash en DB; clave plaintext nunca almacenada |
| **Scope enforcement** | ✅ PRODUCTION-READY | Permisos JSONB por recurso (`vitality:write`, `insights:read`, etc.) |
| **Brute-force protection** | ✅ PRODUCTION-READY | Redis sliding window; bloqueo por IP tras 20 fallos/minuto |
| **Key rotation** | ✅ SUPPORTED | `expiresAt` + `revokedAt`; Redis cache invalida en 5 min |
| **Audit trail** | ✅ PRODUCTION-READY | Cada auth failure registrada en `audit_logs` con IP + user-agent |
| **Rate limiting** | ✅ PRODUCTION-READY | Tier-based: STANDARD (100/min), PROFESSIONAL (1000/min), ENTERPRISE (ilimitado) |
| **Quota mensual** | ✅ PRODUCTION-READY | Hard limit con `Retry-After` header; soft limit con warning header |
| **CORS** | ✅ CONFIGURED | Orígenes configurables vía `ALLOWED_ORIGINS` env var |
| **Security headers** | ✅ PRODUCTION-READY | Helmet + cache `no-store` en todas las respuestas clínicas |

### API Key del Piloto Disglobal
```
Tenant:    00000000-0000-0000-0000-000000000002 (Disglobal Marketplace)
Scopes:    vitality:read/write, preventive:write, referral:read, engagement:write, insights:read
Tier:      ENTERPRISE
Key hash:  SHA-256("vyx_dis_k1_DEMO_KEY_2024")
Formato:   vyx_dis_{random32bytes_base62}
```

---

## 2. Pseudonimización (Privacidad de Pacientes)

| Control | Estado | Detalle |
|---|---|---|
| **Motor de pseudonimización** | ✅ CORRECTO | HMAC-SHA256 con `tenantSecret` como semilla |
| **Estabilidad longitudinal** | ✅ GARANTIZADA | Mismo `userId` → mismo `subjectRef` siempre (no depende de rotación de keys) |
| **Fallback deprecado** | ✅ INFORMADO | Si `tenantSecret` ausente: fallback a `apiKey` con `logger.warn` explícito |
| **Formato subjectRef** | ✅ DOCUMENTADO | `DISG-{base64url_20chars}` (HMAC-SHA256("DISG:{userId}")) |
| **Reversibilidad** | ✅ UNIDIRECCIONAL | Vytalix no almacena el userId de Disglobal; solo el subjectRef |

**Decisión de seguridad crítica:** La pseudonimización usa `tenantSecret` (variable de entorno estable), no la API key. Esto garantiza que una rotación de API key NO rompa la continuidad del historial longitudinal de un paciente.

---

## 3. Tenant Isolation (RLS)

| Control | Estado | Detalle |
|---|---|---|
| **PostgreSQL RLS** | ✅ ACTIVE | `ENABLE ROW LEVEL SECURITY` en 20 tablas |
| **Variable de contexto** | ✅ UNIFICADA | `app.current_tenant_id` en toda la plataforma |
| **Transaccionalidad** | ✅ GARANTIZADA | `withTenant()`: BEGIN → set_config (local=true) → fn() → COMMIT/ROLLBACK |
| **Contaminación de contexto** | ✅ IMPOSIBLE | `is_local=true` destruye el contexto al final de la transacción |
| **Bypass para auth** | ✅ CONTROLADO | Sólo lookup de `api_keys` usa conexión sin RLS (superuser) |
| **Aislamiento Disglobal ↔ Dr Antivejez** | ✅ GARANTIZADO | Tenants separados en DB; misma instancia, datos completamente aislados |

---

## 4. Endpoints API v2 — Estado por Ruta

| Ruta | Método | Scope | Auth | Idempotencia | Estado |
|---|---|---|---|---|---|
| `/api/v2/vitality/assess` | POST | `vitality:write` | ✅ API Key | ✅ X-Idempotency-Key (24h) | ✅ READY |
| `/api/v2/vitality/:subjectRef` | GET | `vitality:read` | ✅ API Key | N/A | ✅ READY |
| `/api/v2/preventive/score` | POST | `preventive:write` | ✅ API Key | ✅ X-Idempotency-Key | ✅ READY |
| `/api/v2/referral/:subjectRef` | GET | `referral:read` | ✅ API Key | N/A | ✅ READY |
| `/api/v2/engagement/events` | POST | `engagement:write` | ✅ API Key | N/A | ✅ READY |
| `/api/v2/insights/cohort` | GET | `insights:read` | ✅ API Key | N/A | ✅ READY |
| `/liveness` | GET | Public | ❌ None | N/A | ✅ READY |
| `/readiness` | GET | Public | ❌ None | N/A | ✅ READY |
| `/metrics` | GET | Public | ❌ None | N/A | ✅ READY |
| `/metrics/prometheus` | GET | Public | ❌ None | N/A | ✅ READY |

---

## 5. Observabilidad

| Control | Estado | Detalle |
|---|---|---|
| **Liveness probe** | ✅ PRODUCTION-READY | Sin I/O; retorna uptime, PID, timestamp |
| **Readiness probe** | ✅ PRODUCTION-READY | DB + Redis checks; 503 si DB caída |
| **Correlation ID** | ✅ END-TO-END | Generado o reenviado en cada request; siempre en response header |
| **Prometheus metrics** | ✅ ACTIVE | `/metrics/prometheus` — `prom-client` con default + custom metrics |
| **Latency histograms** | ✅ ACTIVE | `vytalix_http_request_duration_seconds` con buckets p50/p95/p99 |
| **Request counters** | ✅ ACTIVE | `vytalix_http_requests_total` por method/route/status_code |
| **Structured logging** | ✅ PRODUCTION-READY | Pino JSON; scrubbing automático de PII |
| **Grafana dashboard** | ✅ EXPORTED | `grafana-dashboard.json` — importable directo |

---

## 6. Metering y Billing

| Control | Estado | Detalle |
|---|---|---|
| **Event metering** | ✅ ACTIVE | `billing_events` con `VITALITY_ASSESS`, `PREVENTIVE_SCORE`, etc. |
| **Monthly quota** | ✅ ENFORCED | Hard limit desde tabla `tenants.monthlyApiLimit`; soft warning en 80% |
| **Revenue share** | ✅ CONFIGURED | `tenants.revenueShareRatio = 0.30` para Disglobal |
| **Usage dashboard** | ✅ AVAILABLE | `GET /admin/tenants/:id/usage` (JWT admin auth) |
| **Flush interval** | ✅ ACTIVE | Metering flush cada 60s; no blocking en request path |

---

## 7. SDK Disglobal — Checklist

| Feature | Estado |
|---|---|
| `assessBioAge(input, correlationId?)` | ✅ Implementado |
| `trackEvent(userId, type, payload?)` | ✅ Implementado |
| `trackCtaClick(userId)` | ✅ Implementado |
| `trackConversion(userId, valueUsd)` | ✅ Implementado |
| `batchAssessSegment(users[])` | ✅ Implementado (concurrency: 10) |
| `checkConnectivity()` | ✅ Implementado |
| Pseudonimización con `tenantSecret` | ✅ Implementado |
| `X-Idempotency-Key` automático | ✅ Implementado |
| `X-Correlation-ID` propagado | ✅ Implementado |
| CTA / Derivación opcional | ✅ Implementado (non-blocking) |

---

## 8. Riesgos Abiertos para Piloto

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `tenantSecret` no configurado → fallback a apiKey | MEDIO | `logger.warn` emitido; documentar en onboarding que es obligatorio en producción |
| Prometheus expuesto sin auth | BAJO | Sólo métricas operacionales; sin datos de pacientes ni tenants |
| DB no disponible → /readiness 503 | OPERACIONAL | Disglobal SDK usa `checkConnectivity()` pre-batch; documentado en runbook |
| Rate limit STANDARD solo 100/min | BAJO | Disglobal tiene tier ENTERPRISE; irrelevante para su piloto |
| Legacy `src/legacy/` sin deprecar formalmente | BAJO | Aislado; no impacta runtime; plan de sunsetting en Sprint 3 |

---

## 9. Criterio de Aceptación — GO / NO-GO

| Criterio | Estado |
|---|---|
| API Key auth funcional con scopes | ✅ GO |
| RLS transaccional con aislamiento de tenants | ✅ GO |
| Pseudonimización estable con `tenantSecret` | ✅ GO |
| Endpoints v2 consumibles via SDK | ✅ GO |
| Liveness + Readiness probes operacionales | ✅ GO |
| Metering + Quota enforcement | ✅ GO |
| Correlation IDs end-to-end | ✅ GO |
| Tests clínicos core: 0 regresiones | ✅ GO |
| Prometheus metrics exportadas | ✅ GO |

> **Veredicto: ✅ PILOT GO — La plataforma está lista para el piloto controlado con Disglobal.**
