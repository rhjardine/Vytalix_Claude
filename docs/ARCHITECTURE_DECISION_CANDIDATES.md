# ARCHITECTURE_DECISION_CANDIDATES.md
> **Vytalix Platform — Sprint E4-D8 · Phase 3 · ADR Candidates (NOT final ADRs)**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 · Fase 3 |
| Modo | Candidatos de decisión — **NO son ADRs finales, NO implementar** |
| Fecha | 2026-06 |

> Estos candidatos alimentan la emisión formal de ADRs (≥ ADR-009) tras autorización. Ninguna decisión está tomada ni implementada aquí.

---

## ADR-EventBus (candidato) — Consolidación del sistema de eventos

- **Problema:** dos sistemas de eventos coexisten; el ad-hoc (`emit`/`on`, nombres string) está roto (compile+runtime) y sus listeners comentados. El tipado (`publish`/`subscribe`) solo tiene 1 cadena activa (PaymentConfirmed). (Evidencia: ARCHITECTURE_DEPENDENCY_GRAPH §2.)
- **Contexto:** `eventBus` = `LocalEventBus implements IEventBus` (publish/subscribe; `emitter` privado). `registerCoreSubscriptions` y `registerPlatformEventListeners` sin registrar. 9 errores TS2339 (TD-21).
- **Alternativas:**
  1. **Migrar el ad-hoc al bus tipado:** promover `vitality.assessed`/`referral.triggered`/`referral.converted`/`funnel.*` a `VytalixEvent` tipados + helpers `publish.*`; migrar emisores a `publish.*` y listeners a `subscribe`; cablear `registerCoreSubscriptions`/listeners en `server.ts`.
  2. **Exponer API EventEmitter:** añadir `emit`/`on` a `IEventBus`/`LocalEventBus` (delegando al `emitter` privado). Mantiene los call-sites ad-hoc.
  3. **Eliminar el sistema ad-hoc:** borrar los emit/on y sus listeners (aceptar que esas cadenas nunca se implementaron).
- **Beneficios:** (1) un solo modelo tipado, coherente con ADR-007; (2) mínimo cambio de call-sites; (3) elimina deuda muerta.
- **Riesgos:** (1) mayor esfuerzo + cambio de runtime (activa cadenas hoy inertes); (2) reintroduce EventEmitter no tipado (contra el espíritu del bus tipado); (3) elimina funcionalidad prevista (referral webhook/re-score).
- **Runtime impact:** ALTO en (1)/(3) — activa o elimina cadenas de eventos observables.
- **Migration complexity:** (1) Alta · (2) Media · (3) Baja.
- **Business impact:** define si el re-score automático y el webhook de referral a Disglobal se activan. **Requiere confirmar el comportamiento esperado del piloto.**
- **Recommendation:** **Alternativa 1** (migrar al bus tipado) *si* el negocio requiere esas cadenas; **Alternativa 3** *si* se confirman fuera de alcance del MVP. NO Alternativa 2 (contradice ADR-002/007). Decisión de negocio requerida.
- **Sprint de implementación:** Fase B (Functional Repairs) — sprint dedicado con autorización de runtime.
- **Testing:** tests de integración de cada cadena (emit→listener→efecto); verificar `PaymentConfirmed` sin regresión.
- **Aceptación mínima:** cadenas definidas funcionan end-to-end o se eliminan; `registerCoreSubscriptions`/listeners cableados en `server.ts`; 0 nuevos errores.
- **Rollback:** revert del commit; `server.ts` vuelve a no registrar listeners (estado actual).

---

## ADR-RuntimeImports (candidato) — TD-20 imports dinámicos rotos

- **Problema:** 3 `await import(pathObsoleto)` fallan en runtime; corregir cambia comportamiento (logs, health-check, 500→200). (Evidencia: E4-D6 / TD-20.)
- **Contexto:** billing(99 redis), billing(118 metering — `DEFAULT_UNIT_PRICES_CENTS` no exportado), health(71 event-bus). Destinos canónicos existen en `platform/`.
- **Alternativas:** (1) corregir paths a `platform/*` + exportar `DEFAULT_UNIT_PRICES_CENTS`; (2) eliminar el código muerto (p. ej. el bloque redis no usa el cliente); (3) dejar como está.
- **Beneficios:** (1) restaura funcionalidad (invalidación de cache, health-check event_bus, invoice); (2) elimina intención rota.
- **Riesgos:** (1) cambia runtime (health-check event_bus depende de ADR-EventBus); (2) puede ocultar intención.
- **Runtime impact:** Medio.
- **Migration complexity:** Baja.
- **Business impact:** health-check reporta event_bus real; `/usage` calcula invoice; revocación de key registra log.
- **Recommendation:** **Alternativa 1**, pero health(71) **depende de ADR-EventBus** (no corregir el import event-bus hasta decidir el modelo de eventos). billing(99/118) puede hacerse antes.
- **Sprint:** Fase B, tras/junto a ADR-EventBus para health(71).
- **Testing:** tests de runtime de `/usage` (invoice), revocación de key, health-check.
- **Aceptación mínima:** imports resuelven; comportamiento validado por tests; 0 nuevos errores.
- **Rollback:** revert; imports vuelven a fallar (estado actual, capturado por try/catch donde aplica).

---

## ADR-DTOPolicy (candidato) — TD-19 (unknown narrowing + Zod↔dominio)

- **Problema:** `.detail`/`.type` sobre `unknown` (`res.json()`) y DTO Zod-opcional→dominio-requerido no se pueden corregir type-only sin política. (Evidencia: E4-D3 / TD-19.)
- **Contexto:** index.ts/disglobal-client parsean error-body `unknown`; external-v2/funnel.service pasan tipos Zod (opcionales) a consumidores (requeridos).
- **Alternativas:**
  - Error-body: (a) narrowing tipado contra el contrato canónico `ProblemDetailV1` (tipar el resultado de `res.json()`); (b) type guard `in`/typeof.
  - Zod↔dominio: (a) alinear el schema Zod para producir campos requeridos; (b) validación/mapeo explícito en el borde.
- **Beneficios:** type-safety en parseo de errores y en bordes DTO.
- **Riesgos:** un cast/guard mal hecho cambia comportamiento (E4-D3 mostró que `?? fallback` byte-idéntico es sensible).
- **Runtime impact:** Ninguno si se hace con narrowing/mapeo puro; potencialmente bajo si se ajusta el schema.
- **Migration complexity:** Baja-media.
- **Business impact:** Ninguno directo; mejora robustez.
- **Recommendation:** definir una **política de tipado de error-body** (tipar `res.json()` contra `ProblemDetailV1` en los wrappers SDK) y una **política Zod↔dominio** (mapeo explícito en el borde, sin cambiar contratos). Ambas sin cambio de runtime.
- **Sprint:** Fase C (Type Completion).
- **Testing:** typecheck + tests de los wrappers de error.
- **Aceptación mínima:** 0 errores TD-19; runtime byte-idéntico; sin `any`/unknown-casts.
- **Rollback:** revert (type-only).

---

## ADR-LegacyBuildScope (candidato) — RC-5 + demo + residual

- **Problema:** `src/legacy/` (9 errores) y `src/demo/` (excluido en E4-B) generan ruido en el gate; no se ejecutan en producción. (Evidencia: RC-5; E4-B excluyó demo; Repository-Governance define Legacy como no-productivo.)
- **Contexto:** typecheck usa `tsconfig.server.json` (incluye `src/**`). `src/demo/**` ya excluido (E4-B). `src/legacy/` aún incluido.
- **Alternativas:** (1) excluir `src/legacy/**` de `tsconfig.server.json`; (2) sunsetting formal (mover a `quarantine/` o eliminar vía ADR); (3) corregir los errores legacy.
- **Beneficios:** (1)/(2) sacan 9 errores off-runtime del gate, habilitando la promoción del gate (ADR-TypeCheckGatePromotion).
- **Riesgos:** excluir "oculta" errores; sunsetting elimina historial (mitigado por git).
- **Runtime impact:** Nulo (código no ejecutado).
- **Migration complexity:** Baja (build-config).
- **Business impact:** Ninguno.
- **Recommendation:** **Alternativa 1** (excluir `src/legacy/**` del proyecto de servidor) como decisión de gobernanza documentada, coherente con la exclusión de `src/demo/**` de E4-B; evaluar sunsetting (2) por separado.
- **Sprint:** Fase A/D (build-scope).
- **Testing:** verificar que ningún archivo de runtime importa `src/legacy/` (evidencia E4-B: legacy no importado por producción).
- **Aceptación mínima:** legacy fuera del gate; runtime intacto; AEK/ISO verdes.
- **Rollback:** revert del `tsconfig`.

---

## ADR-TypeCheckGatePromotion (candidato) — promover Type Check/Build a bloqueante

- **Problema:** Type Check/Build son **advisory** (ci.yml) porque el árbol completo no compila (36 errores). (Evidencia: SPRINT_E1_REPORT; ci.yml stages 2/3 advisory.)
- **Contexto:** meta del programa: `typecheck = 0` → promover a gate bloqueante. Bloqueado por TD-18/19/20/21 + RC-5 + Logger.
- **Alternativas:** (1) promover solo tras `typecheck = 0`; (2) promover con un baseline de errores permitidos (allowlist) para congelar la deuda restante; (3) gate por-directorio (bloquear dominios ya limpios: core/longevity/dental/platform).
- **Beneficios:** (1) gate fuerte; (2) previene NUEVA deuda mientras se drena la existente; (3) protege dominios ya limpios de inmediato.
- **Riesgos:** (1) espera a cerrar toda la deuda; (2) allowlist puede volverse permanente; (3) complejidad de config.
- **Runtime impact:** Ninguno (config CI).
- **Migration complexity:** Baja-media.
- **Business impact:** Calidad/regresión.
- **Recommendation:** **Alternativa 3 ahora** (gate por-directorio para dominios limpios: `src/core`, `src/longevity`, `src/dental` — RC-2/RC-7 ya eliminados allí), luego **Alternativa 1** cuando `typecheck = 0` global. Considerar (2) como transición.
- **Sprint:** Fase D (Production Hardening).
- **Testing:** CI dry-run del gate por-directorio.
- **Aceptación mínima:** gate bloqueante sobre dominios limpios sin falsos positivos; documentado en QUALITY_GATES.
- **Rollback:** revert de `.github/workflows/ci.yml`.

---

## ADR-Logger (candidato, menor) — `clinicalLog` métodos faltantes

- **Problema:** `clinicalLog.funnelLead`/`assessmentCompleted` no existen (2 errores). (Evidencia: E4-D7.)
- **Alternativas:** (1) añadir los 2 métodos a `clinicalLog`; (2) eliminar las 2 llamadas.
- **Runtime impact:** Bajo — (1) emite logs antes ausentes; `assessmentCompleted?.` es no-op hoy.
- **Recommendation:** decisión menor de logging; (1) si se desea la traza de auditoría, (2) si no. Sprint Logger dedicado.
- **Aceptación mínima:** 2 errores resueltos; runtime intacto o log añadido intencionalmente.

---

> **STOP:** candidatos documentados. No emitir ni implementar ADRs sin autorización explícita.
