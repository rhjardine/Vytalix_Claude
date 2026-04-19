# Vytalix — Narrativa Técnica Controlada
## 3 capas de discurso. Misma plataforma, audiencia diferente.

---

## Capa 1 — Nivel ejecutivo (Carola u otro C-level)

**Contexto:** 5 minutos. Sin siglas. Sin arquitectura. Solo valor y riesgo.

---

**¿Qué es Vytalix?**

> "Vytalix es una capa de inteligencia que se conecta a los sistemas médicos
> que ya tienen. No reemplaza ni compite con Epic, Meditech, o cualquier EMR.
> Los enriquece con una capacidad que no tienen: análisis longitudinal automatizado
> y soporte a decisiones con trazabilidad completa."

**¿Por qué lo necesitan?**

> "Un médico en consulta ve los datos de hoy. No tiene tiempo de revisar 6 meses
> de laboratorios para detectar una tendencia peligrosa. Vytalix hace eso
> automáticamente — y le dice al médico qué hacer y por qué."

**¿Cómo se integra?**

> "Vía API. Sus sistemas envían datos a Vytalix, y Vytalix devuelve inteligencia
> estructurada. No hay instalación de software en sus servidores. No hay migración
> de datos. El primer piloto puede estar activo en semanas."

**¿Es seguro?**

> "La arquitectura está diseñada bajo principios HIPAA. Los datos de cada
> organización son completamente aislados — es imposible que los datos de un
> cliente sean visibles para otro, incluso dentro de la misma plataforma.
> Cada decisión del sistema queda auditada permanentemente."

**¿Cuál es el riesgo de no adoptarlo?**

> "Los pacientes de alto riesgo que hoy no están siendo detectados a tiempo.
> Eso no es un problema de tecnología — es un problema de información disponible
> en el momento correcto."

---

## Capa 2 — Nivel técnico (arquitecto de sistemas o CTO)

**Contexto:** 15-20 minutos. Pueden hacer preguntas. Quieren ver las decisiones reales.

---

**Stack y por qué**

| Decisión | Elección | Justificación |
|----------|----------|---------------|
| Runtime | Node.js 20 + TypeScript 5 | Type safety en contratos clínicos. Mismo stack que el equipo de producto usa hoy. |
| ORM | Prisma 5 | Migraciones versionadas — crítico en sistema clínico donde cada cambio de schema debe ser auditable. |
| DB | PostgreSQL 15 + TimescaleDB | TimescaleDB no es un sistema separado — es una extensión. Queries de rango temporal sobre millones de observaciones en <150ms. |
| Arquitectura | Modular monolith | Un equipo de 4-8 ingenieros no necesita Kubernetes. Los módulos tienen límites de dominio explícitos — la extracción a servicios es operacional, no arquitectónica. |
| Multi-tenancy | Row-Level Security en PostgreSQL | Enforcement en capa de motor, no en aplicación. Un bug en la aplicación no puede filtrar datos entre tenants. |
| Event bus | EventEmitter (local) → EventBridge (prod) | Misma interfaz en ambos. Migrar a AWS EventBridge es cambiar una línea. |

**¿Cómo funciona el pipeline?**

```
POST /observations
  → Validación LOINC + bounds fisiológicos
  → Normalización de unidades (mmol/L → mg/dL automático)
  → Persistencia en ClinicalObservation (TimescaleDB)
  → DB trigger actualiza PatientHealthSnapshot
  → Evento ObservationAdded emitido
  → Pipeline: RiskScoring (Framingham 2008) → DecisionEngine (5 reglas hardened)
  → Recommendation + DecisionTrace (atómico, inmutable)
  → Evento DecisionGenerated → audit log
```

**Explainability — ¿por qué no LLM?**

> "Los LLMs alucina. En un sistema de soporte clínico eso es inaceptable.
> Toda narrativa clínica es generada por templates determinísticos parametrizados
> con los datos exactos del DecisionTrace. El mismo input siempre produce el mismo output.
> Si el sistema dice 'LDL 213 mg/dL', ese número existe en la base de datos.
> No hay texto generado libre."

**Preguntas frecuentes de equipos técnicos:**

*¿Cómo escala?*
> "TimescaleDB particiona automáticamente por tiempo — sin necesidad de sharding manual.
> El PatientHealthSnapshot es una lectura O(1) para el dashboard — sin joins en tiempo real.
> La API es stateless — escala horizontalmente detrás de un load balancer."

*¿Cómo se integra con nuestro EMR?*
> "FHIR R4 en V1. En MVP: API REST + CSV upload. El ingestion layer tiene un mapper
> de LOINC codes configurable en YAML — no requiere código para soportar nuevas fuentes."

*¿Qué pasa si el sistema de scoring falla?*
> "El pipeline es resiliente. Si risk scoring falla, la observación ya está persistida.
> El decision engine se ejecuta igual. Un fallo en una etapa no cancela las anteriores."

---

## Capa 3 — Nivel diferencial (ventaja competitiva)

**Contexto:** cuando alguien pregunta "¿por qué esto y no [X alternativa]?"

---

**No es un sistema de alertas. Es una capa de inteligencia clínica.**

La diferencia es arquitectónica:

| Dimensión | Sistema de alertas | Vytalix |
|-----------|-------------------|---------|
| Trigger | Valor fuera de rango HOY | Patrón longitudinal detectado |
| Output | "LDL = 213 — fuera de rango" | Razonamiento clínico completo + evidencia |
| Contexto | Observación individual | Historia de 6 meses + tendencia |
| Explicabilidad | Ninguna | DecisionTrace reproducible con guía clínica |
| Audit | Log básico | Quién decidió qué, cuándo, con qué justificación |
| Integración | Cerrado al EMR | API-first, agnóstico al sistema |
| Multi-tenancy | Por instalación | RLS en DB — un solo deployment, N organizaciones |

**La separación de capas es la ventaja técnica real:**

```
Capa 1: Datos          → ClinicalObservations (TimescaleDB, inmutables)
Capa 2: Estado         → PatientHealthSnapshot (siempre fresco, sin joins)
Capa 3: Inteligencia   → RiskScoring + DecisionEngine (determinístico, auditable)
Capa 4: Explicabilidad → DecisionTrace + ClinicalExplanation (reproducible, sin LLM)
Capa 5: Interfaz       → API + Dashboard (desacoplado del core)
```

Esta separación hace posible algo que los sistemas monolíticos no pueden:
reemplazar cualquier capa sin afectar las otras.
El motor de scoring puede cambiar (Framingham → SCORE2 europeo) sin tocar el UI.
El UI puede cambiar sin tocar el pipeline.
El pipeline puede cambiar sin tocar los datos históricos.

**El dato que cierra la conversación técnica:**

> "Cada decisión clínica que Vytalix genera es reproducible 5 años después.
> Si alguien pregunta 'por qué el sistema recomendó esta medicación el 10 de noviembre',
> podemos mostrar exactamente qué datos existían ese día, qué regla se activó,
> con qué umbral, y cuál fue la narrativa que recibió el médico.
> Eso es lo que diferencia un sistema clínico de un sistema de alertas."
