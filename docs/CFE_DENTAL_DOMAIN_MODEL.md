# CFE Dental — Modelo de Dominio

Este documento define el vocabulario estandarizado y las estructuras de datos fundamentales para la vertical financiera odontológica.

## 1. DentalProcedure
Representa la unidad atómica de facturación y costeo.

```typescript
export type TreatmentCode = 'LIMPIEZA_PROFILAXIS' | 'CORONA_ZIRCONIA' | 'IMPLANTE_TITANIO' | ...;

export interface DentalProcedure {
  code: TreatmentCode;
  quantity: number;
  notes?: string;
}
```

## 2. FinancialSnapshot
Captura inmutable del estado financiero acordado (o propuesto) para un paciente en un instante de tiempo.

```typescript
export interface FinancialSnapshot {
  totalCostUsd: number;             // Costo real interno
  suggestedMarginPct: number;       // Margen de ganancia
  finalPriceUsd: number;            // Precio de venta sugerido
  currency: string;                 // Moneda destino (ej. MXN)
  exchangeRate: number;             // Tasa aplicada
  totalInCurrency: number;          // Monto a pagar
  financingMonths?: number;         // Plazo de cuotas
  financingMonthlyPayment?: number; // Valor de la cuota
}
```

## 3. TreatmentVersion
Versión específica de un plan. Se crea cada vez que el odontólogo o el paciente alteran las condiciones clínicas o financieras.

```typescript
export interface TreatmentVersion {
  versionNumber: number;            // Incrementa secuencialmente (1, 2, 3...)
  procedures: DentalProcedure[];    // Tratamientos incluidos
  financials: FinancialSnapshot;    // Condiciones financieras
  createdAt: string;                // Timestamp ISO
  createdBy: string;                // UUID del operador
  modificationsNote?: string;       // Ej. "Se removió la carilla a petición del paciente"
}
```

## 4. TreatmentPlan
Contenedor maestro que agrupa toda la línea temporal de versiones propuestas al paciente para resolver un cuadro clínico particular.

```typescript
export interface TreatmentPlan {
  planId: string;                   // Identificador único del plan (ej. TP-1234)
  tenantId: string;
  patientRef: string;               // ID del paciente
  status: 'DRAFT' | 'PRESENTED' | 'ACCEPTED' | 'REJECTED';
  currentVersion: number;           // Apunta a la versión activa
  versions: TreatmentVersion[];     // Historial completo
}
```

## 5. ExchangeRateSnapshot
Congelamiento de la tasa de cambio utilizada para garantizar que la clínica asume o mitiga el riesgo cambiario correctamente durante la validez del presupuesto (generalmente 7 a 30 días).

```typescript
export interface ExchangeRateSnapshot {
  baseCurrency: string;             // ej. USD
  targetCurrency: string;           // ej. MXN
  rate: number;                     // ej. 17.15
  lockedAt: string;
  validUntil: string;
  provider: string;                 // Origen de la tasa
}
```

## 6. PricingRule (Próximamente)
Reservado para Fase 3. Representará descuentos corporativos, convenios con aseguradoras, o promociones por volumen (ej. "Tercera carilla al 50%").
