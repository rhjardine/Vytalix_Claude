-- =============================================================================
-- prisma/funnel_reactivation.sql
-- Sprint F1 — Funnel Reactivation.
--
-- Provisions the tables that src/api/handlers/funnel.handler.ts writes to via
-- raw SQL and that were never migrated: vitality_assessments (Preventive
-- Questionnaire), facial_analyses (Facial Scanner), bookings (Medical
-- Consultation). Also makes funnel_leads compatible with the public
-- lead-capture handler (additive columns + FunnelStatus 'NEW' value).
--
-- Invariants preserved:
--   • RLS — each new table gets tenant_isolation (same USING policy as the
--     platform tables in migration_rls.sql).
--   • Multi-tenancy — every row is tenantId-scoped.
--   • Idempotent — safe to re-apply (IF NOT EXISTS / IF NOT EXISTS values).
--
-- Apply in a DB-connected environment:  psql "$DATABASE_URL" -f prisma/funnel_reactivation.sql
-- =============================================================================

-- ── Preventive Questionnaire (vitality self-assessment) ──────────────
CREATE TABLE IF NOT EXISTS vitality_assessments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              UUID NOT NULL,
  score                   INTEGER NOT NULL,
  category                VARCHAR(20) NOT NULL,
  "yearsBiological"       INTEGER NOT NULL,
  "chronologicalAgeGroup" VARCHAR(10) NOT NULL,
  "dimEnergiaEstadoMental"  INTEGER NOT NULL,
  "dimSuenoCognicion"       INTEGER NOT NULL,
  "dimComposicionCorporal"  INTEGER NOT NULL,
  "dimSignosEnvejecimiento" INTEGER NOT NULL,
  "dimRangoEdad"            INTEGER NOT NULL,
  "answersPayload"        JSONB NOT NULL,
  "completedAt"           TIMESTAMPTZ NOT NULL,
  "durationSeconds"       INTEGER,
  "deviceType"            VARCHAR(20),
  "sessionId"             VARCHAR(100),
  "leadId"                UUID,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vitality_assessments_tenant_created
  ON vitality_assessments ("tenantId", "createdAt" DESC);

-- ── Facial Scanner (result only — image never stored) ────────────────
CREATE TABLE IF NOT EXISTS facial_analyses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "estimatedAge"   INTEGER NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL,
  "analysisPoints" INTEGER NOT NULL,
  status           VARCHAR(20) NOT NULL,
  provider         VARCHAR(20) NOT NULL,
  "imageHash"      VARCHAR(64) NOT NULL,
  "analyzedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "leadId"         UUID,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facial_analyses_tenant_created
  ON facial_analyses ("tenantId", "createdAt" DESC);

-- ── Medical Consultation (WhatsApp-first booking request) ────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"             UUID NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  email                  VARCHAR(255) NOT NULL,
  phone                  VARCHAR(50),
  "consultationType"     VARCHAR(50) NOT NULL,
  "specialistPreference" VARCHAR(50),
  "preferredDate"        DATE,
  "preferredTime"        VARCHAR(20),
  timezone               VARCHAR(50),
  "vitalityScore"        INTEGER,
  "vitalityCategory"     VARCHAR(20),
  "chiefConcern"         TEXT,
  status                 VARCHAR(30) NOT NULL,
  "confirmationCode"     VARCHAR(20) NOT NULL,
  "confirmationChannel"  VARCHAR(20) NOT NULL,
  "leadId"               UUID,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_created
  ON bookings ("tenantId", "createdAt" DESC);

-- ── funnel_leads: make the public lead-capture handler compatible ────
-- Additive only — existing columns (used by funnel.service) are untouched.
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS name                    VARCHAR(200);
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS organization            VARCHAR(255);
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS country                 VARCHAR(2);
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "interestType"          VARCHAR(50);
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS message                 TEXT;
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "referralCode"          VARCHAR(50);
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "vitalityAssessmentId"  UUID;
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "facialAnalysisId"      UUID;
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "consentMarketing"      BOOLEAN;
ALTER TABLE funnel_leads ADD COLUMN IF NOT EXISTS "consentDataProcessing" BOOLEAN;
-- The public handler does not set currentStep; relax the constraint (funnel.service still sets it).
ALTER TABLE funnel_leads ALTER COLUMN "currentStep" DROP NOT NULL;
-- Public handler emits status 'NEW'; add it to the enum (additive, idempotent).
ALTER TYPE "FunnelStatus" ADD VALUE IF NOT EXISTS 'NEW';

-- ── RLS — tenant isolation on the new tables (same pattern as platform) ──
ALTER TABLE vitality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE facial_analyses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY['vitality_assessments','facial_analyses','bookings'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId"::TEXT = current_setting(''app.current_tenant_id'', TRUE));
    ', tbl, tbl);
  END LOOP;
END $$;
