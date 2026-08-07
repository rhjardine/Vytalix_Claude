1. DOCUMENTO EJECUTIVO — Insurtech Integration Contract v1.1
(Listo para reunión técnica / stakeholders)
🔷 INSURTECH INTEGRATION CONTRACT v1.1
Vytalix • Disglobal • Doctor Antivejez
Fecha: Junio 2026
Tipo: Contrato de Integración Técnica y Operativa (Pre-OpenAPI)
1. PROPÓSITO DEL SISTEMA

Este contrato define la integración entre:

Disglobal → canal de monetización, pago y distribución
Vytalix → capa de evaluación, scoring y orquestación clínica
Doctor Antivejez / red médica → validación clínica presencial
Principio rector:

Vytalix no diagnostica. Vytalix habilita acceso a evaluación médica estructurada.

2. ARQUITECTURA GENERAL
[ Usuario ]
    ↓
[ Disglobal (Marketplace + Payment) ]
    ↓
[ Vytalix API Surface ]
    ↓
[ Clínica / Doctor Antivejez ]
3. MODELO DE INTERACCIÓN
Flujo estándar del sistema
Usuario inicia compra en Disglobal
Disglobal crea Payment Intent
Vytalix genera Assessment Session
Usuario ejecuta:
Facial Scan (AWS Rekognition)
Questionnaire (45 o 5 preguntas)
Vytalix genera:
Risk Score
Clinical Recommendation
Si aplica:
Appointment (online o presencial)
Disglobal confirma pago
Webhook activa servicio
Clínica recibe caso clínico
4. DOMINIOS FUNCIONALES
Dominio	Sistema	Autoridad
Biometría facial	Vytalix	AI inference
Cuestionario	Vytalix	Behavioral model
Risk scoring	Vytalix	Decision engine
Agenda médica	Clínica	Source of truth
Pagos	Disglobal	Financial truth
Atención médica	Doctor Antivejez	Clinical truth
5. RESTRICCIONES CLÍNICAS (CRÍTICO)
❌ No existe diagnóstico digital
❌ No existe cálculo definitivo de edad biológica online
✔ Solo “pre-evaluación” y “derivación clínica”
✔ Toda validación biológica es PRESENCIAL
6. EVENT MODEL (INTEGRACIÓN DISGLOBAL)
AssessmentCreated
AssessmentCompleted
RiskScoreGenerated
ClinicalReviewRequested
AppointmentReserved
PaymentIntentCreated
PaymentConfirmed
ServiceActivated
ClinicalRecordDelivered
7. ENDPOINTS CANÓNICOS (v1)
Assessment
POST /v1/assessments
POST /v1/assessments/{id}/scan
POST /v1/assessments/{id}/questionnaire
POST /v1/assessments/{id}/evaluate
Clinical Flow
POST /v1/appointments
GET /v1/clinical-records/{id}
Payments (Disglobal)
POST /v1/payments/intent
POST /v1/webhooks/disglobal/payment-confirmed
Activation
POST /v1/services/activate
8. PAYMENT & SETTLEMENT MODEL
Split rule (ejemplo estándar)
{
  "clinic": 70,
  "disglobal": 20,
  "vytalix": 10
}
9. WEBHOOK CONTRACT
Seguridad obligatoria:
HMAC signature
Idempotency key
Retry-safe delivery
Event versioning
10. SLA FUNCIONAL
Assessment latency: < 3s
Webhook delivery: < 10s
Appointment booking: real-time lock
Payment confirmation: synchronous event trigger
11. INTEGRATION GUARANTEES
Idempotencia en todos los POST críticos
Event ordering no garantizado → compensación requerida
No dependencia de estado interno de Disglobal
Vytalix es stateless para evaluación
12. FUERA DE ALCANCE (FASE 2)
Diagnóstico automatizado
Prescripción digital automatizada
Seguimiento longitudinal automático
Programas corporativos avanzados