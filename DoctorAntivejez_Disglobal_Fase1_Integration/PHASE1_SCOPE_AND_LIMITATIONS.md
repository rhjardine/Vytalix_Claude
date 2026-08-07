# Alcance y limitaciones — Fase 1

Define el límite de la primera integración entre Doctor Antivejez y Disglobal.
Lo que aparece como no incluido no es un defecto: es alcance reservado para fases
posteriores.

---

## Incluido

Cinco endpoints, verificados contra el servicio en ejecución.

| Servicio | Endpoint | Qué hace |
|---|---|---|
| Registro de interesado | `POST /api/funnel/leads` | Registra el contacto y devuelve un `id` para correlacionar el resto del recorrido |
| Escáner facial | `POST /api/funnel/facial-analysis` | Recibe una imagen en base64 y devuelve un resultado estructurado con el campo `provider` |
| Cuestionario preventivo | `POST /api/funnel/vitality-assessment` | Almacena el resultado calculado por Disglobal y devuelve un `id` |
| Solicitud de consulta | `POST /api/funnel/booking` | Registra la solicitud y devuelve un código de confirmación y un enlace de WhatsApp |
| Confirmación de pago | `POST /api/v2/webhooks/payment` | Verifica la firma HMAC, persiste el pago y dispara la activación |

Garantías del webhook de pago: la respuesta es `200` solo después del COMMIT en base
de datos, y la deduplicación se apoya en una restricción `UNIQUE` sobre `intentId`,
de modo que un reenvío idéntico no puede activar el servicio dos veces.

---

## No incluido

### Análisis biométrico facial en producción

**Fase 1:** el endpoint está operativo y devuelve una respuesta estructuralmente
completa. El proveedor activo por defecto es `mock`, que deriva los valores de los
bytes de la imagen recibida y **no realiza análisis facial**. Toda respuesta lleva
el campo `provider`.

**Consecuencia:** integre el endpoint ahora, pero lea `provider` antes de mostrar
cualquier valor a un usuario final. La forma de la respuesta no cambia cuando se
habilite un proveedor real; cambian el valor de `provider` y la precisión de los
números.

### Cálculo del cuestionario en servidor

**Fase 1:** Disglobal calcula `score`, `category`, `yearsBiological` y las cinco
dimensiones. El endpoint las persiste sin recalcular y devuelve solo un
identificador. Las respuestas en crudo viajan en `answersPayload` a efectos de
registro; no son entrada de ningún cálculo.

**Consecuencia:** el algoritmo de puntuación es responsabilidad de Disglobal en esta
fase. Es la partida de mayor peso en una estimación.

### Agenda automática

**Fase 1:** el endpoint de consulta registra la solicitud y devuelve un código de
confirmación con un enlace de WhatsApp. No hay calendario, ni reserva de cupo, ni
verificación de disponibilidad. `preferredDate` y `preferredTime` se capturan como
preferencias.

**Consecuencia:** muestre el código y el enlace, o el recorrido del usuario termina
sin vía de continuación.

### Asignación de médico o centro

No disponible en ninguna forma en esta fase. La asignación ocurre en el traspaso por
WhatsApp.

### Notificación de retorno hacia Disglobal

Tras la activación, Vytalix no emite ninguna llamada de vuelta hacia Disglobal.

### Entrega real de notificaciones

El proceso posterior al pago se ejecuta, pero el entorno de pruebas está configurado
con un proveedor de registro. No se entrega correo ni SMS, de modo que el contenido
y la entregabilidad de los mensajes no pueden validarse en esta fase.

### Catálogo comercial y verticales adicionales

Fuera de esta integración.

---

## Estado de seguridad actual

| Superficie | Fase 1 |
|---|---|
| Los cuatro endpoints del funnel | **Sin autenticación de socio** |
| Confirmación de pago | HMAC-SHA256 sobre el cuerpo canónico |
| Límites de tasa y cuotas | Registrados en la credencial, **no aplicados** |
| Transporte | HTTPS público. Sin VPN, túnel ni lista de IP |

Que los endpoints del funnel no requieran autenticación es el estado actual, no un
compromiso. **Mantenga la URL base y un eventual header de autenticación en
configuración, no en código**, para que añadir una credencial más adelante sea un
cambio de configuración.

---

## Decisiones abiertas

Cada una tiene una consecuencia técnica concreta y requiere respuesta de ambas
partes.

| Decisión | Estado técnico actual |
|---|---|
| Consulta online frente a presencial | Ningún campo del esquema de `booking` expresa la modalidad. `consultationType` selecciona la materia de la consulta, no el canal |
| Notificación de retorno tras la activación | No implementada |
| Comportamiento ante un reembolso | El evento se reconoce, pero no revoca el acceso al servicio |
| Vocabulario de `metadata.product` | Libre; los valores se almacenan tal como se envían |
| Mecanismo y fecha de autenticación del funnel | Abierto |
| Si el análisis biométrico real entra en el lanzamiento | Abierto |

---

## Resumen para planificación

**Puede construirse ya, sin depender de Doctor Antivejez ni de Vytalix:** el
cuestionario y su cálculo, la interfaz de captura facial, la presentación del
resultado, la selección de servicio, el manejo de referencias de usuario y el
tratamiento de errores.

**Requiere credencial:** únicamente la firma del webhook de pago.

**Requiere decisión conjunta:** los seis puntos de la tabla anterior.
