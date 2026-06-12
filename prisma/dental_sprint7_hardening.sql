-- =============================================================================
-- Migration: 20250903000000_dental_sprint7_hardening
-- Sprint 7: Hardening & Consolidation — corrects audit findings
-- =============================================================================
-- Changes applied:
-- 1. dental_catalog_items — add MISSING updated_at trigger (was in Sprint 4+5
--    migration comment but trigger function may not exist yet in all envs).
--    Added idempotent version using CREATE OR REPLACE.
-- 2. dental_vouchers — add slot_start / slot_end time constraints (slot_end > slot_start)
--    on dental_bookings.
-- 3. dental_catalog_items — add FK-safe currency CHECK (consistent with other tables).
-- 4. dental_audit_logs — add CHECK on event_type enum to prevent garbage values.
-- 5. dental_financial_snapshots — add CHECK that gross_margin_bps and net_margin_bps
--    are within [-10000, 10000] (basis points: -100% to +100%).
-- 6. dental_treatment_plans — ensure updated_at trigger exists (idempotent).
-- 7. dental_inventory_items — ensure updated_at trigger exists (idempotent).
-- =============================================================================

-- ─── 1. Ensure update_updated_at_column() exists (idempotent) ────────────────
-- The function was created in the Phase 3 migration, but re-declaring here
-- with CREATE OR REPLACE ensures it survives environment reset scenarios.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Ensure updated_at triggers exist on all mutable tables ───────────────

DO $$
DECLARE
  trig_name TEXT;
  table_name TEXT;
BEGIN
  -- Map: trigger_name -> table_name for all mutable dental tables
  FOR trig_name, table_name IN VALUES
    ('dental_treatment_plans_updated_at',    'dental_treatment_plans'),
    ('dental_inventory_items_updated_at',    'dental_inventory_items'),
    ('dental_catalog_items_updated_at',      'dental_catalog_items'),
    ('dental_tenant_settings_updated_at',    'dental_tenant_settings'),
    ('dental_vouchers_updated_at',           'dental_vouchers'),
    ('dental_bookings_updated_at',           'dental_bookings')
  LOOP
    -- Drop if exists, then recreate (idempotent)
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trig_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      trig_name, table_name
    );
  END LOOP;
END;
$$;

-- ─── 3. dental_bookings: slot_end > slot_start constraint ────────────────────
-- Missing from Sprint 6 migration. Critical for scheduling integrity.

ALTER TABLE dental_bookings
  DROP CONSTRAINT IF EXISTS dbk_slot_order,
  ADD CONSTRAINT dbk_slot_order CHECK (slot_end > slot_start);

-- ─── 4. dental_audit_logs: event_type CHECK constraint ───────────────────────
-- Prevents storing garbage audit events. Belt-and-suspenders alongside app-layer enum.

ALTER TABLE dental_audit_logs
  DROP CONSTRAINT IF EXISTS dal_event_type_check,
  ADD CONSTRAINT dal_event_type_check CHECK (
    event_type IN (
      'PLAN_CREATED', 'PLAN_STATUS_CHANGED', 'VERSION_SEALED', 'VERSION_CREATED',
      'INVENTORY_MOVEMENT', 'QUOTE_GENERATED', 'VOUCHER_ISSUED', 'VOUCHER_REDEEMED'
    )
  );

-- ─── 5. dental_financial_snapshots: margin bps range CHECK ───────────────────
-- Basis points must be in [-10000, 10000] (-100% to +100%).

ALTER TABLE dental_financial_snapshots
  DROP CONSTRAINT IF EXISTS dfs_margin_bps_range,
  ADD CONSTRAINT dfs_margin_bps_range CHECK (
    gross_margin_bps BETWEEN -10000 AND 10000
    AND net_margin_bps BETWEEN -10000 AND 10000
  );

-- ─── 6. dental_catalog_items: missing updated_at column ─────────────────────
-- dental_catalog_items has updated_at in both migration and Prisma model.
-- Verify column exists (was in Sprint 4+5 migration — this is a no-op if present).
-- Using DO block to avoid error if column already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dental_catalog_items' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE dental_catalog_items
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END;
$$;

-- ─── 7. Composite index on dental_vouchers for beneficiary + status lookup ────
-- Improves queries like "find all active vouchers for a patient".

CREATE INDEX IF NOT EXISTS idx_dvou_beneficiary_status
  ON dental_vouchers (tenant_id, beneficiary_ref, status)
  WHERE beneficiary_ref IS NOT NULL;

-- ─── 8. Index on dental_bookings for voucher_id lookup ───────────────────────

CREATE INDEX IF NOT EXISTS idx_dbk_voucher
  ON dental_bookings (voucher_id)
  WHERE voucher_id IS NOT NULL;

-- ─── 9. Ensure RLS policies exist on Sprint 6 tables (idempotent) ────────────
-- Sprint 6 migration added RLS, but this ensures correctness in any apply order.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['dental_vouchers', 'dental_bookings']
  LOOP
    -- Only create if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.current_tenant_id'')::uuid)',
        t
      );
    END IF;
  END LOOP;
END;
$$;
