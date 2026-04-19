# Vytalix — Architecture Reference
## Single source of truth for module ownership

---

## Directory structure

```
vytalix/
├── src/
│   ├── server.ts              # Express entry point — mounts all routes
│   │
│   ├── auth/                  # Authentication + authorization
│   │   ├── auth.middleware.ts # JWT validation, signToken, loginHandler
│   │   └── bootstrap.ts       # Seed bcrypt passwords for demo users
│   │
│   ├── middleware/            # Express cross-cutting middleware
│   │   ├── tenant.middleware.ts  # Validates tenant_id JWT↔header coherence
│   │   └── error.middleware.ts   # RFC 7807 error handler (last middleware)
│   │
│   ├── api/                   # Route handlers (thin — delegate to services)
│   │   ├── handlers.ts           # /v1/* clinical endpoints
│   │   ├── external.handler.ts   # /api/external/* (API key auth)
│   │   ├── observability.handler.ts # /health, /metrics
│   │   └── timeline.service.ts   # Patient timeline query (TimescaleDB)
│   │
│   ├── ingestion/             # Data ingest + normalization
│   │   ├── ingestion.service.ts  # CANONICAL: multi-source ingest
│   │   ├── loinc-registry.ts     # CANONICAL: LOINC codes + unit conversions
│   │   ├── fhir-mapper.ts        # FHIR R4 → internal format
│   │   ├── observation-validator.ts  # Physiological bounds validation
│   │   └── unit-normalizer.ts    # Unit conversion (mmol/L → mg/dL etc)
│   │
│   ├── pipeline/              # Clinical data processing pipeline
│   │   ├── orchestrator.ts       # CANONICAL: 3-stage pipeline coordinator
│   │   ├── risk-scoring.service.ts # CANONICAL: Framingham 2008
│   │   └── snapshot.service.ts   # PatientHealthSnapshot recomputation
│   │
│   ├── decision/              # Clinical decision engine
│   │   └── decision.engine.ts    # CANONICAL: 5 hardened rules + protocol rules
│   │
│   ├── explainability/        # Deterministic clinical narratives
│   │   └── explainability.service.ts # CANONICAL: no-LLM explanation generator
│   │
│   ├── events/                # Internal event bus
│   │   └── event-bus.ts          # CANONICAL: EventEmitter → EventBridge-ready
│   │
│   ├── contracts/             # Public API data contracts
│   │   ├── v1/index.ts           # Stable contract interfaces
│   │   ├── v1_1/index.ts         # Additive extensions (backward compatible)
│   │   └── compat/mappers.ts     # DB model → wire contract transformations
│   │
│   ├── demo/                  # Demo reliability layer
│   │   ├── demo-dataset.ts       # FROZEN values — no Date.now(), no random
│   │   ├── seed-demo.ts          # Deterministic seeder
│   │   └── demo-status.ts        # GET /demo/status + demo-visible logging
│   │
│   └── lib/                   # Shared infrastructure
│       ├── prisma.ts             # CANONICAL: tenant-aware DB client + RLS
│       └── logger.ts             # CANONICAL: pino structured logger
│
├── prisma/
│   ├── schema.prisma          # CANONICAL: single Prisma schema
│   ├── migration_rls.sql      # RLS policies + TimescaleDB hypertables
│   └── seed.ts                # Re-exports src/demo/seed-demo.ts
│
├── scripts/                   # Operational scripts
│   ├── demo-check.ts          # Pre-demo validation (exit 0/1)
│   └── e2e-flow.ts            # End-to-end flow validator (HTTP real)
│
├── tests/
│   ├── unit/                  # Pure unit tests (no DB)
│   └── integration/           # Integration tests (mock DB)
│
├── frontend/                  # Next.js 14 App Router
│   └── app/
│       ├── dashboard/         # Physician dashboard
│       ├── patients/[id]/     # Patient detail
│       └── decisions/[id]/    # Decision trace / explainability
│
├── Makefile                   # make setup / make demo / make check
├── docker-compose.yml         # Profiles: dev | full | demo | prod
├── Dockerfile                 # Multi-stage: development → production
├── .env.example               # All required env vars documented
└── README.md                  # Executable step-by-step setup
```

---

## Module ownership rules

1. **One canonical file per concern** — if two files claim the same responsibility, the one in the table above wins. The other is deleted.
2. **No circular imports** — lib/ imports nothing from src/. api/ imports from pipeline/, decision/, ingestion/. pipeline/ imports from lib/ only.
3. **Demo layer is isolated** — src/demo/ is never imported by clinical modules. Clinical modules never import demo-dataset.ts.
4. **Contracts are the API boundary** — external consumers get v1/ types only. Internal code may use v1_1/.

---

## Data flow (single direction)

```
POST /observations
  → ingestion.service.ts (validate + normalize)
    → prisma.ts (persist ClinicalObservation)
      → DB trigger → PatientHealthSnapshot updated
  → event-bus.ts (ObservationAdded)
    → pipeline/orchestrator.ts
      → risk-scoring.service.ts (Framingham 2008)
      → decision.engine.ts (5 hardened rules)
        → explainability.service.ts (deterministic narrative)
      → DecisionTrace persisted (immutable)
```

---

## Canonical file registry (last updated: phase 4 hardening)

| Concern | Canonical file |
|---------|---------------|
| DB client | `src/lib/prisma.ts` |
| Logger | `src/lib/logger.ts` |
| Ingest | `src/ingestion/ingestion.service.ts` |
| LOINC | `src/ingestion/loinc-registry.ts` |
| Pipeline | `src/pipeline/orchestrator.ts` |
| Risk scoring | `src/pipeline/risk-scoring.service.ts` |
| Decision engine | `src/decision/decision.engine.ts` |
| Explainability | `src/explainability/explainability.service.ts` |
| Event bus | `src/events/event-bus.ts` |
| Demo dataset | `src/demo/demo-dataset.ts` |
| Prisma schema | `prisma/schema.prisma` |
