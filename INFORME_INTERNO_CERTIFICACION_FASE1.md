# Informe interno — Certificación de la entrega Fase 1

**Uso interno. No forma parte del paquete enviado a Disglobal.**

Fecha: 7 de agosto de 2026
Alcance: certificación documental del paquete de entrega. No se modificó código de
producción.

---

## 1. Resultado de la certificación

La documentación previa describía un alcance de Fase 1 que **no se corresponde con
el estado del código**. Las tres piezas centrales de ese relato —recorrido público
de captación, confirmación de pago y análisis facial— no están operativas.

Se ha reconstruido el paquete de entrega sobre lo verificado.

---

## 2. Discrepancias encontradas entre documentación y código

| # | Afirmación en la documentación previa | Estado real | Evidencia |
|---|---|---|---|
| 1 | «Los cuatro endpoints del funnel están montados y operativos» | **Falso.** Rutas comentadas; `createFunnelRouter` no existe en el repositorio | `src/server.ts:27,132-133` |
| 2 | «`POST /api/v2/webhooks/payment`, firmado con HMAC, responde 200 tras el COMMIT» | **Falso.** La ruta no existe. Sin manejador, sin firma, sin control de duplicados | Sin coincidencias de `webhooks/payment`, `DISGLOBAL_WEBHOOK_SECRET`, `intentId` |
| 3 | «Reconocimiento facial AWS implementado, SDK instalado, solo falta configuración» | **Falso.** No hay dependencia ni código. Cualquier proveedor distinto de `mock` devuelve 501 | `src/api/handlers/funnel.handler.ts:300-307`; `package.json` |
| 4 | «`sandbox/tests/full-funnel.test.ts` pasa 8/8» | **Falso.** El archivo no existe. No hay ninguna prueba del funnel | `tests/` |
| 5 | Se referencian 15 documentos y 2 directorios (`examples/`, `postman/`) | **No existen** en el repositorio | Verificado |
| 6 | «Base URL de sandbox operativa» | **No aprovisionada.** El repositorio no contiene configuración de despliegue público | `docker-compose.yml`, `Dockerfile` |
| 7 | Respuesta de cohorte: `{"cohortTooSmall":true,"minimumRequired":50}` | **Campo incorrecto.** El real es `{"tooSmall":true,"note":"..."}` | `src/longevity/insights.service.ts:126-131` |
| 8 | `POST /api/v2/engagement/events` documentado sin código de estado | Devuelve **`202`**, no `200` | `src/api/handlers/external-v2.handler.ts:302` |
| 9 | Contrato OpenAPI: «Step 2: Run biophysical age assessment» | El manejador **no calcula**: persiste un resultado ya computado | `src/api/handlers/funnel.handler.ts:211-260` |
| 10 | Contrato OpenAPI declara `/api/funnel/*` como disponible | No montado | `src/server.ts:132` |

---

## 3. Riesgo reputacional identificado

Ordenado por gravedad.

| # | Riesgo | Origen | Tratamiento aplicado |
|---|---|---|---|
| R1 | Presentar como biometría un valor derivado de un hash de la cadena base64 | `funnel.handler.ts:267-277` | Declarado explícitamente en el documento de alcance, §2.1, con advertencia de no mostrarlo a usuario final |
| R2 | Prometer confirmación de pago transaccional inexistente | Documentación previa | Reclasificado como «no implementado» |
| R3 | Compromiso de respuesta «en menos de 24 horas hábiles» devuelto por la API | `funnel.handler.ts:416` | Señalado como compromiso humano no garantizado por el sistema. **Requiere decisión: validarlo o retirarlo del mensaje** |
| R4 | Uso del término «booking» para un traspaso a WhatsApp sin reserva de cupo | Código y documentación | Reformulado como «solicitud de consulta» en toda la entrega |
| R5 | Entregar una URL base que puede no resolver | Documentación previa | Marcada como no aprovisionada en el contrato y en el checklist |
| R6 | Ausencia de aviso de no-diagnóstico en material dirigido al integrador | Documentación previa | Aviso clínico incorporado en README, alcance y contrato |
| R7 | Endpoints administrativos de aprovisionamiento en un contrato de socio | `openapi/vytalix-platform-v2.yaml` | Eliminados de la copia externa |

---

## 4. Estado de construcción verificado

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.server.json` | **Falla.** 130 errores en 22 archivos |
| `npx vitest run` | 355/377 pruebas superadas; 15/23 archivos en verde |
| Motor biofísico (núcleo del servicio) | 42/42 superadas, sin dependencia de base de datos |

Desglose de los 22 fallos: 19 por ausencia de PostgreSQL en el entorno de
verificación; 2 archivos no cargan por módulos ausentes
(`../catalog/CatalogEngine`; ruta de esquemas dentales incorrecta).

`npm run api:build` no puede generar `dist/`. El servicio solo arranca mediante
`api:dev`, que omite la verificación de tipos.

---

## 5. Cambios realizados

### Añadido

| Archivo | Contenido |
|---|---|
| `entrega-disglobal-fase1/README.md` | Punto de entrada, en español |
| `entrega-disglobal-fase1/ALCANCE_FASE1_Y_CAPACIDADES_FUTURAS.md` | Disponible / pendiente / no implementado, con evidencia |
| `entrega-disglobal-fase1/CHECKLIST_INTEGRACION.md` | Verificación ejecutable por Disglobal |
| `entrega-disglobal-fase1/openapi/vytalix-platform-v2.yaml` | Copia del contrato, reconciliada |
| `entrega-disglobal-fase1.zip` | Paquete externo |
| `INFORME_INTERNO_CERTIFICACION_FASE1.md` | Este documento |

### Modificado

Únicamente la **copia** del contrato incluida en el paquete externo:

- rutas no montadas marcadas con `[NO DISPONIBLE EN FASE 1]` en su `summary`;
- bloque `info.description` reescrito con el estado verificado por ruta;
- `servers` reordenado: `localhost` primero, los dominios públicos marcados como no
  aprovisionados;
- etiqueta `Funnel` marcada como no montada;
- rutas `/admin/*` y su etiqueta eliminadas del contrato externo.

Validado: el YAML parsea, 12 rutas, sin referencias de esquema colgantes.

### No modificado

- Todo `src/`.
- El contrato original `openapi/vytalix-platform-v2.yaml`.
- `docs/`, `New_files_claude/`, `prisma/`, pruebas y configuración.

---

## 6. Acciones pendientes, por prioridad

### Bloqueantes antes de comprometer fecha con Disglobal

1. **Decidir si el recorrido de captación entra en Fase 1.** Requiere construir el
   enrutador ausente, montarlo, definir su autenticación y probarlo. Hoy no existe
   ninguna prueba de ese recorrido.
2. **Corregir el manifiesto de rutas del arranque.** `src/server.ts:186-191` imprime
   como disponibles cinco rutas que devuelven `404`. Cualquier ingeniero que arranque
   el servicio verá información falsa en el primer segundo. *No se ha modificado por
   la restricción de no tocar código de producción; debe corregirse.*
3. **Dejar en verde la compilación con verificación de tipos** (130 errores).
4. **Confirmar o aprovisionar la URL base** antes de que Disglobal planifique sobre
   ella.

### Alta

5. Decidir sobre la frase de «24 horas hábiles» devuelta por la API (R3).
6. Corregir el contrato original `openapi/vytalix-platform-v2.yaml` en el mismo
   sentido que la copia externa, para que ambos coincidan.
7. Reparar los dos archivos de prueba que no cargan por módulos ausentes.

### Media

8. Definir el contrato de la confirmación de pago si se mantiene en el alcance.
9. Resolver la decisión comercial sobre el vertical odontológico.
10. Implementar el control efectivo de límites por volumen.

---

## 7. Nota sobre el material previo

El material de integración anterior no debe reenviarse a Disglobal: describe como
disponibles capacidades que no lo están, y sus instrucciones de verificación
apuntan a archivos y rutas inexistentes. El paquete `entrega-disglobal-fase1.zip`
lo reemplaza en su totalidad.
