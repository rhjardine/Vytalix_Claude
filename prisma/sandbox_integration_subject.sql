-- =============================================================================
-- prisma/sandbox_integration_subject.sql
-- Permanent integration subject for the Disglobal sandbox.
--
-- Run AFTER the schema exists:
--   psql $DATABASE_URL -f prisma/sandbox_integration_subject.sql
--
-- This is the subject Disglobal uses for the whole technical integration, not a
-- throwaway fixture. Two consequences follow from that:
--
--   * Every identifier is fixed, never generated. Re-running the file leaves the
--     database in the same state, so it is safe on an environment that already
--     has it.
--   * The reference is `DISG-8c1e5a`, the same value already hard-coded in the
--     webhook signing examples shipped in the kickoff package. Provisioning that
--     exact value is what makes those examples runnable as written.
--
-- The subject carries the minimum a Phase 1 call needs to resolve and score:
-- identity, date of birth and biological sex. No clinical history is seeded —
-- assessments, scores and engagement are produced by the APIs themselves, which
-- is precisely what the integration is meant to exercise.
--
-- Tenant note: the subject belongs to the same tenant as DEFAULT_FUNNEL_TENANT_ID,
-- so a payment webhook that falls back to that tenant lands on the same subject
-- rather than an unrelated one.
-- =============================================================================

BEGIN;

-- ── Tenant ───────────────────────────────────────────────────────────
-- Normally already present; created here so the file also works on an empty
-- sandbox. Existing values are left untouched.
-- `updatedAt` is written explicitly: Prisma maintains @updatedAt from the client,
-- so the column is NOT NULL with no database default and a raw INSERT must set it.
INSERT INTO tenants (id, name, slug, "isActive", "monthlyApiLimit", plan, "createdAt", "updatedAt")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001'::uuid,
  'Grupo Nueve Once — Red de Salud',
  'grupo-nueve-once',
  true,
  0,            -- 0 = unlimited; the sandbox must not hit a quota mid-integration
  'STARTER',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ── Integration subject ──────────────────────────────────────────────
-- Resolved by GET/POST /api/v2/* through externalIds->>'disglobal_ref', and
-- equally through mrn — the platform accepts either.
INSERT INTO patients (
  id, "tenantId", mrn,
  "firstName", "lastName",
  "dateOfBirth", "biologicalSex",
  "isActive", status, "externalIds",
  "createdAt", "updatedAt"
)
VALUES (
  'a1b2c3d4-0000-4000-8000-0000000000d1'::uuid,
  'a1b2c3d4-0000-4000-8000-000000000001'::uuid,
  'DISG-SANDBOX-0001',
  'Integration',
  'Subject',
  DATE '1981-06-15',      -- fixed: keeps chronological age reproducible
  'MALE',
  true,
  'ACTIVE',
  '{"disglobal_ref": "DISG-8c1e5a"}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
  SET "externalIds" = EXCLUDED."externalIds",
      status        = EXCLUDED.status,
      "isActive"    = EXCLUDED."isActive",
      "updatedAt"   = NOW();

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────
-- Expect exactly one row.
SELECT
  p.id                              AS patient_id,
  p."tenantId",
  p.mrn,
  p."externalIds"->>'disglobal_ref' AS subject_ref,
  p."biologicalSex",
  p.status
FROM patients p
WHERE p."tenantId" = 'a1b2c3d4-0000-4000-8000-000000000001'::uuid
  AND p."externalIds"->>'disglobal_ref' = 'DISG-8c1e5a';
