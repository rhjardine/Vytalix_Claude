# Vytalix — External Integration Guide

## Overview

External systems (EMR, LIS, wearables) send data to Vytalix via a dedicated endpoint that:
- Uses API keys (not JWT) — simpler for server-to-server auth
- Accepts a flexible FHIR-like JSON format
- Normalizes units and LOINC codes automatically
- Triggers the clinical pipeline asynchronously
- Emits a `decision.created` webhook when alerts are generated

---

## Endpoint

```
POST /api/external/observations
```

### Authentication

API key in header — **not** JWT:

```
X-API-Key: vyx_demo_k1_NueveOnce_2024
```

### Request body

```json
{
  "patientMrn": "GNO-2024-000112",
  "observations": [
    {
      "loincCode": "2089-1",
      "value": 213.0,
      "unit": "mg/dL",
      "effectiveDateTime": "2024-11-10T10:00:00Z"
    },
    {
      "loincCode": "8480-6",
      "value": 148.0,
      "unit": "mmHg",
      "effectiveDateTime": "2024-11-10T10:00:00Z"
    }
  ]
}
```

### Response

```json
{
  "accepted": 2,
  "rejected": 0,
  "total": 2,
  "patientId": "a1b2c3d4-0000-4000-8000-000000000010",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "pipelineTriggered": true
}
```

---

## Working curl example

```bash
# Send 2 observations for Roberto Vargas
curl -s -X POST http://localhost:3001/api/external/observations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vyx_demo_k1_NueveOnce_2024" \
  -d '{
    "patientMrn": "GNO-2024-000112",
    "observations": [
      {
        "loincCode": "2089-1",
        "displayName": "LDL Cholesterol",
        "value": 220.0,
        "unit": "mg/dL",
        "effectiveDateTime": "2024-11-15T09:00:00Z"
      },
      {
        "loincCode": "8480-6",
        "displayName": "Systolic BP",
        "value": 152.0,
        "unit": "mmHg",
        "effectiveDateTime": "2024-11-15T09:00:00Z"
      }
    ]
  }' | python3 -m json.tool
```

---

## Unit auto-conversion

The API automatically converts units to canonical form:

| Input | Canonical | Formula |
|-------|-----------|---------|
| `mmol/L` (LDL) | `mg/dL` | × 38.67 |
| `mmol/L` (glucose) | `mg/dL` | × 18.0182 |
| `μmol/L` (creatinine) | `mg/dL` | × 0.011312 |
| `kPa` (BP) | `mmHg` | × 7.50062 |

```bash
# Example: LDL in mmol/L — will be stored as 213.0 mg/dL
curl -s -X POST http://localhost:3001/api/external/observations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vyx_demo_k1_NueveOnce_2024" \
  -d '{
    "patientMrn": "GNO-2024-000112",
    "observations": [{"loincCode":"2089-1","value":5.51,"unit":"mmol/L","effectiveDateTime":"2024-11-15T09:00:00Z"}]
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Accepted:', d['accepted'])"
```

---

## Supported LOINC codes

| LOINC | Measurement | Canonical unit |
|-------|-------------|---------------|
| 2089-1 | LDL Cholesterol | mg/dL |
| 2085-9 | HDL Cholesterol | mg/dL |
| 2093-3 | Total Cholesterol | mg/dL |
| 8480-6 | Systolic BP | mmHg |
| 8462-4 | Diastolic BP | mmHg |
| 2345-7 | Fasting Glucose | mg/dL |
| 4548-4 | HbA1c | % |
| 39156-5 | BMI | kg/m2 |
| 2160-0 | Creatinine | mg/dL |
| 30522-7 | hsCRP | mg/L |

Unknown LOINC codes are accepted and stored with a validation warning.

---

## Webhook: decision.created

When new decisions are generated after an external ingest, Vytalix sends a webhook to the tenant's configured URL.

### Payload

```json
{
  "eventType": "decision.created",
  "payload": {
    "patientId": "a1b2c3d4-0000-4000-8000-000000000010",
    "patientMrn": "GNO-2024-000112",
    "generated": 2,
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-11-15T09:00:05Z"
  }
}
```

### Signature verification

Every webhook is signed with HMAC-SHA256. Verify in your receiver:

```python
import hmac, hashlib

def verify_webhook(body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.{body.decode()}".encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)

# In your webhook handler:
body      = request.body          # raw bytes
timestamp = request.headers['X-Vytalix-Timestamp']
signature = request.headers['X-Vytalix-Signature']
is_valid  = verify_webhook(body, timestamp, signature, WEBHOOK_SECRET)
```

### Headers sent

```
X-Vytalix-Event:     decision.created
X-Vytalix-Timestamp: 1700000000000
X-Vytalix-Signature: sha256=abc123...
X-Vytalix-Tenant:    a1b2c3d4-0000-4000-8000-000000000001
```

---

## Full integration flow

```
Your EMR/LIS
  ↓ POST /api/external/observations (API key)
Vytalix ingest
  ↓ validate LOINC + physiological bounds
  ↓ normalize units
  ↓ persist ClinicalObservation
  ↓ update PatientHealthSnapshot (DB trigger)
  ↓ [async] pipeline: risk score → decision engine
  ↓ [async] webhook → decision.created → your system
Your system
  ↓ receive webhook
  ↓ query GET /v1/patients/:id/decisions (via JWT)
  ↓ display alerts to physician
```

---

## Error handling

| Scenario | HTTP | Detail |
|----------|------|--------|
| Invalid API key | 401 | `"Invalid or missing X-API-Key header"` |
| Patient MRN not found | 404 | `"Patient with MRN \"...\" not found"` |
| Physiologically impossible value | 422 | `"Value 850 mg/dL exceeds physiological maximum (800 mg/dL) for LDL Cholesterol"` |
| Future-dated observation | 422 | `"observedAt is in the future"` |
| Empty observations array | 422 | `"observations must be a non-empty array"` |

---

## Rate limits

| Tier | Limit |
|------|-------|
| STARTER | 100 requests/min per API key |
| PROFESSIONAL | 1,000 requests/min per API key |
| ENTERPRISE | Custom |

Batch up to 500 observations per request for efficiency.
