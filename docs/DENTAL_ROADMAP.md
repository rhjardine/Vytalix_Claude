# CFE Dental — Roadmap de Odontología Financiera Inteligente
## Vertical paralela sobre infraestructura Vytalix

> **Estado:** Fase 1 implementada — motores de costo y precio activos  
> **Prioridad:** Alta — vertical comercialmente independiente

---

## 1. Visión del producto

CFE Dental es la primera expansión vertical de Vytalix hacia **odontología financiera inteligente**.  

Mientras Vytalix Core sirve a Doctor Antivejez y Disglobal con inteligencia preventiva y longevidad, CFE Dental cubre una brecha diferente: **la brecha entre el costo real de los tratamientos y la capacidad de pago del paciente**, con herramientas para el odontólogo que le permiten ofrecer precios justos, financiamiento accesible y trazabilidad clínica.

### Actores del ecosistema dental

| Actor | Rol |
|-------|-----|
| **CFE Dental** | Autoridad de protocolos y validación odontológica |
| **Vytalix** | Motor de cálculo, pricing, trazabilidad y APIs |
| **Clínicas / Dentistas** | Consumidores de la API — generan cotizaciones para pacientes |
| **Pacientes** | Usuarios finales — reciben precios transparentes y opciones de financiamiento |
| **Aseguradoras / HR** | B2B — acceden a métricas de salud bucal de cohortes |

---

## 2. Arquitectura de la vertical

### Módulos implementados (Fase 1 ✅)

```
src/dental/
  ├── dental-cost.engine.ts       ← Cálculo de costo interno (18 tratamientos)
  ├── dental-pricing.service.ts   ← Precio al paciente + financiamiento
  └── dental.handler.ts           ← 6 endpoints HTTP + schema DB
```

### Endpoints activos

| Método | Ruta | Propósito |
|--------|------|-----------|
| `GET`  | `/api/v2/dental/treatments` | Catálogo de tratamientos |
| `GET`  | `/api/v2/dental/treatments/:code` | Detalle de tratamiento |
| `POST` | `/api/v2/dental/cost-estimate` | Costo interno (no visible al paciente) |
| `POST` | `/api/v2/dental/price-quote` | Cotización con margen + financiamiento |
| `POST` | `/api/v2/dental/treatment-snapshot` | Plan inmutable aprobado por paciente |
| `GET`  | `/api/v2/dental/snapshots/:id` | Recuperar snapshot |

### Request/Response de ejemplo — cotización

```bash
curl -X POST https://api.vytalix.health/api/v2/dental/price-quote \
  -H "X-API-Key: vyx_dental_k1_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "treatments": [
      { "code": "CORONA_ZIRCONIA", "quantity": 2 },
      { "code": "BLANQUEAMIENTO_LASER", "quantity": 1 }
    ],
    "locationCode": "MX-MTY",
    "currency": "MXN",
    "includeFinancing": true,
    "marginPct": 2.5,
    "chairRatePerHour": 90
  }'
```

**Response:**
```json
{
  "quoteId": "QT-M8X2P4R",
  "lineItems": [
    { "treatmentName": "Corona de Zirconia", "quantity": 2, "priceUsd": 1750, "sessions": 2 },
    { "treatmentName": "Blanqueamiento Láser", "quantity": 1, "priceUsd": 281, "sessions": 1 }
  ],
  "totalUsd": 2031,
  "currency": "MXN",
  "totalInCurrency": 34831.65,
  "exchangeRate": 17.15,
  "financingOptions": [
    { "months": 3,  "monthlyPayment": 11610.55, "label": "3 meses sin intereses" },
    { "months": 6,  "monthlyPayment": 5805.28,  "label": "6 meses sin intereses" },
    { "months": 12, "monthlyPayment": 3050.12,  "label": "12 meses (8% anual)" }
  ],
  "validUntil": "2025-07-03T00:00:00.000Z"
}
```

---

## 3. Catálogo de tratamientos Fase 1

| Categoría | Tratamientos |
|-----------|-------------|
| **Estética** | Blanqueamiento Láser, Carilla de Porcelana |
| **Restaurativa** | Corona Metal-Porcelana, Corona de Zirconia, Endodoncia (anterior/premolar/molar), Restauración en Resina |
| **Quirúrgica** | Implante de Titanio, Extracción Simple/Quirúrgica, Injerto Óseo, Cirugía Periodontal |
| **Ortodoncia** | Ortodoncia Tradicional, Alineadores Invisibles |
| **Preventiva** | Limpieza y Profilaxis |
| **Prostodoncia** | Prótesis Parcial, Prótesis Total |

**Ajuste por ubicación soportado:** MX-CDMX, MX-MTY, MX-GDL, MX-TIJ, US-BORDER, CO-BOG, AR-BUE, y 8 más.

---

## 4. Schema de base de datos

```prisma
model DentalTreatmentSnapshot {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String   @db.Uuid
  patientRef       String   @db.VarChar(100)   // pseudonymous
  status           DentalSnapshotStatus @default(PENDING)
  treatments       Json     @db.JsonB           // immutable treatment list
  priceQuoteId     String   @db.VarChar(50)
  totalUsd         Decimal  @db.Decimal(10, 2)
  currency         String   @db.VarChar(3)
  approvedBy       String?  @db.Uuid            // dentist UUID
  consentGiven     Boolean                      // REQUIRED before snapshot
  algorithmVersion String   @db.VarChar(50)
  completedAt      DateTime? @db.Timestamptz
  cancelledAt      DateTime? @db.Timestamptz
  createdAt        DateTime @default(now()) @db.Timestamptz

  @@index([tenantId, patientRef])
  @@index([tenantId, status])
  @@map("dental_treatment_snapshots")
}
```

**Principio de inmutabilidad:** Los snapshots son append-only. Una vez creado el plan de tratamiento aprobado, no se modifica. Si cambia, se crea uno nuevo con referencia al anterior.

---

## 5. Reutilización de infraestructura Vytalix

CFE Dental reutiliza directamente sin modificaciones:

| Componente Vytalix | Uso en CFE Dental |
|-------------------|-------------------|
| `api-key.middleware.ts` | Auth con scopes `dental:read`, `dental:write` |
| `consent.guard.ts` | Consentimiento del paciente antes del snapshot |
| `audit_logs` | Trazabilidad de cotizaciones y aprobaciones |
| `calculation_versions` | Versionado del motor de costos dental |
| `metering.service.ts` | Billing por llamada (POST /dental/price-quote = $0.08) |
| `redis.ts` | Cache de catálogo y tasas de cambio (TTL 1h) |
| `trace.middleware.ts` | Correlation IDs en todas las solicitudes |

---

## 6. Roadmap por fases

### Fase 1 — Motores base ✅ COMPLETO

- [x] 18 tratamientos en catálogo
- [x] Cost engine determinista y versionado
- [x] Pricing con margen configurable
- [x] Financiamiento (5 planes: 3/6/12/18/24 meses)
- [x] Multi-moneda (10 pares de cambio)
- [x] Treatment snapshot inmutable
- [x] 6 endpoints HTTP activos
- [x] Tests unitarios (dental-cost.test.ts)

### Fase 2 — Inteligencia clínica dental (Q3 2025)

- [ ] **Historial de salud bucal del paciente** — serie de tiempo de tratamientos
- [ ] **Risk scoring periodontal** — probabilidad de recurrencia y complicaciones
- [ ] **Tratamiento preventivo recomendado** — basado en historial (physician-in-the-loop)
- [ ] **Integración con imaging** — análisis de radiografías (Computer Vision, stub Phase 3)
- [ ] **Segunda opinión engine** — comparación de tratamientos alternativos

### Fase 3 — Integración financiera (Q4 2025)

- [ ] **Pasarela de pagos integrada** — Stripe / Conekta / PayCaddy
- [ ] **Financiamiento con terceros** — integración con financieras dentales (Kueski, etc.)
- [ ] **Seguro dental** — cotización y activación de cobertura básica
- [ ] **Vouchers y beneficios** — integración con HR tech (beneficios de empleados)
- [ ] **Tesorería multi-clínica** — para grupos dentales con varias sedes

### Fase 4 — Marketplace dental (Q1 2026)

- [ ] **Directorio de especialistas** — búsqueda por tratamiento + ubicación
- [ ] **Comparador de cotizaciones** — anonimizado, entre clínicas participantes
- [ ] **CFE Dental Score** — score de confianza de la clínica basado en resultados
- [ ] **Población insights** — métricas de salud bucal por cohorte para aseguradoras
- [ ] **Exportación CDROM/FHIR** — compatible con expedientes digitales

---

## 7. Modelo comercial

| Tier | Target | Precio | APIs incluidas |
|------|--------|--------|---------------|
| **Starter** | Consultorios independientes | $99/mes | cost-estimate, price-quote, snapshots |
| **Clinical Pro** | Grupos dentales (3–10 sedes) | $499/mes | Todas + analytics |
| **Enterprise** | Cadenas (10+ sedes) | Custom | Todas + white-label + insurance API |
| **Pay-per-use** | Integradores / HR tech | $0.08/cotización | price-quote únicamente |

### Revenue share con clínicas aliadas

```
Paciente agenda consulta desde cotización Vytalix
  → Conversión trackeable por referral token
  → Vytalix cobra 5% del tratamiento completado
  → Clínica retiene 95%
```

---

## 8. Riesgos y decisiones de diseño

| ID | Riesgo | Mitigación |
|----|--------|-----------|
| D-01 | Costos de materiales varían por región y proveedor | `locationFactor` + `chairRatePerHour` configurables por tenant. Dental cataloga actualizable vía admin API |
| D-02 | Tipos de cambio desactualizados | Cache 1h en Redis. Fase 3: integración live con Fixer.io/Banxico API |
| D-03 | Regulación de cotizaciones odontológicas (NOM/SAT) | Disclaimer explícito en respuesta: "cotización orientativa, sujeta a evaluación clínica". No es factura |
| D-04 | Sobrelapso con Vytalix Core (RLS, auth) | CFE Dental es un módulo Vytalix, no un sistema separado. Comparte toda la infraestructura |
| D-05 | Catálogo de tratamientos estático | `calculation_versions` gestiona versiones. Admin API para actualizar catálogo sin deploy |

---

## 9. Criterios de aceptación — Fase 1

```
✅ GET /dental/treatments devuelve 18 tratamientos categorizados
✅ POST /dental/cost-estimate → cálculo determinista con breakdown
✅ POST /dental/price-quote → precio con margen + 5 opciones de financiamiento
✅ POST /dental/treatment-snapshot → registro inmutable, requiere consentGiven=true
✅ Tests unitarios: 100% pass en dental-cost.test.ts
✅ Todos los endpoints requieren dental:read o dental:write scope
✅ Respuestas incluyen algorithmVersion y computedAt (trazabilidad)
✅ Multi-moneda: USD + MXN + COP + ARS + EUR y 6 más
```

---

*Documento generado por: Agente Future Vertical Planner*  
*Versión: 1.0 — Fase 1 completa*  
*Próxima revisión: inicio de Fase 2*
