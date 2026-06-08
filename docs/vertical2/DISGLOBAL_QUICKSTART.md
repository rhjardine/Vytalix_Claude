# Disglobal Integration Quickstart
**Vytalix Vertical 2 — Longevity Commerce**
**Versión:** 2.0 | **Clasificación:** Partner Confidential

---

## Resumen de integración

Disglobal es el primer socio estratégico de Vytalix Vertical 2. Esta guía cubre todo lo necesario para comenzar a consumir el catálogo de Doctor Antivejez, emitir vouchers, gestionar reservas y rastrear entregas.

**Modelo de operación:**
```
Disglobal compra → Vytalix emite voucher → Paciente reserva → Clínica entrega
```

---

## Autenticación

Todas las llamadas a la API requieren un API key de partner en el header:

```http
Authorization: Bearer vx2_<tu-api-key>
```

El API key es provisto por Vytalix durante el proceso de onboarding. Se muestra **una única vez** — guárdalo de forma segura.

**Scopes incluidos para Disglobal (tier STRATEGIC):**

| Scope | Descripción |
|-------|-------------|
| `commerce:catalog:read` | Consultar catálogo activo |
| `commerce:pricing:quote` | Solicitar cotizaciones |
| `commerce:vouchers:issue` | Emitir vouchers post-pago |
| `commerce:vouchers:read` | Consultar estado de vouchers |
| `commerce:vouchers:redeem` | Validar y consumir vouchers en punto de servicio |
| `commerce:bookings:create` | Reservar slots de agenda |
| `commerce:bookings:read` | Consultar estado de reservas |
| `commerce:fulfillment:read` | Rastrear órdenes físicas |
| `commerce:analytics:read` | Ver insights comerciales agregados propios |

---

## Base URL

```
Production:  https://api.vytalix.com/api/v2/commerce
Sandbox:     https://sandbox.vytalix.com/api/v2/commerce
```

---

## Flujo completo paso a paso

### Paso 1 — Consultar el catálogo

```http
GET /catalog?status=ACTIVE&page=1&pageSize=20
Authorization: Bearer vx2_<api-key>
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "sku": "DAV-CONSUL-90",
      "type": "CONSULTATION",
      "deliveryMode": "IN_CLINIC",
      "name": "Consulta Longevidad — Doctor Antivejez",
      "shortDescription": "Evaluación preventiva completa de 90 min",
      "durationMinutes": 90,
      "requiresBooking": true,
      "requiresShipping": false,
      "tags": ["longevity", "preventive", "consultation"]
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 8, "totalPages": 1 }
}
```

Filtros disponibles: `type`, `deliveryMode`, `requiresBooking`, `tags`, `search`

---

### Paso 2 — Cotizar un ítem

```http
POST /pricing/quote
Authorization: Bearer vx2_<api-key>
Content-Type: application/json

{
  "catalogItemId": "550e8400-e29b-41d4-a716-446655440001",
  "currency": "MXN"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "catalogItemId": "550e8400-e29b-41d4-a716-446655440001",
    "basePrice": { "amount": 250000, "currency": "MXN" },
    "finalPrice": { "amount": 200000, "currency": "MXN" },
    "discountApplied": { "amount": 50000, "currency": "MXN" },
    "appliedRuleType": "PARTNER_TIER",
    "validUntil": "2025-09-01T15:30:00Z",
    "quotedAt": "2025-09-01T15:15:00Z"
  }
}
```

> **Nota:** `amount` está en centavos — $2,000.00 MXN = 200000. La cotización es válida por 15 minutos.

---

### Paso 3 — Emitir un voucher (post-pago)

Después de confirmar el pago en tu plataforma, emite el voucher:

```http
POST /vouchers
Authorization: Bearer vx2_<api-key>
Content-Type: application/json

{
  "partnerId": "tu-partner-id",
  "catalogItemId": "550e8400-e29b-41d4-a716-446655440001",
  "type": "SINGLE_USE",
  "beneficiaryId": "id-del-paciente-en-tu-sistema",
  "expiresInDays": 365,
  "pricePaid": { "amount": 200000, "currency": "MXN" },
  "correlationId": "tu-order-id-unico",
  "metadata": {
    "disglobalOrderId": "DG-2025-001234",
    "plan": "gold"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "v-uuid-001",
    "token": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    "qrPayload": "eyJ0b2tlbiI6Ii4uLiIsInRlbmFudElkIjoiLi4uIn0",
    "status": "ACTIVE",
    "type": "SINGLE_USE",
    "expiresAt": "2026-09-01T00:00:00Z",
    "pricePaidSnapshot": { "amount": 200000, "currency": "MXN" }
  }
}
```

> **El `token` es el secreto de canje. El `qrPayload` se usa para generar el código QR.**

**Generar QR en tu app:**
```javascript
import QRCode from 'qrcode';
const qrImage = await QRCode.toDataURL(voucher.qrPayload);
```

---

### Paso 4 — Consultar disponibilidad

```http
GET /booking/slots?catalogItemId=550e...&fromDate=2025-10-01&toDate=2025-10-31
Authorization: Bearer vx2_<api-key>
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "slot-uuid-001",
      "startTime": "2025-10-15T10:00:00Z",
      "endTime": "2025-10-15T11:30:00Z",
      "timezone": "America/Mexico_City",
      "locationId": "clinica-polanco",
      "remainingCapacity": 1
    }
  ]
}
```

---

### Paso 5 — Reservar un slot

```http
POST /bookings
Authorization: Bearer vx2_<api-key>
Content-Type: application/json

{
  "voucherId": "v-uuid-001",
  "catalogItemId": "550e8400-e29b-41d4-a716-446655440001",
  "beneficiaryId": "id-del-paciente-en-tu-sistema",
  "slotId": "slot-uuid-001",
  "correlationId": "tu-booking-correlation-id",
  "notes": "Primera vez. Prefiere consulta en español."
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid-001",
    "status": "REQUESTED",
    "slot": {
      "startTime": "2025-10-15T10:00:00Z",
      "endTime": "2025-10-15T11:30:00Z",
      "timezone": "America/Mexico_City"
    }
  }
}
```

> Cuando la clínica confirme, el status cambia a `CONFIRMED`. Puedes consultar el estado con `GET /bookings/:bookingId`.

---

### Paso 6 — Canje en punto de servicio

En la clínica, el paciente presenta el QR. El sistema escanea y llama:

```http
POST /vouchers/redeem
Authorization: Bearer vx2_<api-key>
Content-Type: application/json

{
  "token": "a3f8b2c1d4e5...",
  "redeemedBy": "recepcionista-id",
  "channel": "QR_SCAN",
  "locationId": "clinica-polanco",
  "bookingId": "booking-uuid-001",
  "correlationId": "scan-event-unique-id"
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id": "re-uuid-001",
    "result": "SUCCESS",
    "channel": "QR_SCAN",
    "redeemedAt": "2025-10-15T10:02:33Z"
  }
}
```

**Respuestas de error:**

| Código HTTP | error.code | Acción |
|-------------|-----------|--------|
| 409 | `ALREADY_REDEEMED` | Voucher ya consumido — verificar con clínica |
| 410 | `EXPIRED` | Voucher expirado — contactar soporte |
| 422 | `INVALID_TOKEN` | Token inválido — verificar QR |
| 422 | `VOUCHER_SUSPENDED` | Suspendido por fraude — contactar soporte |

---

### Paso 7 — Rastrear fulfillment físico (kits/productos)

Para items con `requiresShipping: true`:

```http
GET /fulfillment/<order-id>
Authorization: Bearer vx2_<api-key>
```

```json
{
  "success": true,
  "data": {
    "id": "fo-uuid-001",
    "status": "SHIPPED",
    "trackingNumber": "DHL1234567890MX",
    "carrier": "DHL",
    "estimatedDeliveryDate": "2025-10-20"
  }
}
```

---

## Idempotencia

Todas las operaciones de escritura aceptan `correlationId`. Si envías el mismo `correlationId` dos veces:
- `POST /vouchers` → retorna el voucher ya creado
- `POST /vouchers/redeem` → retorna el evento de canje ya registrado
- `POST /bookings` → crea una segunda reserva (usa IDs únicos para evitarlo)

---

## Webhooks (opcional)

Si configuras un `webhookUrl` en tu perfil de partner, recibirás notificaciones POST:

```json
{
  "event": "booking.confirmed",
  "data": { "bookingId": "...", "status": "CONFIRMED" },
  "correlationId": "...",
  "timestamp": "2025-10-01T12:00:00Z"
}
```

Eventos disponibles: `voucher.issued`, `booking.confirmed`, `booking.completed`, `fulfillment.shipped`, `fulfillment.delivered`

Valida la firma del webhook con el header `X-Disglobal-Signature` usando tu `webhookSecret`.

---

## Límites y cuotas (sandbox)

| Recurso | Límite |
|---------|--------|
| Cotizaciones | 500/hora |
| Emisión de vouchers | 200/hora |
| Redemptions | 1000/hora |
| Consulta de catálogo | Sin límite en sandbox |

---

## Soporte técnico

- **Slack:** #vytalix-disglobal-integration
- **Email:** api-support@vytalix.com
- **Estado del sistema:** https://status.vytalix.com
