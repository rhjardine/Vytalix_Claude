# Confirmación de pago — Fase 1

```
POST /api/v2/webhooks/payment
```

Es la única llamada firmada del paquete y la única en la que Disglobal notifica a
Vytalix. Disglobal cobra al usuario con su propia pasarela; Vytalix no participa en
el cobro. Cuando el pago se confirma, Disglobal invoca este endpoint para que el
servicio quede registrado y activado.

---

## 1. Firma

La autenticación es una firma HMAC-SHA256. **No es un header: viaja en el campo
`signature` del cuerpo de la petición.**

La firma es el digest hexadecimal de HMAC-SHA256 sobre el **cuerpo canónico**:
exactamente estas claves, en este orden, en JSON compacto y **excluyendo**
`signature`:

```
event, intentId, amount, currency, timestamp, subjectRef, metadata
```

Cualquier reordenación, espacio adicional o cambio de formato produce un digest
distinto y devuelve `401`.

Ejemplo de cuerpo canónico sobre el que se calcula la firma:

```json
{"event":"payment.confirmed","intentId":"intent-1754568000","amount":4900,"currency":"USD","timestamp":"2026-08-07T10:00:00.000Z","subjectRef":"DISG-8c1e5a","metadata":{"product":"FACIAL_SCAN"}}
```

**No escriba su firmador desde cero antes de ejecutar el de referencia.** El paquete
incluye dos implementaciones equivalentes:

```bash
BASE_URL=$BASE_URL DISGLOBAL_WEBHOOK_SECRET=$SECRETO ./examples/send-payment-webhook.sh
node ./examples/send-payment-webhook.js
```

El secreto se entrega por canal separado. Guárdelo en servidor; nunca en un paquete
de cliente.

---

## 2. Request

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| `event` | enum | sí | `payment.confirmed` · `payment.failed` · `payment.refunded` |
| `intentId` | string | sí | 1–128. Clave de deduplicación |
| `amount` | integer | sí | positivo. En la unidad mínima de la moneda |
| `currency` | string | sí | exactamente 3 caracteres |
| `timestamp` | string | sí | ISO-8601 |
| `subjectRef` | string | sí | 1–128. Referencia seudónima del usuario |
| `metadata` | object | no | mapa de `string` → `string`. Por defecto `{}` |
| `signature` | string | sí | digest hexadecimal HMAC-SHA256 |

```json
{
  "event": "payment.confirmed",
  "intentId": "intent-1754568000",
  "amount": 4900,
  "currency": "USD",
  "timestamp": "2026-08-07T10:00:00.000Z",
  "subjectRef": "DISG-8c1e5a",
  "metadata": { "product": "FACIAL_SCAN" },
  "signature": "d82a41125c840e744307eef7240f1206bb2097f1ee3d45bca91f74e4100e6397"
}
```

`metadata.product` es de vocabulario libre en esta fase: los valores se almacenan tal
como se envían. Acordar el vocabulario es una de las decisiones abiertas.

---

## 3. Respuesta correcta

**`200 OK`**

```json
{ "received": true, "replayed": false }
```

| Campo | Significado |
|---|---|
| `received` | La petición fue verificada y procesada |
| `replayed` | `false`: primer registro de este `intentId`. `true`: ya se conocía; no se volvió a procesar |

**Solo se devuelve `200` después del COMMIT en base de datos.** Un `200` significa
que el pago quedó registrado de forma duradera.

Envíe la misma petición dos veces y verá `replayed` pasar de `false` a `true`. Esa
transición es la garantía sobre la que puede apoyar su política de reintentos.

### Eventos que no confirman pago

`payment.failed` y `payment.refunded` se verifican y se reconocen con `200`, pero
**no producen ningún efecto**: no se persiste transacción y no se activa nada.

> Un reembolso se reconoce pero **no revoca el acceso al servicio** ya activado. El
> comportamiento esperado ante un reembolso es una decisión abierta.

---

## 4. Errores

| Código | Causa | Qué debe hacer Disglobal |
|---|---|---|
| `400` | El cuerpo no supera la validación de esquema. `detail` indica campo y motivo | Corregir la petición. **No reintentar sin cambios** |
| `401` | La firma no coincide | Revisar el secreto y el orden canónico de claves. **No reintentar sin cambios** |
| `500` | El pago **no** quedó registrado: fallo de persistencia, o secreto no configurado en el servidor | **Reintentar la misma petición** |

Los errores siguen el formato RFC 7807:

```json
{
  "type": "https://api.vytalix.health/errors/401",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid webhook signature",
  "correlationId": "7f3a1c92-0f4b-4e2a-9d61-2b8c5e0a1d34"
}
```

Obsérvese que este endpoint responde **`400`** ante un cuerpo inválido, mientras que
los endpoints del funnel responden `422`.

---

## 5. Reintentos

La política de reintentos es de Disglobal. La garantía que la sostiene es de
Vytalix:

- **`500` significa que no se registró nada.** Reenviar la misma petición es seguro.
- **Los duplicados son imposibles.** La deduplicación se apoya en una restricción
  `UNIQUE` sobre `intentId` en base de datos, no en una caché. Un reenvío con el
  mismo `intentId` devuelve `200` con `replayed: true` y no vuelve a procesar.
- **Reutilice el mismo `intentId` al reintentar.** Generar uno nuevo para el mismo
  pago crearía un segundo registro.
- **No reintente ante `400` ni `401`.** Son errores de construcción de la petición y
  se repetirán igual.

Recomendación: retroceso exponencial sobre `500` y sobre errores de red, con un
límite de intentos y registro del `correlationId` de cada respuesta.

---

## 6. Qué ocurre tras la confirmación

Una vez confirmado el COMMIT, Vytalix reconoce la petición y **después** publica el
evento de pago confirmado, que dispara la activación del servicio y el proceso de
notificación. Ese paso posterior es de mejor esfuerzo: si fallara, el pago ya está
registrado y la activación se resuelve por reconciliación. Un fallo ahí nunca
altera el resultado financiero ni el `200` ya emitido.

Dos límites de esta fase:

- **No hay notificación de retorno hacia Disglobal.** La activación no produce
  ninguna llamada saliente. Si Disglobal necesita confirmación, es alcance nuevo con
  su propio contrato.
- **No hay entrega real de correo ni SMS.** El proceso de notificación se ejecuta,
  pero el entorno de pruebas usa un proveedor de registro.
