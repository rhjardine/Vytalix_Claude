# EXECUTIVE_SUMMARY.md
> **Vytalix Platform — Sprint E4-D8 · Phase 6 · Executive Summary (Architecture Consolidation)**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 · Fase 6 |
| Rama | `adr/baseline-2026` |
| Modo | Análisis; conclusiones respaldadas por evidencia |
| Fecha | 2026-06 |

> Documentos de soporte: [ARCHITECTURE_BASELINE_REPORT](./ARCHITECTURE_BASELINE_REPORT.md) · [ARCHITECTURE_DEPENDENCY_GRAPH](./ARCHITECTURE_DEPENDENCY_GRAPH.md) · [ARCHITECTURE_DECISION_CANDIDATES](./ARCHITECTURE_DECISION_CANDIDATES.md) · [ROADMAP_V2](./ROADMAP_V2.md) · [ARCHITECTURAL_RISK_MATRIX](./ARCHITECTURAL_RISK_MATRIX.md).

---

## 1. Madurez arquitectónica actual

**Media-Alta.** Aislamiento de dominio ejecutable (AEK 3 reglas, 0 findings; RULE-ISO-001 = 0), bounded contexts definidos (ADR-002/007), RLS + pseudonimización, gobernanza consolidada (E0–E2) y certificada (BC-1). **Debilidad estructural única y localizada:** el sistema de eventos (dos modelos coexistentes, uno roto — TD-21). El resto de la arquitectura es coherente.

## 2. Madurez de la deuda técnica

**Alta (bien caracterizada).** TD-14 pasó de 117 → 36 errores (−69%). Toda la deuda restante está **inventariada, clasificada por causa raíz, con impacto de runtime/negocio determinado y dependencias mapeadas** (TD-18/19/20/21, RC-5, Logger). Ninguna deuda restante es "type-only runtime-neutral" — todas requieren decisión de arquitectura/política o cambio de runtime autorizado. La deuda ya no es ambigua.

## 3. Production readiness

**Condicional (núcleo listo; eventos y admin con brechas).**
- ✅ **Listo:** núcleo clínico (Core/Longevity), Platform/RLS, Dental, la cadena `PaymentConfirmed` (única cadena de eventos activa), gobernanza y CI (gates bloqueantes: AEK/sandbox/prisma verdes).
- ⚠️ **Brechas:** (a) **eventos** — re-score automático y webhook de referral a Disglobal **inactivos** (TD-21; listeners comentados en `server.ts:172`, emit/on inexistentes); (b) **admin** — `/usage` y health-check de event_bus con imports rotos (TD-20); (c) funnel público **no montado** (comentado).
- **Runtime estable** para lo que está cableado (transpile-only; 49/49 sandbox; app arranca). Los 36 errores de typecheck **no bloquean runtime** pero sí la promoción del gate.

## 4. Esfuerzo de ingeniería restante

| Fase | Sprints | Naturaleza | Riesgo |
|---|---|---|---|
| A (ADRs) | A1, A2 | Documentación/decisión | Bajo |
| B (Functional) | B1 (EventBus), B2 (imports/funnel), B3 (Logger) | Runtime + tests | Alto (B1), Medio (B2) |
| C (Types) | C1 (DTO) | Type-only | Bajo |
| D (Hardening) | D1 (gate/legacy), D2 (full-suite CI) | CI/config | Bajo-Medio |

Estimación relativa: la mayor parte del esfuerzo y riesgo se concentra en **B1 (EventBus)**. El resto es acotado y de bajo-medio riesgo.

## 5. Estrategia de ejecución recomendada

1. **Decidir primero (Fase A):** ADR-EventBus es el cuello de botella y la mayor decisión de negocio (¿se activan las cadenas de eventos del piloto?). Emitir ADR-EventBus antes de tocar código.
2. **Reparar por riesgo (Fase B):** ejecutar B1 (EventBus) según el ADR; en paralelo, B2 billing/funnel y B3 Logger (independientes), **serializando** los archivos compartidos (`funnel.service`, `biological-age.service`).
3. **Completar tipos (Fase C):** aplicar ADR-DTOPolicy (type-only).
4. **Endurecer (Fase D):** excluir legacy del gate y promover Type Check/Build a bloqueante (por-directorio primero) cuando `typecheck = 0`.
5. **Disciplina mantenida:** cada sprix mono-dominio, con gates (typecheck/ci/AEK/ISO) y validación de runtime, como en E4-*.

## 6. Modelo de gobernanza recomendado

- **Un dominio por sprint** + gates obligatorios (probado en E4-*).
- **ADR antes de código** para toda decisión de arquitectura (EventBus, DTO, legacy, gate).
- **Autorización de runtime explícita** para Fase B (los cambios activan/eliminan comportamiento observable).
- **Gate por-directorio** para congelar la calidad de dominios ya limpios (core/longevity/dental) mientras se drena la deuda restante.
- Registrar cada decisión en `TECHNICAL_DEBT_REGISTER.md` y ADRs (`src/dental/docs/trd/adr/` o la ubicación canónica a decidir en ADR-009 pendiente de E2).

## 7. Decisiones arquitectónicas críticas pendientes

| ADR candidato | Decisión clave | Bloquea |
|---|---|---|
| **ADR-EventBus** | ¿Migrar ad-hoc al bus tipado, o eliminarlo? ¿Se activa el webhook Disglobal/re-score? | TD-21, TD-20(health), funcionalidad de piloto |
| **ADR-DTOPolicy** | Narrowing de error-body (vs `ProblemDetailV1`) + mapeo Zod↔dominio | TD-19 |
| **ADR-LegacyBuildScope** | Excluir `src/legacy/` del gate / sunsetting | RC-5, promoción de gate |
| **ADR-TypeCheckGatePromotion** | ¿Gate por-directorio ahora, global tras `typecheck=0`? | Calidad/regresión |
| **ADR-RuntimeImports** | Corregir imports dinámicos rotos (billing/health) | TD-20 |

(Pendientes previos de E0/E2 también abiertos: ADR-009 ubicación de ADRs, ADR-010 Integration Contract, ADR-011 ciclo de vida documental.)

## 8. Próximo sprint recomendado

**Sprint A1 — ADR-EventBus decision** (Fase A, documentación/decisión, riesgo bajo). Es la decisión de mayor palanca: define el modelo de eventos, desbloquea TD-21 y TD-20(health), y determina si la funcionalidad de eventos del piloto Disglobal (webhook de referral, re-score automático) debe activarse. **Requiere input de negocio** sobre el comportamiento esperado del piloto.

---

## Conclusión

La plataforma tiene un **núcleo productivo maduro y certificado** con una **deuda restante acotada, caracterizada y sin ambigüedad**. La fase de remediación type-only se agotó exitosamente (−69% de errores, RC-1/2/4/7 eliminados). El trabajo restante es **arquitectónico y funcional**, dominado por una única decisión estructural (EventBus). Con las ADRs emitidas y la Fase B autorizada (runtime + tests), el camino a `typecheck = 0` y a un gate bloqueante es claro y de riesgo gestionable.

> **STOP.** Todos los candidatos ADR documentados y el roadmap reconstruido. **No iniciar implementación.** Esperar autorización explícita (empezando por ADR-EventBus / Sprint A1).
