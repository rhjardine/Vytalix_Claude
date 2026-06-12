# CFE_DENTAL_ALIGNMENT_REPORT.md
**Vytalix — CFE Dental Sprint 7: Cross-Layer Alignment Report**

---

## Estado de alineación por eje

### Eje 1: Prisma ↔ SQL Migrations

| Modelo Prisma | Tabla SQL | Alineado |
|---------------|-----------|---------|
| `TreatmentPlan` | `dental_treatment_plans` | ✅ |
| `TreatmentVersion` | `dental_treatment_versions` | ✅ |
| `InventoryItem` | `dental_inventory_items` | ✅ |
| `InventoryMovement` | `dental_inventory_movements` | ✅ |
| `FinancialSnapshot` | `dental_financial_snapshots` | ✅ |
| `DentalAuditLog` | `dental_audit_logs` | ✅ (añadido Sprint 7) |
| `DentalCatalogItem` | `dental_catalog_items` | ✅ (añadido Sprint 7) |
| `DentalPricingRule` | `dental_pricing_rules` | ✅ (añadido Sprint 7) |
| `ExchangeRateSnapshot` | `dental_exchange_rate_snapshots` | ✅ (añadido Sprint 7) |
| `DentalTenantSettings` | `dental_tenant_settings` | ✅ (añadido Sprint 7) |
| `DentalVoucher` | `dental_vouchers` | ✅ (añadido Sprint 7) |
| `DentalBooking` | `dental_bookings` | ✅ (añadido Sprint 7) |

**Cobertura:** 12/12 ✅

### Eje 2: SQL ↔ Repositories

| Tabla | Repositorio | Patrón RLS | Transaccional | Alineado |
|-------|-------------|-----------|---------------|---------|
| `dental_treatment_plans` | `TreatmentPlanRepository` | ✅ withTenant | ✅ FOR UPDATE | ✅ |
| `dental_treatment_versions` | `TreatmentPlanRepository` | ✅ withTenant | ✅ MAX(version)+1 | ✅ |
| `dental_inventory_items` | `InventoryRepository` | ✅ withTenant | ✅ FOR UPDATE | ✅ |
| `dental_inventory_movements` | `InventoryRepository` | ✅ withTenant | ✅ SUM derivado | ✅ |
| `dental_financial_snapshots` | `FinancialSnapshotRepository` | ✅ withTenant | ✅ INSERT-only | ✅ |
| `dental_audit_logs` | `AuditService` | ✅ withTenant | ✅ mismo client | ✅ |
| `dental_catalog_items` | `DentalCatalogRepository` | ✅ withTenant | N/A read-heavy | ✅ |
| `dental_pricing_rules` | `PricingRuleRepository` | ✅ withTenant | N/A read-heavy | ✅ |
| `dental_exchange_rate_snapshots` | `ExchangeRateRepository` | ✅ withTenant | ✅ INSERT-only | ✅ |
| `dental_tenant_settings` | `TenantSettingsService` | ✅ withTenant | ✅ ON CONFLICT | ✅ |
| `dental_vouchers` | `DentalVoucherEngine` | ✅ withTenant | ✅ FOR UPDATE | ✅ |
| `dental_bookings` | `DentalBookingEngine` | ✅ withTenant | ✅ status WHERE | ✅ |

**Cobertura:** 12/12 ✅

### Eje 3: Repositories ↔ Routers

| Repositorio / Engine | Router que lo consume | Usa validate() | Propaga correlationId | Alineado |
|---------------------|----------------------|---------------|----------------------|---------|
| `QuoteOrchestrator` | `dentalRouter /quote` | ✅ CreateQuoteSchema | ✅ | ✅ |
| `TreatmentPlanRepository` | `dentalRouter /treatment-plan` | ✅ CreateTreatmentPlanSchema | ✅ | ✅ |
| `TreatmentPlanRepository.sealAndAdvanceVersion` | `dentalRouter /seal` | ✅ SealPlanVersionSchema (corregido S7) | ✅ | ✅ |
| `InventoryRepository` | `dentalRouter /inventory` | ✅ InventoryMovementSchema | ✅ | ✅ |
| `DentalCatalogRepository` | `dentalAdminRouter /catalog` | ✅ CreateCatalogItemSchema | ✅ | ✅ |
| `PricingRuleRepository` | `dentalAdminRouter /pricing-rules` | ✅ CreatePricingRuleSchema | ✅ | ✅ |
| `ExchangeRateRepository` | `dentalAdminRouter /exchange-rates` | ✅ CreateExchangeRateSchema | ✅ | ✅ |
| `TenantSettingsService` | `dentalAdminRouter /settings` | ✅ UpsertTenantSettingsSchema | ✅ | ✅ |
| `FinancialSnapshotRepository` | `dentalAdminRouter /analytics` | N/A (query) | ✅ | ✅ |
| `DentalCatalogRepository + PricingRuleRepository` | `dentalCommerceRouter /catalog` | N/A (GET) | ✅ | ✅ |
| `DentalVoucherEngine` | `dentalCommerceRouter /vouchers` | ✅ IssueDentalVoucherSchema | ✅ | ✅ |
| `DentalBookingEngine` | `dentalCommerceRouter /bookings` | ✅ CreateDentalBookingSchema | ✅ | ✅ |

**Cobertura:** 12/12 ✅

### Eje 4: Routers ↔ OpenAPI

| Endpoint en runtime | En OpenAPI | Schema request | Códigos HTTP | Alineado |
|--------------------|-----------|---------------|-------------|---------|
| `POST /dental/quote` | ✅ | ✅ | 200/400/422 | ✅ |
| `POST /dental/treatment-plan` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/treatment-plan/:id` | ✅ | N/A | 200/404 | ✅ |
| `POST /dental/treatment-plan/:id/seal` | ✅ | ✅ (F7 corregido) | 200/400 | ✅ |
| `POST /dental/inventory/items` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/inventory` | ✅ | N/A | 200 | ✅ |
| `POST /dental/inventory/movement` | ✅ | ✅ | 201/409 | ✅ |
| `GET /dental/inventory/:id/movements` | ✅ | ✅ | 200 | ✅ |
| `GET /dental/metrics` | ✅ | ✅ | 200 | ✅ |
| `POST /dental/admin/catalog` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/admin/catalog` | ✅ | ✅ (enum F4 corregido) | 200 | ✅ |
| `GET /dental/admin/catalog/:code` | ✅ | ✅ | 200/404 | ✅ |
| `POST /dental/admin/pricing-rules` | ✅ | ✅ | 201/400 | ✅ |
| `POST /dental/admin/exchange-rates` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/admin/exchange-rates/latest` | ✅ | ✅ | 200/404 | ✅ |
| `PUT /dental/admin/settings` | ✅ | ✅ | 200/400 | ✅ |
| `GET /dental/admin/settings` | ✅ | ✅ | 200 | ✅ |
| `GET /dental/admin/analytics/revenue` | ✅ | ✅ | 200/400 | ✅ |
| `GET /dental/admin/analytics/margin` | ✅ | ✅ | 200/404 | ✅ |
| `GET /dental/admin/analytics/inventory` | ✅ | ✅ | 200 | ✅ |
| `GET /dental/commerce/catalog` | ✅ | ✅ (enum F4 corregido) | 200 | ✅ |
| `GET /dental/commerce/catalog/:code` | ✅ | ✅ | 200/404 | ✅ |
| `POST /dental/commerce/vouchers` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/commerce/vouchers/:token` | ✅ | ✅ | 200/404 | ✅ |
| `POST /dental/commerce/vouchers/redeem` | ✅ | ✅ | 200/409/410/422 | ✅ |
| `POST /dental/commerce/bookings` | ✅ | ✅ | 201/400 | ✅ |
| `GET /dental/commerce/bookings/:id` | ✅ | ✅ | 200/404 | ✅ |
| `POST /dental/commerce/bookings/:id/confirm` | ✅ | ✅ | 200/422 | ✅ |
| `POST /dental/commerce/bookings/:id/check-in` | ✅ | ✅ | 200/422 | ✅ |
| `POST /dental/commerce/bookings/:id/complete` | ✅ | ✅ | 200/422 | ✅ |
| `POST /dental/commerce/bookings/:id/cancel` | ✅ | ✅ | 200/422 | ✅ |

**Total endpoints runtime:** 31 | **Documentados en OpenAPI:** 31 | **Cobertura:** 31/31 ✅

---

## Resumen de alineación

| Eje | Antes Sprint 7 | Después Sprint 7 |
|-----|---------------|-----------------|
| Prisma ↔ SQL | 5/12 modelos | 12/12 ✅ |
| SQL ↔ Repositories | 12/12 | 12/12 ✅ |
| Repositories ↔ Routers | 11/12 (seal sin validate) | 12/12 ✅ |
| Routers ↔ OpenAPI | 29/31 (enums faltantes) | 31/31 ✅ |
| Zod Schema consistency | 1 bug (record enum keys) | ✅ corregido |
| Métricas | Sistema dual | Sistema único ✅ |
