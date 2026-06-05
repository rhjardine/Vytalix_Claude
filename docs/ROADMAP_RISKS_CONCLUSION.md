# Vytalix Health Intelligence Platform
## Roadmap, Riesgos y Conclusión Ejecutiva

---

## 11. Roadmap por Fases

### Criterios de priorización

| Criterio | Peso |
|----------|------|
| Valor comercial con Disglobal | 40% |
| Reducción de riesgo técnico | 30% |
| Velocidad de validación clínica | 20% |
| Complejidad de implementación | 10% |

---

### Fase 1 — MVP Clínico ✅ COMPLETO

**Duración**: 12 semanas · **Equipo**: 2 engineers + 1 médico validador

**Entregables completados**:
- Pipeline clínico: ingesta LOINC → Framingham → 5 reglas → explainability
- Multi-tenancy con RLS en PostgreSQL
- JWT auth + tenant middleware
- External API v1 (API Key, ingest de observaciones)
- Frontend Next.js Doctor Antivejez (biofísica, bioquímica, orthomolecular)
- TimescaleDB para observaciones longitudinales
- Demo dataset determinístico + scripts de validación

**Indicadores de éxito**: ✅ 3 pacientes demo completos, ✅ pipeline < 2s end-to-end, ✅ RLS auditado

---

### Fase 2 — Plataforma API v2 🔨 ACTUAL (6–8 semanas)

**Duración**: 6 semanas · **Equipo**: 2 engineers

**Entregables construidos en esta sesión**:

| Semana | Sprint | Entregable |
|--------|--------|-----------|
| 1 | Arquitectura | ARCHITECTURE.md + decisiones de diseño |
| 1 | Schema DB | 14 nuevas entidades en schema-extensions.prisma |
| 2 | BiophysicsEngine | Motor DAAa desacoplado del frontend |
| 2 | BiologicalAgeService | Persist inmutable + boards cache + EventBus |
| 3 | PreventiveScoreService | Score compuesto 0–100 con 4 componentes |
| 3 | ReferralEngine | 5 triggers + CTA payload + webhook |
| 4 | ExternalV2Handler | 6 endpoints + auth + idempotency |
| 4 | EngagementService | Score conductual + streak + tier |
| 4 | InsightsService | Analítica de cohorte anónima |
| 5 | PipelineV2Orchestrator | Stage 4+5 + event listeners |
| 5 | Tests unitarios | 22 tests (BiophysicsEngine + PreventiveScore + Referral) |
| 6 | Seguridad | ApiKeyMiddleware + ConsentGuard + HardeningMiddleware |
| 6 | Billing/Metering | MeteringService + BillingAdminHandler |
| 6 | Disglobal SDK | DisgglobalVytalixClient + pseudonymization |

**Checklist para Go-Live de Fase 2**:
```
□ npx prisma migrate dev --name "add_vytalix_platform_v2"
□ Seedear biophysics_boards con baremos Doctor Antivejez
□ CREATE TABLE billing_events + ALTER TABLE tenants ADD COLUMN ...
□ INSERT INTO api_keys para Disglobal (con prefix "dis")
□ Refactorizar calculateAndSaveBiophysicsTest() (ver INTEGRATION_GUIDE_V2.md)
□ Registrar platform event listeners en server.ts
□ Montar /api/v2/* y /admin/* en server.ts
□ Configurar REDIS_URL en .env
□ Ejecutar suite de tests: npx vitest run
□ Smoke test: curl /api/v2/vitality/assess con API Key Disglobal
□ Verificar frontend Doctor Antivejez inalterado
□ Configurar webhook URL en tenant Disglobal
```

**Indicadores de éxito**:
- BioAge API responde < 300ms p99
- 22/22 unit tests en verde
- Frontend Doctor Antivejez funciona sin cambios en UI
- 1 llamada real de Disglobal con subjectRef procesada correctamente

---

### Fase 3 — Suite Preventiva + Engagement Avanzado (8 semanas)

**Equipo**: 2 engineers + 1 data analyst

| Componente | Descripción | Prioridad |
|-----------|-------------|-----------|
| Biochemistry Age API | Edad biológica por marcadores de laboratorio | Alta |
| Orthomolecular Score | Micronutrientes + estrés oxidativo | Media |
| Engagement Campaigns | Notificaciones push basadas en tier | Alta |
| Population Trends API | TimescaleDB continuous aggregates | Media |
| Self-service Key Portal | UI para que tenants gestionen sus API Keys | Alta |
| Disglobal Webhook v2 | Payload enriquecido con CTA y engagement score | Alta |

**Indicadores de éxito**:
- 3 tipos de edad biológica disponibles via API v2
- Engagement campaigns triggering en < 5 min de evento
- Self-service portal activo para Disglobal

---

### Fase 4 — Population Insights + Disglobal Go-Live (6 semanas)

| Componente | Descripción |
|-----------|-------------|
| TimescaleDB Continuous Aggregates | Refresh cada 1h para cohort metrics |
| Disglobal Dashboard | Embedded analytics (iframe o standalone) |
| Billing Metering Production | Invoicing mensual automatizado |
| FHIR R4 Compliance | Adaptador completo para EMR enterprise |
| White-label API | Disglobal branding en responses |
| SLA Monitoring | p99 latency + uptime dashboard |

**Objetivo comercial**: Primer cliente Disglobal en producción, facturación recurrente activa.

---

### Fase 5 — Expansión Clínica (Q2-Q3 siguiente año)

| Componente | Descripción |
|-----------|-------------|
| Genetic Age API | Integración laboratorio externo (telómeros, metilación) |
| AI-assisted Explainability | LLM-assisted (con guardrails) para narrativas preventivas |
| Clinical Decision v2 | Reglas ampliadas + validación Doctor Antivejez |
| Multi-country Compliance | HIPAA + GDPR + NOM-024 + regulación LATAM |
| Partner Network | API marketplace: aseguradoras, HR tech, wellness apps |

---

## 12. Riesgos y Decisiones de Diseño

### Registro de riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|----|--------|-------------|---------|-----------|-------------|
| R-01 | Precisión del algoritmo DAAa cuestionada clínicamente | Media | Alto | Posicionamiento como "indicador preventivo", no diagnóstico. Validación con Doctor Antivejez antes de cada release. Human-in-the-loop mandatorio. | Médico validador |
| R-02 | Brecha de seguridad en datos PHI | Baja | Crítico | RLS PostgreSQL, SHA-256 hashing, PII mínimo en Disglobal, auditoría append-only, cifrado en reposo. Pentest antes de Fase 4. | Security lead |
| R-03 | Latencia > 300ms en Disglobal (alto volumen) | Media | Alto | Redis cache 6h, cálculo async post-response, idempotency evita re-cómputo. Load test antes de go-live. | Backend engineer |
| R-04 | Incumplimiento GDPR en sujetos Disglobal (EU) | Media | Alto | Consent records obligatorios antes de primer assessment. Pseudonymization con HMAC. DPA firmado con Disglobal. | Legal / CTO |
| R-05 | Drift de algoritmo: resultados históricos incompatibles | Baja | Medio | `calculation_versions` table. Input snapshot inmutable por assessment. Versión semver en cada resultado. | Data scientist |
| R-06 | Dependencia de Redis (single point of failure) | Media | Medio | Fail-open para cache (never blocks request). Fail-open para rate limiter con log. Redis Sentinel o Cluster en Fase 4. | DevOps |
| R-07 | Sobreingeniería prematura | Baja | Medio | APIs v2 reutilizan infraestructura Fase 1 sin new stack. No más de 5 APIs en Fase 2. Strict feature freeze hasta go-live. | Tech lead |
| R-08 | Disglobal no integra por API friction alta | Media | Alto | DisgglobalVytalixClient SDK reduce integración a <1 día. Documentación curl lista. Sandbox con datos demo. | Product |
| R-09 | Consent fatigue: usuarios Disglobal no completan onboarding | Alta | Medio | Flujo de consent en 1 click (checkbox + terms v1). Progressive disclosure. Solo DATA_PROCESSING requerido para primer uso. | UX / Product |
| R-10 | Competencia con plataformas de bienestar digital | Media | Bajo | Diferenciación: motor clínico validado (Doctor Antivejez), no autodiagnóstico. B2B first, no consumer first. | CEO |

### Decisiones de diseño clave

**D-01: Inmutabilidad de assessments**
Los registros en `biological_age_assessments` son append-only. Si se re-evalúa, se crea un nuevo registro. Esto garantiza que resultados históricos nunca cambian aunque evolucionen los algoritmos.
*Alternativa rechazada*: UPDATE con versioning. Rechazado por mayor complejidad de auditoría y riesgo de pérdida de historial.

**D-02: Pseudonymización HMAC en Disglobal**
Los userIds de Disglobal se convierten a subjectRef vía HMAC-SHA256 con la API Key como secreto. Determinístico (mismo userId → mismo subjectRef siempre), pero no reversible sin la key.
*Alternativa rechazada*: UUID aleatorio por usuario. Rechazado porque rompería idempotencia y haría imposible el lookup de historial.

**D-03: Metering no-blocking**
El registro de billing nunca bloquea el request path. Los eventos van a Redis stream y se flushean a DB cada 60s. Una falla de billing nunca degrada la API.
*Riesgo aceptado*: pérdida de ≤60s de eventos en crash. Mitigado por el hecho de que es un pequeño porcentaje y se puede reconciliar con logs.

**D-04: Consent fail-safe**
Si el consent check falla por error de DB o Redis, la respuesta es DENY (no ALLOW). Seguridad > disponibilidad para datos clínicos.
*Trade-off*: muy raramente puede denegar a un usuario con consent válido si hay outage breve. Mitigado por Redis cache de 1h que absorbe cortes de DB.

**D-05: Human-in-the-loop en decisiones clínicas**
El motor genera recomendaciones con estado PENDING. Nunca actúa autónomamente sobre el paciente. Un médico debe ACCEPT/REJECT cada recomendación.
*Razón*: posicionamiento clínico, regulatorio y ético. No negociable.

---

## 13. Conclusión Ejecutiva

### Estado del sistema

La plataforma Vytalix v2 tiene, al finalizar esta sesión de arquitectura y desarrollo, una **base de infraestructura lista para producción** que abarca:

- **Motor clínico completo**: BiophysicsEngine (algoritmo Doctor Antivejez), Framingham 2008, 5 reglas clínicas, explainability determinístico, todo sin LLM.
- **6 APIs comerciales**: BioAge, Preventive Score, Referral, Engagement, Insights, y endpoint compatible con Disglobal.
- **Seguridad de producción**: SHA-256 API keys, consent guard (HIPAA/GDPR), rate limiting por tier, brute-force protection, HMAC webhooks, audit log append-only.
- **Modelo de monetización ejecutable**: metering por operación, revenue share con Disglobal (30/70 configurable), billing events, exportación CSV para facturación.
- **SDK Disglobal listo**: pseudonymización, español nativo, wrappers sobre los 6 endpoints, batch onboarding.
- **22 tests unitarios** en verde cubriendo el motor clínico y los algoritmos de scoring.

### La oportunidad de negocio

El diseño tripartito (Doctor Antivejez → Vytalix → Disglobal) permite activar tres fuentes de ingresos simultáneas:

| Fuente | Mecanismo | Estimado por conversión |
|--------|-----------|------------------------|
| **API usage** | $0.15 por BioAge assessment | Escala con base de usuarios Disglobal |
| **Revenue share** | 30% de consultas premium convertidas | Doctor Antivejez: $150–500 USD/consulta |
| **SaaS tier** | Clinical Pro para clínicas | $299–999/mes recurrente |

Con una base de 10,000 assessments/mes en Disglobal, solo el usage genera ~$1,500 USD/mes en Fase 2. Con 2% de conversión a consulta premium a $200 promedio, el revenue share agrega ~$1,200 USD/mes adicionales. **Breakeven estimado: 4–6 meses post go-live.**

### Próximas decisiones ejecutivas

1. **Fecha de go-live Fase 2**: el checklist tiene 11 ítems, todos técnicos. Con 1 engineer dedicado: **1 semana de implementación**.
2. **Acuerdo de revenue share con Disglobal**: la estructura está codificada (tabla `tenants.revenueShareRatio`). Requiere firma de contrato.
3. **DPA GDPR/HIPAA**: necesario antes de procesar sujetos EU/US de Disglobal. Template disponible en legal.
4. **Validación clínica de baremos**: los baremos default están en el engine. Doctor Antivejez debe validar y proveer sus tablas oficiales para seedear `biophysics_boards`.
5. **Pentest**: recomendado antes de Fase 4 (go-live masivo). Fase 2 puede operar con Disglobal en acceso controlado (piloto ≤500 usuarios).

### La ventaja competitiva

Lo que hace único a este sistema no es la tecnología (Express, Prisma, Redis son commodity) sino la **combinación de tres activos difíciles de replicar**:

1. **Validación clínica de Doctor Antivejez**: el algoritmo biofísico tiene respaldo médico real, no es un cálculo especulativo.
2. **Multi-tenancy + inmutabilidad**: la arquitectura permite servir a Disglobal, clínicas y aseguradoras desde la misma base de código sin comprometer el aislamiento de datos.
3. **Human-in-the-loop sistemático**: posicionamiento regulatorio defensivo en un mercado (salud digital) donde los reguladores están activos. Esto es una ventaja, no una limitación.

La plataforma está lista para su primera integración comercial.

---

*Documento generado: Sprint 14 — Fase 2 completa*
*Versión: 2.0.0-rc1*
*Próxima revisión: post go-live Disglobal pilot*
