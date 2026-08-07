# Alcance Fase 1 y capacidades futuras

**Destinatario:** Disglobal
**Fecha de verificación:** 7 de agosto de 2026

Este documento distingue tres categorías, sin ambigüedad:

| Categoría | Significado |
|---|---|
| **Disponible** | Montado en el servidor, con código presente y verificado |
| **Pendiente** | Código presente, pero no expuesto o no operativo |
| **No implementado** | Sin código funcional. Corresponde a fases posteriores |

La verificación se realizó sobre el código fuente. Cada afirmación indica el archivo
y la línea que la sustenta.

---

## 1. Estado verificado, ruta por ruta

### 1.1 Disponible

| Ruta | Método | Autenticación | Alcance requerido |
|---|---|---|---|
| `/liveness` | GET | Ninguna | — |
| `/readiness` | GET | Ninguna | — |
| `/health` | GET | Ninguna | — |
| `/metrics` | GET | Ninguna | — |
| `/metrics/prometheus` | GET | Ninguna | — |
| `/api/v2/vitality/assess` | POST | `X-API-Key` | `vitality:write` |
| `/api/v2/vitality/{subjectRef}` | GET | `X-API-Key` | `vitality:read` |
| `/api/v2/preventive/score` | POST | `X-API-Key` | `preventive:write` |
| `/api/v2/referral/{subjectRef}` | GET | `X-API-Key` | `referral:read` |
| `/api/v2/engagement/events` | POST | `X-API-Key` | `engagement:write` |
| `/api/v2/insights/cohort` | GET | `X-API-Key` | `insights:read` |

Evidencia: montaje en `src/server.ts:125-129` y `src/server.ts:136`; definición de
rutas y alcances en `src/api/handlers/external-v2.handler.ts:171-311`.

En este conjunto **Vytalix calcula el resultado**. Disglobal envía mediciones y
recibe un valor computado.

### 1.2 Pendiente de habilitación

| Ruta | Método | Estado real |
|---|---|---|
| `/api/funnel/leads` | POST | Manejador escrito; **ruta no montada** |
| `/api/funnel/vitality-assessment` | POST | Manejador escrito; **ruta no montada** |
| `/api/funnel/facial-analysis` | POST | Manejador escrito; **ruta no montada** |
| `/api/funnel/booking` | POST | Manejador escrito; **ruta no montada** |
| `/api/exchange-rate` | GET | Manejador ausente; **ruta no montada** |

Evidencia: `src/server.ts:132-133`, líneas comentadas. La importación
correspondiente está comentada en `src/server.ts:27`.

Los manejadores existen como funciones exportadas en
`src/api/handlers/funnel.handler.ts` (`handleSubmitLead`, `handleSubmitAssessment`,
`handleFacialAnalysis`, `handleBooking`), pero **no existe el enrutador que las
conecta**: la función `createFunnelRouter` no está definida en ningún punto del
repositorio.

**Consecuencia operativa:** cualquier llamada a `/api/funnel/*` responde `404`.

### 1.3 No implementado

| Capacidad | Estado |
|---|---|
| `POST /api/v2/webhooks/payment` | **No existe en el código.** Sin ruta, sin manejador, sin firma HMAC, sin control de duplicados |
| Activación de servicio tras el pago | No existe |
| Notificación posterior a la activación | No existe |
| Reconocimiento facial con proveedor externo | No existe |
| Gestión de agenda o reserva de cupos | No existe |
| Notificación de retorno de Vytalix hacia Disglobal | No existe |
| Aplicación de límites de tasa o cuota | No existe |
| Reversión de acceso ante un reembolso | No existe |

Evidencia: la búsqueda de `webhooks/payment`, `DISGLOBAL_WEBHOOK_SECRET` e
`intentId` en el árbol de código no arroja ninguna coincidencia. El contrato
`openapi/vytalix-platform-v2.yaml` tampoco define esta ruta.

---

## 2. Precisiones sobre tres puntos sensibles

Los siguientes tres puntos han sido descritos con anterioridad de forma que puede
inducir a error. Se corrigen aquí de forma explícita.

### 2.1 Análisis facial

El manejador `handleFacialAnalysis` (`src/api/handlers/funnel.handler.ts:279-339`)
tiene un único modo operativo: `VISION_PROVIDER=mock`.

En ese modo, el valor `estimatedAge` se deriva de una **función hash determinista
sobre los primeros 120 caracteres de la cadena base64 recibida**
(`src/api/handlers/funnel.handler.ts:267-277`). No hay detección de rostro, ni
biometría, ni modelo de visión.

Con cualquier otro valor de `VISION_PROVIDER`, el endpoint responde **`501`**
(`src/api/handlers/funnel.handler.ts:303-306`).

No existe integración con ningún proveedor de visión por computador. El repositorio
no declara dependencia alguna de SDK de visión ni contiene referencias a servicios
de reconocimiento facial.

> **El valor devuelto no describe a la persona fotografiada.** No debe mostrarse a
> un usuario final ni presentarse como resultado de un análisis facial.

### 2.2 Agendamiento

El manejador `handleBooking` (`src/api/handlers/funnel.handler.ts:353-422`)
**registra una solicitud y genera un enlace de WhatsApp**. Persiste el registro con
estado `WHATSAPP_ONLY` y canal `WHATSAPP`.

No reserva un cupo. No consulta disponibilidad. No existe integración de calendario.

El texto que el manejador devuelve incluye la frase *«Un especialista te contactará
en menos de 24 horas hábiles»* (`src/api/handlers/funnel.handler.ts:416`). **Ese
plazo es un compromiso operativo humano, no una garantía del sistema.** Debe
validarse con el área responsable antes de mostrarse a un usuario final, o
retirarse del mensaje.

### 2.3 Cuestionario preventivo

El manejador `handleSubmitAssessment` (`src/api/handlers/funnel.handler.ts:211-260`)
**no calcula nada**. Recibe `score`, `category`, `yearsBiological` y las cinco
dimensiones ya computadas, los persiste y devuelve un identificador.

Existe una discrepancia con el contrato `openapi/vytalix-platform-v2.yaml:245`, que
describe esta operación como *«Step 2: Run biophysical age assessment»*. **Esa
descripción no corresponde al comportamiento del código.** El cálculo, en esta
ruta, es responsabilidad de Disglobal.

Nota: el cálculo de edad biológica **sí** lo realiza Vytalix, pero en una ruta
distinta —`POST /api/v2/vitality/assess`— y a partir de mediciones biofísicas, no
de un cuestionario.

---

## 3. Reparto de responsabilidades

| Responsabilidad | Titular |
|---|---|
| Identidad de usuario, interfaz y recorrido | Disglobal |
| Captura de mediciones | Disglobal |
| Cobro al usuario | Disglobal |
| Cálculo de edad biológica a partir de mediciones | Vytalix |
| Puntaje preventivo compuesto | Vytalix |
| Evaluación de derivación | Vytalix |
| Persistencia de los cálculos | Vytalix |
| Metodología clínica y validación | Doctor Antivejez |

---

## 4. Estado de construcción y pruebas

Verificado el 7 de agosto de 2026 sobre el árbol de código entregado.

| Comprobación | Resultado |
|---|---|
| `npm run api:build` (compilación con verificación de tipos) | **Falla.** 130 errores de tipo en 22 archivos |
| `npm run api:dev` (ejecución sin verificación de tipos) | Ejecuta |
| Pruebas automatizadas | 355 de 377 pruebas superadas; 15 de 23 archivos de prueba en verde |

Sobre las 22 pruebas no superadas:

- **19** fallan por ausencia de PostgreSQL en el entorno de verificación
  (`ECONNREFUSED 127.0.0.1:5432`). Son dependientes de infraestructura, no
  necesariamente defectos de lógica.
- **2 archivos** no llegan a cargarse por módulos ausentes: uno requiere un motor de
  catálogo que no está en el árbol de código; el otro, una ruta de esquemas del
  vertical odontológico que no existe. Ninguno afecta a los endpoints disponibles
  descritos en la sección 1.1.

El motor de cálculo biofísico —núcleo del servicio— supera sus **42 pruebas** sin
dependencia de base de datos (`tests/biophysics-engine.test.ts`).

**No existe ninguna prueba automatizada del recorrido de captación.**

> La compilación con verificación de tipos debe quedar en verde antes de un
> despliegue productivo. Hoy el servicio solo arranca en modo de transpilación
> directa, que omite esa verificación.

---

## 5. Entornos

| Entorno | Estado |
|---|---|
| Local | Operativo mediante `docker-compose` y `npm run api:dev` |
| Sandbox con URL pública | **No aprovisionado en este repositorio** |
| Producción | No aprovisionado |

El repositorio **no contiene configuración de despliegue** que publique un dominio
accesible desde Internet. Cualquier URL de sandbox comunicada previamente debe
confirmarse con Vytalix antes de utilizarla como base de una planificación.

---

## 6. Capacidades futuras

Las siguientes capacidades están diseñadas o parcialmente construidas, pero **no
forman parte de esta entrega**. Se enumeran para planificación, sin compromiso de
fecha.

| Capacidad | Situación actual | Requisito para habilitarla |
|---|---|---|
| Recorrido público de captación | Manejadores escritos | Construir el enrutador, montarlo, definir autenticación y probarlo |
| Confirmación de pago y activación | Sin código | Diseño de contrato, firma, control de duplicados y transaccionalidad |
| Análisis facial real | Sin código | Selección de proveedor, contrato de datos, decisión sobre tratamiento de imágenes |
| Agenda y reserva de cupos | Sin código | Definición del titular del calendario |
| Notificación de retorno hacia Disglobal | Sin código | Contrato de reintentos y autenticación |
| Límites de tasa y cuota | Solo registro de nivel | Implementación del control efectivo |
| Vertical odontológico | Montado en `/api/v2/dental/*` | Decisión comercial |

---

## 7. Decisiones pendientes que condicionan la planificación

Ninguna de estas decisiones es técnica. Todas afectan al alcance y al calendario.

1. ¿Se habilita el recorrido público de captación dentro de la Fase 1, o se difiere?
2. ¿Quién construye la confirmación de pago, y bajo qué contrato?
3. ¿El resultado del análisis facial debe ser visible para el usuario final? Si la
   respuesta es afirmativa, se requiere un proveedor real.
4. ¿Quién es el titular de la agenda una vez registrada la solicitud?
5. ¿Qué comportamiento se espera ante un reembolso?
6. ¿Cuál es el volumen previsto y qué política de límites debe aplicarse?
7. ¿El vertical odontológico entra en el alcance?

---

## 8. Aviso clínico

Una valoración digital no constituye un diagnóstico médico. Los resultados
producidos por esta plataforma tienen carácter informativo y orientador: sirven para
dirigir a una persona hacia una consulta profesional, no para sustituirla.

La determinación de edad biológica con validez clínica requiere evaluación
presencial.
