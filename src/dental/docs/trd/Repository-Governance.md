# Repository-Governance.md

---

## Estado del documento

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Estado | ACTIVO — autoridad normativa |
| Ruta canónica | `src/dental/docs/trd/Repository-Governance.md` |
| Mantenido por | Arquitecto Principal |
| Última revisión | 2026-06 |

---

## Propósito

Definir qué puede entrar en cada zona del repositorio, quién puede modificarlo, bajo qué condiciones se acepta un cambio y cómo se gestiona el material no verificado. Este documento aplica a cualquier contribuyente humano o agente IA que opere sobre el repositorio Vytalix.

---

## Estructura canónica del repositorio

```
vytalix-clinical-engine/
├── src/
│   ├── core/                    # Core Clinical Domain
│   ├── longevity/               # Vertical longevity (dentro del core)
│   ├── dental/                  # Dental Domain (vertical satélite)
│   │   ├── docs/trd/            # TRD y ADR dentales
│   │   ├── engines/             # Motores puros
│   │   ├── repositories/        # Acceso a datos
│   │   ├── routers/             # Adaptadores HTTP
│   │   ├── schemas/             # Validación Zod
│   │   └── services/            # Servicios transversales dental
│   ├── shared/                  # Shared kernel
│   ├── platform/                # Infraestructura multitenant
│   └── api/                     # Commercial/API Domain
│       ├── handlers/            # Routers Express
│       ├── middlewares/         # Auth, RLS, validación
│       └── pipelines/           # Orquestadores de pipeline
├── frontend-dental/             # Superficie de presentación dental
│   └── src/
│       ├── app/                 # Páginas Next.js
│       ├── components/          # Componentes UI
│       ├── lib/                 # Cliente HTTP tipado
│       ├── providers/           # Context de sesión
│       └── types/               # Tipos espejo del backend
├── openapi/                     # Contratos HTTP (Nivel 1)
├── prisma/                      # Esquema y migraciones (Nivel 1)
│   └── migrations/              # Migraciones SQL ejecutadas
└── src/dental/docs/             # Documentación técnica dental
    └── trd/
        └── adr/                 # ADR individuales (ADR-001 a ADR-008)
```

---

## Zonas del repositorio

### Zona Core (`src/core/`, `src/longevity/`, `src/shared/`)

**Qué puede entrar:**
- Motores clínicos deterministas con tests unitarios completos
- Tipos de dominio clínico versionados
- Servicios que implementan algoritmos médicos publicados (Framingham 2008, DAAa v2.1)

**Qué no puede entrar:**
- Lógica de presentación o HTTP
- Imports desde verticales satélite (`src/dental/`)
- Cualquier lógica que tome decisiones clínicas autónomas sin el loop del médico
- Datos de pacientes reales hardcodeados

---

### Zona Platform (`src/platform/`, `src/api/middlewares/`, `src/api/pipelines/`)

**Qué puede entrar:**
- Infraestructura multitenant (`withTenant()`, RLS context)
- Middlewares de seguridad verificados
- Orquestadores de pipeline que coordinan dominios sin contener lógica de negocio

**Qué no puede entrar:**
- Lógica de negocio clínica o financiera
- Acceso directo a base de datos sin `withTenant()`
- Secretos o credenciales en texto claro

---

### Zona Commercial/API (`src/api/handlers/`, `openapi/`)

**Qué puede entrar:**
- Routers Express que delegan a servicios de dominio
- Schemas Zod de validación de entrada
- Contratos OpenAPI actualizados antes de la implementación

**Qué no puede entrar:**
- Lógica de negocio dentro de handlers HTTP
- Endpoints sin contrato OpenAPI previo
- Respuestas que expongan `baseCost` u otros campos internos no publicados en OpenAPI

---

### Zona Dental (`src/dental/`)

**Qué puede entrar:**
- Motores puros sin efectos secundarios de I/O
- Repositorios que usan `withTenant()` exclusivamente
- Routers que solo traducen HTTP ↔ dominio
- Schemas Zod con `.strict()` obligatorio
- Migraciones SQL aprobadas por el arquitecto principal
- ADR en `src/dental/docs/trd/adr/`

**Qué no puede entrar:**
- Imports directos desde `src/core/` o `src/longevity/`
- Lógica clínica (diagnósticos, scoring médico) dentro de engines financieros
- `baseCost` expuesto en respuestas externas
- Valores monetarios en formato decimal (solo enteros en unidades menores)

---

### Zona Frontend (`frontend-dental/`)

**Qué puede entrar:**
- Componentes React de presentación
- Cliente HTTP tipado contra contratos OpenAPI
- Tipos que son espejos explícitos de tipos del backend
- Lógica de sesión de tenant (sin lógica de negocio)

**Qué no puede entrar:**
- Imports de Prisma o cualquier módulo del servidor
- Lógica de cálculo de precios o márgenes
- Datos clínicos reales de pacientes hardcodeados
- Llamadas directas a la base de datos

---

### Zona Docs (`src/dental/docs/trd/`, `openapi/`)

**Qué puede entrar:**
- TRD promovidos desde cuarentena tras revisión explícita
- ADR con número asignado, decisión clara y consecuencias documentadas
- Contratos OpenAPI actualizados síncronamente con la implementación

**Qué no puede entrar:**
- Narrativas generadas por IA sin verificación contra Nivel 1
- Documentación que contradiga el código compilable
- Documentos sin estado explícito (DRAFT / ACTIVO / DEPRECADO)

---

### Zona Legacy

Código desactivado, versiones anteriores de motores o handlers que han sido sustituidos. Material en esta zona no se ejecuta en producción.

**Regla:** Un archivo llega a Legacy por decisión documentada en un ADR. Nunca por descuido.

---

### Zona Quarantine (`quarantine/` o marcados con `[QUARANTINE]`)

Cualquier artefacto cuya procedencia sea una salida de agente IA no verificada contra Nivel 1, código huérfano encontrado sin dueño claro, o artefactos temporales de una sesión de trabajo.

**Regla:** Nada entra a la línea base desde cuarentena sin revisión humana explícita y registro en el historial de cambios.

---

## Reglas de contribución

1. **OpenAPI antes de código.** Ningún endpoint HTTP nuevo existe sin su entrada en el archivo OpenAPI correspondiente, aprobada primero.

2. **Tests antes de merge.** Todo cambio en engines o repositorios requiere tests unitarios que pasen. El umbral actual es 281/281 tests en verde; cualquier PR que lo rompa no se acepta.

3. **Sin lógica en routers.** Los handlers HTTP validan entrada (Zod), invocan el servicio de dominio y devuelven la respuesta. La lógica reside en el motor, no en el router.

4. **Auditoria obligatoria en mutaciones.** Cualquier operación que mute datos de tenant en las tablas de dominio dental debe escribir un registro en `dental_audit_logs` dentro de la misma transacción.

5. **Inmutabilidad clínica y financiera.** Los registros de `dental_audit_logs`, `dental_financial_snapshots`, `dental_inventory_movements` y `biological_age_assessments` no se modifican ni eliminan una vez creados.

---

## Reglas de dependencia

1. Un dominio no puede importar internals de otro dominio. Solo barrels de índice o contratos publicados.

2. `withTenant()` es la única forma de acceder a la base de datos. `getDb().rawQuery()` directo solo está autorizado en la capa de plataforma para operaciones de infraestructura (bootstrap, health check, metering flush).

3. Las dependencias npm nuevas requieren justificación documentada. El `package.json` de `frontend-dental/` y el raíz son independientes; una dependencia en uno no autoriza su uso en el otro.

4. Ninguna dependencia nueva con vulnerabilidades conocidas (nivel alto o crítico) entra a la línea base.

---

## Reglas de publicación

1. El esquema Prisma y las migraciones SQL son artefactos de Nivel 1. Toda modificación pasa por revisión del arquitecto principal antes de ejecutarse en cualquier entorno compartido.

2. Las migraciones son aditivas. Nunca se elimina una columna ni una tabla en una migración sin un ciclo de deprecación documentado.

3. Los contratos OpenAPI son versionados. Un cambio que rompe compatibilidad requiere un nuevo version prefix (`v3`) o un campo deprecado con periodo de gracia documentado.

4. El `dental_sprint7_hardening.sql` es el patrón de referencia para migraciones de hardening: idempotentes, con `DROP CONSTRAINT IF EXISTS` antes de `ADD CONSTRAINT`, y con bloques `DO $$` para lógica condicional.

---

## Reglas de revisión

1. **Todo cambio en Nivel 1 requiere revisión del arquitecto principal.** Esto incluye: migraciones SQL, esquema Prisma, archivos OpenAPI, y cambios en `src/platform/db.ts` o `src/api/middlewares/`.

2. **Los cambios en engines dentales requieren revisión de un segundo ingeniero** con acceso a los tests de la suite afectada.

3. **Una salida de agente IA no es una revisión.** La verificación humana contra el código compilable es obligatoria antes de promover cualquier artefacto de Nivel 4 a la línea base.

4. **Los ADR requieren consenso del equipo técnico** antes de ser marcados como ACEPTADO. Un ADR en DRAFT no es autoridad.

---

## Política de cuarentena

**Entra automáticamente a cuarentena:**
- Cualquier archivo generado por un agente IA que no haya sido verificado contra Nivel 1.
- Archivos huérfanos encontrados sin relación clara a un módulo existente.
- Artefactos de sesiones de trabajo temporal que no fueron limpiados.
- Cualquier archivo que contenga datos de pacientes reales (PHI) fuera de su tabla de base de datos correspondiente.

**Sale de cuarentena cuando:**
- Un revisor humano certifica que el contenido no contradice ningún artefacto de Nivel 1.
- El artefacto tiene un dueño asignado (módulo, dominio, sprint).
- El artefacto tiene tests que lo respaldan o su ausencia está justificada.
- El movimiento desde cuarentena está registrado en el historial de cambios con fecha y autor.

---

## Política de excepciones

Toda excepción a las reglas de este documento requiere:

1. Justificación técnica escrita en un ADR numerado.
2. Aprobación explícita del arquitecto principal.
3. Fecha de revisión de la excepción (máximo 90 días; se renueva o se elimina).
4. Registro del riesgo aceptado y su mitigación.

Las excepciones no aprobadas son deuda técnica de riesgo alto, no opciones de diseño.

Los riesgos aceptados del Sprint 1 (Redis nonce store, secretos de tenant por pseudónimo, restricciones ESLint) están documentados y tienen fecha de revisión en Sprint 2.

---

## Checklist de aceptación

Antes de integrar cualquier cambio a la línea base, verificar:

- [ ] El cambio tiene un artefacto de Nivel 1 que lo justifica (código compilable, migración SQL, OpenAPI, test).
- [ ] Ningún test existente se rompe (281/281 en verde o más).
- [ ] Si hay nuevo endpoint HTTP, existe su entrada en OpenAPI antes del merge.
- [ ] Si hay nueva tabla o columna, existe su migración SQL idempotente.
- [ ] Si hay mutación de datos de tenant, hay registro de auditoría en la misma transacción.
- [ ] No se expone `baseCost` ni ningún campo marcado como interno en el OpenAPI.
- [ ] No hay lógica de negocio dentro de un router HTTP.
- [ ] No hay imports cruzados entre dominios fuera de los canales autorizados.
- [ ] No hay datos de pacientes reales hardcodeados en ningún archivo fuera de la base de datos.
- [ ] Si el cambio proviene de una salida de agente IA, ha sido verificado contra Nivel 1 por un revisor humano.
- [ ] Si hay excepción a estas reglas, está documentada en un ADR con aprobación explícita.
