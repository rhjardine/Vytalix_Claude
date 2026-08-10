# F1_MIGRATION_GOVERNANCE_VERIFICATION.md
> **Vytalix Platform — Funnel Reactivation (F1) · Database Migration Governance & Schema-Drift Verification**

| Campo | Valor |
|---|---|
| Rol | Verificación de gobernanza de BD (no implementación) |
| Rama | `adr/baseline-2026` |
| Alcance | ¿La reactivación F1 es correcta, consistente con la BD, deployment-ready y sincronizada? |
| Fuente de verdad | Repositorio + entorno real. Cada conclusión cita evidencia. |
| Fecha | 2026-07 |

> **Regla observada:** no se asume nada; no se modifica lógica/negocio/OpenAPI/API; toda conclusión con evidencia; si falta evidencia, se declara explícitamente.

---

## 1. Executive Summary

**Veredicto: `READY WITH OBSERVATIONS`.**

El código de F1 (router `createFunnelRouter`, fix TD-18, montaje `/api/funnel`) está **validado en capa de código** (typecheck 31; sandbox 49/49; AEK PASS 0 findings) y es **arquitectónicamente coherente**. Las 3 tablas nuevas (`vitality_assessments`, `facial_analyses`, `bookings`) creadas por `prisma/funnel_reactivation.sql` son **consistentes con un patrón ya existente** en el repo (las tablas `dental_*` también viven fuera de `schema.prisma`).

**Dos observaciones bloquean el "READY" pleno:**
1. **Verificación runtime NO completada** — **no hay ninguna instancia PostgreSQL disponible** en este entorno (ver §3). No se fabrican resultados.
2. **Fuente real de schema drift** — `funnel_reactivation.sql` **modifica objetos gestionados por Prisma** (`funnel_leads` +10 columnas, enum `FunnelStatus` +`'NEW'`, `currentStep` DROP NOT NULL) que **NO están reflejados en `schema.prisma`**. Es la **primera** SQL cruda del repo que altera estructuralmente objetos Prisma (la convención previa —`migration_rls.sql`— solo hace `ENABLE RLS`/storage). Un futuro `prisma migrate dev` **revertiría** estos cambios.

Ninguna observación invalida la arquitectura; ambas se resuelven en un sprint de implementación posterior (recomendaciones §6).

---

## 2. Migration Strategy Assessment (Phase A)

### 2.1 Filosofía de migración actual (evidencia)
El repo usa una estrategia **híbrida**:

| Mecanismo | Evidencia | Uso |
|---|---|---|
| Prisma migrations (`migrate deploy`) | `package.json:18` `db:migrate`; `prisma/migrations/20250902000000_dental_sprints4_5_tables/migration.sql` (única migración) | Esquema estructural |
| SQL cruda aplicada manualmente | `package.json:20` `db:rls` = `psql $DATABASE_URL -f prisma/migration_rls.sql`; `prisma/dental_sprint7_hardening.sql` | RLS + hardening (lo que Prisma no expresa) |
| CI | `package.json:34` `ci` = `sandbox:test && prisma validate && aek:check` | **NO aplica migraciones** (solo valida el schema file) |

**Hecho:** las tablas `dental_*` (creadas en la migración Prisma) **NO están en `schema.prisma`** (`git grep "dental_bookings\|model Dental" prisma/schema.prisma` → vacío). Es decir, **"tablas estructurales fuera de `schema.prisma`" ya es un patrón aceptado** en el repositorio.

### 2.2 Consistencia de `funnel_reactivation.sql` con el repo
| Parte de `funnel_reactivation.sql` | ¿Consistente con la convención? | Evidencia |
|---|---|---|
| `CREATE TABLE vitality_assessments/facial_analyses/bookings` | ✅ Sí — igual que `dental_*` (SQL cruda, fuera de `schema.prisma`) | precedente dental |
| RLS (`ENABLE ROW LEVEL SECURITY` + policy `tenant_isolation` USING) | ✅ Sí — copia el patrón de `migration_rls.sql:20-52` | idéntica policy |
| `ALTER TABLE funnel_leads ADD COLUMN ...` (10 cols) | ⚠️ **No** — `funnel_leads` **está** en `schema.prisma:436`; ninguna SQL cruda previa altera columnas de objetos Prisma | `migration_rls.sql` solo hace `ENABLE RLS`/`SET(...)` |
| `ALTER TYPE "FunnelStatus" ADD VALUE 'NEW'` | ⚠️ **No** — enum `FunnelStatus` está en `schema.prisma:612` | — |
| `ALTER COLUMN "currentStep" DROP NOT NULL` | ⚠️ **No** — divergencia de constraint vs `schema.prisma:447` (`currentStep String` NOT NULL) | — |

### 2.3 Recomendación Phase A (¿Prisma migration u SQL manual?)
- **Las 3 tablas nuevas:** pueden permanecer como SQL cruda **por precedente** (dental), PERO lo más seguro y mantenible es **modelarlas en `schema.prisma`** y emitir una **migración Prisma oficial** (evita que un futuro `migrate dev` las elimine). RLS **debe** quedar como SQL cruda (patrón `db:rls`).
- **Los ALTER sobre objetos Prisma (`funnel_leads`, `FunnelStatus`, `currentStep`):** **DEBEN reflejarse en `schema.prisma`** — esta es la corrección de drift no negociable.
- **Conclusión:** `funnel_reactivation.sql` **no debe permanecer tal cual**: su porción estructural que toca objetos Prisma debe promoverse a `schema.prisma` + migración Prisma; su porción RLS permanece SQL cruda. (Implementación en sprint posterior; este sprint es verificación.)

---

## 3. Runtime Verification (Phase B)

> **NO SE PUDO COMPLETAR — no hay PostgreSQL disponible.** No se infiere éxito.

Evidencia de indisponibilidad:
- `printenv DATABASE_URL` → **no set**.
- `pg_isready` → `/var/run/postgresql:5432 - no response`; `ss -ltn` → **sin listener en 5432**.
- `psql postgresql://localhost:5432/postgres -c 'SELECT 1'` → `connection refused`.
- `command -v postgres` → **no binario de servidor**; `docker` presente pero **sin instancia/contenedor Postgres** (provisionar uno sería *implementación*, prohibido en este sprint).

**Por tanto NO se verificó:** creación de tablas, columnas, índices, constraints, FKs, RLS habilitada, políticas por tenant, idempotencia real, rollback, ni el E2E de `POST /api/funnel/{leads,vitality-assessment,facial-analysis,booking}` (insert, tenant isolation, correlationId, ausencia de errores SQL/tabla/columna/permiso).

**Lo que SÍ se verificó (sin BD):**
- `prisma validate` → **`schema.prisma` es válido** (pero **no** refleja las tablas/columnas de `funnel_reactivation.sql`).
- Análisis estático: las columnas del `CREATE TABLE` coinciden 1:1 con los `INSERT` del handler (revisión de `funnel.handler.ts` vs `funnel_reactivation.sql`); la policy RLS es idéntica a la de `migration_rls.sql`; la SQL es idempotente (`IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`).

> **Acción requerida (fuera de este sprint):** aplicar `psql "$DATABASE_URL" -f prisma/funnel_reactivation.sql` en staging y ejecutar el E2E. Sin BD aquí, es imposible confirmar runtime.

---

## 4. Schema Synchronization Matrix (Phase C)

Columnas: **P**=`schema.prisma` · **M**=migración Prisma · **R**=SQL cruda · **DB**=PostgreSQL real. (DB = **UNVERIFIED**: no hay instancia.)

| Objeto | P | M | R | DB | Estado de sincronización |
|---|:--:|:--:|:--:|:--:|---|
| `funnel_leads` (base) | ✓ | ✗ | RLS only | UNVERIFIED | OK (base Prisma) |
| `funnel_leads` +10 cols (name, organization, interestType, …) | ✗ | ✗ | ✓ (funnel_reactivation) | UNVERIFIED | **DRIFT — DB-only, ausente en Prisma** |
| enum `FunnelStatus` +`'NEW'` | ✗ | ✗ | ✓ | UNVERIFIED | **DRIFT — valor DB-only** |
| `funnel_leads.currentStep` NOT NULL | ✓ (NOT NULL) | — | ✓ DROP NOT NULL | UNVERIFIED | **DRIFT — constraint divergente** |
| `vitality_assessments` | ✗ | ✗ | ✓ | UNVERIFIED | DB-only (consistente con precedente dental) |
| `facial_analyses` | ✗ | ✗ | ✓ | UNVERIFIED | DB-only (precedente) |
| `bookings` | ✗ | ✗ | ✓ | UNVERIFIED | DB-only (precedente) |
| `dental_*` (8+ tablas) | ✗ | ✓ (20250902) | — | UNVERIFIED | **Precedente**: estructural fuera de `schema.prisma` |
| Políticas RLS (todas) | ✗ | ✗ | ✓ (migration_rls + funnel_reactivation) | UNVERIFIED | Esperado (dominio SQL cruda) |

**Inventario de drift:**
- **Objetos DB-only sobre objetos Prisma (crítico):** columnas de `funnel_leads`, valor `'NEW'` de `FunnelStatus`, constraint `currentStep`. → Prisma no los conoce; `migrate dev` los revertiría.
- **Tablas DB-only nuevas (aceptable por precedente):** `vitality_assessments`, `facial_analyses`, `bookings` (igual que `dental_*`).
- **Sin migración faltante en el sentido Prisma** (no hay migración pendiente en `prisma/migrations`), PERO **sí falta reflejar** los cambios estructurales en `schema.prisma`.
- **Sin script de aplicación:** `funnel_reactivation.sql` no está referenciado por `package.json` ni CI (`git grep funnel_reactivation` en scripts → vacío) → paso de despliegue no cableado (solo el comentario cabecera lo indica).

---

## 5. Risks

| # | Riesgo | Prob. | Impacto | Evidencia |
|---|---|---|---|---|
| RK-1 | `prisma migrate dev` **revierte** columnas/enum/constraint (drift), rompiendo el handler de leads | Media (si alguien corre migrate dev) | **Alto** | funnel_leads/FunnelStatus en `schema.prisma`, cambios solo en SQL |
| RK-2 | Runtime nunca verificado → error de tabla/columna/permiso latente al desplegar | Media | Alto | Phase B sin BD |
| RK-3 | Paso de aplicación de `funnel_reactivation.sql` no cableado → se olvida en deploy → rutas 500 | Media | Alto | sin script `db:funnel`; CI no migra |
| RK-4 | Handler usa pool crudo (`getDb()`) sin `withTenant()` → bajo RLS, `SELECT` anti-spam filtra sin GUC | Baja | Bajo | diseño existente del funnel (no regresión); policy es USING-only (INSERT no bloqueado) |
| RK-5 | Duplicidad semántica percibida (`vitality_assessments` vs `funnel_assessments`) | Baja | Bajo | son entidades distintas (cuestionario vs biofísica), documentado en F1 |

---

## 6. Recommendations (evidencia, para sprint de implementación posterior)

1. **Eliminar el drift Prisma (no negociable):** en `schema.prisma` — añadir las 10 columnas a `model FunnelLead`, añadir `NEW` al `enum FunnelStatus`, hacer `currentStep` opcional. Así Prisma y BD concuerdan y `migrate dev` no revierte. *(Corrige RK-1.)*
2. **Gobernar las 3 tablas nuevas:** preferentemente **modelarlas en `schema.prisma`** (`VitalityAssessment`/`FacialAnalysis`/`Booking` con `@@map`) y convertir la porción `CREATE TABLE` en una **migración Prisma oficial**; mantener **RLS como SQL cruda**. Alternativa mínima: documentarlas formalmente como tablas raw-SQL intencionales (patrón dental) y **no** ejecutar `migrate dev` hasta reconciliar.
3. **Cablear la aplicación:** añadir script `db:funnel` (`psql $DATABASE_URL -f prisma/funnel_reactivation.sql`) y referenciarlo en el runbook de deploy junto a `db:migrate`+`db:rls`. *(Corrige RK-3.)*
4. **Verificación runtime:** aplicar en staging y ejecutar el E2E de los 4 endpoints (insert, tenant isolation, correlationId). *(Corrige RK-2 — requiere BD.)*
5. **Salvaguarda operativa:** hasta reconciliar (rec. 1), **prohibir `prisma migrate dev`** contra cualquier entorno con los objetos raw-SQL del funnel (generaría reverts destructivos).

> Estas recomendaciones **no** se implementan en este sprint (verificación únicamente).

---

## 7. Governance Verification (Phase D)

| Dimensión | Estado | Evidencia |
|---|---|---|
| OpenAPI consistency | ✅ | 4 paths `/api/funnel/*` documentados y coinciden con el router (`vytalix-platform-v2.yaml:208-329`); contrato sin cambios |
| DDD boundaries | ✅ | Funnel en contexto Growth; handler sin cambios; `server→funnel.handler` es api→api |
| AEK rules | ✅ | AEK PASS, 0 findings (F1); health 82/100 |
| RLS integrity | ✅ (diseño) | 3 tablas nuevas con `tenant_isolation` USING idéntica al patrón plataforma; **UNVERIFIED en runtime** |
| Tenant isolation | ✅ (diseño) | `tenantId` en toda tabla nueva + RLS; **UNVERIFIED en runtime** |
| Prisma compatibility | ⚠️ | Drift por ALTERs no reflejados en `schema.prisma` (§4) |
| Future maintainability | ⚠️ | Sin script de aplicación; drift latente |

---

## 8. Final Verdict (Phase E)

# `READY WITH OBSERVATIONS`

**Justificación (evidencia):** el código F1 es correcto y validado (typecheck 31, sandbox 49/49, AEK 0 findings, OpenAPI consistente); las 3 tablas nuevas siguen el precedente raw-SQL del repo (dental). **Pero** (a) la verificación runtime **no pudo completarse por ausencia total de PostgreSQL** (§3, no se fabrican resultados), y (b) existe **schema drift real** por ALTERs a objetos Prisma (`funnel_leads`/`FunnelStatus`/`currentStep`) no reflejados en `schema.prisma` (§4, RK-1). Ambas son **observaciones resolubles** (§6) en un sprint de implementación posterior; ninguna invalida la arquitectura de F1.

**No es `READY` pleno** hasta: reconciliar `schema.prisma` (rec. 1-2), cablear la aplicación (rec. 3) y verificar en staging con BD (rec. 4).
**No es `NOT READY`** porque el código compila, no rompe `/api/v2`, respeta DDD/AEK/RLS-por-diseño y la SQL es idempotente y correcta por inspección estática.

---

## 9. Validación del sprint

| ✓ | Ítem |
|---|---|
| ✓ | Un solo documento producido; sin código/lógica/negocio modificados |
| ✓ | Sin cambios de API/OpenAPI (no se probó inconsistencia real) |
| ✓ | Sin documentación duplicada (concepto nuevo: verificación de gobernanza de BD de F1) |
| ✓ | Repositorio coherente; typecheck 31 sin cambio |
| ✓ | Indisponibilidad de PostgreSQL declarada explícitamente (no inferida) |
| ✓ | Cada conclusión citada a evidencia (`archivo:línea` / comando) |

---

> **STOP.** Informe de verificación de gobernanza producido. Veredicto: **READY WITH OBSERVATIONS**. No se realizó implementación adicional. La verificación runtime queda pendiente de un entorno con PostgreSQL; la reconciliación de `schema.prisma` queda para un sprint de implementación autorizado.
