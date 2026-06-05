# TENANT_ISOLATION_REPORT.md
> **Reporte de Auditoría: Multi-Tenancy y Aislamiento en Vytalix v2**

## Estrategia de Aislamiento
Vytalix utiliza **Row-Level Security (RLS)** a nivel de PostgreSQL para garantizar que las consultas de un cliente (ej. Disglobal) jamás puedan acceder o modificar los datos de otro (ej. Doctor Antivejez), incluso en caso de error de la capa de aplicación.

## 1. Unificación de Variable de Entorno
Se ha resuelto la deuda técnica de nomenclatura. En toda la plataforma (consultas, migraciones y capa de conexión), el ID de tenant se inyecta y valida bajo una única variable:
`app.current_tenant_id`

## 2. Transaccionalidad Estricta en `withTenant`
El acceso a la BD se realiza **exclusivamente** a través de `withTenant` (en `src/lib/db.ts`). Este envoltorio ejecuta los siguientes pasos:
1. Adquiere cliente del pool de `pg`.
2. Ejecuta `BEGIN`.
3. Configura RLS de forma segura y local: `SELECT set_config('app.current_tenant_id', '<uuid>', true);`
4. Ejecuta la lógica clínica o consulta del repositorio.
5. Ejecuta `COMMIT` o `ROLLBACK`.
6. Libera la conexión.

*Esto asegura que si el thread de Node.js falla o el cliente de BD se recicla, ningún otro request heredará la configuración del tenant anterior.*

## 3. Pruebas y Evidencia (Suite RLS)
La suite `tenant-isolation.test.ts` valida el comportamiento estricto del driver de BD frente al RLS:
- **Lectura cruzada bloqueada**: Consultas tipo `SELECT * FROM patients` solo retornan pacientes cuyo `"tenantId"` coincida con la sesión activa.
- **Escritura cruzada rechazada**: Un intento de inserción con un `tenantId` diferente al de la sesión actual genera una excepción de política de RLS a nivel del motor PostgreSQL.
- **Limpieza de variables locales**: Comprobación explícita de que `app.current_tenant_id` desaparece fuera del closure de `withTenant`.

## 4. Gestión de Excepciones y Mantenimiento
- Las migraciones corren con privilegios elevados (`SUPERUSER`), permitiendo modificaciones de esquema.
- El servidor `vytalix-clinical-engine` usa una conexión de aplicación normal.
- Las vistas agregadas de TimescaleDB (ej. `bio_age_monthly_stats`) preservan la columna `"tenantId"` para filtrar los dashboards.

**Estado:** Aislamiento verificado. Listo para alojar de manera simultánea el piloto Disglobal y los pacientes legados de Doctor Antivejez sin contaminación de historiales.
