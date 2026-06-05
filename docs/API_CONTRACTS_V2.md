# API_CONTRACTS_V2.md
> **Vytalix Preventive Intelligence APIs — Contrato v2 para Disglobal**
> Base URL: `https://api.vytalix.health`  |  Auth: `X-API-Key: vyx_dis_{key}`

---

## Convenciones Generales

### Headers Requeridos

```http
X-API-Key: vyx_dis_{your_key}         # SIEMPRE requerido
X-Correlation-ID: {uuid}              # Opcional; generado automáticamente si ausente
X-Idempotency-Key: {unique_string}    # Opcional; recomendado para POST mutantes
```

### Headers en Respuesta

```http
X-Correlation-ID: {uuid}              # Siempre presente — usar para soporte
X-RateLimit-Limit: 99999
X-RateLimit-Remaining: 99998
X-RateLimit-Reset: 1749135600
X-Quota-Warning: 82% of monthly limit # Solo si >80% de cuota mensual
```

### Formato de Errores (RFC 7807)

```json
{
  "type": "https://api.vytalix.health/errors/401",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Missing X-API-Key header.",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Endpoints

### POST /api/v2/vitality/assess
**Evalúa la edad biológica mediante el protocolo biofísico Doctor Antivejez.**

**Scope requerido:** `vitality:write`

**Request:**
```json
{
  "subjectRef": "DISG-abc123xyz456",
  "chronologicalAge": 45,
  "biologicalSex": "MALE",
  "isAthlete": false,
  "measurements": {
    "fatPercentage": 22.5,
    "bmi": 26.1,
    "digitalReflexes": { "high": 180, "long": 120, "width": 80 },
    "visualAccommodation": 35,
    "staticBalance": { "high": 95, "long": 60, "width": 40 },
    "skinHydration": 58,
    "systolicPressure": 125,
    "diastolicPressure": 82
  }
}
```

**Response 200:**
```json
{
  "assessmentId": "550e8400-e29b-41d4-a716-446655440000",
  "biologicalAge": 48.3,
  "differentialAge": 3.3,
  "ageStatus": "ENVEJECIDO",
  "partialAges": {
    "fatAge": 47, "bmiAge": 46, "reflexesAge": 52, "visualAge": 49,
    "balanceAge": 50, "hydrationAge": 45, "systolicAge": 48, "diastolicAge": 47
  },
  "algorithmVersion": "biophysics-v2.1",
  "assessedAt": "2026-06-05T12:00:00Z"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `subjectRef` | string | ID pseudonimizado generado por el SDK (`DISG-{hash}`) |
| `ageStatus` | enum | `REJUVENECIDO` \| `NORMAL` \| `ENVEJECIDO` |
| `differentialAge` | float | Edad biológica − Edad cronológica. Negativo = rejuvenecido |
| `algorithmVersion` | string | Versión del algoritmo para trazabilidad y reproducibilidad |

---

### GET /api/v2/vitality/:subjectRef
**Recupera el último assessment biofísico de un sujeto.**

**Scope requerido:** `vitality:read`

**Response 200:** Misma estructura que POST /assess
**Response 404:**
```json
{ "status": 404, "detail": "No assessment found", "correlationId": "..." }
```

---

### POST /api/v2/preventive/score
**Calcula el puntaje preventivo compuesto (riesgo cardiovascular + adherencia + engagement).**

**Scope requerido:** `preventive:write`

**Request:**
```json
{ "subjectRef": "DISG-abc123xyz456" }
```

**Response 200:**
```json
{
  "compositeScore": 67.4,
  "tier": "MEDIUM_RISK",
  "components": {
    "cardiovascular": 72.1,
    "metabolic": 65.0,
    "lifestyle": 65.0
  },
  "algorithmVersion": "preventive-v1.2",
  "computedAt": "2026-06-05T12:00:00Z"
}
```

**Response 202 (datos insuficientes):**
```json
{ "message": "Insufficient data for score", "patientId": "..." }
```

---

### GET /api/v2/referral/:subjectRef
**Evalúa si el sujeto califica para derivación a Doctor Antivejez.**

**Scope requerido:** `referral:read`

**Response 200 — Elegible:**
```json
{
  "eligible": true,
  "referralType": "BIOLOGICAL_AGE",
  "urgency": "URGENT",
  "ctaPayload": {
    "headline": "Tu edad biológica es 3 años mayor de lo esperado",
    "subheadline": "Un especialista puede ayudarte a revertirlo",
    "ctaLabel": "Agenda tu consulta gratuita",
    "ctaUrl": "https://doctorantivejez.com/agenda?ref=DISG-abc123",
    "urgencyLabel": "Plazas limitadas esta semana",
    "valueProposition": "Primeros 50 pacientes reciben evaluación completa sin costo"
  }
}
```

**Response 200 — No elegible:**
```json
{ "eligible": false }
```

---

### POST /api/v2/engagement/events
**Registra eventos de interacción para el motor de engagement y scoring.**

**Scope requerido:** `engagement:write`

**Request:**
```json
{
  "subjectRef": "DISG-abc123xyz456",
  "events": [
    {
      "type": "REFERRAL_CTA_CLICKED",
      "payload": { "platform": "disglobal", "converted": false },
      "occurredAt": "2026-06-05T12:00:00Z"
    }
  ],
  "source": "disglobal_marketplace"
}
```

**Tipos de evento soportados:**
- `REFERRAL_CTA_CLICKED` — El usuario hizo clic en la derivación
- `REFERRAL_CONVERTED` — El usuario completó la cita
- `ASSESSMENT_VIEWED` — El usuario vio sus resultados

**Response 202:**
```json
{ "accepted": 1, "patientId": "..." }
```

---

### GET /api/v2/insights/cohort
**Devuelve métricas poblacionales anonimizadas del tenant. Requiere mínimo 50 pacientes.**

**Scope requerido:** `insights:read`

**Query params opcionales:** `ageGroup=30-45`, `biologicalSex=MALE`, `period=2026-06`

**Response 200:**
```json
{
  "cohortSize": 247,
  "metrics": {
    "avgBiologicalAge": 44.2,
    "avgDifferential": 2.1,
    "pctRejuvenecido": 31,
    "pctEnvejecido": 42
  },
  "filters": { "ageGroup": "30-45", "biologicalSex": "MALE" },
  "note": "Anonymized cohort data. Minimum cohort size: 50.",
  "generatedAt": "2026-06-05T12:00:00Z"
}
```

**Response 200 (cohorte pequeña):**
```json
{ "cohortTooSmall": true, "minimumRequired": 50, "note": "Privacy threshold not met" }
```

---

## Observabilidad

### GET /liveness
```json
{ "status": "alive", "pid": 1234, "uptimeSec": 86400, "timestamp": "..." }
```

### GET /readiness
```json
{
  "status": "ready",
  "version": "0.9.0-demo",
  "env": "production",
  "uptimeSec": 86400,
  "checks": {
    "database": { "status": "ok", "latencyMs": 3 },
    "redis":    { "status": "ok", "latencyMs": 1 }
  },
  "timestamp": "..."
}
```
> ⚠️ Disglobal debe llamar a `/readiness` antes de iniciar cualquier batch. Si `status != "ready"` → hold traffic.

---

## Códigos de Error

| HTTP | Significado | Acción recomendada |
|---|---|---|
| 401 | API key inválida o ausente | Verificar header `X-API-Key` |
| 403 | Scope insuficiente | Solicitar permisos al equipo Vytalix |
| 404 | Sujeto no encontrado | Crear sujeto vía `vitality/assess` primero |
| 413 | Payload muy grande (>2MB) | Reducir tamaño del request |
| 422 | Error de validación | Ver campo `errors[]` en la respuesta |
| 429 | Rate limit o quota excedida | Usar header `Retry-After` |
| 503 | Plataforma no disponible | Esperar; llamar `/readiness` hasta 200 |
