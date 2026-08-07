# Checklist de integración — Fase 1

**Destinatario:** Disglobal
**Propósito:** permitir que un ingeniero de Disglobal verifique de forma
independiente lo que esta entrega afirma.

Todas las comprobaciones se ejecutan sobre los endpoints **efectivamente montados**.
Las rutas declaradas como pendientes en `ALCANCE_FASE1_Y_CAPACIDADES_FUTURAS.md`
no forman parte de este checklist porque hoy responden `404`.

---

## Sección A — Requisitos previos

| # | Comprobación | Estado |
|---|---|---|
| A1 | Node.js 20 o superior disponible | ☐ |
| A2 | PostgreSQL 15 accesible mediante `DATABASE_URL` | ☐ |
| A3 | Redis accesible | ☐ |
| A4 | Clave de API recibida por canal seguro | ☐ |
| A5 | `subjectRef` de prueba aprovisionado y confirmado por Vytalix | ☐ |
| A6 | URL base confirmada por escrito con Vytalix | ☐ |

> **A6 no es un trámite.** Este repositorio no incluye configuración de despliegue
> que publique un dominio accesible desde Internet. Confirme la URL antes de
> planificar sobre ella.

```bash
export VYTALIX_BASE_URL=<url confirmada por Vytalix>
export VYTALIX_API_KEY=<clave recibida por canal seguro>
export SUBJ=<subjectRef aprovisionado>
```

---

## Sección B — Disponibilidad del servicio

| # | Comprobación | Resultado esperado | Estado |
|---|---|---|---|
| B1 | `GET /liveness` | `200` | ☐ |
| B2 | `GET /readiness` | `200` con base de datos y Redis accesibles | ☐ |
| B3 | Encabezado `X-Correlation-ID` presente en la respuesta | Presente en toda respuesta | ☐ |

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$VYTALIX_BASE_URL/liveness"
curl -si "$VYTALIX_BASE_URL/readiness" | grep -i x-correlation-id
```

`/liveness` no consulta dependencias. `/readiness` sí: un `200` aquí confirma que
la base de datos y Redis responden.

---

## Sección C — Autenticación

| # | Comprobación | Resultado esperado | Estado |
|---|---|---|---|
| C1 | Llamada sin `X-API-Key` | `401` | ☐ |
| C2 | Llamada con clave inválida | `401` | ☐ |
| C3 | Llamada con clave válida, alcance insuficiente | `403` | ☐ |
| C4 | Más de 20 fallos de autenticación por minuto desde una IP | `429` | ☐ |

```bash
# C1
curl -s -o /dev/null -w '%{http_code}\n' "$VYTALIX_BASE_URL/api/v2/insights/cohort"

# C2
curl -s -o /dev/null -w '%{http_code}\n' "$VYTALIX_BASE_URL/api/v2/insights/cohort" \
  -H "X-API-Key: clave-invalida"
```

El cuerpo de la respuesta es idéntico para clave ausente, inválida o revocada. Es
intencional: no revela cuál de los tres casos ocurrió.

> El `429` de C4 corresponde a **protección contra fuerza bruta en la
> autenticación**. No es un límite de tasa de uso: el control de cuota por volumen
> no está implementado.

---

## Sección D — Cálculo de edad biológica

Es el servicio central de esta entrega.

| # | Comprobación | Resultado esperado | Estado |
|---|---|---|---|
| D1 | `POST /api/v2/vitality/assess` con carga válida | `200` con `biologicalAge` | ☐ |
| D2 | La respuesta incluye `algorithmVersion` | Presente | ☐ |
| D3 | `GET /api/v2/vitality/{subjectRef}` devuelve el mismo `assessmentId` | Coincide | ☐ |
| D4 | Repetición con el mismo `X-Idempotency-Key` | Repite la respuesta almacenada | ☐ |
| D5 | Carga inválida | `422` con detalle en `errors[]` | ☐ |
| D6 | `subjectRef` inexistente | `404` | ☐ |

```bash
curl -s -X POST "$VYTALIX_BASE_URL/api/v2/vitality/assess" \
  -H "X-API-Key: $VYTALIX_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "subjectRef": "'"$SUBJ"'",
    "chronologicalAge": 45,
    "biologicalSex": "MALE",
    "isAthlete": false,
    "measurements": {
      "fatPercentage": 24.0,
      "bmi": 27.0,
      "digitalReflexes":     { "high": 1.7, "long": 1.7, "width": 1.7 },
      "visualAccommodation": 1.0,
      "staticBalance":       { "high": 3.0, "long": 3.5, "width": 2.8 },
      "skinHydration": 32,
      "systolicPressure": 132,
      "diastolicPressure": 85
    }
  }'
```

### Punto crítico sobre las unidades

`digitalReflexes` y `staticBalance` son **una medición con tres dimensiones**, no
tres intentos repetidos. El motor las reduce **al producto** de sus tres
componentes antes de consultar los baremos.

| Medición | Reducción | Orden de magnitud esperado |
|---|---|---|
| `digitalReflexes` | `high × long × width` | 1 – 5 |
| `staticBalance` | `high × long × width` | 10 – 40 |

Enviar valores un orden de magnitud por encima **no produce error**: la respuesta
sigue siendo `200` y la edad biológica resultante carece de sentido. Verifique el
orden de magnitud antes de dar por válida la integración.

### Campos de la respuesta

| Campo | Significado |
|---|---|
| `assessmentId` | Identificador del cálculo almacenado |
| `biologicalAge` | Edad calculada, en años |
| `differentialAge` | `biologicalAge − chronologicalAge`; negativo indica menor que la edad cronológica |
| `ageStatus` | `REJUVENECIDO` · `NORMAL` · `ENVEJECIDO` |
| `partialAges` | Aportación por marcador |
| `algorithmVersion` | Los resultados solo son comparables dentro de una misma versión. Regístrelo |
| `assessedAt` | Marca temporal |

---

## Sección E — Puntaje preventivo y derivación

| # | Comprobación | Resultado esperado | Estado |
|---|---|---|---|
| E1 | `POST /api/v2/preventive/score` con datos suficientes | `200` con el puntaje | ☐ |
| E2 | Mismo endpoint con datos insuficientes | `202` con `{"message":"Insufficient data for score"}` | ☐ |
| E3 | `GET /api/v2/referral/{subjectRef}` | `200` con `eligible` | ☐ |

```bash
curl -s -X POST "$VYTALIX_BASE_URL/api/v2/preventive/score" \
  -H "X-API-Key: $VYTALIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subjectRef": "'"$SUBJ"'"}'
```

> **`202` no es un error y no debe reintentarse.** Significa «aceptado, sin datos
> suficientes para calcular todavía». El puntaje compuesto requiere al menos dos de
> sus cuatro componentes.

---

## Sección F — Interacción y métricas poblacionales

| # | Comprobación | Resultado esperado | Estado |
|---|---|---|---|
| F1 | `POST /api/v2/engagement/events` | **`202`** con `{"accepted": n}` | ☐ |
| F2 | `GET /api/v2/insights/cohort` con menos de 50 sujetos | `200` con `{"tooSmall": true, "note": "..."}` | ☐ |

```bash
curl -s "$VYTALIX_BASE_URL/api/v2/insights/cohort" \
  -H "X-API-Key: $VYTALIX_API_KEY"
```

> **F1 devuelve `202`, no `200`.** El registro de eventos es asíncrono.
>
> **F2 devuelve `tooSmall`,** no `cohortTooSmall`. Los agregados poblacionales se
> retienen por debajo de 50 sujetos por privacidad; la respuesta es correcta, no un
> fallo.

---

## Sección G — Manejo de errores

| Código | Significado | Acción |
|---|---|---|
| `401` | Clave ausente, inválida, expirada o revocada | Detener. Contactar con Vytalix. No reintentar en bucle |
| `403` | Clave válida sin el alcance requerido | Detener. Solicitar ampliación de alcance |
| `404` | El `subjectRef` no existe, o el sujeto no tiene cálculos | Distinga ambos casos por el mensaje |
| `422` | Validación fallida | Corregir la carga. `errors[]` indica los campos |
| `429` | Exceso de fallos de autenticación | Esperar 60 segundos. Revisar la clave |
| `5xx` | Error interno | Registrar `correlationId` y remitirlo a soporte |

Todas las respuestas de error siguen el formato RFC 7807:
`type`, `title`, `status`, `detail`, `correlationId`.

| # | Comprobación | Estado |
|---|---|---|
| G1 | El cliente registra `X-Correlation-ID` en todas las respuestas | ☐ |
| G2 | El cliente distingue `202` de `200` y no lo trata como error | ☐ |
| G3 | El cliente no reintenta ante `401` ni `403` | ☐ |
| G4 | La clave de API se almacena en servidor, nunca en el cliente | ☐ |

---

## Sección H — Confirmaciones previas a producción

Estos puntos **no son verificables por Disglobal**: requieren respuesta escrita de
Vytalix.

| # | Punto a confirmar | Estado |
|---|---|---|
| H1 | URL de producción y procedimiento de emisión de credenciales | ☐ |
| H2 | Si el recorrido público de captación entra en el alcance, y en qué plazo | ☐ |
| H3 | Quién construye la confirmación de pago y bajo qué contrato | ☐ |
| H4 | Si el análisis facial tendrá un proveedor real y su contrato de datos | ☐ |
| H5 | Titular de la agenda tras registrar una solicitud de consulta | ☐ |
| H6 | Comportamiento esperado ante un reembolso | ☐ |
| H7 | Volumen previsto y política de límites aplicable | ☐ |
| H8 | Estado de la compilación con verificación de tipos | ☐ |

> **H8.** Hoy la compilación con verificación de tipos no está en verde y el
> servicio arranca en modo de transpilación directa, que omite esa verificación.
> Debe resolverse antes de un despliegue productivo.

---

## Criterio de cierre

La integración de Fase 1 se considera verificada cuando las secciones **B, C, D, E,
F y G** están completas y la sección **H** tiene respuesta escrita.

Las secciones A6, H1 y H8 son bloqueantes para producción.
