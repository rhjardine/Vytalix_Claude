# SECURITY_HARDENING_REPORT.md
> **Vytalix Platform — Sprint 3 Security Hardening**

## 1. Protección contra Brute Force y Rate Limiting
- **API Keys**: Resolución segura mediante caché Redis. Hashes almacenados (`SHA-256`), nunca texto plano.
- **Rate Limiting**: Implementado vía Sliding Window en Redis (`hardening.middleware.ts`), manejando tiers (STANDARD, PROFESSIONAL, ENTERPRISE).
- **Brute Force Protection**: Las solicitudes fallidas por IP (`MISSING_API_KEY`, `INVALID_API_KEY`) registran fallos en Redis. Al superar 20 en 1 min, se aplica bloqueo temporal por 60s.

## 2. Aislamiento de Tenants (RLS)
- **Política**: `tenant_isolation` activada en **todas** las tablas de dominio (patients, observations, scores, etc.).
- **Contexto Transaccional**: El middleware `withTenant` (`db.ts`) ahora usa transacciones explícitas (`BEGIN`...`COMMIT`) que envuelven `set_config('app.current_tenant_id', id, true)`.
- **Prevención de Fugas**: Debido al `is_local = true`, el contexto se destruye automáticamente al final de la transacción o en caso de error, previniendo fuga de datos entre requests que compartan conexiones del pool.

## 3. Manejo de PII y Pseudonimización
- **Log Scrubber**: Los logs estructurados omiten automáticamente campos sensibles (ej. `email`, `ssn`, tokens) en `logger.ts` utilizando máscaras `[REDACTED]`.
- **Pseudonimización (Disglobal)**: En el `disglobal-client.ts`, el identificador de usuario se enmascara usando `HMAC-SHA256` combinado con un `tenantSecret`.
- **Resolución**: Se documentó el deprecado temporal del uso de `apiKey` como semilla de HMAC, recomendando fuertemente el `tenantSecret` para no romper el historial longitudinal ante una rotación de keys.

## 4. Trazabilidad
- Todas las operaciones emiten eventos `apiCallLog` (request/response/quota).
- Uso forzado de `X-Correlation-ID` de extremo a extremo, facilitando la auditoría de un assessment biofísico desde el API Gateway hasta los logs de recomendación clínica.

**Conclusión:**
Las capas de red, base de datos y logs están fortificadas para el piloto sin comprometer la velocidad ni la lógica existente.
