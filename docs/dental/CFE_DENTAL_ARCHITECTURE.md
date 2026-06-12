# CFE Dental — Arquitectura del Sistema

> **Vytalix v2 | Sprint: CFE Dental Foundation v2.0**  
> **Clasificación:** Documento Técnico Interno  
> **Última actualización:** 2026-06-07

---

## 1. Posición en el Ecosistema Vytalix

```
Vytalix Ecosystem
│
├── src/core/            ← Motor clínico: riesgo CV, decisiones médicas
├── src/longevity/       ← Edad biológica, preventive score, referral
├── src/platform/        ← DB, Redis, logger, metering, SDK Disglobal
├── src/shared/          ← Contratos públicos, engagement
│
└── src/dental/          ← CFE Dental (dominio autónomo)
    ├── types.ts             ← ÚNICA fuente de verdad de entidades
    ├── dental-cost.engine.ts
    ├── margin.engine.ts
    ├── exchange.engine.ts
    ├── inventory.engine.ts  ← NUEVO
    ├── snapshot.engine.ts
    ├── quote.orchestrator.ts ← NUEVO: punto de entrada principal
    ├── dental-pricing.service.ts
    └── index.ts             ← NUEVO: barrel público del dominio
```

## 2. Contrato de Aislamiento (Regla Estricta)

| Dirección | Permitido | Prohibido |
|---|---|---|
| `src/dental` → `src/shared` | ✅ Contratos explícitos únicamente | ❌ Importar lógica clínica |
| `src/dental` → `src/core` | ❌ NUNCA | — |
| `src/dental` → `src/longevity` | ❌ NUNCA | — |
| `src/core` → `src/dental` | ❌ NUNCA | — |
| `src/api` → `src/dental` | ✅ Solo a través de `src/dental/index.ts` | ❌ Importar archivos internos directamente |

**Verificación:** `grep -r "from.*dental" src/core` debe retornar vacío.

## 3. Flujo de Datos de una Cotización

```
Doctor ingresa tratamientos
         │
         ▼
QuoteOrchestrator.generate()
         │
         ├──► DentalCostEngine.compute()        → CostEstimateResult × N
         │         (materiales + labor + overhead + location factor)
         │
         ├──► MarginEngine.compute()            → MarginEngineResult × N
         │         (aplica margen según complejidad + riesgo financiero)
         │
         ├──► PricingRule.apply()               → descuentos y reglas
         │
         ├──► ExchangeEngine.generateSnapshot() → ExchangeRateSnapshot (congelado)
         │
         ├──► InventoryEngine.estimateImpact()  → InventoryImpactEstimate[]
         │         (opcional; detecta stock insuficiente)
         │
         └──► FinancialSnapshot (inmutable)
                   + TreatmentVersion v1
                   + TreatmentPlan (status: DRAFT)
                         │
                         ▼
                 QuoteResult (entregado al doctor)
```

## 4. Principios de Diseño

### 4.1 Motores Puros
Todos los motores son **funciones puras sin side effects**:
- No conectan a DB
- No llaman APIs externas
- Mismo input → mismo output (determinismo verificado en tests)
- Fallan con errores descriptivos y statusCode semántico

### 4.2 Inmutabilidad de Snapshots
La entidad `FinancialSnapshot` es **append-only**. Una vez creada:
- **Nunca** se modifica
- Cada cambio al plan genera una nueva `TreatmentVersion` con su propio snapshot
- El historial de versiones se conserva completo en `TreatmentPlan.versions[]`

### 4.3 Inventario sin Persistencia (Sprint Actual)
El `InventoryEngine` opera sobre un `InventoryState` en memoria. En el siguiente sprint se persiste en DB. El diseño es funcional puro — el estado se pasa como argumento y el resultado es un nuevo estado inmutable.

### 4.4 Idempotencia de IDs
Los IDs de `TreatmentPlan`, `FinancialSnapshot` y `ExchangeRateSnapshot` son generados con `crypto.randomUUID()` — seguros y únicos.

## 5. Decisiones Arquitectónicas

| Decisión | Justificación |
|---|---|
| `types.ts` como única fuente de entidades | Evita inconsistencias entre motores; un único lugar para cambiar |
| `index.ts` como barrel público | Permite refactoring interno sin romper importadores externos |
| `QuoteOrchestrator` como punto de entrada | Coordina todos los motores; simplifica el test de integración |
| `InventoryState` en memoria con diseño funcional | Permite adoptar persistencia sin cambiar la interfaz |
| `ExchangeRateSnapshot` congelado al momento de cotizar | El presupuesto no varía si el tipo de cambio cambia después |

## 6. Expansión Futura (No en este Sprint)

- **Persistencia:** `TreatmentPlanRepository` (Prisma) para `TreatmentPlan` e `InventoryMovement`
- **API HTTP:** Endpoint `POST /api/v2/dental/quote` registrado en `src/server.ts`
- **PricingRule corporativa:** Convenios por empresa o aseguradora
- **Agenda de consultas:** Si el flujo de cobro lo requiere
- **Reportes financieros:** COGS mensual, margen por procedimiento, por doctor
