# Vytalix — RUNBOOK
## Operaciones · Diagnóstico · Recuperación

---

## Inicio rápido

```bash
make setup    # primera instalación
make demo     # levantar para demo
make check    # validación pre-demo
make reset    # restaurar datos demo
```

---

## Comandos de diagnóstico

```bash
# Estado general
make check

# Estado del demo (JSON)
curl -s http://localhost:3001/demo/status | python3 -m json.tool

# Health completo
curl -s http://localhost:3001/health | python3 -m json.tool

# Métricas
curl -s http://localhost:3001/metrics | python3 -m json.tool

# Logs en vivo
docker compose --profile full logs -f api --tail=50

# Estado de contenedores
docker compose --profile full ps
```

---

## Escenario 1 — API no responde

**Señal:** `make check` falla en "API health endpoint"

```bash
# Diagnóstico
docker compose --profile full ps api
# Si no está Up:
docker compose --profile full up -d api
sleep 5 && curl -sf http://localhost:3001/health

# Si está Up pero no responde:
docker compose --profile full logs api --tail=30
```

**Causas comunes:**

| Error en log | Causa | Solución |
|---|---|---|
| `JWT_SECRET must be at least 32 characters` | .env incompleto | Revisar JWT_SECRET en .env |
| `ECONNREFUSED 5432` | Postgres caído | `docker compose up -d postgres` |
| `Cannot find module` | Deps no instaladas | `npm install` |

**Fallback en demo:** Mostrar API directo en terminal:
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
curl -s "http://localhost:3001/v1/patients/$TOKEN" -H "Authorization: Bearer $TOKEN"
```

---

## Escenario 2 — Base de datos caída

**Señal:** `/health` muestra `"db": "error"` | Error 503

```bash
# Restart
docker compose --profile full restart postgres
sleep 10
curl -s http://localhost:3001/health | python3 -c "import sys,json; print(json.load(sys.stdin)['checks'])"
```

**Si persiste:**
```bash
# Ver logs de postgres
docker compose --profile full logs postgres --tail=20

# Verificar volumen de datos
docker volume ls | grep postgres
docker compose --profile full exec postgres pg_isready -U vytalix
```

---

## Escenario 3 — Redis caído

**Señal:** `/health` muestra `"redis": "degraded"` — sistema sigue funcionando

Redis es caché y rate limiting. Su caída no detiene el flujo clínico.

```bash
docker compose --profile full restart redis
sleep 5
# Verificar que API sigue respondiendo sin Redis:
curl -sf http://localhost:3001/v1/patients \
  -H "Authorization: Bearer $TOKEN" && echo "API OK without Redis"
```

**En demo:** No mencionar Redis. El sistema degrada gracefully.

---

## Escenario 4 — UI no carga / pantalla en blanco

**Señal:** Browser muestra blank page o error de conexión en localhost:3000

```bash
# Restart frontend
docker compose --profile full restart frontend
sleep 5 && open http://localhost:3000/dashboard

# Si persiste, verificar variable de entorno
grep NEXT_PUBLIC_API_URL .env
# Debe ser: NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Fallback en demo — modo API terminal:**
```bash
# Mostrar en pantalla: los mismos datos que la UI, vía API
echo "=== Pacientes ===" && \
curl -s http://localhost:3001/v1/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | \
  python3 -c "import sys,json; [print(f'  {p[\"firstName\"]} {p[\"lastName\"]} — LDL: {p.get(\"healthSnapshot\",{}).get(\"latestLdlMgDl\",\"N/A\")} mg/dL') for p in json.load(sys.stdin).get('data',[])]"

echo "" && echo "=== Alertas de Roberto ===" && \
curl -s "http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010/decisions?status=PENDING" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | \
  python3 -c "import sys,json; [print(f'  [{r[\"urgency\"]}] {r[\"title\"]}') for r in json.load(sys.stdin).get('data',[])]"
```

> "Lo que ven es el API que consumiría cualquier EMR externo. La UI es un cliente más."

---

## Escenario 5 — Datos incorrectos en demo

**Señal:** `make check` falla · número de alertas incorrecto · valores clínicos distintos

```bash
# Reset completo (15 segundos, idempotente)
make reset

# Verificar inmediatamente
make check
# Debe mostrar: READY TO DEMO
```

**Si el reset falla:**
```bash
# Limpiar datos y re-seed manual
docker compose --profile full exec postgres \
  psql -U vytalix -d vytalix_dev -c "
    DELETE FROM decision_traces;
    DELETE FROM recommendations;
    DELETE FROM risk_scores;
    DELETE FROM clinical_observations;
    DELETE FROM patient_health_snapshots;
    DELETE FROM patients WHERE mrn LIKE 'GNO-%' OR mrn LIKE 'E2E-%';
  "
npm run db:seed
make check
```

---

## Escenario 6 — Pregunta técnica inesperada

No es un fallo — es una oportunidad. Respuestas preparadas:

**"¿Cómo garantizan aislamiento entre clientes?"**
```bash
# Mostrar RLS activo en vivo
docker compose --profile full exec postgres \
  psql -U vytalix -d vytalix_dev -c "\d+ patients" | grep -A5 "Row Security"
# Muestra: Row Security: enabled, Force Row Security: enabled
```

**"¿Cómo integran con nuestro EMR?"**
```bash
# Demo en vivo de integración externa
curl -s -X POST http://localhost:3001/api/external/observations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vyx_demo_k1_NueveOnce_2024" \
  -d '{"patientMrn":"GNO-2024-000112","observations":[{"loincCode":"2089-1","value":220,"unit":"mg/dL","effectiveDateTime":"2024-11-15T09:00:00Z"}]}' \
  | python3 -m json.tool
```

**"¿Qué pasa si fallan los algoritmos de ML?"**
> "El sistema es rule-first. Las 5 reglas hardened se ejecutan antes que cualquier ML.
> Si el ML falla, las reglas siguen funcionando. No hay dependencia de ML para seguridad clínica."

---

## Protocolo de escalada en demo

Si ningún recovery funciona en **90 segundos:**

1. `make reset` (15s) — intento único
2. Si falla → **pivotear a presentación arquitectural**

```
"En lugar de continuar con el live demo, quiero mostrarles la arquitectura
porque ahí está la propuesta de valor real de Vytalix."
```

Abrir `ARCHITECTURE.md` o `NARRATIVA_TECNICA.md` y guiar la conversación.
Esto siempre funciona porque no depende de infraestructura.

---

## Checklist 30 minutos antes de cualquier demo

```bash
# En este orden. No saltarse ningún paso.
make check                          # Todos deben ser ✓ verdes
curl -sf http://localhost:3001/health > /dev/null && echo "API ✓"
open http://localhost:3000/dashboard # Pre-cargar para evitar first-load lento

# Obtener y guardar token para uso durante demo
export TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token','NO_TOKEN'))")
echo "Token: ${TOKEN:0:30}..."  # Debe mostrar un JWT válido, no NO_TOKEN

# Pre-cargar página de Roberto para evitar lentitud en demo
open "http://localhost:3000/patients/a1b2c3d4-0000-4000-8000-000000000010"
```
