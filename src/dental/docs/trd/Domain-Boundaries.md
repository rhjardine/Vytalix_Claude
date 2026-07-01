# Domain-Boundaries.md

---

## Estado del documento

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO — autoridad normativa |
| Ruta canónica | `src/dental/docs/trd/Domain-Boundaries.md` |
| Mantenido por | Arquitecto Principal |
| Última revisión | 2026-06 |

---

## Objetivo

Definir con precisión los bounded contexts del ecosistema Vytalix, sus responsabilidades, sus dependencias autorizadas y las prohibiciones de cruce que garantizan la integridad del sistema multitenant clínico-comercial.

---

## Bounded contexts oficiales

### 1. Core Clinical Domain

**Raíz:** `src/core/`, `src/shared/`

**Responsabilidades:**
- Motor de decisión clínica (`DecisionEngine`)
- Cálculo de riesgo cardiovascular Framingham 2008
- Motor biofísico DAAa v2.1
- Puntuación preventiva (`PreventiveScoreService`)
- Motor de derivación (`ReferralEngine`)
- Ingesta y normalización de observaciones LOINC
- Trazabilidad de decisiones y explainability

**Invariantes:**
- Ningún resultado clínico se modifica retroactivamente. Los registros son append-only.
- El médico está siempre en el loop. Ninguna lógica del motor produce acciones autónomas sin revisión.
- Los algoritmos son deterministas y versionables. Cada ejecución almacena su `inputSnapshot` y `algorithmVersion`.
- Prohibido importar desde cualquier otra capa vertical (incluido `src/dental/`).

---

### 2. Platform Domain

**Raíz:** `src/platform/`, `src/api/middlewares/`, `src/api/pipelines/`

**Responsabilidades:**
- Infraestructura multitenant: `withTenant()`, `SET LOCAL app.current_tenant_id`
- Seguridad: JWT, API Key, RLS, HMAC, consentimiento
- Orquestación de pipelines clínicos (`PipelineOrchestrator`, `PlatformPipelineOrchestrator`)
- Event Bus interno (`src/platform/event-bus`)
- Métricas Prometheus y observabilidad
- Metering y billing (`src/platform/metering.service`)
- Redis: caché, rate limiting, idempotencia

**Invariantes:**
- `withTenant()` es el único mecanismo de acceso a la base de datos. Prohibida la conexión directa sin contexto de tenant.
- RLS se configura exclusivamente mediante migraciones SQL ejecutadas, nunca por configuración dinámica en runtime.
- Los secretos de tenant se provisionan desde la capa de plataforma, nunca desde variables de entorno como fallback en producción.

---

### 3. Commercial / API Domain

**Raíz:** `src/api/handlers/`, `openapi/`

**Responsabilidades:**
- Exposición HTTP: routers Express, middlewares de validación Zod
- Autenticación y autorización: `requireApiKey()`, `authMiddleware()`, `requireRole()`
- Integración con terceros (Disglobal, partners)
- Facturación y cuotas de API
- Contratos OpenAPI como fuente de verdad de contratos HTTP

**Invariantes:**
- Los routers HTTP no contienen lógica de negocio clínica ni financiera. Son adaptadores puros.
- El contrato OpenAPI prevalece sobre cualquier implementación divergente. Una discrepancia es un defecto.
- Los pagos y la emisión de vouchers ocurren después de confirmación de pago, nunca antes.

---

### 4. Dental Domain (vertical satélite)

**Raíz:** `src/dental/`

**Responsabilidades:**
- Motores de costos, márgenes y tipos de cambio dental (`DentalCostEngine`, `MarginEngine`, `ExchangeEngine`)
- Motor de inventario dental (`InventoryEngine`)
- Orquestador de cotizaciones (`QuoteOrchestrator`)
- Motor de vales digitales (`DentalVoucherEngine`) con HMAC-SHA256
- Motor de reservas dentales (`DentalBookingEngine`) con máquina de estados
- Repositorios financieros dentales
- Auditoría dental append-only (`AuditService`)
- Métricas Prometheus propias de la vertical

**Invariantes:**
- El dominio dental es una vertical satélite autónoma. No puede modificar el Core Clinical Domain.
- `src/dental/index.ts` es el único punto de entrada para importaciones externas al dominio dental.
- Ningún archivo externo importa directamente de `src/dental/*.engine.ts` ni de `src/dental/repositories/`.
- **Excepción Composition Root:** `src/server.ts` actúa como Composition Root y puede importar routers HTTP directamente (`src/dental/routers/*.router.ts`) para montarlos. Esto no aplica a handlers ni a lógica de dominio, que sí deben consumir el barrel.
- Los costos base (`baseCost`) nunca se exponen a socios externos. Solo se expone el precio resuelto.
- Los montos monetarios se almacenan en unidades menores (centavos enteros). Prohibidos los valores decimales en base de datos.

---

### 5. Frontend Dental — Superficie de presentación

**Raíz:** `frontend-dental/`

**Responsabilidades:**
- Interfaz administrativa Next.js 14 para operadores de la clínica
- Visualización de datos provenientes del backend vía API REST
- Gestión de sesión de tenant (token + tenantId via `TenantProvider`)

**Lo que NO es:**
- No es un dominio de negocio.
- No define contratos de API; los consume desde el backend.
- No contiene lógica clínica ni financiera.
- No es el motor de precios; muestra los precios calculados por el backend.
- No accede directamente a la base de datos.

**Invariantes:**
- El frontend nunca importa Prisma ni accede a la base de datos.
- Toda la lógica de precios reside en el backend. El frontend recibe el precio resuelto.
- `src/lib/api/client.ts` es el único adaptador HTTP del frontend. Prohibidos los `fetch()` directos fuera de él.
- Los tipos en `src/types/dental.ts` son espejos de los tipos del backend, no definiciones originales.

---

## Matriz de dependencias permitidas

| Origen | Puede importar de |
|---|---|
| Core Clinical | `src/shared/`, `src/platform/` |
| Platform | `src/shared/` |
| Commercial/API | `src/core/`, `src/platform/`, `src/dental/index.ts`, `src/shared/` |
| Dental | `src/shared/`, `src/platform/db` (vía `withTenant`) |
| Frontend | API REST del backend exclusivamente |

---

## Dependencias estrictamente prohibidas

| Origen | No puede importar de |
|---|---|
| Core Clinical | `src/dental/`, `src/api/handlers/`, `frontend-dental/` |
| Dental | `src/core/`, `src/longevity/` directamente — solo mediante eventos o contratos |
| Frontend | `prisma/`, `src/dental/`, `src/core/`, cualquier módulo de servidor |
| Cualquier dominio | Otro dominio saltando su barrel o adaptador |

---

## Shared kernel autorizado

Los siguientes artefactos son compartidos entre dominios sin violar los límites:

- `src/shared/types/domain.ts` — tipos primitivos (`TenantId`, `Money`, `ApiResponse`)
- `src/platform/db.ts` — acceso a base de datos mediante `withTenant()`
- `src/platform/logger.ts` — logging estructurado
- `src/platform/redis.ts` — cliente Redis singleton
- `src/shared/middleware/` — middlewares de validación y contexto de tenant

---

## Leyes inmutables de arquitectura

**Ley 1 — Domain Isolation**
Ningún dominio importa internals de otro dominio. Los cruces ocurren exclusivamente a través de contratos publicados (OpenAPI, barrels de índice, event bus) o adaptadores explícitos.

**Ley 2 — OpenAPI First**
Todo endpoint HTTP tiene su contrato definido en un archivo OpenAPI antes de su implementación. La implementación no puede contradecir el contrato. El contrato es Nivel 1.

**Ley 3 — RLS Obligatorio**
Todo acceso a datos de tenant pasa por `withTenant()`, que establece `SET LOCAL app.current_tenant_id`. No existe acceso directo a la base de datos sin contexto de tenant. Las políticas RLS de PostgreSQL son la segunda línea de defensa obligatoria.

**Ley 4 — Clinical & Financial Append-Only**
Los registros clínicos (`biological_age_assessments`, `audit_logs`, `dental_audit_logs`, `dental_inventory_movements`, `dental_financial_snapshots`) son inmutables una vez escritos. Los triggers de base de datos `prevent_modification()` y `trg_immutable_*` refuerzan esta ley a nivel de motor de base de datos.

**Ley 5 — Anti-Corruption Layer**
El dominio dental no invoca directamente servicios del core clínico. La comunicación entre la vertical dental y el core ocurre mediante el event bus (`vitality.assessed`, `referral.triggered`) o mediante contratos HTTP. No mediante imports directos entre dominios.

---

## Anti-corruption layers

| Frontera | Mecanismo |
|---|---|
| Dental → Core Clinical | Event bus (`eventBus.on('vitality.assessed', ...)`) |
| Core Clinical → Commercial | Handlers HTTP en `src/api/handlers/` como adaptadores |
| Partners externos → Platform | API Key + OpenAPI contract en `/api/v2/*` |
| Frontend → Backend | Cliente HTTP tipado `src/lib/api/client.ts` |
| Dental → Platform DB | `withTenant()` como único punto de acceso |

---

## Decisión de gobernanza

**DG-004** — *Dental como satélite autónomo*

La vertical dental (`src/dental/`) se despliega dentro del monorepo pero mantiene aislamiento de dominio estricto. Su ciclo de sprint (Sprint 4–7 completados) avanza independientemente del core clínico. Los engines dentales son puros y no tienen dependencias de runtime hacia el core. Esta autonomía es intencional y debe preservarse en cualquier refactorización futura.

**DG-005** — *Frontend no define contratos*

Cualquier cambio de contrato que se origine en el frontend requiere primero actualizar el contrato OpenAPI y el handler Express. El orden es siempre: OpenAPI → Backend → Frontend. El orden inverso viola Ley 2.
