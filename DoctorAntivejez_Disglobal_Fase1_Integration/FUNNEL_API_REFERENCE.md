# Referencia de la API del funnel — Fase 1

Los cuatro endpoints que Disglobal invoca durante el recorrido del usuario.

**Autenticación:** ninguna en esta fase, en los cuatro endpoints.
**Content-Type:** `application/json` en todas las peticiones.
**Correlación:** toda respuesta incluye el header `X-Correlation-ID` y el campo
`meta.correlationId`. Regístrelo: es lo que permite localizar una petición en
soporte.

Todos los errores siguen el formato RFC 7807:

```json
{
  "type": "https://api.vytalix.health/errors/422",
  "title": "Validation Failed",
  "status": 422,
  "detail": "Imagen inválida o demasiado pequeña",
  "correlationId": "ea3497cf-8f2b-4a1e-9c33-71d0e5b2a9f4"
}
```

---

## 1. Registro de interesado

```
POST /api/funnel/leads
```

### Request

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `name` | string | sí | 2–200 caracteres |
| `email` | string | sí | formato email |
| `interestType` | enum | sí | `DEMO_PLATAFORMA` · `INTEGRACION_EMR` · `PARTNERSHIP_CLINICO` · `INFORMACION_GENERAL` · `LONGEVIDAD_CLINICA` · `ODONTOLOGIA_LONGEVIDAD` · `TURISMO_SALUD` |
| `source` | enum | sí | `CTA_FORM` · `VITALITY_TEST_RESULT` · `FACIAL_ANALYSIS_RESULT` · `CONSULTA_EXPLORATORIA` · `HERO_CTA` |
| `consentMarketing` | boolean | sí | — |
| `consentDataProcessing` | boolean | sí | debe ser `true` para continuar |
| `organization` | string | no | máx. 255 |
| `phone` | string | no | máx. 50 |
| `country` | string | no | exactamente 2 caracteres |
| `message` | string | no | máx. 2000 |
| `utmSource` · `utmCampaign` | string | no | máx. 100 |
| `referralCode` | string | no | máx. 50 |
| `vitalityAssessmentId` · `facialAnalysisId` | string | no | UUID |

```json
{
  "name": "Kevin Perdomo",
  "email": "kevin@disglobal.test",
  "interestType": "LONGEVIDAD_CLINICA",
  "source": "HERO_CTA",
  "consentMarketing": true,
  "consentDataProcessing": true
}
```

### Response

**`201 Created`** — interesado nuevo:

```json
{
  "data": { "id": "04a66eb7-8318-4611-b66d-e4dbbf7dd007", "status": "NEW", "confirmationEmailSent": false },
  "meta": { "correlationId": "ea3497cf-…", "timestamp": "2026-08-07T13:57:33.703Z" }
}
```

**`200 OK`** — ya existía un registro con ese email en las últimas 24 horas:

```json
{
  "data": { "id": "04a66eb7-8318-4611-b66d-e4dbbf7dd007", "status": "EXISTING" },
  "meta": { "correlationId": "ea3497cf-…", "timestamp": "2026-08-07T13:57:33.703Z" }
}
```

Trate `200` como éxito, no como error: devuelve el `id` existente para que pueda
seguir correlacionando el recorrido. `confirmationEmailSent` es siempre `false` en
esta fase; no hay entrega de correo.

### Errores

| Código | Causa |
|---|---|
| `422` | Validación fallida. `detail` concatena todos los mensajes |
| `422` | `consentDataProcessing` es `false` |

---

## 2. Escáner facial

```
POST /api/funnel/facial-analysis
```

### Request

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `imageBase64` | string | sí | 100 – 3 100 000 caracteres (~2 MB codificados) |
| `sessionId` | string | no | máx. 100 |
| `leadId` | string | no | UUID |

```json
{ "imageBase64": "<JPEG en base64>", "sessionId": "demo-001" }
```

La imagen **no se almacena**. Se guarda únicamente su hash SHA-256, a efectos de
auditoría.

### Response

**`200 OK`**

```json
{
  "data": {
    "id": "04a66eb7-8318-4611-b66d-e4dbbf7dd007",
    "estimatedAge": 51,
    "confidence": 0.88,
    "analysisPoints": 24,
    "status": "COMPLETED",
    "provider": "mock",
    "analyzedAt": "2026-08-07T13:57:33.703Z"
  },
  "meta": { "correlationId": "ea3497cf-…", "timestamp": "2026-08-07T13:57:33.703Z" }
}
```

> **Lea `provider` antes de mostrar nada.** Con `"mock"`, `estimatedAge` se deriva de
> los bytes de la imagen y no describe a la persona fotografiada. La estructura de la
> respuesta no cambia cuando se habilite un proveedor real.

### Errores

| Código | Causa |
|---|---|
| `422` | Imagen menor de 100 caracteres o mayor de ~2 MB |
| `422` | No se detectó un rostro en la imagen (solo con proveedor real) |
| `501` | Proveedor de visión no soportado o no disponible |
| `502` | El proveedor de visión no respondió correctamente |
| `504` | El proveedor de visión superó el tiempo de espera |

---

## 3. Cuestionario preventivo

```
POST /api/funnel/vitality-assessment
```

**Disglobal calcula, Vytalix almacena.** El endpoint no ejecuta ningún cálculo:
persiste los valores recibidos y devuelve un identificador.

### Request

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `score` | integer | sí | 0–100 |
| `category` | enum | sí | `EXCELENTE` · `BUENO` · `REGULAR` · `CRITICO` |
| `yearsBiological` | integer | sí | 18–120 |
| `chronologicalAgeGroup` | enum | sí | `"45"` · `"59"` · `"69"` · `"78"` — es un tramo de edad, no un número de años |
| `dimensions` | object | sí | Las cinco claves siguientes, cada una entero 0–100 |
| `dimensions.energiaEstadoMental` | integer | sí | 0–100 |
| `dimensions.suenoCognicion` | integer | sí | 0–100 |
| `dimensions.composicionCorporal` | integer | sí | 0–100 |
| `dimensions.signosEnvejecimiento` | integer | sí | 0–100 |
| `dimensions.rangoEdad` | integer | sí | 0–100 |
| `answersPayload` | object | sí | Mapa libre de `string` → `boolean` |
| `completedAt` | string | sí | ISO-8601 |
| `durationSeconds` | integer | no | positivo |
| `deviceType` | enum | no | `mobile` · `desktop` · `tablet` |
| `sessionId` | string | no | máx. 100 |
| `leadId` | string | no | UUID |

```json
{
  "score": 72,
  "category": "BUENO",
  "yearsBiological": 47,
  "chronologicalAgeGroup": "45",
  "dimensions": {
    "energiaEstadoMental": 70, "suenoCognicion": 65,
    "composicionCorporal": 80, "signosEnvejecimiento": 75, "rangoEdad": 70
  },
  "answersPayload": { "q1": true, "q2": false, "q3": true },
  "completedAt": "2026-08-07T10:00:00.000Z",
  "durationSeconds": 480,
  "deviceType": "mobile"
}
```

`answersPayload` es un mapa libre de booleanos: **caben 45 preguntas sin cambiar el
esquema**. Use `q1…q45` o sus propias claves.

### Response

**`201 Created`**

```json
{
  "data": { "id": "6d90ff53-1222-4dac-9813-59db0b473c88" },
  "meta": { "correlationId": "6c3d8198-…", "timestamp": "2026-08-07T10:00:01.000Z" }
}
```

Devuelve solo el identificador. No hay interpretación del resultado: la
presentación al usuario corresponde a Disglobal.

### Errores

| Código | Causa |
|---|---|
| `422` | Validación fallida. `detail` contiene **solo el primer** fallo, no la lista completa. Corrija un campo, reenvíe y verá el siguiente |

---

## 4. Solicitud de consulta

```
POST /api/funnel/booking
```

Registra la solicitud y devuelve un traspaso a WhatsApp. **No reserva un cupo ni
consulta disponibilidad.**

### Request

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `name` | string | sí | 2–200 |
| `email` | string | sí | formato email |
| `consultationType` | enum | sí | `EXPLORATORIA_LONGEVIDAD` · `EXPLORATORIA_DENTAL` · `EXPLORATORIA_PREVENTIVA` · `SEGUNDA_OPINION` |
| `phone` | string | no | máx. 50 |
| `specialistPreference` | enum | no | `longevity` · `dental` · `preventive` · `any` |
| `preferredDate` | string | no | `YYYY-MM-DD` |
| `preferredTime` | enum | no | `morning` · `afternoon` · `evening` |
| `timezone` | string | no | por defecto `America/Caracas` |
| `vitalityScore` | integer | no | 0–100 |
| `vitalityCategory` | enum | no | `EXCELENTE` · `BUENO` · `REGULAR` · `CRITICO` |
| `chiefConcern` | string | no | máx. 500 |
| `leadId` · `sessionId` | string | no | UUID / máx. 100 |

```json
{
  "name": "Kevin Perdomo",
  "email": "kevin@disglobal.test",
  "consultationType": "EXPLORATORIA_LONGEVIDAD"
}
```

> **Ningún campo distingue hoy consulta online de presencial.** `consultationType`
> selecciona la materia de la consulta, no el canal. Es una de las decisiones
> abiertas listadas en `PHASE1_SCOPE_AND_LIMITATIONS.md`.

### Response

**`201 Created`**

```json
{
  "data": {
    "id": "9f2c1b40-5a3e-4d18-b7c6-0e8a2d4f6b11",
    "status": "WHATSAPP_ONLY",
    "confirmationCode": "VYT4K9Z2Q",
    "confirmationChannel": "WHATSAPP",
    "whatsappFallbackUrl": "https://wa.me/58412XXXXXXX?text=…",
    "nextSteps": ["…"]
  },
  "meta": { "correlationId": "ea3497cf-…", "timestamp": "2026-08-07T13:57:33.703Z" }
}
```

**Muestre `confirmationCode` y `whatsappFallbackUrl`,** o el recorrido del usuario
termina sin vía de continuación.

Dos advertencias sobre esta respuesta:

- **`data.id` no es la clave del registro almacenado.** Se genera en la respuesta y
  no permite recuperar la solicitud más adelante. Para correlacionar, use
  `confirmationCode`.
- **`nextSteps` contiene un texto orientado al usuario final** que menciona un plazo
  de contacto. Ese plazo es un compromiso operativo humano, no una garantía del
  sistema. Valide su contenido antes de mostrarlo tal cual.

### Errores

| Código | Causa |
|---|---|
| `422` | Validación fallida. `detail` contiene solo el primer fallo |

---

## Resumen de códigos

| Código | Significado | Acción del cliente |
|---|---|---|
| `200` | Éxito. En `leads`, además, registro ya existente | Continuar |
| `201` | Recurso creado | Continuar |
| `422` | Validación fallida | Corregir la petición. No reintentar sin cambios |
| `501` · `502` · `504` | Proveedor de visión no disponible | Reintentar con retroceso; degradar la interfaz si persiste |
| `5xx` | Error interno | Registrar `correlationId` y remitirlo a soporte |
