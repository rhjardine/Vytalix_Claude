# CFE_DENTAL_OPENAPI_SYNC.md
**Vytalix — CFE Dental Sprint 7: OpenAPI Synchronization Report**

---

## Objetivo

Verificar que `openapi/dental-api-v2.yaml` refleja el comportamiento real del runtime,
no el deseado — y corregir toda divergencia.

---

## Cambios aplicados al OpenAPI

### Cambio 1 — Category enum en DentalCatalogItem (F4)

**Antes:**
```yaml
DentalCatalogItem:
  properties:
    category: { type: string }
```

**Después:**
```yaml
DentalCatalogItem:
  properties:
    category:
      type: string
      enum: [CONSULTATION, RESTORATION, ENDODONTICS, PERIODONTICS,
             SURGERY, ORTHODONTICS, PROSTHETICS, IMPLANTS,
             PREVENTIVE, COSMETIC, OTHER]
      description: |
        Dental service category vocabulary (distinct from inventory category).
        CONSULTATION=general/specialty visits, RESTORATION=fillings/crowns...
```

**Razón:** El schema Zod (`CreateCatalogItemSchema`) tiene enum estricto de 11 valores. Los clientes necesitan conocer los valores válidos para construir filtros correctos.

---

### Cambio 2 — Category enum en `GET /admin/catalog` (F4)

**Antes:** `- name: category, schema: { type: string }`

**Después:**
```yaml
- name: category
  in: query
  schema:
    type: string
    enum: [CONSULTATION, RESTORATION, ENDODONTICS, PERIODONTICS,
           SURGERY, ORTHODONTICS, PROSTHETICS, IMPLANTS,
           PREVENTIVE, COSMETIC, OTHER]
```

---

### Cambio 3 — Category enum y parámetro documentado en `GET /commerce/catalog` (F4)

El endpoint público del catálogo no tenía ningún parámetro documentado. Añadido el parámetro `category` con su enum completo.

---

## Verificaciones de integridad OpenAPI → Runtime

### Endpoints documentados que existen en runtime

Todos los 31 endpoints documentados fueron verificados contra el código fuente de los tres routers. **31/31 existen** en el runtime.

### Endpoints en runtime no documentados

Ninguno. La auditoría confirmó cobertura completa.

### Schemas de request

| Schema OpenAPI | Zod Schema runtime | Alineados |
|---------------|-------------------|----------|
| `/quote` body | `CreateQuoteSchema` | ✅ |
| `/treatment-plan` body | `CreateTreatmentPlanSchema` | ✅ |
| `/treatment-plan/:id/seal` body | `SealPlanVersionSchema` | ✅ (corregido F7) |
| `/inventory/movement` body | `InventoryMovementSchema` | ✅ |
| `/admin/catalog` body | `CreateCatalogItemSchema` | ✅ |
| `/admin/pricing-rules` body | `CreatePricingRuleSchema` | ✅ |
| `/admin/exchange-rates` body | `CreateExchangeRateSchema` | ✅ |
| `/admin/settings` body | `UpsertTenantSettingsSchema` | ✅ |
| `/commerce/vouchers` body | `IssueDentalVoucherSchema` | ✅ |
| `/commerce/vouchers/redeem` body | `RedeemDentalVoucherSchema` | ✅ |
| `/commerce/bookings` body | `CreateDentalBookingSchema` | ✅ |

### Códigos de error en OpenAPI vs runtime

| Endpoint | Código | Runtime lo emite | OpenAPI lo documenta |
|----------|--------|-----------------|---------------------|
| `/inventory/movement` | 409 | ✅ INSUFFICIENT_STOCK | ✅ |
| `/vouchers/redeem` | 409 | ✅ ALREADY_REDEEMED | ✅ |
| `/vouchers/redeem` | 410 | ✅ EXPIRED | ✅ |
| `/vouchers/redeem` | 422 | ✅ INVALID/SUSPENDED | ✅ |
| `/bookings/:id/*` | 422 | ✅ INVALID_TRANSITION | ✅ |
| Todos los endpoints | 401 | ✅ (middleware) | ✅ |

### Tipos de dinero

OpenAPI documenta:

```yaml
Money:
  properties:
    amount:
      type: integer
      description: Minor currency units (e.g. 800000 = $8,000.00 MXN)
```

Runtime y Zod usan `number().int().min(0)`. **Alineados ✅**

### Márgenes en basis points

OpenAPI documenta: `"grossMarginBps: basis points (6000 = 60.00%)"`.
DB almacena `INTEGER`. Runtime usa `bps / 100` para mostrar porcentaje. **Alineados ✅**

---

## Nota sobre vocabulario de categorías

Existen dos enums de categoría distintos en el sistema:

| Contexto | Enum | Valores |
|----------|------|---------|
| Inventario (`dental_inventory_items`) | `dental_inventory_category` (DB enum) | CONSUMABLE, MATERIAL, INSTRUMENT, EQUIPMENT, PROSTHETIC, MEDICATION, OTHER |
| Catálogo (`dental_catalog_items`) | String con Zod enum | CONSULTATION, RESTORATION, ENDODONTICS, PERIODONTICS, SURGERY, ORTHODONTICS, PROSTHETICS, IMPLANTS, PREVENTIVE, COSMETIC, OTHER |

Son dominios semánticos distintos. El inventario modela **materiales e insumos**. El catálogo modela **tipos de servicio clínico**. Ambos están correctamente documentados en el OpenAPI actualizado.

---

## Estado final

`openapi/dental-api-v2.yaml` está sincronizado con el runtime.
Toda divergencia identificada fue corregida. Sin endpoints fantasma ni endpoints ocultos.
