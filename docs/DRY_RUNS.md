# Vytalix — Dry Run Playbook
## 5 escenarios. Cada uno tiene: situación → respuesta exacta → recovery.

---

## Cómo hacer los dry runs

Antes de cada demo real:

```bash
# Reset completo + validación
npm run demo:reset   # borra y re-siembra
npm run demo:check   # valida todo

# Luego hacer el dry run en voz alta, solo.
# Cronometrar. Debe durar exactamente 10 minutos.
```

---

## Escenario 1 — Todo funciona perfecto ✓

**Flujo:**

```
1. demo:check → READY
2. Abrir http://localhost:3000/dashboard
3. Ver lista: Roberto (HIGH, 3 alertas), Ana (LOW, 0 alertas)
4. Clic Roberto → detail: riesgo 34.2%, edad bio 63
5. Scroll timeline → LDL 162→188→213 visible
6. Clic alerta LDL → explicación clínica completa
7. Clic "Aceptar" → status PENDING→ACCEPTED
8. Mostrar terminal → logs visibles en tiempo real
9. Abrir /demo/status → {"ready":true,"decisions":2,"alerts":2}
10. Cerrar con frase de cierre
```

**Frase de apertura:**
> "Voy a mostrarles cómo Vytalix convierte datos clínicos en inteligencia accionable.
> Tenemos a Roberto, 56 años, con datos de los últimos 6 meses."

**Frase de cierre:**
> "En 10 minutos: ingesta, scoring, tendencias, explainability, audit. Todo sin tocar el EMR."

---

## Escenario 2 — API tarda (>3 segundos)

**Señal:** La página de pacientes carga lentamente o el spinner dura más de lo esperado.

**Respuesta exacta (no improvisar):**
> "Están viendo la carga inicial del servidor — en producción esto se resuelve con
> instancias pre-calentadas en AWS ECS. El sistema hace tres queries paralelas a
> TimescaleDB. Una vez cargado, la navegación es instantánea."

**Mientras espera:** abrir el terminal y mostrar los logs del API.
> "Pueden ver aquí: el sistema está procesando las queries de riesgo y timeline en paralelo."

**Recovery:** si tarda más de 8 segundos, cambiar a mostrar directamente el endpoint JSON:
```bash
curl http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010 \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | jq .data.healthSnapshot
```
> "Aquí el API directo — esto es lo que consume cualquier sistema externo."

---

## Escenario 3 — UI no carga rápido / pantalla en blanco

**Señal:** El dashboard muestra pantalla blanca o error de hydration de Next.js.

**Respuesta exacta:**
> "El frontend está en modo desarrollo con hot reload — esto no ocurre en la build
> de producción. Mientras, les muestro el API que es lo que integra con su EMR."

**Recovery inmediato — cambiar a modo API-first:**
```bash
# Terminal 1: status del sistema
curl -s http://localhost:3001/demo/status | jq .

# Terminal 2: paciente con snapshot
curl -s http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010 \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | jq '.data | {name: (.firstName + " " + .lastName), risk: .healthSnapshot.latestLdlMgDl}'

# Terminal 3: alertas pendientes
curl -s "http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010/decisions?status=PENDING" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | jq '.data[] | {title, urgency}'
```

> "Esto es Vytalix en su forma más pura — API-first, consumible por cualquier sistema."

**Ventaja de este recovery:** muestra la arquitectura real, que es más convincente para equipos técnicos que la UI.

---

## Escenario 4 — Error en un dato / validación falla

**Señal:** Un valor clínico muestra NULL o incorrecto en el dashboard.

**Diagnóstico rápido (30 segundos):**
```bash
npm run demo:check
```

Si falla: `npm run demo:reset` tarda ~15 segundos.

**Respuesta mientras resetea:**
> "Voy a mostrarles algo interesante — el sistema de validación de datos clínicos.
> Vytalix rechaza valores fisiológicamente imposibles antes de persistirlos."

**Demostrar la validación en vivo:**
```bash
# Intentar ingerir LDL imposible — debe rechazarse
curl -s -X POST http://localhost:3001/v1/observations \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" \
  -d '{"patientId":"a1b2c3d4-0000-4000-8000-000000000010","loincCode":"2089-1","valueNumeric":850,"unit":"mg/dL","observedAt":"2024-11-10T10:00:00Z","sourceSystem":"MANUAL_ENTRY"}' | jq .
```

Muestra respuesta de error 422 con `"code": "ABOVE_PHYSIOLOGICAL_MAX"`.

> "El sistema rechazó ese valor — LDL de 850 mg/dL es fisiológicamente imposible.
> Esto protege la calidad de datos clínicos antes de que lleguen al motor de decisiones."

---

## Escenario 5 — Fallo controlado (para demos técnicas avanzadas)

**Cuándo usar:** cuando el equipo técnico quiere ver cómo el sistema falla gracefully.

**Setup previo:**
```bash
# Detener Redis (falla el rate limiting, pero la API sigue funcionando)
docker stop vytalix-redis
```

**Respuesta:**
> "Acabo de bajar Redis — el sistema de cache. Observen que la API sigue respondiendo."

**Demostrar:**
```bash
curl http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010 \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | jq .data.firstName
# Responde: "Roberto" — sin cache, directamente a DB
```

> "El sistema degrada gracefully. Sin Redis, pierde cache pero mantiene funcionalidad clínica.
> La arquitectura separa concerns: si el cache falla, los datos clínicos siguen accesibles."

**Recovery:**
```bash
docker start vytalix-redis
```

---

## Reglas absolutas del demo

1. **Nunca decir "debería funcionar"** — si algo no funciona, hay un recovery planificado.
2. **Nunca pedir disculpas por la tecnología** — redirigir siempre a una fortaleza.
3. **El terminal siempre visible** — los logs en tiempo real son un activo, no un detalle técnico.
4. **Si algo sale mal y no hay recovery** — parar, `npm run demo:reset`, continuar en 20 segundos.
5. **Nunca mostrar datos de producción reales** — siempre el dataset de demo frozen.

---

## Checklist 30 minutos antes

```bash
# En este orden exacto:
docker compose --profile full ps        # todos los servicios UP
npm run demo:check                       # todos los checks verdes
open http://localhost:3000/dashboard     # UI carga sin errores
curl http://localhost:3001/demo/status   # ready: true
# Pre-cargar la página del paciente en una pestaña separada (evita primera carga lenta)
open "http://localhost:3000/patients/a1b2c3d4-0000-4000-8000-000000000010"
```

**Si demo:check falla:**
```bash
npm run demo:reset    # borra + re-siembra (15 segundos)
npm run demo:check    # volver a validar
```
