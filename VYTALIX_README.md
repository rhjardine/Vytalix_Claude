# Vytalix Clinical Intelligence Engine — MVP

## Stack
- **Runtime**: Node.js 20 + TypeScript 5
- **Framework**: Next.js 14 App Router
- **ORM**: Prisma 5 + PostgreSQL 15
- **TimescaleDB**: Extension on PostgreSQL (hypertable for observations + audit_logs)
- **Testing**: Vitest
- **Logging**: pino (JSON structured)

## Prerequisites
```bash
# PostgreSQL 15 with TimescaleDB extension
# Node.js 20+
# pnpm 8+
```

## Setup

### 1. Install dependencies
```bash
pnpm install
```

### 2. Environment variables
```bash
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, LOG_LEVEL
```

### 3. Database setup
```bash
# Create database
createdb vytalix_dev

# Run Prisma migrations
npx prisma migrate dev --name init

# Apply RLS + TimescaleDB
psql $DATABASE_URL -f migration_rls.sql

# Seed demo data
npx prisma db seed
```

### 4. Run development server
```bash
pnpm dev
# API: http://localhost:3001
# Dashboard: http://localhost:3000
```

## Running tests
```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests
pnpm test:integration

# With coverage
pnpm test:coverage
```

## Architecture
```
src/
  ingestion/
    loinc-registry.ts     # LOINC codes, unit conversions, physiological bounds
    ingestion.service.ts  # Multi-source ingest: API | CSV | FHIR R4
  pipeline/
    orchestrator.ts       # 3-stage pipeline: snapshot → score → decide
    risk-scoring.service.ts # Framingham 2008 cardiovascular risk
  decision/
    decision.engine.ts    # 5 hardened rules + protocol DB rules
  explainability/
    explainability.service.ts # Deterministic clinical narratives
  lib/
    prisma.ts             # Tenant-aware DB client with RLS middleware
    logger.ts             # pino structured logger
tests/
  unit/
    risk-scoring.test.ts  # Framingham equation accuracy + boundaries
    loinc-registry.test.ts # Unit conversion + validation
  integration/
    pipeline.test.ts      # Full ingest → decision flow
frontend/
  app/
    dashboard/page.tsx    # Physician dashboard (Server Component)
    patients/[id]/page.tsx # Patient detail
    decisions/[id]/trace/ # Explainability view
```

## Clinical Pipeline Flow
```
POST /observations
  → IngestionService.ingestSingle()
    → validateObservationValue() [LOINC bounds]
    → normalizeUnit() [mmol/L → mg/dL, etc.]
    → persist ClinicalObservation
    → DB trigger updates PatientHealthSnapshot
  → PipelineOrchestrator.runFromObservation()
    → Stage 1: verify snapshot currency
    → Stage 2: RiskScoringService.computeCardiovascularRisk() [Framingham 2008]
    → Stage 3: DecisionEngine.generateForPatient()
      → evaluate 5 hardened clinical rules
      → evaluate DB protocol rules
      → create Recommendation + DecisionTrace (atomic)
      → ExplainabilityService renders ClinicalExplanation
```

## Key design decisions

**Rule-first, never ML-only**: Every recommendation is triggered by a deterministic rule.
Risk scores add context but never replace the rule as the trigger.

**Immutability**: ClinicalObservation and RiskScore are never updated — only new rows added.
DecisionTrace is insert-only. Full audit reproduction is always possible.

**Resilient pipeline**: A stage failure (e.g., risk scoring) does not fail the ingestion.
Observations are always persisted.

**RLS at DB level**: All clinical tables enforce tenant isolation via PostgreSQL Row Level
Security. Application bugs cannot leak cross-tenant data.
