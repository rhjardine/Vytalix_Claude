-- =============================================================================
-- prisma/payment_lifecycle.sql
-- Disglobal payment lifecycle — raw-SQL vertical table + RLS.
-- Companion to schema.prisma (same pattern as funnel_reactivation.sql):
-- payment_transactions is written by the payment pipeline via withTenant
-- (db.rawQuery), so it lives here as an explicit raw-SQL table — NOT a Prisma
-- model — exactly like vitality_assessments / facial_analyses / bookings.
--
-- Invariants: tenant_isolation RLS (same USING policy as migration_rls.sql /
-- funnel_reactivation.sql); FORCE RLS so even the table owner is subject to the
-- policy (same guarantee verified in tests/funnel-rls.test.ts); multi-tenancy
-- ("tenantId" on every row); idempotent (IF NOT EXISTS + UNIQUE "intentId").
--
-- Apply via:  pnpm db:payment   (or: psql "$DATABASE_URL" -f prisma/payment_lifecycle.sql)
-- Deployment order: prisma db push (schema.prisma) → db:rls → db:funnel → db:payment
-- =============================================================================

-- ── Payment transaction (durable registro — persisted before activation) ──
CREATE TABLE IF NOT EXISTS payment_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "intentId"      VARCHAR(128) NOT NULL,
  "subjectRef"    VARCHAR(128) NOT NULL,
  amount          INTEGER NOT NULL,
  currency        VARCHAR(3) NOT NULL,
  product         VARCHAR(80) NOT NULL,
  status          VARCHAR(30) NOT NULL,
  "correlationId" VARCHAR(36),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confirmedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one row per payment intent (supports ON CONFLICT ("intentId"))
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_intent
  ON payment_transactions ("intentId");

CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_confirmed
  ON payment_transactions ("tenantId", "confirmedAt" DESC);

-- ── RLS — tenant isolation (same pattern as funnel_reactivation.sql) ──
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON payment_transactions;
CREATE POLICY tenant_isolation ON payment_transactions
  USING ("tenantId"::TEXT = current_setting('app.current_tenant_id', TRUE));
