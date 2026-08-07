# PROGRAM_CHARTER.md
> **Vytalix Platform — Program Charter (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/PROGRAM_CHARTER.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Este documento es una **capa de agregación**. No redefine ni reemplaza ninguna decisión arquitectónica. Toda autoridad técnica reside en los ADR (`src/dental/docs/trd/adr/`) y en la jerarquía de verdad (`Architectural-Truth-Matrix.md`). Ante cualquier contradicción, prevalece el Nivel 1 definido en ADR-008.

---

## 1. Propósito del programa

Vytalix es una plataforma de inteligencia clínica preventiva *API-first*, multitenant, validada clínicamente por Doctor Antivejez y distribuida comercialmente a través de socios como Disglobal. El programa coordina tres capacidades:

1. **Capa de inteligencia clínica** — motores deterministas de edad biológica, score preventivo y derivación (Core Clinical Domain).
2. **Capa de plataforma** — multitenancy con RLS, seguridad, observabilidad, metering (Platform Domain).
3. **Verticales satélite** — CFE Dental como dominio autónomo (Satellite Domain, ADR-007/008).

## 2. Partes y autoridades

| Parte | Rol | Autoridad |
|---|---|---|
| Vytalix | Plataforma tecnológica y orquestación | Verdad técnica y de contrato |
| Doctor Antivejez | Autoridad clínica | Verdad clínica (diagnóstico, indicaciones) |
| Disglobal | Canal de distribución y pago | Verdad financiera (pagos, settlement) |

## 3. Principios rectores (no negociables)

Estos principios están formalizados como ADR. Este charter los enumera; no los redefine.

| Principio | ADR de autoridad |
|---|---|
| Contract-First / API-First | [ADR-001](../../src/dental/docs/trd/adr/ADR-001%20Arquitectura%20Hexagonal/ADR-001.md) |
| Domain Isolation (DDD / Bounded Contexts) | [ADR-002](../../src/dental/docs/trd/adr/ADR-002%20DDD%20como%20patron%20dominante/ADR-002.md) |
| Tenant Isolation (PostgreSQL RLS) | [ADR-003](../../src/dental/docs/trd/adr/ADR-003%20PostgreSQL%20+%20RLS/ADR-003.md) |
| Motores puros para lógica de negocio | [ADR-004](../../src/dental/docs/trd/adr/ADR-004%20OpenAPI%20First/ADR-004.md) |
| OpenAPI como contrato único | [ADR-005](../../src/dental/docs/trd/adr/ADR-005%20pnpm%20+%20Turborepo/ADR-005.md) |
| Inmutabilidad clínica y financiera (append-only) | [ADR-006](../../src/dental/docs/trd/adr/ADR-006%20Clinical%20Immutability/ADR-006.md) |
| Integración event-driven entre dominios | [ADR-007](../../src/dental/docs/trd/adr/ADR-007%20Event%20Driven%20Integration/ADR-007.md) |
| Jerarquía de verdad y gobernanza de IA | [ADR-008](../../src/dental/docs/trd/adr/ADR-008%20Satellite%20Domains/ADR-008.md) |

## 4. Invariantes clínicos

- La evaluación digital **no es diagnóstico médico**.
- La determinación de edad biológica real **requiere evaluación médica presencial**.
- El médico permanece siempre en el loop; ningún motor produce acciones clínicas autónomas (ver Domain-Boundaries, Core Clinical Domain).

## 5. Alcance de gobernanza

Esta capa corporativa gobierna **proceso** (cómo se decide, revisa, asegura, libera y cambia). La gobernanza **estructural** (qué entra en cada zona, qué puede importar de qué) reside en:

- [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md)
- [Domain-Boundaries.md](../../src/dental/docs/trd/Domain-Boundaries.md)
- [Architectural-Truth-Matrix.md](../../src/dental/docs/trd/Architectural-Truth-Matrix.md)

## 6. Referencias

- Índice maestro: [docs/governance/README.md](./README.md)
- Arquitectura de plataforma: [docs/VYTALIX_PLATFORM_ARCHITECTURE.md](../VYTALIX_PLATFORM_ARCHITECTURE.md)
- Arquitectura clínica: [docs/CLINICAL_ARCHITECTURE.md](../CLINICAL_ARCHITECTURE.md)
