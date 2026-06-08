# Vertical 2 — Longevity Commerce: Architecture

## Overview

Longevity Commerce es la capa comercial de Vytalix que convierte los servicios clínicos, productos físicos y programas de Doctor Antivejez en consumibles digitales vendibles, orquestables y trazables.

**Esta vertical no es el core clínico.** Es la capa de productización que se sienta encima de él.

---

## Principios de diseño

| Principio | Implementación |
|-----------|---------------|
| Aislamiento de dominio | Commerce nunca lee tablas clínicas directamente |
| Contrato explícito | `ClinicalIntegrationPort` es el único canal de comunicación clínica |
| Seguridad por defecto | RLS en todas las tablas, tenantSecret en vouchers, sprint-1 inheritance |
| Fail-safe-deny | Sin consentimiento verificable = acceso denegado |
| Trazabilidad total | correlationId en todos los objetos, audit log de redemptions |
| Idempotencia | Voucher redeem, access grant y booking-slot son idempotentes |

---

## Estructura de directorios

```
src/
├── shared/
│   ├── types/domain.ts              ← Tipos compartidos — contrato entre engines
│   ├── db/schema.sql                ← Schema PostgreSQL con RLS
│   └── middleware/partnerMiddleware.ts
│
├── catalog/        CatalogEngine.ts
├── pricing/        PricingEngine.ts
├── voucher/        VoucherEngine.ts
├── booking/        BookingEngine.ts
├── fulfillment/    FulfillmentEngine.ts
├── access/         AccessGrantService.ts
├── analytics/      CommercialAnalyticsService.ts
├── integration/    clinicalIntegrationContract.ts
│
├── commerceRouter.ts  ← API pública (Disglobal y partners)
├── admin/adminRouter.ts ← API interna (operadores, admin)
└── tests/vertical2.test.ts
```

---

## Los cinco motores

### 1. CatalogEngine
Gestiona el inventario comercial de Doctor Antivejez. Cada `CatalogItem` tiene un `type` que describe si es un servicio, producto, programa, diploma, kit o bundle.

**Separación crítica:** Solo almacena `clinicalServiceReferenceId` como string opaco. Nunca lee datos clínicos directamente.

### 2. PricingEngine
Resuelve el precio aplicable mediante reglas priorizadas:
- `FIXED` → precio base fijo
- `PARTNER_TIER` → precio por nivel de socio
- `BUNDLE` → descuento por combinación de items
- `PROMOTIONAL` → descuento temporal
- `VOLUME` → descuento por cantidad
- `CURRENCY` → override por moneda

Selección: mayor `priority` gana; en empate, especificidad (`partner+item > partner > item > global`).

### 3. VoucherEngine
El objeto de intercambio comercial. Cada voucher tiene:
- **Token**: 32 bytes aleatorios (hex) — 256 bits de entropía
- **QR payload**: base64url(JSON{token, tenantId, itemId, exp, checksum})
- **Checksum**: HMAC-SHA256 del payload con `tenantSecret` del tenant (no env fallback — Sprint 1)
- **Redemption**: idempotente por `correlationId`, atómica con `FOR UPDATE`

### 4. BookingEngine
Gestiona agenda y disponibilidad. Previene overbooking mediante `SELECT FOR UPDATE` en el slot antes de incrementar `booked_count`. La cancelación libera capacidad automáticamente.

**Separación:** Una reserva confirmada emite un evento (`BookingConfirmedEvent`) al core clínico. Commerce no espera respuesta — desacoplamiento total.

### 5. FulfillmentEngine
Ciclo de vida de pedidos físicos: `CREATED → PROCESSING → SHIPPED → DELIVERED`. Soporta devoluciones (`RETURNED`). Los ítems se almacenan en tabla separada para soporte de pedidos multi-ítem.

---

## Flujo completo Disglobal

```
Disglobal API Client
        │
        ▼
  [Partner Auth]              partnerMiddleware.ts
  API Key → partner_id,       SHA-256 hash lookup, tier → scopes
  tier, scopes
        │
        ▼
  GET /catalog                CatalogEngine.listItems()
  (solo ACTIVE, filtrado      RLS: tenant isolation
   por allowedCatalogItemIds)
        │
        ▼
  POST /pricing/quote         PricingEngine.quoteItem()
  catalogItemId + currency    Rule priority resolution
  → PriceQuote (15min TTL)
        │
        ▼
  [Disglobal procesa pago]    Fuera del alcance de Vytalix
        │
        ▼
  POST /vouchers              VoucherEngine.issueVoucher()
  catalogItemId + pricePaid   Token 256-bit + QR payload HMAC
  → Voucher{token, qrPayload, expiresAt}
        │
        ▼
  GET /booking/slots          BookingEngine.listAvailableSlots()
  catalogItemId + dateRange   Solo slots con capacidad disponible
        │
        ▼
  POST /bookings              BookingEngine.requestBooking()
  slotId + beneficiaryId      FOR UPDATE anti-overbooking
  → Booking{status:REQUESTED}
        │
        ▼
  [Admin confirma]            POST /admin/bookings/:id/confirm
        │
        ▼
  [Paciente llega]
  POST /vouchers/redeem       VoucherEngine.redeemVoucher()
  token + channel             Verifica HMAC, estado, expiración
  → RedemptionEvent{SUCCESS}  + AccessGrant creado
        │
        ▼
  [Clínica verifica]          GET /admin/access-grants
  AccessGrant{ACTIVE}         El único canal de verificación
        │
        ▼
  [Servicio entregado]        POST /admin/bookings/:id/complete
```

---

## Integración con el core clínico

La integración está definida en `clinicalIntegrationContract.ts`:

```
Commerce → ClinicalIntegrationPort → Clinical Core
                (solo 3 llamadas permitidas)
  1. verifyServiceExists()     — en creación de catálogo
  2. getServiceSummary()       — para display (graceful degradation)
  3. checkUserConsent()        — fail-safe-deny si no hay consentimiento

Commerce → CommerceEventPublisher → Clinical Core
                (fire-and-forget)
  1. BookingConfirmedEvent     — el core crea su registro de agenda
  2. VoucherRedeemedEvent      — el core puede iniciar pre-assessment
```

**Lo que commerce NUNCA puede conocer:**
- Resultados de assessments biofísicos
- Scores preventivos
- Diagnósticos o planes de tratamiento
- Cualquier dato de salud del paciente

---

## Seguridad

| Capa | Mecanismo |
|------|-----------|
| Multi-tenancy | RLS + `withTenant()` SET LOCAL (Sprint 1) |
| Autenticación partners | API key → SHA-256 hash, cache 60s |
| Autorización | Scopes por tier, `requireScope()` middleware |
| Tokens de voucher | 256-bit CSPRNG, HMAC-SHA256 con tenantSecret |
| Anti-overbooking | `SELECT FOR UPDATE` en slots |
| Anti-replay en redemption | `FOR UPDATE` en voucher + idempotencia por correlationId |
| Audit trail | `commerce_redemption_events` append-only |
| Secretos | Sin defaults inseguros (hereda Sprint 1) |

---

## Persistencia

10 tablas + RLS en todas:

```
commerce_catalog_items         → inventario comercial
commerce_pricing_rules         → reglas de precio
commerce_vouchers              → tokens de canje
commerce_redemption_events     → audit log (append-only)
commerce_availability_slots    → agenda disponible
commerce_bookings              → reservas
commerce_fulfillment_orders    → pedidos físicos
commerce_fulfillment_items     → ítems de pedidos
commerce_partners              → socios comerciales
commerce_access_grants         → entitlements post-canje
```

---

## Observabilidad

Cada respuesta incluye:
- `X-Request-Id` header (correlationId propagado)
- `meta.requestId` en el cuerpo JSON
- `meta.timestamp` y `meta.version`

Los `correlationId` enlazan: Voucher → RedemptionEvent → AccessGrant → Booking
