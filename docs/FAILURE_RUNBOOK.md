# Vytalix — Failure Runbook
## Diagnóstico · Acción inmediata · Fallback

Regla: **nunca improvisar**. Si algo sale mal, este documento tiene la respuesta.

---

## Escenario 1 — API caída

**Síntoma:** UI muestra error de conexión · `make check` falla en "API health endpoint"

### Diagnóstico (10 segundos)

```bash
# 1. ¿El contenedor está corriendo?
docker compose --profile full ps api
# Si STATUS != "Up" → ir a Acción A

# 2. ¿El proceso está escuchando?
curl -sf http://localhost:3001/health
# Si connection refused → ir a Acción A
# Si responde → ir a Acción B
```

### Acción A — Contenedor caído (30 segundos)

```bash
docker compose --profile full up -d api
sleep 5
curl http://localhost:3001/health
```

### Acción B — API responde pero con error

```bash
# Ver logs para diagnóstico
docker compose --profile full logs --tail=50 api | grep -E "ERROR|FATAL"
```

Errores comunes:

| Error en log | Causa | Fix |
|-------------|-------|-----|
| `JWT_SECRET must be at least 32 characters` | .env incorrecto | Verificar JWT_SECRET en .env |
| `ECONNREFUSED 5432` | Postgres caído | `docker compose up -d postgres` |
| `Cannot find module` | Build roto | `npm install && npm run build` |

### Fallback — API completamente irrecuperable

Cambiar a demo modo API-terminal:

```bash
# Abrir terminal visible en la pantalla y ejecutar:
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Mostrar paciente con riesgo
curl -s "http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'Paciente: {d[\"firstName\"]} {d[\"lastName\"]} | LDL: {d[\"healthSnapshot\"][\"latestLdlMgDl\"]} mg/dL | Riesgo: {d[\"healthSnapshot\"][\"latestSystolicBp\"]} mmHg')"
```

**Guión de transición:**
> "Mientras resolvemos el frontend, les muestro el API directamente.
> Esto es exactamente lo que consumiría un EMR o una integración externa."

---

## Escenario 2 — UI falla / pantalla en blanco

**Síntoma:** Dashboard muestra blank page · Error de hydration Next.js

### Diagnóstico (10 segundos)

```bash
# 1. ¿El contenedor de frontend está corriendo?
docker compose --profile full ps frontend

# 2. ¿Hay errores de JS en el browser?
# Abrir DevTools → Console → ver errores

# 3. ¿La API está OK?
curl http://localhost:3001/health
```

### Acción A — Restart frontend (20 segundos)

```bash
docker compose --profile full restart frontend
sleep 5
# Recargar el browser
```

### Acción B — Error de conectividad API→Frontend

```bash
# Verificar que NEXT_PUBLIC_API_URL está bien configurado
grep NEXT_PUBLIC_API_URL .env
# Debe ser: http://localhost:3001 (o http://api:3001 dentro de Docker)
```

### Fallback — UI completamente irrecuperable

Este fallback es el más fuerte de todos. Cambiar a modo "arquitectura en vivo":

**Paso 1:** Abrir terminal y ejecutar la demo enteramente por API.

**Paso 2:** Usar el guión:
> "Lo que ven aquí es el sistema en su forma más fundamental.
> La UI que acaban de ver es solo un cliente del API.
> Cualquier EMR, cualquier sistema externo, cualquier aplicación
> puede hacer exactamente lo mismo que acaban de ver en pantalla —
> consumiendo estos mismos endpoints."

```bash
# Mostrar en terminal (narrativa completa):
echo "=== Pacientes en sistema ==="
curl -s "http://localhost:3001/v1/patients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | \
  python3 -c "import sys,json; [print(f'  {p[\"firstName\"]} {p[\"lastName\"]} — {p[\"healthSnapshot\"][\"latestLdlMgDl\"]} LDL') for p in json.load(sys.stdin)['data']]"

echo ""
echo "=== Alertas pendientes ==="
curl -s "http://localhost:3001/v1/patients/a1b2c3d4-0000-4000-8000-000000000010/decisions?status=PENDING" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001" | \
  python3 -c "import sys,json; [print(f'  [{r[\"urgency\"]}] {r[\"title\"]}') for r in json.load(sys.stdin)['data']]"
```

---

## Escenario 3 — Datos inconsistentes

**Síntoma:** `make check` falla · valores incorrectos · número de alertas incorrecto

### Diagnóstico (15 segundos)

```bash
make check
# Leer qué check específico falló
```

### Acción — Reset completo (15 segundos)

```bash
make reset
# Esto borra y re-siembra el dataset frozen
# El resultado es SIEMPRE idéntico

make check
# Debe mostrar READY TO DEMO
```

### Si el reset falla

```bash
# Verificar conexión a DB
docker compose --profile full exec postgres pg_isready -U vytalix

# Si DB no responde:
docker compose --profile full up -d postgres
sleep 10
make reset
```

### Si el seed falla con errores de constraint

```bash
# Limpiar datos manualmente y re-seed
docker compose --profile full exec postgres \
  psql -U vytalix -d vytalix_dev -c "
    DELETE FROM decision_traces;
    DELETE FROM recommendations;
    DELETE FROM risk_scores;
    DELETE FROM clinical_observations;
    DELETE FROM patient_health_snapshots;
    DELETE FROM patients WHERE mrn LIKE 'GNO-%';
  "
make reset
```

---

## Escenario 4 — Database unreachable

**Síntoma:** `/health` muestra `db: error` · API retorna 503

### Acción (20 segundos)

```bash
# Restart postgres
docker compose --profile full restart postgres
sleep 10

# Verify
curl -s http://localhost:3001/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB:', d['checks']['db']['status'])"
```

---

## Escenario 5 — Pregunta técnica inesperada del partner

No es un fallo técnico — es una oportunidad. Respuestas preparadas:

**"¿Cómo manejan multi-tenancy?"**
> "Row-Level Security en PostgreSQL. No es un filtro en la aplicación —
> es una política en el motor de base de datos. Si hay un bug en nuestra app
> que olvida el WHERE tenant_id, el motor lo rechaza igual. Es la última línea de defensa."
> Abrir terminal: `curl http://localhost:3001/demo/status | python3 -m json.tool`

**"¿Cómo garantizan que los datos de nuestros pacientes no se mezclan con otros clientes?"**
> Misma respuesta que multi-tenancy, agregar:
> "Cada query va con `SELECT set_config('app.current_tenant_id', <uuid>, true)` dentro de la transacción.
> Si la transacción termina sin completarse, el contexto se limpia automáticamente."

**"¿Qué pasa si el scoring de Framingham no es el algoritmo correcto para nosotros?"**
> "El algoritmo es un módulo intercambiable. El contrato entre el pipeline y el scoring
> es: recibe un PatientHealthSnapshot, devuelve { value, category, inputSnapshot }.
> Pueden pluggear SCORE2, AHA Pooled Cohort, o un modelo propio. El pipeline no cambia."

**"¿Cómo integran con nuestro Epic?"**
> "FHIR R4 bidireccional en V1. En el MVP que están viendo hoy:
> POST /api/external/observations con formato simplificado.
> Mostrar:"
> ```bash
> curl -s -X POST http://localhost:3001/api/external/observations \
>   -H "X-API-Key: vyx_demo_k1_NueveOnce_2024" \
>   -H "Content-Type: application/json" \
>   -d '{"patientMrn":"GNO-2024-000112","observations":[{"loincCode":"2089-1","value":210,"unit":"mg/dL","effectiveDateTime":"2024-11-10T10:00:00Z"}]}' | python3 -m json.tool
> ```

---

## Protocolo de escalada

Si ninguno de los anteriores resuelve el problema en **90 segundos**:

1. **Decir:** "Voy a verificar algo rápidamente — dame 60 segundos."
2. Ejecutar: `make reset` (15 segundos) + `make check` (5 segundos)
3. Si pasa: continuar demo normalmente
4. Si no pasa: **pivotear a presentación arquitectural**
   > "En lugar de continuar con el live demo, voy a explicar la arquitectura
   > en detalle porque creo que es donde está la propuesta de valor real."
   Abrir NARRATIVA_TECNICA.md en el editor y guiar la conversación desde ahí.
