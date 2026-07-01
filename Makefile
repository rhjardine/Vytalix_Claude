# =============================================================================
# Vytalix Platform — Makefile
# =============================================================================

.PHONY: setup dev demo check reset stop logs test typecheck lint build ci ci-full aek

# ── Setup (first run) ─────────────────────────────────────────────
setup:
	@echo "🔧 Setting up Vytalix Platform..."
	cp -n .env.example .env || true
	npm install
	docker compose up -d postgres redis
	@echo "⏳ Waiting for database..."
	@sleep 5
	npx prisma migrate deploy
	psql $$DATABASE_URL -f prisma/migration_rls.sql
	@echo "✅ Setup complete. Run 'make dev' to start."

# ── Development servers ───────────────────────────────────────────
dev:
	docker compose up -d postgres redis
	npx concurrently \
	  "npm run api:dev" \
	  "npm run dev"

# ── Demo (with seeded data) ───────────────────────────────────────
demo:
	@$(MAKE) check
	docker compose --profile demo up -d
	@echo ""
	@echo "🚀 Vytalix Platform running:"
	@echo "   Dashboard:  http://localhost:3000/dashboard"
	@echo "   Funnel:     http://localhost:3000/funnel"
	@echo "   API Health: http://localhost:3001/health"
	@echo "   API Docs:   http://localhost:3001/docs"

# ── Pre-flight check ──────────────────────────────────────────────
check:
	@echo "🔍 Running pre-flight checks..."
	@node -e "require('dotenv').config(); const u=process.env.DATABASE_URL; if(!u) throw new Error('DATABASE_URL missing')"
	@node -e "require('dotenv').config(); const r=process.env.REDIS_URL; if(!r) throw new Error('REDIS_URL missing')"
	@curl -sf http://localhost:3001/health | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); if(j.status!=='ok') throw new Error('API not healthy: '+j.status)" 2>/dev/null || echo "⚠️  API not running yet (start with 'make dev')"
	@echo "✅ Checks passed"

# ── Tests ─────────────────────────────────────────────────────────
test:
	npx vitest run

test-watch:
	npx vitest

test-coverage:
	npx vitest run --coverage

test-integration:
	npx vitest run tests/integration/

# ── Type checking ─────────────────────────────────────────────────
typecheck:
	npx tsc --noEmit --project tsconfig.server.json

# ── Lint ──────────────────────────────────────────────────────────
lint:
	npx eslint src --ext .ts --max-warnings 0

# ── Build ────────────────────────────────────────────────────────
build:
	npm run api:build
	npm run build

# ── Reset demo data ───────────────────────────────────────────────
reset:
	@echo "♻️  Resetting demo data..."
	psql $$DATABASE_URL -c "TRUNCATE funnel_leads, funnel_assessments, funnel_bookings, biological_age_assessments, engagement_events, referral_events, billing_events RESTART IDENTITY CASCADE;"
	psql $$DATABASE_URL -c "SET app.seed_demo = 'true';" -f prisma/migration_rls.sql
	@echo "✅ Demo data reset"

# ── Stop all services ────────────────────────────────────────────
stop:
	docker compose down

# ── Logs ─────────────────────────────────────────────────────────
logs:
	docker compose logs -f api

logs-all:
	docker compose logs -f

# ── DB utilities ─────────────────────────────────────────────────
db-studio:
	npx prisma studio

db-migrate:
	npx prisma migrate dev

db-rls:
	psql $$DATABASE_URL -f prisma/migration_rls.sql

# ── API Key provisioning ──────────────────────────────────────────
provision-disglobal-key:
	@echo "🔑 Provisioning Disglobal API key..."
	curl -sf -X POST http://localhost:3001/admin/tenants/00000000-0000-0000-0000-000000000002/api-keys \
	  -H "Content-Type: application/json" \
	  -d '{"name":"Disglobal Production","prefix":"dis","permissions":{"vitality":["read","write"],"preventive":["write"],"referral":["read"],"engagement":["write"],"insights":["read"]},"rateLimitTier":"PROFESSIONAL","createdBy":"00000000-0000-0000-0000-000000000001"}' \
	  | python3 -m json.tool
	@echo "⚠️  Save the keyPlain value — it cannot be retrieved again."

# ── Release candidate validation ─────────────────────────────────
rc-validate:
	@echo "🔍 Release Candidate Validation..."
	@$(MAKE) typecheck   && echo "  ✅ TypeCheck" || echo "  ❌ TypeCheck FAILED"
	@$(MAKE) lint        && echo "  ✅ Lint"      || echo "  ❌ Lint FAILED"
	@$(MAKE) test        && echo "  ✅ Tests"     || echo "  ❌ Tests FAILED"
	@$(MAKE) check       && echo "  ✅ Health"    || echo "  ❌ Health FAILED"
	@echo "Done."

# ── AEK architecture gate ─────────────────────────────────────────
aek:
	npm run aek:check

# ── CI blocking gates (mirrors .github/workflows/ci.yml blocking stages) ──
# Single entrypoint for the merge-blocking quality gates. Reuses existing
# package.json scripts; introduces no new behavior. See:
#   docs/governance/QUALITY_GATES.md
ci:
	@echo "🔒 Running blocking quality gates (sandbox + prisma validate + AEK)..."
	npm run ci

# ── CI full (includes advisory stages — needs Postgres + Redis for tests) ──
# Advisory stages may fail on pre-existing issues documented in
# docs/SPRINT_E1_REPORT.md; they do not block locally.
ci-full:
	@echo "🧪 Full local validation (advisory stages may fail — see SPRINT_E1_REPORT.md)..."
	@$(MAKE) typecheck && echo "  ✅ TypeCheck" || echo "  ⚠️  TypeCheck (advisory)"
	@npm run api:build && echo "  ✅ Build"     || echo "  ⚠️  Build (advisory)"
	@npm run sandbox:test && echo "  ✅ Sandbox" || echo "  ❌ Sandbox FAILED (blocking)"
	@npm run test && echo "  ✅ Tests"          || echo "  ⚠️  Tests (advisory — needs DB/Redis)"
	@npx prisma validate && echo "  ✅ Prisma"  || echo "  ❌ Prisma FAILED (blocking)"
	@npm run aek:check && echo "  ✅ AEK"        || echo "  ❌ AEK FAILED (blocking)"
	@npm run lint && echo "  ✅ Lint"           || echo "  ⚠️  Lint (advisory — no config)"
	@echo "Done."
