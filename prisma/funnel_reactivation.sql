-- =============================================================================
-- prisma/funnel_reactivation.sql
-- Funnel — raw-SQL vertical tables + RLS (companion to schema.prisma).
--
-- OWNERSHIP (P0.5 decision):
--   • schema.prisma OWNS the funnel_leads columns, currentStep optionality,
--     updatedAt default and the FunnelStatus 'NEW' value — do NOT alter those
--     Prisma-managed objects here (that caused schema drift; now reconciled in
--     schema.prisma).
--   • This file OWNS only what Prisma cannot express or model as a vertical:
--     the three raw-SQL tables the funnel handler writes to via db.rawQuery
--     (vitality_assessments, facial_analyses, bookings) + their tenant RLS.
--     Same pattern as the dental vertical (raw-SQL tables outside schema.prisma).
--
-- Invariants: tenant_isolation RLS (same USING policy as migration_rls.sql);
-- multi-tenancy (tenantId on every row); idempotent (IF NOT EXISTS).
--
-- Apply via:  pnpm db:funnel   (or: psql "$DATABASE_URL" -f prisma/funnel_reactivation.sql)
-- Deployment order: db:migrate → prisma db push (schema.prisma) → db:rls → db:funnel
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

-- NOTE: funnel_leads columns, currentStep optionality, updatedAt default and
-- FunnelStatus 'NEW' are now declared in schema.prisma (single source of truth)
-- and applied by `prisma db push` — intentionally NOT altered here (drift fix).

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
