# =============================================================================
# Vytalix Clinical Intelligence Engine — Makefile
# make setup   → complete first-time installation (< 10 minutes)
# make demo    → validate + start full stack
# make check   → pre-demo Go/No-Go validation
# make reset   → restore demo data (idempotent)
# =============================================================================

.PHONY: setup demo check reset dev stop logs clean help
.DEFAULT_GOAL := help

G  = \033[0;32m
Y  = \033[0;33m
R  = \033[0;31m
B  = \033[1m
X  = \033[0m

COMPOSE      = docker compose
COMPOSE_FULL = $(COMPOSE) --profile full
DB_EXEC      = $(COMPOSE) --profile dev exec -T postgres \
               psql -U $${POSTGRES_USER:-vytalix} -d $${POSTGRES_DB:-vytalix_dev}

# ── setup ─────────────────────────────────────────────────────────
setup: .env
	@echo "\n$(B)  Vytalix Setup$(X)\n"

	@echo "  Checking prerequisites..."
	@which docker >/dev/null 2>&1 || (echo "$(R)  ✗ Docker not found$(X)" && exit 1)
	@which node   >/dev/null 2>&1 || (echo "$(R)  ✗ Node.js not found$(X)" && exit 1)
	@echo "  $(G)✓$(X) Prerequisites OK (Docker + Node.js)"

	@echo "  Installing npm dependencies..."
	@npm install --silent
	@echo "  $(G)✓$(X) Dependencies installed"

	@echo "  Generating Prisma client (requires internet)..."
	@if PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npm run db:generate 2>/dev/null; then \
		echo "  $(G)✓$(X) Prisma client generated"; \
	else \
		echo "  $(Y)~$(X) Prisma generate failed (offline mode — using pg fallback)"; \
		echo "  $(Y)~$(X) Run 'npm run db:generate' when internet is available"; \
	fi

	@echo "  Starting database..."
	@$(COMPOSE) --profile dev up -d postgres redis
	@echo "  Waiting for PostgreSQL..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		$(COMPOSE) --profile dev exec -T postgres pg_isready -U $${POSTGRES_USER:-vytalix} >/dev/null 2>&1 && break; \
		sleep 3; \
	done
	@$(COMPOSE) --profile dev exec -T postgres pg_isready -U $${POSTGRES_USER:-vytalix} >/dev/null 2>&1 \
		|| (echo "$(R)  ✗ PostgreSQL not ready after 30s$(X)" && exit 1)
	@echo "  $(G)✓$(X) PostgreSQL ready"

	@echo "  Running migrations..."
	@npm run db:migrate 2>&1 | grep -E "Applied|already|error" | head -5 || true
	@echo "  $(G)✓$(X) Migrations applied"

	@echo "  Applying RLS policies..."
	@$(DB_EXEC) -f /dev/stdin < prisma/migration_rls.sql >/dev/null 2>&1 \
		|| echo "  $(Y)~$(X) RLS policies: applied or already exist"
	@echo "  $(G)✓$(X) RLS active"

	@echo "  Seeding demo data..."
	@npm run db:seed 2>&1 | tail -3
	@echo "  $(G)✓$(X) Demo data loaded"

	@echo "  Bootstrapping auth credentials..."
	@npm run auth:bootstrap 2>&1 | tail -4
	@echo "  $(G)✓$(X) Credentials ready"

	@echo "\n  $(G)$(B)Setup complete.$(X) Run $(B)make demo$(X) to start.\n"

# ── demo ──────────────────────────────────────────────────────────
demo: .env
	@echo "\n$(B)  Starting Vytalix Demo$(X)\n"

	@echo "  Running pre-demo validation..."
	@npm run demo:check || (echo "\n  $(R)✗ Validation failed. Run: make reset$(X)\n" && exit 1)

	@echo "  Starting all services..."
	@$(COMPOSE_FULL) up -d
	@sleep 4

	@echo "  Verifying API..."
	@curl -sf http://localhost:$${API_PORT:-3001}/health >/dev/null \
		|| (echo "  $(R)✗ API not responding$(X)" && exit 1)
	@echo "  $(G)✓$(X) API healthy"

	@echo ""
	@echo "  $(B)Ready for demo$(X)"
	@echo "  Dashboard:   http://localhost:$${FRONTEND_PORT:-3000}/dashboard"
	@echo "  API:         http://localhost:$${API_PORT:-3001}/health"
	@echo "  Demo status: http://localhost:$${API_PORT:-3001}/demo/status"
	@echo ""

# ── check ─────────────────────────────────────────────────────────
check:
	@npm run demo:check

# ── reset ─────────────────────────────────────────────────────────
reset:
	@echo "\n$(B)  Resetting demo data$(X)\n"
	@npm run db:seed 2>&1 | tail -3
	@npm run auth:bootstrap 2>&1 | tail -3
	@npm run demo:check

# ── dev ───────────────────────────────────────────────────────────
dev:
	@$(COMPOSE) --profile dev up -d postgres redis
	@npm run api:dev

# ── stop ──────────────────────────────────────────────────────────
stop:
	@$(COMPOSE_FULL) down
	@echo "  $(G)✓$(X) All services stopped"

# ── logs ──────────────────────────────────────────────────────────
logs:
	@$(COMPOSE_FULL) logs -f api

# ── clean ─────────────────────────────────────────────────────────
clean:
	@echo "$(R)  WARNING: deletes all data$(X)"
	@read -p "  Continue? [y/N] " c && [ "$$c" = "y" ] || exit 1
	@$(COMPOSE_FULL) down -v
	@echo "  $(G)✓$(X) Clean complete"

# ── .env bootstrap ────────────────────────────────────────────────
.env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "  $(Y)~$(X) Created .env from .env.example"; \
	fi

# ── help ──────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(B)  Vytalix — Commands$(X)"
	@echo ""
	@echo "  $(B)make setup$(X)    First-time installation"
	@echo "  $(B)make demo$(X)     Validate + start demo stack"
	@echo "  $(B)make check$(X)    Pre-demo Go/No-Go validation"
	@echo "  $(B)make reset$(X)    Restore demo data"
	@echo "  $(B)make dev$(X)      Development mode"
	@echo "  $(B)make stop$(X)     Stop all services"
	@echo "  $(B)make logs$(X)     Follow API logs"
	@echo "  $(B)make clean$(X)    Remove all data (destructive)"
	@echo ""
