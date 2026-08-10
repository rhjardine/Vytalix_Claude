# Doctor Antivejez × Disglobal — Integración Fase 1

Paquete de integración inicial para el **Marketplace Vita App** de Disglobal.

**Doctor Antivejez** aporta el producto y el servicio de salud preventiva.
**Disglobal** es el integrador tecnológico y comercial.
**Vytalix** es la plataforma tecnológica y el motor de servicios API que soporta los
productos digitales de Doctor Antivejez.

Este paquete describe únicamente los servicios de la Fase 1. No documenta el resto
de la plataforma.

---

## Qué recibe Disglobal

Cinco endpoints para construir el recorrido del usuario en la app:

| Servicio | Endpoint | Autenticación |
|---|---|---|
| Registro de interesado | `POST /api/funnel/leads` | ninguna |
| Escáner facial | `POST /api/funnel/facial-analysis` | ninguna |
| Cuestionario preventivo | `POST /api/funnel/vitality-assessment` | ninguna |
| Solicitud de consulta | `POST /api/funnel/booking` | ninguna |
| Confirmación de pago | `POST /api/v2/webhooks/payment` | HMAC-SHA256 |

Los cuatro primeros los llama Disglobal durante el recorrido del usuario. El quinto
lo llama Disglobal cuando su pasarela confirma un pago, para que el servicio quede
registrado y activado.

Transporte: HTTPS público. No requiere VPN, túnel ni lista de IP autorizadas.

---

## Reparto de responsabilidades

| Responsabilidad | Titular |
|---|---|
| Usuario, interfaz y recorrido en la app | Disglobal |
| Captura de la imagen facial | Disglobal |
| Cálculo del resultado del cuestionario | Disglobal |
| Cobro al usuario y pasarela de pago | Disglobal |
| Firma del webhook de confirmación | Disglobal |
| Persistencia de cada paso | Vytalix |
| Verificación del pago y activación del servicio | Vytalix |
| Metodología clínica | Doctor Antivejez |

El cálculo del cuestionario es responsabilidad de Disglobal en esta fase: el
endpoint recibe un resultado ya calculado y lo almacena sin recalcularlo.

---

## Documentación

| Documento | Qué responde |
|---|---|
| `PHASE1_SCOPE_AND_LIMITATIONS.md` | Qué está incluido y qué no |
| `FUNNEL_API_REFERENCE.md` | Los cuatro endpoints del funnel: request, response y errores |
| `PAYMENT_AND_NOTIFICATION_FLOW.md` | Confirmación de pago: firma, respuestas y reintentos |

## Artefactos técnicos

| Ruta | Contenido |
|---|---|
| `openapi/vytalix-platform-v2.yaml` | Contrato de la API, recortado a los endpoints de Fase 1 |
| `postman/vytalix_postman_collection.json` | Colección ejecutable |
| `examples/send-payment-webhook.sh` · `.js` | Firma HMAC de referencia |

---

## Cómo iniciar la integración

**1. Confirme la URL base.**

| Entorno | URL |
|---|---|
| Local | `http://localhost:3001` — único entorno verificado en esta entrega |
| Sandbox | Pendiente de confirmación por escrito |

**2. Compruebe disponibilidad.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE_URL/liveness
```

**3. Importe el contrato.** `openapi/vytalix-platform-v2.yaml` sirve para generar
cliente o importar en Postman. La colección incluida ya trae las llamadas listas.

**4. Construya los cuatro endpoints del funnel.** No requieren credencial, así que
puede empezar de inmediato. Detalle campo por campo en `FUNNEL_API_REFERENCE.md`.

**5. Solicite el secreto del webhook.** Es lo único que bloquea la confirmación de
pago. Se entrega por canal separado, nunca por correo ni por tickets.

Antes de escribir su propio firmador, ejecute el ejemplo incluido y reprodúzcalo:

```bash
BASE_URL=$BASE_URL DISGLOBAL_WEBHOOK_SECRET=$SECRETO ./examples/send-payment-webhook.sh
```

---

## Qué queda fuera de esta fase

- Cálculo del cuestionario en servidor.
- Análisis biométrico facial en producción. El proveedor activo por defecto es
  `mock`.
- Gestión de agenda, reserva de cupos y asignación de médico o centro.
- Notificación de retorno desde Vytalix hacia Disglobal tras la activación.
- Entrega real de correo o SMS.
- Catálogo comercial y verticales adicionales.

El detalle está en `PHASE1_SCOPE_AND_LIMITATIONS.md`.

---

## Soporte

Para cualquier incidencia, indique el header `X-Correlation-ID` de la respuesta y el
código de estado HTTP. Con esos dos datos se localiza la petición exacta.

No envíe credenciales por el canal de soporte.

---

## Aviso

La evaluación digital preventiva es una aproximación basada en hábitos y mediciones
declaradas. **No constituye un diagnóstico médico y no sustituye la consulta médica
presencial.** Determinar la edad biológica con validez clínica requiere evaluación
profesional directa.
