# ENGINEERING_GOVERNANCE_ROADMAP.md
> **Vytalix Platform — Engineering Governance Roadmap (E3 · E4 · RC1 · Production)**

| Campo | Valor |
|---|---|
| Estado | ACTIVO — roadmap |
| Rama | `adr/baseline-2026` |
| Sprint de origen | E2 |
| Última revisión | 2026-06 |

> Roadmap de fortalecimiento de la plataforma de ingeniería. No es un roadmap de producto ni de funcionalidad clínica. Cada fase referencia la deuda ([TECHNICAL_DEBT_REGISTER.md](./TECHNICAL_DEBT_REGISTER.md)) y las decisiones diferidas ([BASELINE_CERTIFICATION_REPORT_BC1.md §7](./BASELINE_CERTIFICATION_REPORT_BC1.md)).

---

## Línea base actual (post-E2)

- Gobernanza consolidada (E0) + ejecutable parcial (E1) + certificada (BC-1) + normalizada (E2).
- AEK: 3 reglas, 0 findings. CI: gates bloqueantes = sandbox + prisma + AEK.
- Certificación: **CERTIFIED WITH OBSERVATIONS**.

---

## E3 — Platform Hardening

**Objetivos**
- Resolver deuda **P0/P1** de mayor impacto en la integridad del baseline.
- Convertir aislamiento experimental en invariante ejecutable.
- Promover gates advisory a bloqueantes donde la deuda esté resuelta.

**Alcance**
1. **TD-01 (P0):** decidir destino de `src/vertical2/` (ADR-009/012: cuarentena, `legacy/`, o completar módulos) → habilita Type Check/Build verdes.
2. **AEK v1.1:** regla de *experimental isolation* (prohibir import de `vertical2`/`legacy` desde producción).
3. **AEK v1.2:** analyzer de higiene de repositorio (TD-05).
4. **TD-02:** service containers (Postgres+Redis) + migraciones + seed en CI → full Vitest/Coverage bloqueantes.
5. **TD-03:** ESLint flat config + baseline.

**Dependencias:** decisión de arquitecto sobre TD-01; infraestructura de CI.
**Riesgos:** resolver TD-01 podría tocar `src/` (requiere ADR explícito; fuera de sprints de gobernanza puros).
**Exit criteria:** Type Check/Build/Tests bloqueantes y verdes; `vertical2`/`legacy` aislados por AEK; ESLint con baseline activo.

---

## E4 — Contract & Documentation Governance

**Objetivos**
- Cerrar brechas de contrato y consistencia documental.
- Ampliar enforcement de gobernanza ejecutable.

**Alcance**
1. **TD-04:** adoptar Redocly/Spectral committeado + `oasdiff` (breaking-change) → OpenAPI gate bloqueante.
2. **TD-11 / DAD-8:** reflejar webhook (`X-Disglobal-Signature`, canonical body) en OpenAPI; reconciliar modelo de comisiones.
3. **TD-07/08/09 (ADR-009/010/011):** consolidar duplicados, normalizar nombres de ADR, política de ciclo de vida documental.
4. **AEK v1.3/v1.4:** integridad ADR, link-checker de docs, validador de baseline/topología.

**Dependencias:** E3 completado; decisión comercial sobre comisiones.
**Riesgos:** cambios en OpenAPI/contratos están fuera de sprints de gobernanza (requieren sprint de implementación dedicado).
**Exit criteria:** OpenAPI gate bloqueante; contrato Partner cerrado; cero duplicados documentales; ADR normalizados.

---

## RC1 — Release Candidate

**Objetivos**
- Endurecer para producción multi-partner.
- Cobertura de enforcement avanzada.

**Alcance**
1. **AEK v2.0:** contract-drift detection (Express ↔ OpenAPI), append-only static checks (ADR-006), RLS coverage check.
2. Coverage gate con umbral mínimo (post TD-02).
3. Consolidación de workflows (`ci.yml` único) y unificación de package manager/lockfile (TD-06/DAD-9).
4. Branch protection aplicada en `main`/`adr/**` (required checks + CODEOWNERS).
5. Revisión de sunsetting de `src/legacy/` vía ADR.

**Dependencias:** E3 + E4 completados.
**Riesgos:** estabilidad de la suite completa en CI; performance de analyzers avanzados.
**Exit criteria:** todos los gates clave bloqueantes y verdes; branch protection activa; legacy con plan de retiro; certificación elevable a **CERTIFIED FOR BASELINE**.

---

## Production

**Objetivos**
- Operación productiva multi-partner con gobernanza ejecutable completa.

**Alcance**
1. Go-live con SLA (uptime 99.5%, p99 según `DISGLOBAL_PILOT_READINESS.md`).
2. EventBridge migration (preparado en `event-bus.ts`) — fuera de gobernanza, requiere sprint de implementación.
3. Observabilidad productiva (dashboards Grafana, alertas P0/P1).
4. Auditoría de seguridad externa.

**Dependencias:** RC1 certificado.
**Riesgos:** escalado de tráfico; resiliencia de webhooks; contención DB (read replicas).
**Exit criteria:** certificación productiva; runbooks operativos validados; revenue share configurado.

---

## Resumen de dependencias

```
E2 (done) → E3 (hardening: TD-01,02,03 + AEK iso/hygiene)
          → E4 (contracts/docs: TD-04,07,08,09,11 + AEK integrity)
          → RC1 (AEK v2.0 + coverage gate + branch protection + workflow consolidation)
          → Production (go-live + EventBridge + external audit)
```

> Toda acción que toque `src/`, OpenAPI, Prisma o contratos se ejecuta en **sprints de implementación dedicados**, no en sprints de gobernanza. Este roadmap define el *qué* y el *orden*, no autoriza modificaciones de código.
