# Vytalix — Data Model (FASE 2)

> Capa clínica e inteligente de **Vytalix** que soporta el ecosistema **Doctor Antivejez**.
> Estrategia: modular monolith · PostgreSQL 15 + TimescaleDB · Row-Level Security por `tenantId` · append-only donde aplica · trazabilidad total.

Este documento describe el modelo de datos **tras la extensión FASE 2**, que añade
de forma **aditiva** los dominios de longevidad, consentimiento, engagement y
event store al núcleo cardiovascular del MVP, **sin modificar ni eliminar** ninguna
tabla o columna existente.

---

## 1. Mapa de dominios

| # | Dominio | Tablas | Mutabilidad | RLS |
|---|---------|--------|-------------|-----|
| 1 | Tenancy & Identity | `tenants`*, `organizations`, `users` | mutable | sí (excepto `tenants`*) |
| 2 | Patient Core | `patients`, `patient_health_snapshots` | mutable | sí |
| 3 | Clinical Observations | `clinical_observations` | **append-only** (hypertable) | sí (SELECT+INSERT) |
| 4 | Risk Scoring | `risk_scores` | **append-only** | sí (SELECT+INSERT) |
| 5 | Protocol Engine | `protocols`, `protocol_rules` | mutable | sí |
| 6 | Recommendations + Traces | `recommendations`, `decision_traces` | rec: mutable · trace: **immutable** | sí |
| 7 | Audit | `audit_logs` | **append-only** (hypertable) | sí (SELECT+INSERT) |
| **8** | **Longevity** | `biological_age_assessments` | **append-only** | sí (SELECT+INSERT) |
| **9** | **Consent (PHI)** | `consent_records` | **append-only** (ledger) | sí (SELECT+INSERT) |
| **10** | **Engagement** | `programs`, `challenges`, `patient_enrollments`, `engagement_events` | config/state: mutable · events: **append-only** (hypertable) | sí |
| **11** | **Domain Event Store** | `domain_events` | **append-only** (hypertable) | sí (SELECT+INSERT) |

\* `tenants` no tiene RLS por diseño: es la tabla bootstrap que resuelve el
contexto `app.current_tenant` al inicio de la sesión.

**Negrita** = añadido en FASE 2.

---

## 2. Dominios FASE 2 (nuevos)

### Dominio 8 — Longevidad · `biological_age_assessments`
La métrica insignia de Doctor Antivejez: **edad biológica vs cronológica**.

- **Append-only & longitudinal**: cada reevaluación es una fila nueva e inmutable;
  la trayectoria de envejecimiento (*pace of aging*) se reconstruye exactamente.
- **Determinismo / reproducibilidad**: se persiste el `featureVector` (vector de
  biomarcadores) y `systemAges` (edades por sistema en el modelo biofísico), de
  modo que el resultado es 100% reproducible — sin LLM.
- **Physician-in-the-loop**: `assessedBy` (clínico) + `notes` opcionales.
- Enum `BiologicalAgeMethod`: `BIOPHYSICAL` | `PHENOTYPIC` | `EPIGENETIC`.
- Se habilita además `RiskScoreType.BIOLOGICAL_AGE` (antes comentado).

Índices: `(tenantId, patientId, assessedAt DESC)`, `(tenantId, method, assessedAt DESC)`.

### Dominio 9 — Consent · `consent_records`
Ledger legal de consentimiento (HIPAA / GDPR), requisito para manejar PHI.

- **Append-only**: un *grant* y su posterior *revoke* son filas separadas e
  inmutables. El consentimiento vigente se deriva como la **última fila** por
  `(patientId, consentType)`.
- `scope` (JSONB) define categorías de datos y propósitos autorizados.
- Trazabilidad de captura: `capturedVia` (PORTAL/IN_PERSON/API/IMPORTED),
  `capturedBy`, `evidenceRef` (firma electrónica), `ipAddress`, `policyVersion`.
- Enums: `ConsentType`, `ConsentStatus`, `ConsentChannel`.

Índice: `(tenantId, patientId, consentType, recordedAt DESC)`.

### Dominio 10 — Engagement
Programas preventivos / longevidad con retos y gamificación.

- `programs` — programa por organización (`status`, `durationDays`, `slug` único por tenant).
- `challenges` — retos medibles dentro de un programa (`target` JSONB, `points`).
- `patient_enrollments` — inscripción del paciente (estado, `pointsTotal`, `progress`).
- `engagement_events` — **stream conductual append-only** (hypertable) que alimenta
  analítica e *insights* agregados sin mutar estado.
- Enums: `ProgramStatus`, `ChallengeType`, `EnrollmentStatus`, `EngagementEventType`.

### Dominio 11 — Domain Event Store · `domain_events`
Persistencia durable detrás del *event-bus* en proceso (EventBridge-ready).

- **Append-only** (hypertable por `occurredAt`).
- Campos: `eventType`, `aggregateType`, `aggregateId`, `correlationId`,
  `schemaVersion`, `payload` (JSONB).
- Permite *replay* y futura integración con partners/aseguradoras **sin cambiar
  los productores** de eventos.

---

## 3. Seguridad: RLS y append-only

Toda tabla (salvo `tenants`) tiene:
```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;   -- también para el owner
```
Política base (aislamiento por tenant):
```sql
USING/WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid)
```
- Las tablas **append-only** (`*_assessments`, `consent_records`, `*_events`,
  `clinical_observations`, `risk_scores`, `decision_traces`, `audit_logs`)
  tienen **solo** políticas `SELECT` + `INSERT` → sin `UPDATE`/`DELETE`: la
  inmutabilidad la **impone el motor**, no la aplicación.
- Las tablas mutables (`programs`, `challenges`, `patient_enrollments`, …)
  añaden `UPDATE` (sin `DELETE` — borrados lógicos vía estado).

Totales tras FASE 2: **18 tablas con RLS forzado · 46 políticas · 4 hypertables**.

---

## 4. Nota de corrección — GAP-DB-002 (camelCase/snake_case)

El `migration_rls.sql` original referenciaba columnas en **snake_case**
(`tenant_id`, `occurred_at`, …) pero el schema Prisma **no tiene `@map` de columnas**,
por lo que Postgres genera columnas en **camelCase** (`"tenantId"`, `"occurredAt"`).
La migración **nunca habría aplicado** (RLS, trigger y `create_hypertable` fallarían).

**Corrección (FASE 2):** se reescribió toda la migración para usar los
identificadores reales `"camelCase"` entre comillas dobles. Verificado
estáticamente: el 100% de los identificadores citados existen como campos del
modelo correspondiente; paréntesis balanceados; simetría ENABLE/FORCE.

> Verificación en vivo contra PostgreSQL+TimescaleDB queda pendiente del entorno
> con red/extensión (no disponible en el sandbox). Recomendado en CI (ver GAP-TEST-001).

---

## 5. Diagrama de relaciones (alto nivel)

```
Tenant 1─* Organization 1─* User
  │            │              └─* (creator) Program
  │            └─* Patient ──────────────────────────┐
  │                  ├─* ClinicalObservation         │
  │                  ├─* RiskScore ─* Recommendation ─1 DecisionTrace
  │                  ├─1 PatientHealthSnapshot        │
  │                  ├─* BiologicalAgeAssessment ◄── (clinician) User
  │                  ├─* ConsentRecord                │
  │                  ├─* PatientEnrollment *─1 Program 1─* Challenge
  │                  └─* EngagementEvent              │
  └─* DomainEvent (event store)            AuditLog (append-only)
```
