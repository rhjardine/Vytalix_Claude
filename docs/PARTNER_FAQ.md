# Vytalix — FAQ Técnico
## Para evaluación por equipo de ingeniería del partner

---

### SEGURIDAD Y COMPLIANCE

**¿Cómo manejan multi-tenancy y aislamiento de datos?**

Row-Level Security (RLS) en PostgreSQL. Cada tabla clínica tiene políticas RLS activas con `FORCE ROW LEVEL SECURITY`. El contexto de tenant (`app.current_tenant_id`) se establece dentro de cada transacción como `set_config` — se limpia automáticamente al finalizar la transacción. Un bug en la aplicación que olvide incluir el tenant_id es rechazado por el motor de base de datos antes de llegar a los datos. Este es el aislamiento en la última línea de defensa posible.

**¿Está alineado con HIPAA?**

La arquitectura implementa los controles técnicos requeridos:
- Encryption at rest (PostgreSQL + disk encryption)
- Encryption in transit (TLS obligatorio en producción)
- Audit log append-only con diff antes/después en cada write
- RBAC con roles ADMIN, PHYSICIAN, CARE_COORDINATOR, VIEWER
- Minimal PII surface (no SSN, no insurance ID en MVP)
- Session management con JWT de 8h de vida

Un BAA con AWS es requerido antes de producción. La arquitectura lo facilita — todos los servicios críticos tienen versiones HIPAA-eligible en AWS.

**¿Cómo está protegida la API?**

JWT HS256 con claims `tenant_id`, `sub`, `role`. El `tenant_id` en el token se valida contra cualquier `X-Tenant-ID` header en cada request. Un token válido de un tenant no puede acceder a datos de otro. Las rutas públicas (`/health`, `/demo/status`) no requieren auth. El endpoint externo (`/api/external/observations`) usa API keys separadas con scope por tenant.

---

### ARQUITECTURA E INTEGRACIÓN

**¿Cómo integran con nuestro EMR (Epic, Cerner, Meditech)?**

Dos caminos:

*Camino 1 — Pull (FHIR):* El sistema consulta el FHIR endpoint del EMR. Soporta `Patient` y `Observation` resources (FHIR R4). Implementado en `src/ingestion/ingestion.service.ts`.

*Camino 2 — Push (API):* El EMR envía observaciones a `POST /api/external/observations` con API key. Formato flexible — FHIR simplificado, HL7, o JSON propio normalizable con el mapper configurable.

En ambos casos, Vytalix normaliza los datos (LOINC codes, unidades UCUM) internamente. El EMR no necesita cambiar su formato.

**¿Qué pasa con los datos que ya están en nuestro EMR?**

El historical data import se hace como batch via `POST /v1/observations/batch` con `continueOnError: true`. El pipeline procesa los datos históricos y reconstruye el timeline longitudinal. No se requiere que el EMR cambie nada — solo que exporte datos en cualquier formato que soportemos.

**¿Vytalix modifica datos en el EMR?**

No. Vytalix es read-only respecto al EMR. Es una capa de análisis encima. Si el médico acepta una recomendación, esa acción puede traducirse en un webhook hacia el EMR (V1), pero Vytalix nunca escribe directamente en sistemas externos.

**¿Cómo escala la ingesta de datos?**

El ingestion pipeline es stateless — escala horizontalmente detrás de un load balancer. TimescaleDB maneja el volumen de observations con particionado automático por tiempo (chunks de 1 mes). El PatientHealthSnapshot es una tabla pre-calculada — el dashboard nunca hace queries de agregación en tiempo real.

---

### DECISIONES CLÍNICAS

**¿Cómo garantizan que las decisiones son correctas?**

Tres capas:
1. Reglas determinísticas hardened (5 reglas clínicas basadas en guías ACC/AHA y ADA con evidencia publicada)
2. Framingham 2008 updated — algoritmo de scoring cardiovascular validado clínicamente
3. DecisionTrace inmutable — cada decisión registra exactamente qué datos existían, qué regla se activó, y por qué

El sistema nunca usa generación libre de LLM para decisiones clínicas. Las narrativas de explicabilidad son templates determinísticos parametrizados con datos reales.

**¿El médico siempre tiene la última palabra?**

Sí, por diseño. El sistema genera `PENDING` recommendations. Ninguna acción clínica ocurre sin revisión del médico (ACCEPTED, REJECTED, DEFERRED). El flujo es "physician-in-the-loop", no autónomo.

**¿Qué pasa si cambian las guías clínicas?**

Los umbrales de las reglas están en la base de datos como `ProtocolRules`, no en el código. Un administrador puede actualizar los umbrales sin despliegue. Las reglas hardened (H-001 a H-005) requieren un cambio de código — esto es intencional: son las reglas de seguridad clínica que no deben cambiar sin revisión de ingeniería.

---

### OPERACIONES Y OBSERVABILIDAD

**¿Cómo monitorean el sistema en producción?**

`GET /health` — estado de DB y Redis, latencia de checks.
`GET /metrics` — request count, error rate, latencia p50/p95, conteo de registros en DB.

Los logs son JSON estructurado (pino) con `correlation_id`, `tenant_id`, `user_id` en cada entrada. Compatible con CloudWatch Logs, Datadog, Grafana.

**¿Qué tan rápido responde el sistema?**

- Query de timeline 12 meses (TimescaleDB): < 150ms
- Patient dashboard (snapshot + decisiones): < 80ms
- Generación de decisión completa (pipeline): < 2s
- Ingestión de observación single: < 100ms

**¿Cómo hacen rollback si una actualización rompe algo?**

Las migraciones de Prisma son versionadas y reversibles. El schema de base de datos tiene versiones incrementales. Los contratos de API están versionados (v1, v1.1) — una nueva versión no rompe consumidores existentes. Los modelos de scoring están versionados por `algorithmVersion` — scores históricos son siempre reproducibles con la versión que los generó.

---

### MODELO COMERCIAL Y PILOTO

**¿Cuánto tiempo tarda implementar un piloto?**

Con acceso a datos de pacientes (CSV o FHIR endpoint), un piloto funcional tarda entre 2 y 4 semanas:
- Semana 1: Integración de ingestión de datos
- Semana 2: Validación de datos y calibración de reglas
- Semana 3-4: Acceso al dashboard para médicos piloto + feedback

**¿Qué datos necesitan de nuestra parte para el piloto?**

Mínimo: historial de laboratorios (lípidos, glucosa) y presión arterial en formato CSV o FHIR R4 para un conjunto de pacientes de prueba (puede ser de-identificado). El sistema genera inteligencia útil con tan solo 2-3 observaciones por paciente.

**¿Funciona con datos de-identificados para la prueba?**

Sí. El sistema puede operar con datos sintéticos o de-identificados para la fase de validación. La de-identificación no afecta la capacidad de scoring ni la generación de tendencias.
