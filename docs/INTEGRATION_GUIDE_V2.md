# Guía de Integración: Doctor Antivejez Web → Vytalix Platform v2

## Objetivo

Conectar el frontend Next.js de Doctor Antivejez con los nuevos servicios de la plataforma Vytalix v2,
manteniendo compatibilidad con el backend existente y habilitando el flujo de comercialización con Disglobal.

---

## Estado actual vs. estado objetivo

| Flujo | Estado actual | Estado objetivo |
|-------|--------------|-----------------|
| Test biofísico | Frontend calcula con `calculateAndSaveBiophysicsTest()` (Server Action) | Server Action llama a `BiologicalAgeService` en backend |
| Baremos | Cargados desde DB via `getBiophysicsBoardsAndRanges()` | Cargados desde `biophysics_boards` vía API con Redis cache |
| Edad biológica | Calculada y guardada en frontend (Next.js Server Action) | Calculada en `BiophysicsEngine`, guardada en `biological_age_assessments` |
| Disglobal | Sin integración | Consume `/api/v2/vitality/assess` con API Key |
| Score compuesto | No existe | `PreventiveScoreService` computa post-assessment |
| Derivaciones | No existe | `ReferralEngine` evalúa automáticamente |

---

## Cambio mínimo en el frontend (no-breaking)

El Server Action existente `calculateAndSaveBiophysicsTest` puede mantenerse
**sin cambios en la UI**. Solo se refactoriza su implementación interna
para delegar al backend v2.

### Antes (Server Action actual)

```typescript
// lib/actions/biophysics.actions.ts (actual)
export async function calculateAndSaveBiophysicsTest(params) {
  // Cálculo directo aquí con lógica embebida
  const result = computeBiologicalAge(params) // ← lógica en frontend
  await db.biophysicsTest.create({ data: result })
  return { success: true, data: result }
}
```

### Después (delega al backend v2)

```typescript
// lib/actions/biophysics.actions.ts (actualizado)
'use server'
import { auth } from '@/lib/auth'

export async function calculateAndSaveBiophysicsTest(params: {
  patientId: string
  chronologicalAge: number
  gender: string
  isAthlete: boolean
  formValues: FormValues
}) {
  const session = await auth()
  if (!session?.accessToken) throw new Error('No auth')

  // Map frontend FormValues → API request body
  const requestBody = {
    patientId:        params.patientId,
    chronologicalAge: params.chronologicalAge,
    biologicalSex:    mapGenderToSex(params.gender),
    isAthlete:        params.isAthlete,
    measurements: {
      fatPercentage:        params.formValues.fatPercentage!,
      bmi:                  params.formValues.bmi!,
      digitalReflexes:      params.formValues.digitalReflexes!,
      visualAccommodation:  params.formValues.visualAccommodation!,
      staticBalance:        params.formValues.staticBalance!,
      skinHydration:        params.formValues.skinHydration!,
      systolicPressure:     params.formValues.systolicPressure!,
      diastolicPressure:    params.formValues.diastolicPressure!,
    },
    conductedBy: session.userId,
  }

  const response = await fetch(`${process.env.VYTALIX_API_URL}/v1/patients/${params.patientId}/vitality/assess`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
      'X-Tenant-ID':   session.tenantId,
      'X-Idempotency-Key': `biophysics-${params.patientId}-${Date.now()}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const err = await response.json()
    return { success: false, error: err.detail ?? 'Error del servidor' }
  }

  const data = await response.json()

  // Mapear respuesta v2 → formato esperado por el frontend existente
  return {
    success: true,
    data: {
      biologicalAge:  data.biologicalAge,
      differentialAge: data.differentialAge,
      partialAges: {
        fatAge:       data.partialAges.fatAge,
        bmiAge:       data.partialAges.bmiAge,
        reflexesAge:  data.partialAges.reflexesAge,
        visualAge:    data.partialAges.visualAge,
        balanceAge:   data.partialAges.balanceAge,
        hydrationAge: data.partialAges.hydrationAge,
        systolicAge:  data.partialAges.systolicAge,
        diastolicAge: data.partialAges.diastolicAge,
      },
    },
  }
}

// Helper: mapear gender string del frontend → BiologicalSex enum del backend
function mapGenderToSex(gender: string): 'MALE' | 'FEMALE' | 'INTERSEX' {
  if (gender.includes('FEMENINO') || gender.includes('FEMALE')) return 'FEMALE'
  if (gender.includes('MASCULINO') || gender.includes('MALE'))  return 'MALE'
  return 'MALE' // default for DEPORTIVO variants
}
```

### La UI (edad-biofisica-test-view.tsx) no cambia

El componente existente llama exactamente a la misma firma:
```typescript
const result = await calculateAndSaveBiophysicsTest(params)
```
La UI no sabe ni le importa que ahora el cálculo ocurre en el backend.

---

## Nuevo endpoint interno para clínicos (JWT)

Agregar a `src/api/handlers.ts` (dentro del router `/v1`):

```typescript
// POST /v1/patients/:patientId/vitality/assess
router.post(
  '/patients/:patientId/vitality/assess',
  async (req, res) => {
    const { patientId } = req.params
    const tenantId = req.user.tenantId
    const correlationId = req.correlationId

    const body = BiophysicsAssessRequestSchema.safeParse({ ...req.body, patientId })
    if (!body.success) {
      return res.status(422).json(problemDetail(422, 'Validation failed', correlationId))
    }

    const bioAgeSvc = new BiologicalAgeService()
    const result = await bioAgeSvc.assessBiophysics(tenantId, body.data, correlationId)

    return res.json(result)
  }
)

// GET /v1/patients/:patientId/vitality/history
router.get(
  '/patients/:patientId/vitality/history',
  async (req, res) => {
    const { patientId } = req.params
    const bioAgeSvc = new BiologicalAgeService()
    const history = await bioAgeSvc.getHistory(req.user.tenantId, patientId)
    return res.json({ assessments: history })
  }
)
```

---

## Nuevas tarjetas en EdadBiologicaMain

El componente `edad-biologica-main.tsx` puede mostrar el score compuesto
leyendo el nuevo endpoint:

```typescript
// En la carga de datos del paciente (page o layout server component):
const preventiveScore = await fetch(
  `${VYTALIX_API_URL}/v1/patients/${patientId}/preventive-score`,
  { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId } }
).then(r => r.ok ? r.json() : null)

// Pasar como prop al componente:
<EdadBiologicaMain
  patient={patient}
  preventiveScore={preventiveScore}   // ← nuevo prop opcional
  // ...otros callbacks
/>
```

Agregar al componente una tarjeta de **Score Preventivo Compuesto**:

```tsx
// En el array testCards de edad-biologica-main.tsx:
{
  id: 'preventivo',
  title: 'SCORE PREVENTIVO',
  icon: FaShieldAlt,
  value: preventiveScore?.compositeScore ?? '--',
  tier: preventiveScore?.scoreTier,
  isClickable: false,
  color: 'bg-primary',
  hasHistory: false,
}
```

---

## Variables de entorno necesarias

```bash
# .env.local (Doctor Antivejez Next.js)
VYTALIX_API_URL=http://localhost:3001          # dev
# VYTALIX_API_URL=https://api.vytalix.health  # prod
```

---

## Flujo Disglosal (completamente separado del frontend clínico)

```
Disglobal App
  │  POST /api/v2/vitality/assess
  │  X-API-Key: vyx_dis_k1_xxx
  │  Body: { subjectRef: "DISG-12345", chronologicalAge: 45, ... }
  │
  ▼ ExternalV2Handler → BiologicalAgeService
  │  → BiophysicsEngine.compute()
  │  → INSERT biological_age_assessments
  │  → EventBus emit('vitality.assessed')
  │     → PreventiveScoreService (async)
  │     → ReferralEngine (async)
  │
  ▼ Response to Disglobal
  │  { biologicalAge: 42, differentialAge: -3, ageStatus: "REJUVENECIDO" }
  │
  ▼ Webhook → Disglobal si referral triggered
     { eventType: "referral.triggered", referralType: "PREMIUM_CONSULT", ... }
```

---

## Checklist de integración

```
□ 1. Migrar schema: npx prisma migrate dev --name "add_vytalix_platform_v2"
□ 2. Seedear biophysics_boards con baremos Doctor Antivejez
□ 3. Crear API Key para Disglobal: INSERT INTO api_keys (...)
□ 4. Actualizar calculateAndSaveBiophysicsTest() para delegar al backend
□ 5. Agregar endpoints /v1/patients/:id/vitality/* a handlers.ts
□ 6. Registrar platform event listeners en server.ts startup
□ 7. Montar router /api/v2/* en server.ts
□ 8. Configurar REDIS_URL en .env
□ 9. Prueba end-to-end: curl /api/v2/vitality/assess con API key
□ 10. Verificar que frontend Doctor Antivejez mantiene funcionalidad idéntica
```

---

## Tiempo de implementación estimado

| Tarea | Tiempo |
|-------|--------|
| Schema migration + seed boards | 2h |
| Refactorizar calculateAndSaveBiophysicsTest | 2h |
| Agregar endpoints /v1/vitality | 3h |
| Wire event listeners en server.ts | 1h |
| Crear API Key Disglobal + smoke test | 1h |
| **Total** | **~1 día de desarrollo** |
