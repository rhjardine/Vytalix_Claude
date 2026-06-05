# Vytalix SDK — Quickstart para Disglobal

> **Tiempo de integración estimado:** 1–3 horas de desarrollo backend  
> **Prerequisito:** API Key provisionada por el equipo de Vytalix

---

## Instalación

```bash
# Opción A: npm (cuando se publique)
npm install @vytalix/disglobal-sdk

# Opción B: copiar directamente (disponible ahora)
cp src/integrations/disglobal/sdk/index.ts tu-proyecto/lib/vytalix.ts
```

---

## Configuración básica

```typescript
// lib/vytalix.ts (en el backend de Disglobal)
import { createVytalixClient } from '@vytalix/disglobal-sdk'

export const vytalix = createVytalixClient(
  process.env.VYTALIX_API_KEY!,
  {
    baseUrl: 'https://api.vytalix.health',
    timeout: 10_000,
    debug:   process.env.NODE_ENV === 'development',
  }
)
```

---

## Caso de uso 1 — Test de Edad Biológica (flujo principal)

El usuario completa el cuestionario de mediciones en la app Disglobal y tu backend llama a Vytalix:

```typescript
import { vytalix } from '../lib/vytalix'

// En tu endpoint /api/health/bio-age
async function calcularEdadBiologica(req, res) {
  const { userId, mediciones } = req.body

  const resultado = await vytalix.assessBioAge({
    userId,                  // Disglobal user ID — pseudonymizado automáticamente
    age:  mediciones.edad,
    sex: 'MASCULINO',        // o 'FEMENINO'
    mediciones: {
      porcentajeGrasa:    mediciones.grasa,
      imc:                mediciones.imc,
      reflejoDigital:     { alto: 0.8, largo: 15.2, ancho: 8.1 },
      acomodacionVisual:  3.5,
      equilibrioEstatico: { alto: 12.0, largo: 30.5, ancho: 8.0 },
      hidratacionPiel:    42.0,
      presionSistolica:   128,
      presionDiastolica:  82,
    }
  })

  // Mostrar resultado al usuario
  res.json({
    edadBiologica:  resultado.edadBiologica,
    estado:         resultado.estado,          // "REJUVENECIDO" | "NORMAL" | "ENVEJECIDO"
    interpretacion: resultado.interpretacion,  // Mensaje listo para mostrar al usuario
    derivacion:     resultado.derivacion,      // CTA si aplica (null si está bien)
  })

  // Trackear el evento de engagement
  await vytalix.registrarEvento({
    userId,
    tipo: 'TEST_COMPLETADO',
    datos: { bioAge: resultado.edadBiologica, delta: resultado.diferencial }
  })
}
```

**Respuesta de ejemplo:**
```json
{
  "edadBiologica": 42,
  "estado": "REJUVENECIDO",
  "interpretacion": "Tu organismo funciona 3 años mejor que tu edad cronológica. ¡Sigue así!",
  "derivacion": null
}
```

---

## Caso de uso 2 — Derivación premium (monetización)

Cuando el delta es ≥ 2 años o el riesgo es alto, Vytalix genera automáticamente un CTA:

```typescript
// Después del assessment, verificar si hay derivación
if (resultado.derivacion?.elegible) {
  // Mostrar CTA en la app Disglobal
  mostrarCTA({
    titulo:   resultado.derivacion.titular,
    url:      resultado.derivacion.urlCta,
    urgencia: resultado.derivacion.urgencia,
  })
}

// Cuando el usuario hace click en el CTA
async function onCtaClick(userId: string) {
  await vytalix.registrarEvento({ userId, tipo: 'CTA_CLIC' })
  // Redirigir al usuario
}

// Cuando el usuario completa la consulta (conversión = revenue share)
async function onConsultaCompletada(userId: string, montoUsd: number) {
  await vytalix.registrarConversion(userId, montoUsd)
  // Revenue share calculado automáticamente: Disglobal 70% / Vytalix 30%
}
```

---

## Caso de uso 3 — Score preventivo (para aseguradoras)

```typescript
const score = await vytalix.getScorePreventivo(userId)

if (!score) {
  // Datos insuficientes — sugerir completar perfil
  return { mensaje: 'Completa tu perfil médico para obtener tu score' }
}

console.log(score.puntaje)     // 71 (0–100)
console.log(score.nivel)       // "Riesgo moderado — se recomienda intervención preventiva"
console.log(score.recomendacion) // "Agenda una consulta preventiva en los próximos 30 días."
```

---

## Caso de uso 4 — Métricas de población (dashboard Disglobal)

Para dashboards de salud de la base asegurada:

```typescript
const insights = await vytalix.getInsightsDePoblacion({
  grupoEdad: '40-50',
  sexo:      'MASCULINO',
  periodo:   'last_90d',
})

// {
//   cohortSize: 234,
//   avgDifferential: 0.4,
//   pctRejuvenecido: 38,
//   pctEnvejecido: 22,
//   topRiskSignals: [...],
//   summary: "La cohorte muestra una edad biológica promedio acorde..."
// }
```

> **Nota de privacidad:** Solo disponible con ≥ 50 sujetos en la cohorte.

---

## Caso de uso 5 — Batch (onboarding de segmento)

Para procesar un lote de usuarios existentes:

```typescript
const userIds = ['user1', 'user2', 'user3', ...] // hasta miles

const resultados = await vytalix.batchGetLatestBioAge(userIds)

for (const [userId, resultado] of resultados.entries()) {
  if (!resultado) continue  // sin assessment previo
  console.log(`${userId}: ${resultado.edadBiologica} años (${resultado.estado})`)
}
```

---

## Manejo de errores

```typescript
import { VytalixClient } from '@vytalix/disglobal-sdk'

try {
  const resultado = await vytalix.assessBioAge({ userId, age, sex: 'MASCULINO', mediciones })
} catch (err: any) {
  if (err.status === 401) {
    // API Key inválida o revocada
    alertar('Error de autenticación — contactar soporte@vytalix.health')
  } else if (err.status === 429) {
    // Rate limit o cuota mensual
    const retryAfter = err.body?.quota?.retryAfterSeconds ?? 60
    esperarYReintentar(retryAfter)
  } else if (err.status === 422) {
    // Error de validación — revisar mediciones
    console.error('Campos inválidos:', err.body?.errors)
  } else {
    // Error interno — reintentar con backoff
    console.error('Error Vytalix:', err.message)
  }
}
```

---

## Idempotencia

El SDK gestiona idempotencia automáticamente para assessments. Las llamadas repetidas dentro de 1 minuto para el mismo usuario devuelven el resultado cacheado sin re-procesar:

```typescript
// Estas dos llamadas producen el mismo resultado (no se cobra dos veces)
const r1 = await vytalix.assessBioAge({ userId: '123', ...mediciones })
const r2 = await vytalix.assessBioAge({ userId: '123', ...mediciones })  // idempotente
```

---

## Pseudonimización

El SDK convierte automáticamente los `userId` de Disglobal en referencias pseudónimas antes de enviarlas a Vytalix. **Vytalix nunca recibe el userId real** de un usuario de Disglobal:

```
userId: "disg_usr_00112"
                ↓ HMAC-SHA256 con tu API Key
subjectRef: "DISG-xK9mZ2pQr4aB"   ← solo esto llega a Vytalix
```

La pseudonimización es determinística: el mismo `userId` siempre produce el mismo `subjectRef`, permitiendo recuperar el historial del usuario.

---

## Variables de entorno necesarias

```bash
# .env (backend Disglobal)
VYTALIX_API_KEY=vyx_dis_k1_...    # Provisto por Vytalix
VYTALIX_BASE_URL=https://api.vytalix.health
```

---

## Headers devueltos por la API

| Header | Descripción |
|--------|-------------|
| `X-Correlation-ID` | ID de traza para debugging |
| `X-RateLimit-Limit` | Límite de tu tier (1000 req/min en PROFESSIONAL) |
| `X-RateLimit-Remaining` | Llamadas restantes en ventana actual |
| `X-Idempotent-Replayed` | `true` si la respuesta fue de caché |
| `X-Quota-Warning` | Presente si usaste >80% de tu cuota mensual |

---

## Soporte

- **Técnico:** integrations@vytalix.health
- **Slack:** canal `#vytalix-disglobal` (invitación por separado)
- **Sandbox:** https://sandbox.api.vytalix.health
- **Docs completos:** https://docs.vytalix.health
