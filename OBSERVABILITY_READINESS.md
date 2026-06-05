# OBSERVABILITY_READINESS.md
> **Vytalix Platform — Observability & Telemetry Readiness**

## 1. Métricas de Prometheus (`/metrics/prometheus`)
Se ha integrado `prom-client` para la generación estándar de métricas operacionales.
El sistema exporta en el endpoint público `/metrics/prometheus`:
- **Node.js Default Metrics**: GC, event loop lag, CPU, memoria (`vytalix_` prefix).
- **Métricas de Tráfico (Custom)**:
  - `vytalix_http_requests_total` (Counter): Cuenta los requests segmentados por `method`, `route` y `status_code`.
  - `vytalix_http_request_duration_seconds` (Histogram): Mide la latencia de respuesta, con buckets optimizados para APIs clínicas rápidas (50ms a 5s).

## 2. Health & Readiness Probes (`/liveness`, `/readiness`)
Para integraciones Kubernetes/Orquestadores y el orchestrador de batch de Disglobal:
- **`GET /liveness`**: Ligero (< 1ms). Verifica si el proceso y event loop viven.
- **`GET /readiness`**: Profundo. Verifica conectividad DB y Redis. Retorna HTTP `503` si una dependencia dura (DB) está caída.

## 3. Trazabilidad Distribuida (`X-Correlation-ID`)
El middleware global inicializa un `UUID` en cada request entrante (si no viene provisto) y:
- Lo inserta de vuelta en el response HTTP header.
- Lo inyecta en cada entrada del log (`logger.pino`).
- El SDK de Disglobal (`disglobal-client.ts`) propaga el mismo Correlation ID en cascada cuando realiza llamadas secundarias (como a `ReferralEngine`), manteniendo la cadena ininterrumpida.

## 4. Logs Clínicos y de Pilot
- **JSON Estructurado**: En entorno de producción (`NODE_ENV=production`), los logs son emitidos en JSON puro para ingesta directa de Datadog o CloudWatch.
- **Auditoría de Dominio**: Funciones especializadas en `logger.ts` (`clinicalLog.observationIngested`, `apiCallLog.request`) exponen de forma limpia las operaciones de negocio y las llamadas externas separándolas del ruido transaccional.

**Conclusión:** Vytalix es totalmente monitoreable. Los equipos de SRE y partners pueden visualizar anomalías, caídas de tráfico y la distribución de latencias usando Grafana y Prometheus scraping.
