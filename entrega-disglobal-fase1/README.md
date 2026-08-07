# Vytalix — Paquete de Integración Fase 1

**Destinatario:** Disglobal
**Versión del paquete:** 1.0
**Fecha:** 7 de agosto de 2026

---

## Propósito de este documento

Este paquete describe **el estado verificado** de la plataforma Vytalix para la
integración con Disglobal. Cada afirmación técnica fue comprobada contra el código
fuente en la fecha indicada.

Cuando una capacidad está diseñada pero no operativa, se declara como **pendiente**.
No se presenta como disponible.

---

## Resumen en una página

Vytalix expone hoy un conjunto de servicios de cálculo clínico preventivo mediante
API REST autenticada por clave (`X-API-Key`). Esos servicios están montados,
responden y cuentan con pruebas automatizadas.

El recorrido público de captación (escaneo facial, cuestionario, agendamiento) y la
confirmación de pago **no están operativos en esta entrega**. El detalle y el motivo
están en `ALCANCE_FASE1_Y_CAPACIDADES_FUTURAS.md`.

| Bloque | Estado |
|---|---|
| Motor de edad biológica y puntaje preventivo (`/api/v2/*`) | **Disponible** |
| Endpoints de observabilidad (`/liveness`, `/readiness`, `/metrics`) | **Disponible** |
| Recorrido público de captación (`/api/funnel/*`) | **Pendiente de habilitación** |
| Confirmación de pago por webhook | **No implementado** |
| Reconocimiento facial con proveedor externo | **No implementado** |
| Vertical odontológico (`/api/v2/dental/*`) | Montado; decisión comercial pendiente |

---

## Contenido del paquete

| Archivo | Qué responde | Lectura |
|---|---|---|
| `README.md` (este archivo) | ¿Qué recibo y por dónde empiezo? | 3 min |
| `ALCANCE_FASE1_Y_CAPACIDADES_FUTURAS.md` | ¿Qué está disponible, qué está pendiente y con qué evidencia? | 12 min |
| `CHECKLIST_INTEGRACION.md` | ¿Cómo verifico por mí mismo lo que se afirma aquí? | 10 min |
| `openapi/vytalix-platform-v2.yaml` | Contrato de la API en formato legible por máquina | referencia |

Tiempo total de revisión estimado: **25 minutos**.

---

## Qué puede probar Disglobal de inmediato

Con una clave de API y una instancia con base de datos aprovisionada:

1. Cálculo de edad biológica a partir de ocho mediciones biofísicas.
2. Lectura del último cálculo asociado a un sujeto.
3. Puntaje preventivo compuesto.
4. Evaluación de derivación a consulta.
5. Registro de eventos de interacción.
6. Métricas poblacionales anonimizadas.

El procedimiento exacto, con las llamadas y las respuestas esperadas, está en
`CHECKLIST_INTEGRACION.md`.

---

## Qué NO incluye esta entrega

- Endpoints públicos de captación en funcionamiento.
- Webhook de confirmación de pago y activación automática de servicio.
- Análisis facial con proveedor de visión externo.
- Gestión de agenda o reserva de cupos.
- Notificación de retorno desde Vytalix hacia Disglobal.
- Entorno de producción con URL pública y credenciales emitidas.

Cada uno de estos puntos está desarrollado en
`ALCANCE_FASE1_Y_CAPACIDADES_FUTURAS.md`, sección 3.

---

## Requisitos para ejecutar la verificación

| Requisito | Detalle |
|---|---|
| Node.js | 20 o superior |
| PostgreSQL | 15, accesible mediante `DATABASE_URL` |
| Redis | Requerido para idempotencia y control de autenticación |
| Clave de API | Emitida por Vytalix, con los alcances de la sección 4 del documento de alcance |
| Referencia de sujeto | Un `subjectRef` aprovisionado en el entorno de prueba |

Las credenciales se entregan por canal separado. No se incluyen en este paquete ni
deben transmitirse por correo o sistemas de tickets.

---

## Aviso clínico

Los resultados que produce esta plataforma son **estimaciones de carácter
informativo y preventivo**. No constituyen un diagnóstico médico ni sustituyen la
evaluación clínica presencial. La determinación de edad biológica con validez
clínica requiere valoración profesional directa.

La metodología clínica de referencia corresponde a Doctor Antivejez. Vytalix
implementa el cálculo; la validación clínica no es competencia de la capa técnica.

---

## Soporte

Para cualquier incidencia, indicar:

- el encabezado `X-Correlation-ID` devuelto en la respuesta;
- el código de estado HTTP recibido;
- la ruta invocada.

Esos tres datos permiten localizar la solicitud exacta. **Nunca envíe credenciales
por el canal de soporte.**
