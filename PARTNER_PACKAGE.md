# Vytalix — Partner Package
## Para: Grupo NueveOnce (u otro partner técnico)

---

## Brochure técnico (1 página)

**Vytalix Clinical Intelligence Engine** es una capa de análisis clínico que se conecta a sistemas médicos existentes vía API.

**Lo que hace:**
Convierte observaciones clínicas longitudinales en decisiones médicas accionables con explicabilidad determinística completa.

**Lo que NO hace:**
No reemplaza EMRs. No diagnostica. No actúa de forma autónoma. Augmenta al médico.

**Diferenciador técnico real:**
Cada recomendación incluye un `DecisionTrace` inmutable: qué datos existían, qué regla se activó, con qué guía clínica, con qué nivel de evidencia. Reproducible 5 años después.

**Stack:** Node.js 20 + TypeScript · PostgreSQL 15 + TimescaleDB · Next.js 14
**Auth:** JWT + Row-Level Security en PostgreSQL (aislamiento en motor de DB, no en app)
**Integración:** API REST + FHIR simplificado + Webhook firmado (HMAC-SHA256)
**Deploy:** Docker Compose → AWS ECS (mismo Dockerfile)

---

## Demo script — 90 segundos

*Para cuando solo hay tiempo para una impresión. Un punto por vez.*

**[0–20s] El problema:**
> "Este paciente tiene 56 años. Sus últimos tres laboratorios de LDL fueron 162, 188, y 213 mg/dL.
> Ningún valor individual es una emergencia. Pero la tendencia sí lo es.
> Su médico hoy solo ve el 213. Vytalix ve los tres."

**[20–50s] La solución:**
> "El sistema detectó el patrón, calculó un riesgo cardiovascular de 34.2% a 10 años
> usando Framingham 2008, y generó esta alerta."
*(Mostrar la alerta en el dashboard)*
> "Esta es la explicación que recibe el médico: qué datos la soportan, qué la cuestiona,
> qué datos faltan, y la guía clínica de referencia. Sin caja negra."

**[50–90s] La arquitectura:**
> "Esto se integra con su EMR vía API. Una línea de código para enviar datos,
> un webhook para recibir alertas. El médico trabaja en su sistema actual.
> Vytalix trabaja en segundo plano."

---

## Narrativa 3 capas

### Capa 1 — Ejecutiva (5 minutos, sin tecnicismos)

**Problema:** Los médicos toman decisiones con datos del momento presente. Los patrones de deterioro que se desarrollan en semanas o meses son invisibles en el flujo clínico normal.

**Solución:** Vytalix actúa como una capa de memoria clínica longitudinal. Ve lo que el médico no puede ver por limitaciones de tiempo y herramientas.

**Modelo de integración:** API-first. No reemplaza lo que ya tienen. Se conecta encima.

**Riesgo de no adoptarlo:** Pacientes de alto riesgo que hoy se escapan del radar hasta que la condición es más cara de tratar.

---

### Capa 2 — Técnica (20 minutos, para ingeniería)

**Pipeline clínico determinístico:**
```
Observación → Validación LOINC + bounds → Normalización → Snapshot → 
Risk Score (Framingham 2008) → 5 reglas hardened → DecisionTrace → Narrativa
```

**Multi-tenancy:** Row-Level Security en PostgreSQL. No es un filtro en la aplicación — es una política en el motor. `SET LOCAL app.current_tenant = <uuid>` dentro de cada transacción. Si hay un bug que olvide el WHERE, el motor lo rechaza.

**Explainability sin LLM libre:** Cada `DecisionTrace` es un registro inmutable con: reglas evaluadas, valores exactos usados, referencia a guía clínica, nivel de evidencia. Reproducible. No hay texto generado no verificable.

**Integración externa:**
```bash
curl -X POST /api/external/observations \
  -H "X-API-Key: <key>" \
  -d '{"patientMrn":"...", "observations":[...]}'
# → pipeline → webhook decision.created firmado HMAC-SHA256
```

**Escala:** TimescaleDB particiona observaciones por mes. Query de timeline 12 meses: <150ms. PatientHealthSnapshot actualizado por DB trigger (no polling). Stateless API — escala horizontalmente.

---

### Capa 3 — Diferencial (cuándo alguien pregunta "¿por qué esto y no X?")

La diferencia no está en las features — está en la arquitectura de la confianza.

Un sistema de alertas dice: "LDL = 213 — fuera de rango."

Vytalix dice: "LDL 213 mg/dL ≥ umbral ACC/AHA 190 mg/dL (Grado I, Nivel B-R). Tendencia: +31.5% en 6 meses. Factores que lo refuerzan: [lista]. Factores que lo matizan: [lista]. Datos que faltan: [lista]. Confianza: ALTA. Referencia: Guía ACC/AHA 2018."

Y eso puede reproducirse exactamente dentro de 5 años, para cualquier auditoría, sin depender de que el modelo que lo generó siga existiendo.

Eso es lo que diferencia inteligencia clínica de una alerta de umbral.

---

## FAQ técnico honesto

**¿Qué integraciones están implementadas hoy?**
Endpoint REST para ingestión manual y por CSV. FHIR R4 simplificado (Patient y Observation resources). Webhook de salida firmado. Integración nativa con Epic o Cerner: en roadmap V1, no en MVP.

**¿Están certificados HIPAA?**
La arquitectura implementa los controles técnicos requeridos (encryption at rest y in transit, audit log append-only, RBAC, RLS). La certificación formal requiere BAA con AWS y un proceso de evaluación. No afirmamos certificación que no tenemos.

**¿Qué modelos de ML usan?**
En MVP: Framingham 2008 Updated (algoritmo determinístico, no ML). Las reglas clínicas son explícitas, no aprendidas. El roadmap V1 incluye modelos de predicción como capa secundaria, siempre con reglas determinísticas como primera línea.

**¿Cómo manejan multi-tenancy?**
Row-Level Security en PostgreSQL. Cada query se ejecuta dentro de una transacción con `SET LOCAL app.current_tenant = <uuid>`. Si el código application olvida el filtro, el motor lo rechaza. Demostrable en vivo con psql.

**¿Qué pasa si el sistema falla durante uso clínico?**
Vytalix es un sistema de soporte, no de ejecución. Si Vytalix falla, el médico continúa trabajando en su EMR habitual. Las alertas no llegan, pero el flujo clínico base no se interrumpe.

**¿Cuánto tiempo tarda un piloto?**
2–4 semanas: ingestión de datos históricos (CSV o FHIR) → validación → dashboard para médicos piloto → feedback. Requisito mínimo: historial de laboratorios y presión arterial en cualquier formato exportable.
