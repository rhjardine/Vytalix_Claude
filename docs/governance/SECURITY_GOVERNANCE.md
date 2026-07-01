# SECURITY_GOVERNANCE.md
> **Vytalix Platform — Security Governance (Corporate Governance Layer)**

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO |
| Capa | Gobernanza corporativa (agregación) |
| Ruta canónica | `docs/governance/SECURITY_GOVERNANCE.md` |
| Sprint de origen | E0 — Consolidación de gobernanza |
| Última revisión | 2026-06 |

> Capa de agregación. Las implementaciones verificadas (Nivel 1) son la autoridad. Este documento referencia los reportes y ADR existentes; no los duplica.

---

## 1. Modelo Zero Trust

La integración con socios externos opera bajo Zero Trust: la "caja negra" clínica nunca expone IP ni identidades reales. Capas de defensa:

| Capa | Control | Autoridad |
|---|---|---|
| Gateway externo | API Key (`X-API-Key`) + scopes + rate limiting | [docs/AUTH_FLOW.md](../AUTH_FLOW.md), [docs/DISGLOBAL_PILOT_READINESS.md](../DISGLOBAL_PILOT_READINESS.md) |
| Pseudonimización | HMAC-SHA256 con `tenantSecret` (`subjectRef`) | DISGLOBAL_PILOT_READINESS §2 |
| Multitenancy | PostgreSQL RLS + `withTenant()` | [ADR-003](../../src/dental/docs/trd/adr/ADR-003%20PostgreSQL%20+%20RLS/ADR-003.md), [docs/TENANT_ISOLATION_REPORT.md](../TENANT_ISOLATION_REPORT.md) |
| Back-office clínico | JWT Bearer + `X-Tenant-ID`, sin acceso externo directo | AUTH_FLOW |
| Webhooks | HMAC-SHA256 + `timingSafeEqual` + idempotencia | SECURITY_HARDENING_REPORT |

## 2. Invariantes de seguridad (no negociables)

1. **Pseudonimización obligatoria.** Vytalix nunca almacena el `userId` real del socio; solo el `subjectRef` derivado. Determinista, unidireccional sin el secreto.
2. **Separación de contratos.** `/api/v2/*` (API Key, socios) y `/v1/*` (JWT, back-office) son superficies separadas.
3. **Tenant isolation.** Todo acceso a datos de tenant pasa por `withTenant()` (ADR-003). RLS es la segunda línea de defensa obligatoria.
4. **Secretos.** Nunca en texto claro; nunca como fallback de variable de entorno en producción (Domain-Boundaries §Platform).
5. **Verificación de firma en webhooks.** `crypto.timingSafeEqual` para prevenir timing attacks.
6. **Inmutabilidad.** Registros clínicos/financieros append-only ([ADR-006](../../src/dental/docs/trd/adr/ADR-006%20Clinical%20Immutability/ADR-006.md)).

## 3. Privacidad y cumplimiento

- Datos clínicos almacenados bajo el tenant del socio con RLS estricto.
- Datos de identidad y datos clínicos en tablas separadas (limita el alcance de un breach a datos pseudonimizados).
- Consentimiento antes del primer assessment (modelo de consentimiento a fortalecer — ver gaps en [docs/PHASE1_GOVERNANCE_PACKAGE_v1.md](../PHASE1_GOVERNANCE_PACKAGE_v1.md)).

> **No legal advice.** Las afirmaciones de cumplimiento regulatorio (GDPR/LGPD) requieren validación legal formal. Este documento describe controles técnicos, no asesoría legal.

## 4. Reportes de seguridad de referencia (Nivel 1/3)

| Tema | Documento |
|---|---|
| Hardening de seguridad | [docs/SECURITY_HARDENING_REPORT.md](../SECURITY_HARDENING_REPORT.md) |
| Aislamiento de tenant (RLS) | [docs/TENANT_ISOLATION_REPORT.md](../TENANT_ISOLATION_REPORT.md) |
| Auditoría de hardening dental | [docs/CFE_DENTAL_HARDENING_AUDIT.md](../CFE_DENTAL_HARDENING_AUDIT.md) |
| Readiness de piloto (controles auth) | [docs/DISGLOBAL_PILOT_READINESS.md](../DISGLOBAL_PILOT_READINESS.md) |
| Runbook de fallos | [docs/FAILURE_RUNBOOK.md](../FAILURE_RUNBOOK.md) |

## 5. Gestión de vulnerabilidades

- Ninguna dependencia con vulnerabilidad conocida (alta/crítica) entra a la línea base (Repository-Governance §Dependencias).
- Excepciones de seguridad: documentadas en ADR con fecha de revisión ≤ 90 días (Repository-Governance §Excepciones).
