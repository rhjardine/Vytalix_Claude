-- =============================================================================
-- prisma/migration_rls.sql
-- Row Level Security + TimescaleDB hypertables + performance indexes
-- Run AFTER: npx prisma migrate deploy
-- Command: psql $DATABASE_URL -f prisma/migration_rls.sql
-- =============================================================================

-- ── Enable RLS on all tenant-scoped tables ────────────────────────

ALTER TABLE tenants                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_health_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_observations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_traces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE biological_age_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE preventive_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE biophysics_boards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_bookings            ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies — tenant isolation ──────────────────────────────
-- Pattern: app.current_tenant_id set via SET LOCAL before every query

DO $$ DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users','patients','patient_health_snapshots','clinical_observations',
    'risk_scores','decision_traces','recommendations','biological_age_assessments',
    'preventive_scores','engagement_events','engagement_scores','referral_events',
    'api_keys','consent_records','biophysics_boards','audit_logs',
    'billing_events','funnel_leads','funnel_assessments','funnel_bookings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId"::TEXT = current_setting(''app.current_tenant_id'', TRUE));
    ', tbl, tbl);
  END LOOP;
END $$;

-- Special policy: tenants table — only accessible by superuser/service role
CREATE POLICY tenant_self ON tenants
  USING (id::TEXT = current_setting('app.current_tenant_id', TRUE));

-- calculation_versions is global (no tenant column)
-- api_keys lookup bypasses RLS for auth (done via superuser connection)

-- ── TimescaleDB hypertables ───────────────────────────────────────
-- Convert high-volume time-series tables to hypertables

SELECT create_hypertable(
  'clinical_observations', 'observed_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

SELECT create_hypertable(
  'engagement_events', 'occurred_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

SELECT create_hypertable(
  'audit_logs', 'created_at',
  chunk_time_interval => INTERVAL '3 months',
  if_not_exists => TRUE
);

SELECT create_hypertable(
  'billing_events', 'occurred_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- ── TimescaleDB compression (activate after 30 days) ─────────────
ALTER TABLE clinical_observations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"tenantId","patientId"',
  timescaledb.compress_orderby   = 'observed_at DESC'
);
SELECT add_compression_policy('clinical_observations', INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE engagement_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"tenantId","patientId"',
  timescaledb.compress_orderby   = 'occurred_at DESC'
);
SELECT add_compression_policy('engagement_events', INTERVAL '30 days', if_not_exists => TRUE);

-- ── Performance indexes (additional, beyond Prisma-generated) ────

-- Funnel conversion funnel query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funnel_leads_tenant_status_created
  ON funnel_leads ("tenantId", status, "createdAt" DESC);

-- Biological age cohort queries (InsightsService)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bio_age_tenant_type_status
  ON biological_age_assessments ("tenantId", "assessmentType", "ageStatus", "assessedAt" DESC);

-- Referral conversion tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referral_tenant_status_generated
  ON referral_events ("tenantId", status, "generatedAt" DESC);

-- Patient health snapshot lookup (most common query path)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_snapshot_tenant_patient
  ON patient_health_snapshots ("tenantId", "patientId");

-- Billing aggregation (monthly invoice)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_tenant_month
  ON billing_events ("tenantId", DATE_TRUNC('month', "occurredAt"));

-- API key hash lookup (hot path — every v2 request)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_hash
  ON api_keys ("keyHash") WHERE "isActive" = TRUE;

-- ── PatientHealthSnapshot trigger (auto-update on observation insert) ──

CREATE OR REPLACE FUNCTION update_patient_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO patient_health_snapshots (
    id, "tenantId", "patientId",
    "latestTotalCholesterol", "latestHdlMgDl", "latestLdlMgDl",
    "latestSystolicBp", "latestFastingGlucose", "latestBmi",
    "latestHbA1c", "latestCreatinine", "latestHsCrp",
    "snapshotVersion", "updatedAt"
  )
  VALUES (
    gen_random_uuid(), NEW."tenantId", NEW."patientId",
    CASE WHEN NEW."loincCode" = '2093-3' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '2085-9' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '2089-1' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '8480-6' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '2345-7' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '39156-5' THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '4548-4'  THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '2160-0'  THEN NEW.value ELSE NULL END,
    CASE WHEN NEW."loincCode" = '30522-7' THEN NEW.value ELSE NULL END,
    1, NOW()
  )
  ON CONFLICT ("tenantId", "patientId") DO UPDATE SET
    "latestTotalCholesterol" = COALESCE(
      CASE WHEN NEW."loincCode" = '2093-3' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestTotalCholesterol"
    ),
    "latestHdlMgDl" = COALESCE(
      CASE WHEN NEW."loincCode" = '2085-9' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestHdlMgDl"
    ),
    "latestLdlMgDl" = COALESCE(
      CASE WHEN NEW."loincCode" = '2089-1' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestLdlMgDl"
    ),
    "latestSystolicBp" = COALESCE(
      CASE WHEN NEW."loincCode" = '8480-6' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestSystolicBp"
    ),
    "latestFastingGlucose" = COALESCE(
      CASE WHEN NEW."loincCode" = '2345-7' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestFastingGlucose"
    ),
    "latestBmi" = COALESCE(
      CASE WHEN NEW."loincCode" = '39156-5' THEN NEW.value ELSE NULL END,
      patient_health_snapshots."latestBmi"
    ),
    "snapshotVersion" = patient_health_snapshots."snapshotVersion" + 1,
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_snapshot ON clinical_observations;
CREATE TRIGGER trg_update_snapshot
  AFTER INSERT ON clinical_observations
  FOR EACH ROW EXECUTE FUNCTION update_patient_snapshot();

-- ── Continuous aggregates (TimescaleDB — biological age trends) ───

CREATE MATERIALIZED VIEW IF NOT EXISTS bio_age_monthly_stats
WITH (timescaledb.continuous) AS
  SELECT
    "tenantId",
    "assessmentType",
    time_bucket('1 month', "assessedAt") AS month,
    COUNT(*)::INT                         AS assessment_count,
    ROUND(AVG("biologicalAge"::FLOAT)::NUMERIC, 2)   AS avg_biological_age,
    ROUND(AVG("differentialAge"::FLOAT)::NUMERIC, 2) AS avg_differential,
    SUM(CASE WHEN "ageStatus" = 'REJUVENECIDO' THEN 1 ELSE 0 END)::INT AS rejuvenecido_count,
    SUM(CASE WHEN "ageStatus" = 'ENVEJECIDO'   THEN 1 ELSE 0 END)::INT AS envejecido_count
  FROM biological_age_assessments
  GROUP BY "tenantId", "assessmentType", time_bucket('1 month', "assessedAt")
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'bio_age_monthly_stats',
  start_offset => INTERVAL '3 months',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ── Funnel conversion tracking view ──────────────────────────────

CREATE OR REPLACE VIEW funnel_conversion_summary AS
  SELECT
    fl."tenantId",
    DATE_TRUNC('week', fl."createdAt") AS week,
    COUNT(*)                           AS leads_captured,
    COUNT(fa.id)                       AS leads_assessed,
    COUNT(fb.id)                       AS leads_booked,
    COUNT(fl."convertedToPatientId")   AS leads_converted,
    ROUND(
      100.0 * COUNT(fb.id) / NULLIF(COUNT(*), 0), 1
    ) AS booking_rate_pct,
    ROUND(
      100.0 * COUNT(fl."convertedToPatientId") / NULLIF(COUNT(*), 0), 1
    ) AS conversion_rate_pct
  FROM funnel_leads fl
  LEFT JOIN LATERAL (
    SELECT id FROM funnel_assessments WHERE "leadId" = fl.id LIMIT 1
  ) fa ON TRUE
  LEFT JOIN LATERAL (
    SELECT id FROM funnel_bookings WHERE "leadId" = fl.id LIMIT 1
  ) fb ON TRUE
  GROUP BY fl."tenantId", DATE_TRUNC('week', fl."createdAt")
  ORDER BY week DESC;

-- ── Demo seed data (development only) ────────────────────────────

DO $$
BEGIN
  IF current_setting('app.seed_demo', TRUE) = 'true' THEN

    -- Default tenant for funnel
    INSERT INTO tenants (id, name, slug, plan, "monthlyApiLimit", "createdAt", "updatedAt")
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Doctor Antivejez', 'doctor-antivejez', 'PROFESSIONAL', 0, NOW(), NOW()
    ) ON CONFLICT DO NOTHING;

    -- Disglobal tenant
    INSERT INTO tenants (id, name, slug, plan, "monthlyApiLimit", "revenueShareRatio", "createdAt", "updatedAt")
    VALUES (
      '00000000-0000-0000-0000-000000000002',
      'Disglobal Marketplace', 'disglobal', 'ENTERPRISE', 0, 0.30, NOW(), NOW()
    ) ON CONFLICT DO NOTHING;

    -- Demo Disglobal API Key (hash of "vyx_dis_k1_DEMO_KEY_2024")
    INSERT INTO api_keys (
      id, "tenantId", name, "keyHash", "keyPrefix",
      permissions, "rateLimitTier", "createdBy", "isActive", "createdAt"
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000002',
      'Disglobal Demo Key',
      encode(sha256('vyx_dis_k1_DEMO_KEY_2024'::bytea), 'hex'),
      'vyx_dis_',
      '{"vitality":["read","write"],"preventive":["write"],"referral":["read"],"engagement":["write"],"insights":["read"]}'::jsonb,
      'PROFESSIONAL',
      '00000000-0000-0000-0000-000000000001',
      TRUE, NOW()
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Demo seed data inserted';
  END IF;
END $$;

-- ── Audit trail: prevent UPDATE/DELETE on immutable tables ────────

CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. Modifications are not permitted.',
    TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_assessments ON biological_age_assessments;
CREATE TRIGGER trg_immutable_assessments
  BEFORE UPDATE OR DELETE ON biological_age_assessments
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_immutable_audit ON audit_logs;
CREATE TRIGGER trg_immutable_audit
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

DROP TRIGGER IF EXISTS trg_immutable_billing ON billing_events;
CREATE TRIGGER trg_immutable_billing
  BEFORE UPDATE OR DELETE ON billing_events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

RAISE NOTICE '✅ Vytalix RLS + TimescaleDB + triggers applied successfully';
