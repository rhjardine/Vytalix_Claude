# ARCHITECTURE_REPO_STRUCTURE.md
> **Vytalix Platform — Estructura Física del Repositorio**

```text
Vytalix_Claude/
├── docs/                      # Documentación arquitectónica, guías y playbooks
├── openapi/                   # Contratos de API Swagger/OpenAPI
├── prisma/                    # Esquema de DB, migraciones SQL (TimescaleDB/RLS)
├── tests/                     # Suite de pruebas unitarias y de regresión (Vitest)
└── src/                       # Código fuente principal
    ├── api/                   # Capa de presentación (Transporte HTTP)
    │   ├── handlers/          # Controladores (health, dental, observability, external)
    │   ├── middlewares/       # Rate limiting, Auth, RLS context, Quota
    │   └── pipelines/         # Orquestadores de flujo a nivel de servicio
    │
    ├── core/                  # Motores de decisiones (Funciones Puras)
    │   ├── algorithm-registry.ts
    │   ├── decision.engine.ts
    │   ├── loinc-registry.ts
    │   └── referral.engine.ts
    │
    ├── dental/                # Dominio: Odontología Financiera
    │   ├── dental-cost.engine.ts
    │   └── dental-pricing.service.ts
    │
    ├── legacy/                # Archivos preservados para compatibilidad histórica
    │
    ├── longevity/             # Dominio: Motor Preventivo y Vitalidad
    │   ├── biological-age.service.ts
    │   ├── biophysics-engine.ts
    │   ├── insights.service.ts
    │   └── preventive-score.service.ts
    │
    ├── platform/              # Infraestructura y persistencia
    │   ├── db.ts              # pg Pool y wrapper withTenant (RLS)
    │   ├── redis.ts           # Cliente Redis para caché y rate limiting
    │   ├── logger.ts          # Pino struct-logging
    │   ├── event-bus.ts       # Pub/Sub interno
    │   ├── prisma.ts          # Cliente ORM Prisma
    │   └── disglobal-client.ts# SDK oficial para el cliente comercial
    │
    └── shared/                # Lógica cruzada y compartida
        ├── contracts-v1.ts    # Tipos Zod compartidos
        ├── mappers.ts         # Transformadores de DTO a Dominio
        ├── engagement.service.ts
        ├── funnel.service.ts
        └── ingestion.service.ts

```

## Principios
- **Regla de Dependencia**: `/api` puede importar desde `/longevity` o `/core`. Pero `/core` NUNCA debe importar desde `/api` ni `/platform`.
- **Inyección de Dependencias (Implícita)**: La base de datos y eventos están acoplados en `/platform`, pero las funciones críticas del `/core` son funciones puras sin side-effects.
