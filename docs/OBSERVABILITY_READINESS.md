# OBSERVABILITY_READINESS.md
> **Vytalix v2 — Readiness de Observabilidad para Piloto Disglobal**
> Versión: 0.9.0-demo | Fecha: 2026-06-05

---

## 1. Health y Liveness Probes

### GET /liveness
- **Propósito:** Verificar que el proceso está vivo sin ningún I/O.
- **Frecuencia sugerida:** Cada 10s (k8s livenessProbe).
- **Latencia esperada:** <5ms (solo lectura de memoria).
- **Criterio de fallo:** Solo si el proceso muere — siempre 200 si el servidor está corriendo.

```json
{ "status": "alive", "pid": 1234, "uptimeSec": 86400, "timestamp": "2026-06-05T12:00:00Z" }
```

### GET /readiness
- **Propósito:** Verificar conectividad a DB + Redis antes de servir tráfico.
- **Frecuencia sugerida:** Cada 30s, o antes de cualquier batch Disglobal.
- **Latencia esperada:** <100ms (depende de latencia de red a DB).
- **Criterio de fallo:** 503 si DB cae; 200 degradado si Redis cae (metering/cache desactivados pero API funcional).

```json
{
  "status": "ready",
  "version": "0.9.0-demo",
  "checks": {
    "database": { "status": "ok", "latencyMs": 3 },
    "redis":    { "status": "ok", "latencyMs": 1 }
  }
}
```

> **Instrucción Disglobal:** Verificar `/readiness` antes de iniciar cualquier sesión de batch. Si `status != "ready"`, usar `checkConnectivity()` del SDK y esperar 30s antes de reintentar.

---

## 2. Métricas JSON — GET /metrics

Métricas operacionales para dashboards internos o monitoreo del partner. Sin datos de pacientes.

```json
{
  "service": "vytalix-clinical-engine",
  "version": "0.9.0-demo",
  "uptimeSec": 86400,
  "requests": {
    "total": 12450,
    "errors": 23,
    "errorRatePct": 0.18
  },
  "latency": {
    "p50Ms": 47,
    "p95Ms": 180,
    "p99Ms": 420
  },
  "db": {
    "patients": 1247,
    "observations": 98450,
    "decisions": 3210,
    "billingEvents": 5430
  }
}
```

---

## 3. Prometheus — GET /metrics/prometheus

Endpoint nativo de Prometheus (`prom-client`). Importable en Grafana directamente.

### Métricas expuestas:

| Métrica | Tipo | Labels | Descripción |
|---|---|---|---|
| `vytalix_http_requests_total` | Counter | method, route, status_code | Total de requests HTTP |
| `vytalix_http_request_duration_seconds` | Histogram | method, route, status_code | Latencia por ruta (buckets: 50ms, 100ms, 200ms, 500ms, 1s, 2s, 5s) |
| `process_cpu_seconds_total` | Counter | — | CPU consumido por el proceso |
| `process_resident_memory_bytes` | Gauge | — | Memoria RSS |
| `nodejs_eventloop_lag_seconds` | Histogram | — | Lag del event loop de Node.js |
| `nodejs_active_handles_total` | Gauge | — | Handles activos (sockets, timers) |

### Ejemplo de scrape:
```
# HELP vytalix_http_requests_total Total number of HTTP requests
# TYPE vytalix_http_requests_total counter
vytalix_http_requests_total{method="POST",route="/api/v2/vitality/assess",status_code="200"} 1247
vytalix_http_requests_total{method="GET",route="/readiness",status_code="200"} 8640
```

### Configuración Prometheus (scrape config):
```yaml
scrape_configs:
  - job_name: 'vytalix'
    static_configs:
      - targets: ['api.vytalix.health:3001']
    metrics_path: '/metrics/prometheus'
    scrape_interval: 15s
```

---

## 4. Correlation IDs — Trazabilidad End-to-End

### Flujo:
```
Disglobal SDK → POST /api/v2/vitality/assess
  Header: X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
    ↓
  Express Middleware (server.ts): genera UUID si ausente, siempre propaga
    ↓
  Pino Logger: { correlationId: "550e8400-..." } en cada línea de log
    ↓
  Response: X-Correlation-ID: 550e8400-e29b-41d4-a716-446655440000
```

### Flujo SDK Disglobal (automático):
El SDK genera un `correlationId` por llamada y lo propaga a todos los sub-requests (assess → referral). Al llamar a soporte, el ID del `correlationId` en la respuesta es suficiente para trazar la ejecución completa en los logs de Vytalix.

---

## 5. Structured Logging (Pino JSON)

Cada línea de log es JSON estructurado. Ejemplo:

```json
{
  "level": "info",
  "time": "2026-06-05T12:00:00.123Z",
  "service": "vytalix-clinical-engine",
  "version": "0.9.0-demo",
  "env": "production",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "00000000-0000-0000-0000-000000000002",
  "method": "POST",
  "path": "/api/v2/vitality/assess",
  "status": 200,
  "ms": 52,
  "msg": "HTTP"
}
```

### PII Scrubbing:
Los campos `password`, `secret`, `token`, `authorization`, `x-api-key`, `email`, `phone`, `ssn`, `dob`, `address` son automáticamente reemplazados por `[REDACTED]` antes de ser logueados. El cuerpo completo del request nunca se loguea.

---

## 6. Alertas Recomendadas para Grafana

| Alerta | Condición | Severidad |
|---|---|---|
| Alta tasa de errores | `errorRatePct > 1%` durante 5min | 🔴 CRITICAL |
| Latencia p95 alta | `p95Ms > 500` durante 10min | ⚠️ WARNING |
| DB no disponible | `checks.database.status != ok` | 🔴 CRITICAL |
| Redis no disponible | `checks.redis.status == error` | ⚠️ WARNING |
| Quota cerca del límite | `X-Quota-Warning` en headers | ℹ️ INFO |

---

## 7. Estado de Madurez Observabilidad

| Capacidad | Estado | Notas |
|---|---|---|
| Liveness probe | ✅ LISTO | |
| Readiness probe (DB + Redis) | ✅ LISTO | |
| Correlation IDs end-to-end | ✅ LISTO | Generado o reenviado en cada request |
| Structured JSON logging | ✅ LISTO | Pino; PII scrubbing automático |
| Métricas JSON operacionales | ✅ LISTO | `/metrics` |
| Prometheus export nativo | ✅ LISTO | `/metrics/prometheus` |
| Latency histograms | ✅ LISTO | p50/p95/p99 via prom-client |
| Grafana dashboard base | ✅ EXPORTADO | `grafana-dashboard.json` |
| Distributed tracing (OpenTelemetry) | ⏳ FASE 3 | No requerido para piloto |
| Alerting rules como código | ⏳ FASE 3 | Manual en Grafana por ahora |
