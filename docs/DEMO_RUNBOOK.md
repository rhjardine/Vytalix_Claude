# Vytalix — Demo Runbook
## Guía de ejecución exacta · 10 minutos

---

## Pre-demo (30 minutos antes)

```bash
# En este orden exacto. No saltarse ningún paso.

# 1. Validar que todo el sistema está correcto
make check
# DEBE mostrar: READY TO DEMO (todos verdes)
# Si falla: make reset (15 segundos) → make check de nuevo

# 2. Abrir browser — pre-cargar páginas para evitar first-load lento
open http://localhost:3000/dashboard
open "http://localhost:3000/patients/a1b2c3d4-0000-4000-8000-000000000010"

# 3. Preparar terminal visible (tamaño grande, fondo oscuro)
# Tener listo:
API_PORT=3001
TENANT=a1b2c3d4-0000-4000-8000-000000000001

# 4. Obtener token demo (copiar para usarlo durante demo)
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token OK: ${TOKEN:0:30}..."

# 5. Verificar demo status
curl -s http://localhost:3001/demo/status | python3 -c "import sys,json; d=json.load(sys.stdin); print('Ready:', d['ready'], '| Patients:', d['patients'], '| Alerts:', d['alerts'])"
# Output esperado: Ready: True | Patients: 2 | Alerts: 2
```

---

## Script de demo (10 minutos exactos)

### [0:00–0:30] Apertura (sin abrir nada aún)

**Decir:**
> "Vytalix es una capa de inteligencia clínica. No reemplaza el EMR — lo enriquece.
> En los próximos 10 minutos voy a mostrar cómo el sistema convierte datos clínicos
> en decisiones médicas accionables y explicables."

---

### [0:30–2:00] Patient List — pantalla 1

**Acción:** Ir a `http://localhost:3000/dashboard`

**Mostrar:**
- Roberto Vargas → badge HIGH rojo · 3 alertas pendientes
- Ana Restrepo → badge LOW verde · 0 alertas

**Decir:**
> "El sistema prioriza automáticamente. Roberto está en rojo porque cruzó
> tres umbrales clínicos en los últimos 6 meses. Ana está en verde.
> El médico sabe en quién enfocarse antes de abrir un expediente."

**Punto de pausa:** *"¿Ven el badge de riesgo? Ese número viene de Framingham 2008,
calculado sobre los datos reales del paciente."*

---

### [2:00–4:00] Patient Detail — pantalla 2

**Acción:** Clic en Roberto Vargas

**Mostrar:**
- Edad cronológica 56 · Edad biológica 63 (+7 años)
- Riesgo cardiovascular 10 años: **34.2% — ALTO**
- Panel derecho: 3 alertas en rojo/ámbar

**Decir:**
> "El sistema calcula una edad biológica. Roberto tiene 56 cronológicos
> pero un perfil fisiológico de 63. Eso es lo que los biomarcadores dicen.
> Un EMR tradicional no tiene esta vista."

**Punto de pausa:** *"El 34.2% no es un número arbitrario. Está calculado con
los coeficientes exactos de D'Agostino 2008 — la misma fórmula que usa
un cardiólogo cuando calcula riesgo manualmente."*

---

### [4:00–6:00] Timeline — pantalla 3

**Acción:** Scroll a sección Timeline

**Mostrar:**
- LDL: 162 → 188 → 213 mg/dL (flecha roja hacia arriba)
- PA sistólica: 136 → 142 → 148 mmHg
- Glucosa: 105 → 109 → 112 mg/dL

**Decir:**
> "En 6 meses este paciente cruzó tres umbrales distintos.
> Ninguno por sí solo sería alarma. Juntos y en tendencia, son el cuadro
> que el médico necesita ver. Vytalix ve el patrón completo."

**Punto de pausa:** *"Esta data viene de TimescaleDB — una extensión de Postgres
optimizada para series temporales clínicas. La query de 12 meses responde
en menos de 150ms independiente del volumen de observaciones."*

---

### [6:00–8:00] Alerta + Explicabilidad — pantalla 4

**Acción:** Clic en alerta "LDL-C gravemente elevado: 213 mg/dL"

**Mostrar:**
- Resumen una línea
- Factores primarios (evidencia)
- Factores de cautela (contra-evidencia)
- Datos faltantes
- Referencia guía: ACC/AHA 2018 · Grado I Nivel B-R
- Confidence: HIGH

**Decir:**
> "El médico no recibe un número. Recibe razonamiento.
> ¿Por qué esta alerta? ¿Qué la soporta? ¿Qué la cuestiona?
> Y los datos faltantes — porque el sistema tiene que ser honesto
> sobre su propia incertidumbre."

**Punto de pausa — el más importante:**
> "Esto se generó sin LLM libre. Es determinístico. Si le preguntan
> en 5 años por qué el sistema hizo esta recomendación el 10 de noviembre,
> podemos mostrar exactamente qué datos existían, qué regla se activó,
> y qué le dijo al médico. Eso es lo que diferencia Vytalix de un
> sistema de alertas genérico."

---

### [8:00–9:00] Physician Review + API

**Acción 1:** Clic en "Aceptar recomendación"

**Mostrar:** Status cambia PENDING → ACCEPTED

**Decir:**
> "Cada decisión del médico queda registrada. Quién, cuándo,
> sobre qué recomendación. Trazabilidad HIPAA-compliant."

**Acción 2:** Abrir terminal — mostrar API

```bash
curl -s "http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010/timeline" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Events:', len(d['data']['events']), '| Trend:', d['data']['summary']['riskTrend'])"
```

**Decir:**
> "Este es el API que consume cualquier sistema externo. FHIR R4,
> REST puro, o el formato de su EMR. No hay vendor lock-in."

---

### [9:00–10:00] Cierre

**Decir:**
> "En 10 minutos vieron:
> — Ingesta y normalización de datos clínicos
> — Scoring de riesgo cardiovascular (Framingham 2008)
> — Detección de tendencias longitudinales
> — 3 reglas clínicas hardened con guías internacionales
> — Explicabilidad médica completa, determinística, auditable
> — API REST listo para integración
>
> Todo esto sin tocar el EMR actual de su organización."

**Pregunta de apertura:**
> "¿Cómo integran hoy el análisis de tendencias en el flujo del médico?"

---

## Timings de referencia

| Paso | Tiempo acumulado |
|------|-----------------|
| Apertura | 0:30 |
| Patient list | 2:00 |
| Patient detail | 4:00 |
| Timeline | 6:00 |
| Explicabilidad | 8:00 |
| Review + API | 9:00 |
| Cierre | 10:00 |
