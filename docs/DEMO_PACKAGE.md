# Vytalix Clinical Intelligence Engine
## Partner Demo Package — Grupo Nueve Once (u otro partner)

---

## Script de demostración (10 minutos)

### Minuto 0:30 — Contexto
> "Vytalix es una capa de inteligencia clínica que se conecta a su EMR existente.
> No reemplaza Epic o Meditech — los enriquece con capacidad de análisis longitudinal,
> scoring de riesgo y soporte a decisiones con explicabilidad clínica completa."

### Minuto 1:00 — Patient List (pantalla 1)
**Abrir:** `http://localhost:3000/dashboard`

Mostrar:
- Lista de pacientes con badge de riesgo (HIGH en rojo, MODERATE en ámbar)
- Roberto Vargas aparece en el top — badge HIGH + 3 alertas pendientes
- Ana Restrepo — riesgo LOW, sin alertas
- "El sistema prioriza automáticamente por urgencia y riesgo"

**Punto clave:** "La lista no es estática — se actualiza en tiempo real cada vez que ingresan nuevos laboratorios."

### Minuto 2:30 — Patient Detail (pantalla 2)
**Clic en:** Roberto Vargas

Mostrar:
- Edad cronológica: 56 años | Edad biológica estimada: 63 años
- Riesgo cardiovascular a 10 años: **34.2%** (categoría ALTO)
- Tres alertas en rojo/ámbar en el panel derecho

**Punto clave:** "El sistema calcula una edad biológica basada en marcadores cardiovasculares actuales.
Un paciente puede tener 56 años cronológicos pero un perfil fisiológico de 63.
Esto es lo que Vytalix aporta que un EMR tradicional no puede hacer."

### Minuto 4:00 — Timeline (pantalla 3)
**Scroll a:** sección Timeline

Mostrar:
- LDL ascendente: 162 → 188 → 213 mg/dL (mayo → agosto → noviembre)
- PA sistólica ascendente: 136 → 142 → 148 mmHg
- Glucosa en ayuno ascendente: 105 → 109 → 112 mg/dL
- Gráfica de tendencia con flecha roja hacia arriba

**Punto clave:** "En 6 meses, este paciente cruzó tres umbrales clínicos distintos.
El médico que ve solo la consulta de hoy no tiene este contexto.
Vytalix ve el patrón completo."

### Minuto 5:30 — Alerts Panel + Explainability (pantalla 4)
**Clic en:** alerta "LDL-C gravemente elevado: 213 mg/dL"

Mostrar:
- Resumen en una línea: "LDL-C de 213 mg/dL supera el umbral ACC/AHA para estatinas de alta intensidad"
- Factores primarios (evidencia que soporta)
- Factores de cautela (evidencia que el médico debe considerar)
- Datos faltantes (gaps que reducen la confianza)
- Referencia de guía clínica: ACC/AHA 2018
- Confidence: HIGH

**Punto clave:** "El médico no recibe un número. Recibe un razonamiento clínico.
¿Por qué esta recomendación? ¿Qué datos la soportan? ¿Qué podría cambiarla?
Esto es lo que diferencia Vytalix de un simple sistema de alertas."

### Minuto 7:00 — Physician Review
**Clic en:** "Aceptar recomendación"

Mostrar:
- Estado cambia de PENDING → ACCEPTED
- Audit log generado automáticamente
- "Queda registrado quién tomó qué decisión, cuándo, y con qué justificación clínica"

**Punto clave:** "Para HIPAA, GDPR, y cualquier auditoría clínica: trazabilidad completa
de cada decisión. No hay caja negra. No hay 'el sistema dijo esto'."

### Minuto 8:30 — API + Integración
**Abrir:** `http://localhost:3001/v1/patients/[id]/timeline`

Mostrar:
- JSON response con toda la historia clínica estructurada
- "Este mismo endpoint puede ser consumido por Epic, Salesforce Health Cloud,
  o cualquier plataforma que soporte FHIR/REST"

**Punto clave:** "Vytalix es API-first. No es un sistema cerrado.
Se integra con lo que ya tienen."

### Minuto 9:30 — Closing
> "En 10 minutos vieron:
> ✓ Ingesta y normalización de datos clínicos
> ✓ Scoring de riesgo cardiovascular (Framingham 2008)
> ✓ Tendencias longitudinales sobre TimescaleDB
> ✓ 3 reglas clínicas hardened con base en guías internacionales
> ✓ Explicabilidad médica completa — sin LLMs sin control
> ✓ Audit trail HIPAA-compatible
> ✓ API REST lista para integración
>
> Todo esto, sin tocar el EMR actual de su organización."

---

## Narrativa técnica para engineering teams

### Arquitectura
- Modular monolith en Node.js 20 + TypeScript 5 — sin microservicios innecesarios
- PostgreSQL 15 + TimescaleDB para datos longitudinales (particionado automático por tiempo)
- Row-Level Security en todas las tablas clínicas — aislamiento de tenant en capa de base de datos
- Event bus interno (EventEmitter → EventBridge-compatible) para desacoplamiento de pipeline
- Decision engine rule-first: las reglas determinísticas siempre toman precedencia sobre ML

### Seguridad y compliance
- Multi-tenant con RLS: un bug en la aplicación NO puede filtrar datos entre tenants
- Audit log append-only: cada write genera un registro inmutable con diff antes/después
- DecisionTrace inmutable: toda decisión clínica es reproducible desde el archivo histórico
- JWT con tenant_id embebido + validación en cada request
- Contratos de datos versionados (v1, v1.1) con estrategia de backward compatibility documentada

### Escabilidad
- TimescaleDB: queries de rango temporal sobre millones de observaciones en <150ms
- PatientHealthSnapshot: lectura O(1) del dashboard — sin joins costosos en tiempo real
- Idempotency keys: ingestión de datos de laboratorio idempotente (no duplica en reintentos)
- Pipeline resiliente: fallo en scoring no cancela la ingestión de observaciones

### Extensibilidad
- LOINC registry: añadir un nuevo código clínico = agregar una entrada al registry
- Protocol rules: médicos pueden crear reglas custom sin tocar código
- Contratos v1 → v1.1: consumidores existentes no se rompen con nuevos campos opcionales
- EventBridge-ready: migrar a async distribuido es cambiar una línea de configuración

---

## Puntos de valor para partners clínicos

### Problema que resuelve
Los médicos toman decisiones con datos de la consulta de hoy.
No ven tendencias de 6 meses. No calculan riesgo longitudinal.
No saben si tres valores "normales" juntos forman un patrón peligroso.

### Diferenciadores vs. EMR tradicional
| Capacidad | EMR Tradicional | Vytalix |
|-----------|----------------|---------|
| Vista longitudinal de marcadores | Manual, por query | Automática, timeline visual |
| Risk scoring | Ninguno o manual | Framingham 2008 automatizado |
| Explicabilidad de alertas | "Valor fuera de rango" | Razonamiento clínico completo |
| Tendencias multi-marcador | No disponible | Detección automática de deterioro |
| Edad biológica | No disponible | Proxy cardiovascular en tiempo real |
| Audit de decisiones | Log básico | DecisionTrace reproducible |

### Modelo de integración
- **Layer 1 (MVP):** API REST + ingestión CSV/manual + dashboard web
- **Layer 2 (V1):** FHIR R4 bidireccional + Epic/Cerner webhook integration
- **Layer 3 (V2):** Embedded widget dentro del EMR existente

### ROI para la organización
- Reduce tiempo de análisis clínico: de 15-20 min por paciente a 2-3 min
- Detecta riesgo alto antes de que se vuelva emergencia → reduce hospitalización
- Trazabilidad completa → reduce exposición en auditorías y litigios
- Sin reemplazar el flujo existente → adopción sin resistencia del staff clínico

---

## Checklist pre-demo (30 minutos antes)

```bash
# 1. Verificar servicios corriendo
docker compose --profile full ps

# 2. Verificar seed data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM recommendations WHERE status='PENDING';"
# Esperado: 3

# 3. Verificar API health
curl http://localhost:3001/health
# Esperado: {"status":"ok","db":"connected","redis":"connected"}

# 4. Abrir en browser
open http://localhost:3000/dashboard

# 5. Tener listo el terminal con:
curl -s http://localhost:3001/v1/patients/demo0005-0000-4000-8000-000000000020/timeline \
  -H "X-Tenant-ID: [tenant-id]" \
  -H "Authorization: Bearer [demo-token]" | jq .
```
