# CHANGE_MANAGEMENT.md
> **Vytalix Platform — Change Management (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/CHANGE_MANAGEMENT.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Capa de agregación. Las reglas de contribución, revisión y excepciones son normativas en [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md). Este documento las enlaza y describe el flujo de cambio.

---

## 1. Clasificación de cambios

| Categoría | Ejemplo | Requisito mínimo |
|---|---|---|
| Documentación | Guías, runbooks, esta capa de gobernanza | Revisión de un mantenedor |
| Contrato (OpenAPI/DTO) | Nuevo endpoint, cambio de schema | OpenAPI primero (ADR-001/005) + revisión arquitecto |
| Lógica de dominio | Motor clínico/dental, repositorio | Tests verdes + revisión de segundo ingeniero |
| Nivel 1 crítico | Migraciones SQL, Prisma schema, `src/platform/db.ts`, middlewares, AEK | Revisión obligatoria del arquitecto principal |
| Decisión arquitectónica | Cambio de invariante o frontera | Nuevo ADR con consenso del equipo técnico |

## 2. Orden de cambio inmutable

Para cualquier cambio que toque contratos HTTP:

```
OpenAPI  →  implementación (Express/servicio)  →  consumidores (frontend/SDK)
```

El orden inverso viola ADR-001/ADR-005 y es un defecto, no una opción de diseño.

## 3. Flujo de ADR

- Los ADR existentes (**ADR-001 … ADR-008**) son autoridad aceptada. **No se reescriben.** Solo se corrigen enlaces, formato y referencias cruzadas.
- Un cambio que altere una decisión arquitectónica requiere un **nuevo ADR** (numeración ≥ ADR-009), no la edición de uno existente.
- Un ADR en estado DRAFT no es autoridad. Solo ACCEPTED obliga (Repository-Governance §Revisión).
- Índice de ADR: ver [docs/governance/README.md](./README.md).

## 4. Política de excepciones

Toda excepción a una regla de gobernanza requiere (Repository-Governance §Excepciones):

1. Justificación técnica escrita en un ADR numerado.
2. Aprobación explícita del arquitecto principal.
3. Fecha de revisión (≤ 90 días; se renueva o elimina).
4. Registro del riesgo aceptado y su mitigación.

Una excepción no aprobada es deuda técnica de riesgo alto, no diseño.

## 5. Gestión de material no verificado (IA)

Conforme a ADR-008 y la jerarquía de verdad:

- Toda salida de agente IA es **Nivel 4** hasta verificación humana contra Nivel 1.
- No entra a la línea base desde cuarentena sin revisión humana explícita y registro en el historial.
- Una salida de IA **no es una revisión**.

## 6. Git y trazabilidad

- Rama de trabajo del baseline actual: `adr/baseline-2026`.
- Cada cambio se registra con commit descriptivo; los cambios de Nivel 1 referencian el artefacto que los justifica.
- No se elimina documentación existente: se reutiliza, amplía o reorganiza (regla E0).

## 7. Referencias

- Reglas estructurales: [Repository-Governance.md](../../src/dental/docs/trd/Repository-Governance.md)
- Gates de calidad: [QUALITY_GATES.md](./QUALITY_GATES.md)
- Release: [RELEASE_GOVERNANCE.md](./RELEASE_GOVERNANCE.md)
