# AWS Staging Governance Baseline v1.1 — READY FOR APPROVAL
### Pre-Provisioning Approval Package · Vytalix Platform — Baseline 2026

| Campo | Valor |
|---|---|
| Estado | ✅ **READY FOR APPROVAL** — pendiente solo de firma (§10) |
| Ejecución | Operador (Opción A) · ningún recurso AWS creado en esta sesión |
| Decisiones ratificadas | D1 SSO+STS · D2 `us-east-1` · D3 GuardDuty diferido · D4 Budget $10 · **Policy B extendida + renombrada** |
| Principio | Mínima complejidad necesaria · HealthTech con compliance futuro |

---

## 1. AWS Account Ownership Charter v1.0 (modelo flexible startup)

| Owner | Responsable de | Titular |
|---|---|---|
| **Account Owner** | Facturación, términos AWS, recuperación de cuenta, decisiones financieras | `Pending Operator Action` |
| **Technical Owner** | Arquitectura cloud, IAM, integración, estándares DevSecOps | `Pending Operator Action` |
| **Security Owner** | Accesos, MFA, secretos, auditoría | `Pending Operator Action` |
| **Operational Owner** | Ejecución de runbooks, evidencias, pruebas | `Pending Operator Action` |

**Modelo flexible:** en fase startup **una persona puede acumular varios roles** (p. ej. Technical = Security = Operational), documentando la acumulación al firmar. **Invariante que nunca se relaja:** *"Root account ownership never delegates operational usage"* — root con MFA, jamás operacional.

**RACI:** Facturación → **Account R/A**; Arquitectura/IAM/DevSecOps → **Technical R/A**, Security C; Accesos/MFA/secretos/auditoría → **Security R/A**, Technical C; Runbook/evidencia/pruebas → **Operational R**, Technical A, Security C.

## 2. Root Account Security Checklist *(gate bloqueante — nada marcado como hecho)*

| Check | Status | Evidence | Owner | Date |
|---|---|---|---|---|
| MFA root habilitado | `Pending Operator Action` | — | Account | — |
| Email propietario verificado (buzón dedicado + MFA) | `Pending Operator Action` | — | Account | — |
| Contactos alternativos (security/billing) | `Pending Operator Action` | — | Account | — |
| Root access keys = 0 | `Pending Operator Action` | — | Security | — |
| Uso root operacional prohibido | `Pending Operator Action` | — | Security | — |
| IAM Identity Center habilitado | `Pending Operator Action` | — | Technical | — |
| Permission Sets definidos | `Pending Operator Action` | — | Technical | — |
| MFA obligatorio para humanos | `Pending Operator Action` | — | Security | — |

## 3. IAM Security Baseline v1.1 — Modelo de identidad
```
Humano:      Identity Center → Permission Set → STS (temporal, MFA) → AWS API
Aplicación:  Service → IAM Role (vytalix-staging-rekognition-validator) → AWS API
```
Cero credenciales de larga vida; cero IAM users permanentes (excepción documentada por Security Owner). App nunca usa credenciales humanas.

## 4. IAM Policies finales (3 políticas separadas)

**Policy A — `vytalix-staging-rekognition-detectfaces-allow`**
```json
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "AllowDetectFacesOnly", "Effect": "Allow",
    "Action": "rekognition:DetectFaces", "Resource": "*" } ] }
```

**Policy B — `vytalix-staging-biometric-identity-deny`** *(renombrada + extendida · invariante "No persistent biometric identity storage")*
```json
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "DenyBiometricIdentityManagement", "Effect": "Deny", "Action": [
    "rekognition:CreateCollection", "rekognition:DeleteCollection",
    "rekognition:DescribeCollection", "rekognition:ListCollections",
    "rekognition:IndexFaces", "rekognition:DeleteFaces", "rekognition:ListFaces",
    "rekognition:AssociateFaces", "rekognition:DisassociateFaces",
    "rekognition:SearchFaces", "rekognition:SearchFacesByImage",
    "rekognition:CreateUser", "rekognition:DeleteUser", "rekognition:ListUsers",
    "rekognition:SearchUsers", "rekognition:SearchUsersByImage"
  ], "Resource": "*" } ] }
```
Cubre **toda** la superficie de identidad facial persistente: Collections, Faces (embeddings), y la API de Users. Cierra las vías clásicas y modernas de re-identificación.

**Policy C — `vytalix-staging-video-processing-deny`** *(control financiero + reducción de superficie)*
```json
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "DenyVideoProcessing", "Effect": "Deny", "Action": [
    "rekognition:StartFaceDetection", "rekognition:StartFaceSearch" ], "Resource": "*" } ] }
```
> Los `Deny` prevalecen sobre cualquier `Allow` presente/futuro → garantía por infraestructura. Trust policy vía Identity Center permission-set (`Pending Operator Action`: ARN).

## 5. Cost Governance Baseline
- **Budget** `vytalix-staging-monthly-budget` · **$10/mes** · alertas **50/80/100%**.
- **Cost ownership:** alertas → Account Owner (Operational en copia); revisión de desviaciones → Account Owner; 80% → Operational investiga; 100% → Account Owner puede suspender el rol validador. Gasto esperado ≈ **$0** (Free Tier: 5.000 img/mes).

## 6. Security Guardrails Matrix

| Control | Estado | Responsable | Evidencia |
|---|---|---|---|
| MFA root | `Pending Operator Action` | Account/Security | §2 |
| Identity Center | `Pending Operator Action` | Technical | Permission sets |
| CloudTrail (multi-región, mgmt events, log-file validation) | `Pending Operator Action` | Security | Trail status |
| **CloudTrail retención + KMS (cifrado)** | 🟡 **Recomendación NO bloqueante** | Security | *(diferible; adoptar antes de prod/PHI)* |
| Budget $10 + alertas | `Pending Operator Action` | Account | Budget ID |
| IAM Least Privilege (Policies A/B/C) | `Pending Operator Action` | Technical/Security | Role ARN + policies |
| Secrets management (solo env/STS; nada en repo) | ✅ **Cumplido (sesión)** | Security | Sin secretos en Git |
| Región única (`us-east-1`) | `Pending Operator Action` | Technical | Deny otras regiones |
| Tagging (`vytalix-staging` + 5 tags) | `Pending Operator Action` | Operational | Tags aplicados |

## 7. Operational Acceptance Criteria (objetivos)
- **Seguridad:** ningún IAM principal excede el mínimo aprobado (`aws iam simulate-principal-policy`).
- **Privacidad:** sin capacidad IAM para almacenar embeddings/identidad facial (Policy B → explicitDeny en `IndexFaces`/`SearchFaces`/`SearchUsersByImage`).
- **Costos:** Budget + alertas 50/80/100 verificables.
- **Auditoría:** toda acción admin trazable en CloudTrail.
- **Root:** MFA + 0 access keys + sin uso operacional.

## 8. Evidence Package Template *(a completar tras provisioning — sin valores)*
```
AWS Account ID: ____   Region: us-east-1   Date: ____   Operator: ____
[ ] CloudTrail activo (name/status)      [ ] Budget activo (ID/thresholds)
[ ] IAM Role creado (ARN)                [ ] Policies A/B/C asociadas
[ ] Tags verificados                     [ ] MFA root confirmado
Negative-test IAM: DetectFaces=Allow OK  IndexFaces=Deny OK  SearchUsersByImage=Deny OK  StartFaceDetection=Deny OK
```

## 9. ADR-AWS-001 — AWS Staging Governance Model
- **Contexto:** validar `DetectFaces` en cuenta staging nueva, sin PHI, con privacidad biométrica estricta, presupuesto mínimo y madurez demostrable ante aliados (Disglobal).
- **Decisión:** cuenta aislada; humanos vía Identity Center+STS; rol de app con **1 Allow** + **Deny** biométrico (16 acciones) y de video; guardrails mínimos (root, CloudTrail, Budget $10, región única, tagging); **sin** GuardDuty/Config/Organizations ahora.
- **Alternativas rechazadas:** IAM user con keys (fuga/rotación); `rekognition:*` (viola least-privilege/privacidad); Organizations/Control Tower ahora (sobre-ingeniería); multi-región (superficie/costo).
- **Consecuencias:** least-privilege + privacidad por IAM; costo ~$0; base auditable escalable a prod (elevar Deny a SCP; adoptar KMS/retención CloudTrail). Requiere disciplina STS; replicar Deny como SCP al añadir prod.

## 10. Approval / Sign-off
| Aprobador | Rol | Decisión | Fecha |
|---|---|---|---|
| ____________ | Account Owner | ☐ Aprobado / ☐ Cambios | ______ |
| ____________ | Security Owner | ☐ Aprobado / ☐ Cambios | ______ |

---

## Decisiones pendientes (no bloquean la aprobación del baseline; sí el provisioning)
1. Nombrar owners (§1) — modelo flexible permitido.
2. Confirmar permission-set ARN para la trust policy.
3. (No bloqueante) Adoptar retención + KMS de CloudTrail antes de prod/PHI.

## Próximos pasos (por prioridad)
1. Firmar v1.1 (§10) + nombrar owners.
2. Operador ejecuta Root Checklist (§2) → gate.
3. Provisionar CloudTrail + Budget + Rol con Policies A/B/C + tags.
4. Llenar Evidence Package (§8) + negative-test IAM.
5. Sprint *"AWS Rekognition Functional Validation Closure"*.
