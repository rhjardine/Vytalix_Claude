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
  'observed_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- Also convert audit_logs to hypertable for efficient range queries.
SELECT create_hypertable(
  'audit_logs',
  'occurred_at',
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
--    Pattern: tenant_id must equal the session-local variable app.current_tenant.
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
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY org_tenant_isolation_insert ON organizations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY org_tenant_isolation_update ON organizations
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- users
CREATE POLICY users_tenant_isolation_select ON users
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY users_tenant_isolation_insert ON users
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY users_tenant_isolation_update ON users
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- patients
CREATE POLICY patients_tenant_isolation_select ON patients
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY patients_tenant_isolation_insert ON patients
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY patients_tenant_isolation_update ON patients
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- patient_health_snapshots
CREATE POLICY snapshots_tenant_isolation_select ON patient_health_snapshots
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY snapshots_tenant_isolation_insert ON patient_health_snapshots
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY snapshots_tenant_isolation_update ON patient_health_snapshots
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- clinical_observations
CREATE POLICY obs_tenant_isolation_select ON clinical_observations
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY obs_tenant_isolation_insert ON clinical_observations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE policy — observations are immutable. Corrections are new rows.

-- risk_scores
CREATE POLICY scores_tenant_isolation_select ON risk_scores
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY scores_tenant_isolation_insert ON risk_scores
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE policy — scores are immutable. New calculation = new row.

-- protocols
CREATE POLICY protocols_tenant_isolation_select ON protocols
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY protocols_tenant_isolation_insert ON protocols
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY protocols_tenant_isolation_update ON protocols
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- protocol_rules
CREATE POLICY rules_tenant_isolation_select ON protocol_rules
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY rules_tenant_isolation_insert ON protocol_rules
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY rules_tenant_isolation_update ON protocol_rules
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- recommendations
CREATE POLICY recs_tenant_isolation_select ON recommendations
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY recs_tenant_isolation_insert ON recommendations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY recs_tenant_isolation_update ON recommendations
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- decision_traces — INSERT ONLY (immutable audit artifact)
CREATE POLICY traces_tenant_isolation_select ON decision_traces
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY traces_tenant_isolation_insert ON decision_traces
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE, no DELETE policy — immutability enforced at DB level.

-- audit_logs — INSERT ONLY (append-only)
CREATE POLICY audit_tenant_isolation_select ON audit_logs
  FOR SELECT USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
CREATE POLICY audit_tenant_isolation_insert ON audit_logs
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);
-- No UPDATE, no DELETE — ever.

-- ---------------------------------------------------------------------------
-- 3. DB trigger: auto-update PatientHealthSnapshot on new ClinicalObservation
--    This keeps the snapshot fresh without application-layer polling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_patient_health_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO patient_health_snapshots (
    id, tenant_id, patient_id,
    latest_systolic_bp, latest_diastolic_bp,
    latest_ldl_mg_dl, latest_hdl_mg_dl,
    latest_total_cholesterol, latest_fasting_glucose,
    last_observation_at, updated_at
  )
  VALUES (
    gen_random_uuid(), NEW.tenant_id, NEW.patient_id,
    CASE WHEN NEW.loinc_code = '8480-6' THEN NEW.value_numeric ELSE NULL END,  -- Systolic BP
    CASE WHEN NEW.loinc_code = '8462-4' THEN NEW.value_numeric ELSE NULL END,  -- Diastolic BP
    CASE WHEN NEW.loinc_code = '2089-1' THEN NEW.value_numeric ELSE NULL END,  -- LDL
    CASE WHEN NEW.loinc_code = '2085-9' THEN NEW.value_numeric ELSE NULL END,  -- HDL
    CASE WHEN NEW.loinc_code = '2093-3' THEN NEW.value_numeric ELSE NULL END,  -- Total Chol
    CASE WHEN NEW.loinc_code = '2345-7' THEN NEW.value_numeric ELSE NULL END,  -- Fasting Glucose
    NEW.observed_at, NOW()
  )
  ON CONFLICT (patient_id) DO UPDATE SET
    latest_systolic_bp = CASE
      WHEN NEW.loinc_code = '8480-6' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_systolic_bp END,
    latest_diastolic_bp = CASE
      WHEN NEW.loinc_code = '8462-4' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_diastolic_bp END,
    latest_ldl_mg_dl = CASE
      WHEN NEW.loinc_code = '2089-1' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_ldl_mg_dl END,
    latest_hdl_mg_dl = CASE
      WHEN NEW.loinc_code = '2085-9' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_hdl_mg_dl END,
    latest_total_cholesterol = CASE
      WHEN NEW.loinc_code = '2093-3' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_total_cholesterol END,
    latest_fasting_glucose = CASE
      WHEN NEW.loinc_code = '2345-7' THEN NEW.value_numeric
      ELSE patient_health_snapshots.latest_fasting_glucose END,
    last_observation_at = GREATEST(
      patient_health_snapshots.last_observation_at, NEW.observed_at
    ),
    snapshot_version = patient_health_snapshots.snapshot_version + 1,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- SECURITY DEFINER runs as function owner, bypassing RLS safely.

CREATE TRIGGER trg_update_health_snapshot
  AFTER INSERT ON clinical_observations
  FOR EACH ROW EXECUTE FUNCTION update_patient_health_snapshot();

