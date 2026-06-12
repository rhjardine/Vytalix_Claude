-- =============================================================================
-- Migration: 20250902000000_dental_sprints4_5_tables
-- Sprint 4: dental_audit_logs
-- Sprint 5: dental_catalog_items, dental_pricing_rules,
--           dental_exchange_rate_snapshots, dental_tenant_settings
-- Sprint 6: dental_vouchers, dental_bookings
-- Extensions: dental_financial_snapshots, dental_inventory_items, dental_inventory_movements
-- =============================================================================

-- ─── SPRINT 4: AUDIT LOGS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_audit_logs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  event_type       VARCHAR(50)  NOT NULL,
  entity_id        VARCHAR(128) NOT NULL,
  entity_type      VARCHAR(64)  NOT NULL,
  actor_id         VARCHAR(128) NOT NULL,
  correlation_id   VARCHAR(128) NOT NULL,
  before_state     JSONB,
  after_state      JSONB,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dal_tenant_event    ON dental_audit_logs (tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_dal_tenant_entity   ON dental_audit_logs (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_dal_tenant_created  ON dental_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_correlation     ON dental_audit_logs (correlation_id);

ALTER TABLE dental_audit_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_audit_logs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_audit_logs
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 5: DENTAL CATALOG ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_catalog_items (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  code             VARCHAR(64)  NOT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  category         VARCHAR(64)  NOT NULL,
  base_cost        INTEGER      NOT NULL,       -- Minor units (clinic cost)
  suggested_price  INTEGER      NOT NULL,       -- Minor units (suggested retail)
  currency         VARCHAR(3)   NOT NULL DEFAULT 'MXN',
  duration_minutes INTEGER,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT dci_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT dci_price_gte_cost CHECK (suggested_price >= base_cost),
  CONSTRAINT dci_cost_positive CHECK (base_cost >= 0),
  CONSTRAINT dci_currency_check CHECK (currency IN ('USD','MXN','COP','PEN','EUR'))
);

CREATE INDEX IF NOT EXISTS idx_dci_tenant_active   ON dental_catalog_items (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dci_tenant_category ON dental_catalog_items (tenant_id, category);

ALTER TABLE dental_catalog_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_catalog_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_catalog_items
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 5: PRICING RULES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_pricing_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL,
  catalog_item_code   VARCHAR(64),              -- NULL = applies to whole category
  category            VARCHAR(64),              -- NULL = applies to single item only
  margin_percent      NUMERIC(8,2),             -- Applied to base_cost
  discount_percent    NUMERIC(5,2),             -- Applied to suggested_price
  fixed_price         INTEGER,                  -- Minor units — overrides all
  currency            VARCHAR(3),
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until         TIMESTAMPTZ,
  priority            INTEGER     NOT NULL DEFAULT 0,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dpr_scope_check CHECK (
    catalog_item_code IS NOT NULL OR category IS NOT NULL
  ),
  CONSTRAINT dpr_rule_type_check CHECK (
    margin_percent IS NOT NULL OR discount_percent IS NOT NULL OR fixed_price IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_dpr_tenant_code   ON dental_pricing_rules (tenant_id, catalog_item_code)
  WHERE catalog_item_code IS NOT NULL AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_dpr_tenant_cat    ON dental_pricing_rules (tenant_id, category)
  WHERE category IS NOT NULL AND is_active = TRUE;

ALTER TABLE dental_pricing_rules ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_pricing_rules' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_pricing_rules
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 5: EXCHANGE RATE SNAPSHOTS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_exchange_rate_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  base_currency   VARCHAR(3)  NOT NULL,
  rates           JSONB       NOT NULL,         -- { "USD": 1.0, "MXN": 17.9, ... }
  source          VARCHAR(64) NOT NULL DEFAULT 'manual',
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ders_currency_check CHECK (
    base_currency IN ('USD','MXN','COP','PEN','EUR')
  )
);

CREATE INDEX IF NOT EXISTS idx_ders_tenant_base  ON dental_exchange_rate_snapshots
  (tenant_id, base_currency, effective_at DESC);

ALTER TABLE dental_exchange_rate_snapshots ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_exchange_rate_snapshots' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_exchange_rate_snapshots
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 5: TENANT SETTINGS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_tenant_settings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL UNIQUE,   -- One row per tenant
  default_currency        VARCHAR(3)  NOT NULL DEFAULT 'MXN',
  tax_rate                NUMERIC(5,2) NOT NULL DEFAULT 16.0,
  default_margin_percent  NUMERIC(8,2) NOT NULL DEFAULT 35.0,
  financing_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  timezone                VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
  metadata                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dts_currency_check CHECK (
    default_currency IN ('USD','MXN','COP','PEN','EUR')
  ),
  CONSTRAINT dts_tax_rate_check CHECK (tax_rate BETWEEN 0 AND 100),
  CONSTRAINT dts_margin_check CHECK (default_margin_percent >= 0)
);

ALTER TABLE dental_tenant_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_tenant_settings' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_tenant_settings
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 6: DENTAL VOUCHERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_vouchers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  catalog_item_code VARCHAR(64) NOT NULL,
  token             VARCHAR(64) NOT NULL UNIQUE,
  qr_payload        TEXT        NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  beneficiary_ref   VARCHAR(128),
  expires_at        TIMESTAMPTZ NOT NULL,
  redeemed_at       TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  price_amount      INTEGER     NOT NULL,
  price_currency    VARCHAR(3)  NOT NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  correlation_id    VARCHAR(128) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dvou_status_check CHECK (
    status IN ('ACTIVE','REDEEMED','EXPIRED','CANCELLED','SUSPENDED')
  ),
  CONSTRAINT dvou_currency_check CHECK (
    price_currency IN ('USD','MXN','COP','PEN','EUR')
  )
);

CREATE INDEX IF NOT EXISTS idx_dvou_token          ON dental_vouchers (token);
CREATE INDEX IF NOT EXISTS idx_dvou_tenant_status  ON dental_vouchers (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dvou_beneficiary    ON dental_vouchers (beneficiary_ref)
  WHERE beneficiary_ref IS NOT NULL;

ALTER TABLE dental_vouchers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_vouchers' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_vouchers
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── SPRINT 6: DENTAL BOOKINGS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_bookings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  voucher_id        UUID        REFERENCES dental_vouchers(id),
  catalog_item_code VARCHAR(64) NOT NULL,
  patient_ref       VARCHAR(128) NOT NULL,
  provider_id       VARCHAR(128),
  location_id       VARCHAR(128),
  slot_start        TIMESTAMPTZ NOT NULL,
  slot_end          TIMESTAMPTZ NOT NULL,
  timezone          VARCHAR(64) NOT NULL DEFAULT 'UTC',
  status            VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  notes             TEXT,
  cancellation_reason TEXT,
  confirmed_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  correlation_id    VARCHAR(128) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dbk_status_check CHECK (
    status IN ('REQUESTED','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')
  )
);

CREATE INDEX IF NOT EXISTS idx_dbk_tenant_status  ON dental_bookings (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dbk_patient        ON dental_bookings (patient_ref);
CREATE INDEX IF NOT EXISTS idx_dbk_slot_start     ON dental_bookings (slot_start);

ALTER TABLE dental_bookings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_bookings' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_bookings
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── ADDITIONS: FINANCIAL SNAPSHOTS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_financial_snapshots (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  snapshot_type    VARCHAR(50)  NOT NULL,
  gross_margin_bps INTEGER      NOT NULL,
  net_margin_bps   INTEGER      NOT NULL,
  net_revenue      INTEGER      NOT NULL,
  currency         VARCHAR(3)   NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dfs_tenant_created ON dental_financial_snapshots (tenant_id, created_at DESC);

ALTER TABLE dental_financial_snapshots ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_financial_snapshots' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_financial_snapshots
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

-- ─── ADDITIONS: INVENTORY ITEMS & MOVEMENTS ──────────────────────────────────

CREATE TABLE IF NOT EXISTS dental_inventory_items (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  sku              VARCHAR(100) NOT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  category         VARCHAR(64)  NOT NULL,
  unit             VARCHAR(50)  NOT NULL,
  reorder_level    INTEGER      NOT NULL DEFAULT 0,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  
  CONSTRAINT dii_tenant_sku_unique UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_dii_tenant_sku ON dental_inventory_items (tenant_id, sku);

ALTER TABLE dental_inventory_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_inventory_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_inventory_items
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS dental_inventory_movements (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  item_id          UUID         NOT NULL REFERENCES dental_inventory_items(id),
  quantity         INTEGER      NOT NULL,
  type             VARCHAR(50)  NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_tenant_item ON dental_inventory_movements (tenant_id, item_id);

ALTER TABLE dental_inventory_movements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_inventory_movements' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dental_inventory_movements
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
  END IF;
END
$$;
