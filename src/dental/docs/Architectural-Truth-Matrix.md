MATRIZ CANÓNICA DE VERDAD ARQUITECTÓNICA
Vytalix Platform – Baseline 2026

Estado: Proposed → Candidate Official

Objetivo

Eliminar definitivamente las múltiples narrativas generadas por agentes IA distintos (Claude, Gemini, GPT, DeepSeek, etc.) y establecer una única fuente de verdad verificable.

Nivel 1 — Verdad Máxima (Nivel A)

Estos artefactos prevalecen sobre cualquier documento.

Si existe contradicción, estos ganan siempre.

Prioridad	Fuente	Estado
A1	Código fuente compilable	Canonical
A2	Prisma Schema	Canonical
A3	Migraciones SQL ejecutadas	Canonical
A4	OpenAPI real del backend	Canonical
A5	Tests que pasan	Canonical
Regla

Si un ADR dice una cosa y el código dice otra:

gana el código.

Nivel 2 — Verdad Arquitectónica (Nivel B)

Define cómo DEBERÍA evolucionar el sistema.

Prioridad	Documento
B1	TRD
B2	DDD Map
B3	Dependency Matrix
B4	Repository Governance
B5	ADRs
Regla

Los ADRs no describen lo que existe.

Describen:

decisiones
restricciones
dirección futura
Nivel 3 — Verdad Operativa (Nivel C)

Documenta cómo se usa el sistema.

Prioridad	Documento
C1	README técnicos
C2	Manuales
C3	Runbooks
C4	Guías IA
Nivel 4 — Narrativas IA (Nivel D)

Documentos producidos por agentes.

Nunca se consideran verdad.

Documento
Baseline Certification
Auditorías Gemini
Auditorías Claude
Informes GPT
Informes DeepSeek
Regla

Todo informe IA debe validarse contra:

código
Prisma
OpenAPI

antes de aceptarse.