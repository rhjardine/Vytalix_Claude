-- =============================================================================
-- Vytalix MVP — Migration: Row-Level Security + TimescaleDB setup
-- File: migrations/0001_rls_and_timescale/migration.sql
-- Run AFTER `prisma migrate deploy` creates the tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enable TimescaleDB extension (must be superuser)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert clinical_observations to a hypertable partitioned by observed_at.
-- chunk_time_interval = 1 month balances query performance vs number of chunks.
SELECT create_hypertable(
  'clinical_observations',
  'observedAt',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- Also convert audit_logs to hypertable for efficient range queries.
SELECT create_hypertable(
  'audit_logs',
  'occurredAt',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on all clinical tables
--    The `tenants` table is deliberately excluded — it is the bootstrap table.
-- ---------------------------------------------------------------------------
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols             ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_traces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (critical — without this, the DB owner bypasses policies).
ALTER TABLE organizations         FORCE ROW LEVEL SECURITY;
ALTER TABLE users                 FORCE ROW LEVEL SECURITY;
ALTER TABLE patients              FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_health_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE risk_scores           FORCE ROW LEVEL SECURITY;
ALTER TABLE protocols             FORCE ROW LEVEL SECURITY;
ALTER TABLE protocol_rules        FORCE ROW LEVEL SECURITY;
ALTER TABLE recommendations       FORCE ROW LEVEL SECURITY;
ALTER TABLE decision_traces       FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. RLS policies — SELECT, INSERT, UPDATE
--    Pattern: "tenantId" must equal the session-local variable app.current_tenant.
--    This variable is SET by the Prisma middleware on every connection checkout.
--
--    Separate policies per command (SELECT/INSERT/UPDATE) because:
--    - audit_logs needs INSERT-only (no UPDATE/DELETE — append-only enforcement)
--    - decision_traces needs INSERT-only (immutable)
--    - All others need SELECT + INSERT + UPDATE (no DELETE — soft deletes via status)
-- ---------------------------------------------------------------------------

-- Helper: current tenant as UUID
-- We cast to uuid to prevent type confusion attacks (passing a non-uuid string).
-- Returns NULL if the variable is not set, which causes all RLS checks to fail
-- safely (no rows returned / no writes allowed).

-- organizations
CREATE POLICY org_tenant_isolation_select ON organizations
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY org_tenant_isolation_insert ON organizations
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY org_tenant_isolation_update ON organizations
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- users
CREATE POLICY users_tenant_isolation_select ON users
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY users_tenant_isolation_insert ON users
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY users_tenant_isolation_update ON users
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- patients
CREATE POLICY patients_tenant_isolation_select ON patients
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY patients_tenant_isolation_insert ON patients
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY patients_tenant_isolation_update ON patients
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- patient_health_snapshots
CREATE POLICY snapshots_tenant_isolation_select ON patient_health_snapshots
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY snapshots_tenant_isolation_insert ON patient_health_snapshots
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY snapshots_tenant_isolation_update ON patient_health_snapshots
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- clinical_observations
CREATE POLICY obs_tenant_isolation_select ON clinical_observations
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY obs_tenant_isolation_insert ON clinical_observations
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE policy — observations are immutable. Corrections are new rows.

-- risk_scores
CREATE POLICY scores_tenant_isolation_select ON risk_scores
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY scores_tenant_isolation_insert ON risk_scores
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE policy — scores are immutable. New calculation = new row.

-- protocols
CREATE POLICY protocols_tenant_isolation_select ON protocols
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY protocols_tenant_isolation_insert ON protocols
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY protocols_tenant_isolation_update ON protocols
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- protocol_rules
CREATE POLICY rules_tenant_isolation_select ON protocol_rules
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY rules_tenant_isolation_insert ON protocol_rules
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY rules_tenant_isolation_update ON protocol_rules
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- recommendations
CREATE POLICY recs_tenant_isolation_select ON recommendations
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY recs_tenant_isolation_insert ON recommendations
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY recs_tenant_isolation_update ON recommendations
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- decision_traces — INSERT ONLY (immutable audit artifact)
CREATE POLICY traces_tenant_isolation_select ON decision_traces
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY traces_tenant_isolation_insert ON decision_traces
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE, no DELETE policy — immutability enforced at DB level.

-- audit_logs — INSERT ONLY (append-only)
CREATE POLICY audit_tenant_isolation_select ON audit_logs
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY audit_tenant_isolation_insert ON audit_logs
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE, no DELETE — ever.

-- ---------------------------------------------------------------------------
-- 3. DB trigger: auto-update PatientHealthSnapshot on new ClinicalObservation
--    This keeps the snapshot fresh without application-layer polling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_patient_health_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO patient_health_snapshots (
    id, "tenantId", "patientId",
    "latestSystolicBp", "latestDiastolicBp",
    "latestLdlMgDl", "latestHdlMgDl",
    "latestTotalCholesterol", "latestFastingGlucose",
    "lastObservationAt", "updatedAt"
  )
  VALUES (
    gen_random_uuid(), NEW."tenantId", NEW."patientId",
    CASE WHEN NEW."loincCode" = '8480-6' THEN NEW."valueNumeric" ELSE NULL END,  -- Systolic BP
    CASE WHEN NEW."loincCode" = '8462-4' THEN NEW."valueNumeric" ELSE NULL END,  -- Diastolic BP
    CASE WHEN NEW."loincCode" = '2089-1' THEN NEW."valueNumeric" ELSE NULL END,  -- LDL
    CASE WHEN NEW."loincCode" = '2085-9' THEN NEW."valueNumeric" ELSE NULL END,  -- HDL
    CASE WHEN NEW."loincCode" = '2093-3' THEN NEW."valueNumeric" ELSE NULL END,  -- Total Chol
    CASE WHEN NEW."loincCode" = '2345-7' THEN NEW."valueNumeric" ELSE NULL END,  -- Fasting Glucose
    NEW."observedAt", NOW()
  )
  ON CONFLICT ("patientId") DO UPDATE SET
    "latestSystolicBp" = CASE
      WHEN NEW."loincCode" = '8480-6' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestSystolicBp" END,
    "latestDiastolicBp" = CASE
      WHEN NEW."loincCode" = '8462-4' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestDiastolicBp" END,
    "latestLdlMgDl" = CASE
      WHEN NEW."loincCode" = '2089-1' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestLdlMgDl" END,
    "latestHdlMgDl" = CASE
      WHEN NEW."loincCode" = '2085-9' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestHdlMgDl" END,
    "latestTotalCholesterol" = CASE
      WHEN NEW."loincCode" = '2093-3' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestTotalCholesterol" END,
    "latestFastingGlucose" = CASE
      WHEN NEW."loincCode" = '2345-7' THEN NEW."valueNumeric"
      ELSE patient_health_snapshots."latestFastingGlucose" END,
    "lastObservationAt" = GREATEST(
      patient_health_snapshots."lastObservationAt", NEW."observedAt"
    ),
    "snapshotVersion" = patient_health_snapshots."snapshotVersion" + 1,
    "updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- SECURITY DEFINER runs as function owner, bypassing RLS safely.

CREATE TRIGGER trg_update_health_snapshot
  AFTER INSERT ON clinical_observations
  FOR EACH ROW EXECUTE FUNCTION update_patient_health_snapshot();

-- =============================================================================
-- =============================================================================
-- FASE 2 — ECOSYSTEM EXTENSION RLS (longevity · consent · engagement · events)
--
-- Same isolation contract as the core: "tenantId" = app.current_tenant.
-- Append-only tables (biological_age_assessments, consent_records,
-- engagement_events, domain_events) get SELECT + INSERT policies ONLY — no
-- UPDATE / DELETE — so immutability is enforced by the engine, not the app.
-- Mutable config/state tables (programs, challenges, patient_enrollments)
-- additionally get UPDATE.
-- =============================================================================
-- =============================================================================

-- ---------------------------------------------------------------------------
-- F2.0  TimescaleDB hypertables for the high-volume append-only streams
-- ---------------------------------------------------------------------------
SELECT create_hypertable(
  'engagement_events', 'occurredAt',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE
);
SELECT create_hypertable(
  'domain_events', 'occurredAt',
  chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE
);

-- ---------------------------------------------------------------------------
-- F2.1  Enable + FORCE RLS on every new table
-- ---------------------------------------------------------------------------
ALTER TABLE biological_age_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_enrollments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events              ENABLE ROW LEVEL SECURITY;

ALTER TABLE biological_age_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_records            FORCE ROW LEVEL SECURITY;
ALTER TABLE programs                   FORCE ROW LEVEL SECURITY;
ALTER TABLE challenges                 FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_enrollments        FORCE ROW LEVEL SECURITY;
ALTER TABLE engagement_events          FORCE ROW LEVEL SECURITY;
ALTER TABLE domain_events              FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- F2.2  Append-only tables — SELECT + INSERT only (immutable)
-- ---------------------------------------------------------------------------

-- biological_age_assessments (longitudinal, immutable)
CREATE POLICY bioage_tenant_isolation_select ON biological_age_assessments
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY bioage_tenant_isolation_insert ON biological_age_assessments
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE / DELETE — re-assessment is a new row.

-- consent_records (legal ledger, immutable)
CREATE POLICY consent_tenant_isolation_select ON consent_records
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY consent_tenant_isolation_insert ON consent_records
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE / DELETE — revocation/expiry is a new row.

-- engagement_events (behavioral stream, immutable)
CREATE POLICY engevt_tenant_isolation_select ON engagement_events
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY engevt_tenant_isolation_insert ON engagement_events
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE / DELETE — append-only.

-- domain_events (event store, immutable)
CREATE POLICY domevt_tenant_isolation_select ON domain_events
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY domevt_tenant_isolation_insert ON domain_events
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE / DELETE — append-only.

-- ---------------------------------------------------------------------------
-- F2.3  Mutable config/state tables — SELECT + INSERT + UPDATE (no DELETE)
-- ---------------------------------------------------------------------------

-- programs
CREATE POLICY programs_tenant_isolation_select ON programs
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY programs_tenant_isolation_insert ON programs
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY programs_tenant_isolation_update ON programs
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- challenges
CREATE POLICY challenges_tenant_isolation_select ON challenges
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY challenges_tenant_isolation_insert ON challenges
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY challenges_tenant_isolation_update ON challenges
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

-- patient_enrollments
CREATE POLICY enroll_tenant_isolation_select ON patient_enrollments
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY enroll_tenant_isolation_insert ON patient_enrollments
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY enroll_tenant_isolation_update ON patient_enrollments
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant', TRUE)::uuid);

