# REPOSITORY_TOPOLOGY.md
> **Vytalix Platform — Official Repository Topology**

| Campo | Valor |
|---|---|
| Estado | ACTIVO — topología autoritativa |
| Rama | `adr/baseline-2026` |
| Sprint de origen | E2 |
| Última revisión | 2026-06 |

> Topología autoritativa del repositorio. Clasifica cada zona por madurez y propósito. No modifica nada; describe el estado verificado en BC-1/E2.

---

## 1. Mapa por clasificación

| Clase | Zonas | Estado |
|---|---|---|
| **Production** | `src/core/` · `src/platform/` · `src/longevity/` · `src/shared/` · `src/api/` · `src/dental/` | Certificado BASELINE 2026 |
| **Stable / Conditional** | Partner Layer: `src/platform/disglobal-client.ts` + `/api/v2/*` + `sandbox/` | Apto para piloto |
| **Experimental** | `src/vertical2/` | Excluido (no compila — TD-01) |
| **Legacy** | `src/legacy/` | Aislado, no productivo (deprecated) |
| **Infrastructure** | `prisma/` · `Dockerfile` · `docker-compose.yml` · `tsconfig.server.json` · `package.json` · lockfiles | Nivel 1 / build |
| **Governance** | `docs/governance/` · `src/dental/docs/trd/` (TRD+ADR) · `.github/` | Autoridad de proceso |
| **Partner** | `docs/PHASE1_GOVERNANCE_PACKAGE_v1.md` · `disglobal-client.ts` · `/api/v2/*` · `docs/vertical2/` (commerce docs) | Contrato en cierre |
| **Documentation** | `docs/` · `README.md` | Niveles 2–3 |
| **Developer Utilities** | `tools/aek/` · `test-stubs/` · `scripts/` · `src/demo/` | Tooling/dev |
| **Repository Hygiene (debt)** | archivos sueltos en raíz (ver §4) | TD-05 — no productivo |

## 2. Árbol autoritativo

```
adr/baseline-2026/
├── src/
│   ├── core/         [PRODUCTION]    motores clínicos deterministas (4)
│   ├── longevity/    [PRODUCTION]    biophysics, biological-age, preventive, insights, facial (5)
│   ├── shared/       [PRODUCTION]    shared kernel: ingestion, funnel, engagement, contracts (13)
│   ├── platform/     [PRODUCTION]    db/RLS, redis, event-bus, metering, notification, disglobal-client (8)
│   ├── api/          [PRODUCTION]    handlers, middlewares, pipelines (21)
│   ├── dental/       [PRODUCTION]    vertical satélite — barrel index.ts (19)
│   ├── demo/         [DEV UTILITY]   seed/demo (6)
│   ├── legacy/       [LEGACY]        aislado, no productivo (7)
│   ├── vertical2/    [EXPERIMENTAL]  no compila — excluido (2)
│   ├── index.ts · server.ts          composition root
│
├── frontend-dental/  [PRODUCTION]    presentación Next.js (no en scope de cambio)
├── openapi/          [INFRA/Nivel 1] 5 contratos .yaml
├── prisma/           [INFRA/Nivel 1] schema + migraciones
├── tests/            [QA]            24 *.test.ts
├── sandbox/          [PARTNER/QA]    3 *.test.ts (49 deterministas)
├── tools/aek/        [GOVERNANCE]    enforcement de arquitectura (3 reglas, 0 findings)
├── docs/             [DOCUMENTATION] + docs/governance/ (capa corporativa)
├── .github/          [GOVERNANCE]    ci.yml, aek-governance.yml, sandbox-ci.yml, CODEOWNERS, templates
└── .aek/report.json  [GOVERNANCE]    artefacto AEK
```

## 3. Reglas de aislamiento topológico (verificadas por AEK)

| Regla | Descripción | Estado |
|---|---|---|
| RULE-DI-001 | Módulos externos usan el barrel dental; Composition Root (`server.ts`) puede importar routers | 0 findings |
| RULE-DI-002 | Dental no importa core/longevity | 0 findings |
| RULE-DI-003 | Core/longevity no importan internals dentales | 0 findings |

## 4. Zonas de higiene (debt — NO productivo, NO corregido)

Archivos versionados en la raíz, fuera de cualquier zona de dominio (TD-05):
`debug_db.ts`, `refactor.ts`, `fix-imports.ts`, `dashboard.page.tsx`, `payload.json`, `diff.txt`, `diff_utf8.txt`, `New_files_claude`, `demo-integration.sh`.

Artefactos locales presentes (ignorados o transitorios): `dist/`, `.next/`, `mnt/`.

> Clasificados como **Repository Hygiene debt**. No pertenecen al baseline productivo. Resolución diferida (ver [TECHNICAL_DEBT_REGISTER.md](./TECHNICAL_DEBT_REGISTER.md)).

## 5. Fronteras autoritativas

- **Production ↔ Experimental/Legacy:** Vertical2 y Legacy no deben ser importados por `server.ts` ni por dominios productivos. AEK refuerza el aislamiento dental; el aislamiento de vertical2/legacy es por convención + exclusión de build (recomendado endurecer en E3, ver roadmap).
- **Partner ↔ Clinical:** `/api/v2/*` (API Key) vs `/v1/*` (JWT). Pseudonimización obligatoria.
- **Sandbox ↔ Production:** sandbox fuera del scope de AEK; sin imports de `src/`.
