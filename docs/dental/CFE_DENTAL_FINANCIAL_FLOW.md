# CFE Dental — Flujo Financiero Operacional

> **Versión:** 2.0.0 | **Sprint:** CFE Dental Foundation v2.0

---

## Flujo 1: Cotización de Tratamiento

```
[1] Doctor selecciona tratamientos
        │ DentalProcedure[]
        ▼
[2] QuoteOrchestrator.generate()
        │
        ├─[2a] DentalCostEngine.compute()
        │         Inputs: treatmentCode, quantity, chairRatePerHour, overheadPct, locationCode
        │         → materialsUsd + labWorkUsd + laborUsd + overheadUsd = subtotalUsd × locationFactor
        │
        ├─[2b] MarginEngine.compute()
        │         Inputs: costEstimate, financialRiskFactor, targetProfitMargin?
        │         → suggestedPriceUsd = riskAdjustedCost / (1 - margin%)
        │         → netProfitUsd = price - cost
        │
        ├─[2c] PricingRules.apply()
        │         Inputs: pricingRules[] con validFrom/validUntil
        │         → discountAppliedUsd, finalPriceUsd
        │
        ├─[2d] ExchangeEngine.generateSnapshot()
        │         → ExchangeRateSnapshot (congelado por 7 días)
        │         → totalInCurrency = finalPriceUsd × rate
        │
        ├─[2e] InventoryEngine.estimateImpact() [opcional]
        │         → InventoryImpactEstimate[] por material
        │         → inventoryWarnings[] si stock insuficiente
        │
        └─[2f] FinancialSnapshot (INMUTABLE)
                  + TreatmentVersion v1
                  + TreatmentPlan (status: DRAFT)
```

**Salida al Doctor:**
- Precio de venta sugerido en USD y moneda local
- Desglose de costos (materiales, labor, laboratorio, overhead)
- Margen y utilidad neta esperada
- Alertas de inventario si aplica
- Opciones de financiamiento

---

## Flujo 2: Modificación de Presupuesto

El paciente pide cambios. La cotización **NO** se sobrescribe:

```
[1] Doctor llama: QuoteOrchestrator.revise(existingPlan, newRequest, note)

[2] Se genera una nueva cotización completa (nuevo financial snapshot, nuevo FX snapshot)

[3] Se crea TreatmentVersion v(N+1)

[4] TreatmentPlan.versions[] = [...versiones anteriores, nueva versión]

[5] TreatmentPlan.currentVersion = N+1

[6] TreatmentPlan.status = 'DRAFT'
```

**Invariante:** La versión anterior siempre existe en `versions[N-2]`. El historial es **permanente**.

---

## Flujo 3: Consumo de Inventario (Post-Procedimiento)

```
[1] Procedimiento ejecutado → Doctor registra consumo

[2] InventoryEngine.recordMovement({
      itemId, quantity: -N, reason: 'PROCEDURE_CONSUMPTION',
      treatmentRef: planId, patientRef, performedBy
    })

[3] Validación: newStock = currentStock + quantity
    → Si newStock < 0: lanza error 422 "Insufficient stock"
    → Si newStock ≤ minimumStock: flag isLowStock = true

[4] Nuevo InventoryState con stock actualizado
    → InventoryMovement agregado al historial (inmutable)

[5] computeCOGS() agrega todos los movimientos PROCEDURE_CONSUMPTION
    → COGS total del período / procedimiento
```

---

## Estructura de Precios

```
Costo Base (USD)
├── Materiales:      materialsCostUsd × quantity
├── Laboratorio:     labWorkUsd × quantity
├── Labor:           (durationMin × sessions × complexityFactor / 60) × chairRate × quantity
└── Overhead:        (materiales + lab + labor) × overheadPct

Subtotal = Suma anterior
Ajuste Geográfico = subtotal × locationFactor (ej. US-BORDER = 1.20)
Costo Ajustado = subtotal × locationFactor

Ajuste de Riesgo = costoAjustado × (riskFactor - 1.0)
Costo con Riesgo = costoAjustado + ajuste

Precio Sugerido = costoConRiesgo / (1 - margenPct)
  margenPct dinámico: Estándar=30%, Moderada=40%, Compleja=50%, Muy Compleja=60%

Descuentos = aplicación de PricingRules válidas
Precio Final = Precio Sugerido - Descuentos

Precio en Moneda Local = Precio Final × tasaDeCambio (congelada en ExchangeRateSnapshot)
```

---

## Matriz de Tipos de Cambio Soportados

| Par | Fuente | Congelamiento |
|---|---|---|
| USD → MXN | STATIC_FALLBACK_v1 (v2: BCV/Yadio) | 7 días |
| USD → COP | STATIC_FALLBACK_v1 | 7 días |
| USD → ARS | STATIC_FALLBACK_v1 | 7 días |
| USD → EUR | STATIC_FALLBACK_v1 | 7 días |
| Cruzadas | Via USD | 7 días |

> **Nota:** En el próximo sprint, el `ExchangeEngine` se conectará a un proveedor real (BCV, Yadio) con fallback estático.
