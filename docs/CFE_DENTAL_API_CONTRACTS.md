# CFE Dental — Contratos de API (Propuesta)

La vertical CFE Dental expone los motores internos a través de endpoints modulares que pueden integrarse en interfaces administrativas o calculadoras externas.

*Nota: Actualmente estos contratos representan la capa de servicio interno (`DentalPricingService`). El montaje HTTP se realizará cuando se habilite la persistencia.*

## 1. Cotizador Dinámico

### `POST /api/dental/quote`
Calcula los costos base, aplica márgenes, convierte divisas y genera las opciones de financiamiento para una lista de procedimientos.

**Request Body:**
```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "patientRef": "P-9876",
  "treatments": [
    {
      "code": "CORONA_ZIRCONIA",
      "quantity": 2
    },
    {
      "code": "LIMPIEZA_PROFILAXIS",
      "quantity": 1
    }
  ],
  "locationCode": "MX-CDMX",
  "currency": "MXN",
  "includeFinancing": true,
  "chairRatePerHour": 80,
  "overheadPct": 0.35,
  "targetProfitMargin": 0.50
}
```

**Response (200 OK):**
```json
{
  "quoteId": "QT-LW3GXYZ",
  "patientRef": "P-9876",
  "subtotalUsd": 520.00,
  "totalUsd": 520.00,
  "totalNetProfitUsd": 260.00,
  "currency": "MXN",
  "exchangeRate": 17.15,
  "totalInCurrency": 8918.00,
  "lineItems": [
    {
      "treatmentCode": "CORONA_ZIRCONIA",
      "treatmentName": "Corona de Zirconia",
      "quantity": 2,
      "baseCostUsd": 250.00,
      "suggestedMarginPct": 0.50,
      "priceUsd": 500.00,
      "netProfitUsd": 250.00,
      "sessions": 2
    }
  ],
  "financingOptions": [
    {
      "months": 12,
      "label": "12 meses (8% anual)",
      "monthlyPayment": 775.80,
      "totalAmount": 9309.60,
      "interestAmount": 391.60
    }
  ],
  "validUntil": "2026-07-05T12:00:00Z",
  "disclaimer": "Esta cotización es orientativa...",
  "algorithmVersion": "dental-pricing-v2.0.0",
  "generatedAt": "2026-06-05T12:00:00Z"
}
```

## 2. Catálogo de Tratamientos

### `GET /api/dental/catalog`
Retorna el diccionario estandarizado de tratamientos soportados por el motor de costos.

**Query Parameters (Opcional):**
- `category=SURGICAL`

**Response (200 OK):**
```json
[
  {
    "code": "IMPLANTE_TITANIO",
    "name": "Titanium Implant",
    "nameEs": "Implante de Titanio",
    "category": "SURGICAL",
    "avgDurationMinutes": 120,
    "materialsCostUsd": 350,
    "labWorkUsd": 200,
    "requiresSessions": 3,
    "complexityFactor": 1.5
  }
]
```

## 3. Manejo de Versiones y Planes (Fase 3)

### `POST /api/dental/plans`
Creación de un `TreatmentPlan` inicial (Versión 1) basado en un `quoteId` previo.

### `PUT /api/dental/plans/:planId/versions`
Añade una nueva iteración al plan (Versión N+1), con un historial auditable.
