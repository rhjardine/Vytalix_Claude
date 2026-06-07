# CFE Dental — Modelo de Dominio

> **Versión:** 2.0.0 | **Sprint:** CFE Dental Foundation v2.0

---

## Vocabulario Estandarizado

| Término | Definición |
|---|---|
| **Procedimiento** | Servicio odontológico facturable (ej. extracción, corona, implante) |
| **Cotización** | Propuesta económica presentada al paciente para un conjunto de procedimientos |
| **Presupuesto Congelado** | Una cotización cuyo precio ha sido bloqueado y no puede cambiar retrospectivamente |
| **Versión de Plan** | Iteración de una cotización tras modificaciones del paciente o el doctor |
| **Margen** | Diferencia entre precio de venta y costo base (expresado como % del precio de venta) |
| **Snapshot Financiero** | Registro inmutable de las condiciones económicas en el momento de cotizar |
| **Movimiento de Inventario** | Registro auditado de entrada o salida de material consumible |

---

## Entidades

### TreatmentCode
Enumeración de los 18 procedimientos soportados en v2.0.

```
BLANQUEAMIENTO_LASER | CARILLA_PORCELANA | CORONA_METAL_PORCELANA | CORONA_ZIRCONIA
IMPLANTE_TITANIO | ORTODONCIA_TRADICIONAL | ORTODONCIA_INVISIBLE
ENDODONCIA_ANTERIOR | ENDODONCIA_PREMOLAR | ENDODONCIA_MOLAR
EXTRACCION_SIMPLE | EXTRACCION_QUIRURGICA | LIMPIEZA_PROFILAXIS
RESTAURACION_RESINA | PROTESIS_PARCIAL | PROTESIS_TOTAL | INJERTO_OSEO | CIRUGIA_PERIODONTAL
```

### DentalProcedure
```typescript
{
  code:     TreatmentCode   // Procedimiento
  quantity: number          // Unidades (ej. 4 carillas)
  toothRef?: string         // Pieza dental (notación FDI, ej. "21-24")
  notes?:   string          // Notas clínicas o comerciales
}
```

### PricingRule
Descuento o precio especial aplicado a una cotización:
```typescript
{
  ruleId:           string
  type:             'FLAT_DISCOUNT' | 'PERCENT_DISCOUNT' | 'CORPORATE_RATE' | 'PACKAGE_BUNDLE'
  discountPct?:     number    // Para PERCENT_DISCOUNT
  flatAmountUsd?:   number    // Para FLAT_DISCOUNT
  corporatePriceUsd?: number  // Para CORPORATE_RATE
  validFrom:        string    // ISO date
  validUntil:       string    // ISO date
}
```

### ExchangeRateSnapshot
Tipo de cambio congelado para preservar la cotización histórica:
```typescript
{
  snapshotId:     string     // "FX-XXXXXXXX"
  baseCurrency:   string     // "USD"
  targetCurrency: string     // "MXN", "COP", etc.
  rate:           number
  lockedAt:       string     // ISO timestamp
  validUntil:     string
  provider:       string     // fuente de la tasa
}
```

### InventoryItem
```typescript
{
  itemId:        string
  tenantId:      string
  name:          string
  unit:          'UNIT' | 'ML' | 'GR' | 'TUBE' | 'PACK' | 'VIAL'
  unitCostUsd:   number
  currentStock:  number
  minimumStock:  number      // umbral de alerta de stock bajo
  linkedTreatmentCodes?: TreatmentCode[]
}
```

### InventoryMovement
Registro auditado e inmutable de cambios de stock:
```typescript
{
  movementId:     string      // "MOV-XXXXXXXX"
  tenantId:       string
  itemId:         string
  quantity:       number      // positivo = entrada, negativo = salida
  reason:         'PROCEDURE_CONSUMPTION' | 'PURCHASE' | 'ADJUSTMENT' | 'EXPIRY' | 'RETURN'
  treatmentRef?:  string      // planId o quoteId que causó el consumo
  patientRef?:    string
  performedBy:    string
  unitCostAtTime: number      // costo en el momento del movimiento
  performedAt:    string      // ISO timestamp inmutable
}
```

### FinancialSnapshot
Freeze completo e inmutable de las condiciones financieras de una cotización:
```typescript
{
  snapshotId:              string    // "FS-XXXXXXXX"
  // Desglose de costo
  totalMaterialsCostUsd:   number
  totalLabWorkUsd:         number
  totalLaborUsd:           number
  totalOverheadUsd:        number
  totalBaseCostUsd:        number
  // Precio
  appliedMarginPct:        number
  suggestedPriceUsd:       number
  discountAppliedUsd:      number
  finalPriceUsd:           number
  netProfitUsd:            number
  // Moneda
  currency:                string
  exchangeRate:            number
  exchangeSnapshotId:      string    // FK a ExchangeRateSnapshot
  totalInCurrency:         number
  // Financiamiento (opcional)
  financingMonths?:        number
  financingMonthlyPayment?: number
  financingTotalAmount?:   number
  financingInterestUsd?:   number
  // Metadatos de trazabilidad
  algorithmVersion:        string
  frozenAt:                string    // El timestamp de congelamiento
}
```

### TreatmentVersion
Versión inmutable de un plan de tratamiento:
```typescript
{
  versionNumber:    number
  procedures:       DentalProcedure[]
  appliedRules:     PricingRule[]
  financials:       FinancialSnapshot   // snapshot inmutable
  exchangeSnapshot: ExchangeRateSnapshot
  inventoryImpact:  InventoryImpactEstimate[]
  createdAt:        string
  createdBy:        string
  modificationsNote?: string
}
```

### TreatmentPlan
Contenedor de todo el historial de versiones de un presupuesto:
```typescript
{
  planId:         string              // "TP-XXXXXXXX"
  tenantId:       string
  patientRef:     string
  doctorRef:      string
  status:         'DRAFT' | 'PRESENTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  currentVersion: number
  versions:       TreatmentVersion[]  // historial completo
  createdAt:      string
  updatedAt:      string
}
```

---

## Invariantes del Dominio

1. Un `FinancialSnapshot` nunca se modifica — sólo se crea.
2. Un `TreatmentPlan` nunca pierde versiones anteriores.
3. Un `InventoryMovement` nunca se modifica — es append-only.
4. El `currentVersion` del plan siempre apunta a la última versión en `versions[]`.
5. El stock nunca puede ir a negativo — el engine rechaza la operación.
6. Las `PricingRule` vencidas nunca se aplican, aunque estén en la lista.
