# REPO_ORGANIZATION_PLAN.md
> **Vytalix Platform — Plan de Reorganización Arquitectónica**

## Objetivo
Transformar el repositorio plano original en un monorepo modular con separación clara por subdominios, previniendo acoplamientos técnicos, deuda organizativa, y colisión de dependencias entre módulos no relacionados (ej. Dental vs Vitalidad).

## Directrices de la Reestructuración (Sprint 1)
1. **Lógica Clínica Pura (`src/core`)**: Aislar los motores matemáticos y deterministas de toma de decisiones, sin estado y sin dependencias de I/O.
2. **Platform & Infraestructura (`src/platform`)**: Centralizar las conexiones de base de datos (`pg`, `prisma`), redis, mensajería (`event-bus`), instrumentación y el SDK interno de Disglobal.
3. **Módulos de Dominio (Verticales)**:
   - `src/longevity`: Contiene todo lo relativo al Assessment Biofísico y Edad Diferencial.
   - `src/dental`: Motor aislado para las reglas de coste e IA dental.
4. **Capa API (`src/api`)**: Alojar los `handlers`, routers, y middlewares express de forma independiente a la lógica de negocio.
5. **Shared/Transversales (`src/shared`)**: Para servicios de ingestión de datos, CRM/Funnel y scoring de engagement que cruzan múltiples dominios.
6. **Legacy (`src/legacy`)**: Archivos no utilizados pero necesarios por historial (antiguos contratos v1.1, parche de server-v2).

## Mantenimiento de Retrocompatibilidad
El plan se diseñó para reescribir internamente las importaciones de ES6 (`import ... from ...`) en todos los archivos del repositorio, garantizando que el árbol de dependencias internas persista de forma idéntica, manteniendo en color verde la validación estricta de TypeScript (`typecheck`) y la suite unitaria completa (`vitest`).

## Trabajo Futuro
- **Alias de rutas (`@/*`)**: Actualizar el build step en TSConfig para simplificar refactorizaciones futuras.
- **Microservicios opcionales**: Si la capa `dental` crece excesivamente, la estructura actual permite empaquetar esa carpeta en un contenedor docker separado de manera casi inmediata.
