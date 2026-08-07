# Architectural-Truth-Matrix.md

---

## Estado del documento

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO — autoridad normativa |
| Ruta canónica | `src/dental/docs/trd/Architectural-Truth-Matrix.md` |
| Mantenido por | Arquitecto Principal |
| Última revisión | 2026-06 |

---

## Propósito

Este documento establece la jerarquía de verdad técnica para el ecosistema Vytalix y su vertical CFE Dental. Define qué fuentes prevalecen cuando existe contradicción entre artefactos. Ningún agente, documento narrativo ni salida de IA puede suplantar esta jerarquía.

---

## Jerarquía de verdad

```
Nivel 1 (MÁXIMA AUTORIDAD)
│
├── Código fuente compilable (TypeScript, SQL)
├── Esquema Prisma (prisma/schema.prisma)
├── Migraciones SQL ejecutadas
│     ├── prisma/migrations/20250902000000_dental_sprints4_5_tables/migration.sql
│     └── prisma/dental_sprint7_hardening.sql
├── Especificación OpenAPI real
│     ├── openapi/dental-api-v2.yaml
│     ├── openapi/dental-api-v2_synced.yaml
│     ├── openapi/openapi.yaml
│     └── openapi/vytalix-platform-v2.yaml
└── Tests que pasan (281/281 en verde al cierre de Sprint 7)

Nivel 2
├── TRD (Technical Reference Documents)
├── Documentos DDD
└── ADR (Architecture Decision Records)

Nivel 3
└── Documentación operativa (runbooks, guías, onboarding)

Nivel 4 (CUARENTENA)
└── Narrativas generadas por agentes IA — subordinadas siempre
    a Nivel 1 antes de ser incorporadas a la línea base
```

---

## Fuentes oficiales por categoría de artefacto

| Categoría | Fuente de verdad | Ubicación |
|---|---|---|
| Modelos de dominio clínico | `prisma/schema.prisma` | Modelos Prisma compilables |
| Modelos de dominio dental | `schema_hardened.prisma` | `src/dental/schemas/` |
| Contratos HTTP | OpenAPI YAML | `openapi/` |
| RLS y seguridad multitenant | Migraciones SQL ejecutadas | `prisma/migrations/` + `prisma/migration_rls.sql` |
| Tipos TypeScript | `src/dental/types.ts` | Barrel de dominio dental |
| Lógica de negocio dental | Motores puros | `src/dental/*.engine.ts` |
| Repositorios de datos | Implementaciones pg-direct | `src/dental/repositories/` |
| Routers HTTP | Adaptadores sin lógica | `src/dental/routers/` |
| Configuración de infraestructura | `package.json`, `tsconfig.json` | Raíz del repositorio |
| Tests | Suite Vitest | `*.test.ts` |

---

## Regla de resolución de conflictos

Cuando dos artefactos contradicen:

1. Identificar el nivel de cada artefacto según la jerarquía.
2. El artefacto de nivel superior prevalece sin negociación.
3. Si ambos son Nivel 1, prevalece el código compilable sobre el OpenAPI; el código sobre el esquema Prisma si el esquema no refleja una migración ejecutada.
4. Cualquier narrativa de Nivel 4 que contradiga Nivel 1 va a cuarentena; nunca al contrario.
5. La verificación humana siempre se apoya en Nivel 1.

---

## Decisión de gobernanza activa

**DG-001** — *Primacía del contrato backend sobre el frontend*

El contrato de la API (OpenAPI + implementación Express) define los tipos, rutas y comportamientos. El frontend (`frontend-dental/`) adapta su cliente (`src/lib/api/client.ts`) a esos contratos. El frontend no define contratos; los consume.

**DG-002** — *Ningún agente IA es autoridad técnica*

Las salidas de agentes IA anteriores que operaron sobre este repositorio tienen categoría Nivel 4. Su contenido requiere verificación contra Nivel 1 antes de ser promovido a la línea base. Los errores arquitectónicos de sesiones anteriores (race conditions de inicialización criptográfica, valores clínicos hardcodeados, bypass de validación de JWT, colisión de unix/ms en HMAC) fueron detectados precisamente porque se auditó el código compilable, no la narrativa.

**DG-003** — *RLS como invariante no negociable*

`migration_rls.sql` y los bloques `DO $$ ... $$` de las migraciones dentales son la única fuente de verdad sobre qué tablas están protegidas por RLS. Toda afirmación de aislamiento multitenant debe poder rastrearse hasta una política `CREATE POLICY` ejecutada en base de datos.

---

## Implicaciones para agentes IA y revisión humana

**Para agentes IA:**
- Toda propuesta de cambio debe referenciar el artefacto de Nivel 1 que la justifica.
- No proponer código que contradiga un contrato OpenAPI existente sin señalarlo explícitamente.
- No inventar tablas, columnas, endpoints o tipos que no existan en los artefactos de Nivel 1.
- Las salidas propias de la sesión anterior son Nivel 4 hasta verificación humana.

**Para revisores humanos:**
- Todo PR debe ser verificable contra al menos un artefacto de Nivel 1.
- Una discrepancia entre OpenAPI y la implementación Express es un defecto, no una opción de diseño.
- Un test que pasa no es suficiente si el contrato OpenAPI no cubre el caso de borde.
- La cuarentena de narrativas IA no es permanente; se promueven a Nivel 2 tras revisión explícita y documentada.
