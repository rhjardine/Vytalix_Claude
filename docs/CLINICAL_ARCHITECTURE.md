# Nota de Arquitectura Clínica — Vytalix Clinical Domain Isolation

**Sprint:** Clinical Purity & Testability  
**Fecha:** 2026-06-04  
**Rol:** Clinical Domain Engineer + Staff TypeScript Engineer

---

## 1. Principio Arquitectónico Aplicado

**Separación absoluta entre lógica clínica y transporte/persistencia.**

Las funciones que implementan algoritmos clínicos (cálculo de edad biológica, scoring preventivo, evaluación de triggers de derivación) deben ser **puras**: sin I/O, sin efectos secundarios, sin dependencias de tiempo real. La orquestación (logging, DB, Redis, eventos) vive en la capa exterior.

```
[Función Pura Clínica]  ← testeable, determinista, versionada
         ↓
[Motor / Servicio]       ← compone la función pura + logging
         ↓
[Persistencia / Caché]   ← DB, Redis (completamente desacoplados)
```

---

## 2. Funciones Puras Identificadas y Exportadas

### `biophysics-engine.ts` (`ALGORITHM_VERSION = 'daaa-biophysics-v2.1.0'`)

| Función | Descripción |
|---------|-------------|
| `reduceMeasurements(m)` | Convierte medidas dimensionales en escalares (volúmenes) |
| `interpolateAge(value, ranges, chronoAge)` | Interpola edad biológica parcial desde baremo |
| `computePartialAges(scalars, chronoAge, boards)` | Calcula las 8 edades parciales |
| `weightedAverage(partialAges)` | Media ponderada con ITEM_WEIGHTS estables |
| `classifyAgeStatus(differentialAge)` | Clasifica REJUVENECIDO / NORMAL / ENVEJECIDO |
| `resolveBoardsMap(boards, sex)` | Selecciona baremos: DB > defaults por sexo |
| `buildFemaleDefaultBoards()` | Aplica offsets clínicos para baremos femeninos |

### `preventive-score.service.ts` (`PREVENTIVE_ALGORITHM_VERSION = 'preventive-composite-v1.0.0'`)

| Función | Descripción |
|---------|-------------|
| `scoreCardiovascular(riskPct, category)` | Invierte riesgo Framingham 10yr → score 0-100 |
| `scoreMetabolic(snapshot)` | Penaliza glucosa, LDL, HDL, ratio TC/HDL |
| `scoreBiologicalAge(delta, chronoAge)` | Mapea diferencial [-10,+10] → [100,0] |
| `scoreLifestyle(snapshot)` | Penaliza tabaquismo, diabetes, HTA |
| `classifyPreventiveTier(score)` | OPTIMAL / GOOD / MODERATE_RISK / HIGH_RISK / CRITICAL |

### `referral.engine.ts` (`REFERRAL_ALGORITHM_VERSION = 'referral-engine-v1.1.0'`)

| Función | Descripción |
|---------|-------------|
| `selectReferralTrigger(ctx, nowMs)` | Evalúa jerarquía T1-T4, retorna CTA o null |
| `buildCtaUrl(patientId, campaign, nowMs)` | Genera URL con token determinista (nowMs inyectable) |

---

## 3. Campos de Trazabilidad Garantizados

Cada resultado clínico ahora incluye obligatoriamente:

| Campo | Propósito |
|-------|-----------|
| `algorithmVersion` | Identifica exactamente qué versión del algoritmo produjo el resultado |
| `inputSnapshot` | Copia exacta de los inputs usados — permite reproducir el resultado en cualquier momento |
| `computedAt` | Timestamp inyectable (no `new Date()` hardcoded) — determinismo en tests |
| `triggerCode` (referral) | Código T1-T4 — identifica exactamente qué regla disparó la derivación |

---

## 4. Estrategia de Tests

### Niveles de cobertura implementados
1. **Tests de función pura**: Cada función exportada tiene tests directos (no a través de la clase).
2. **Tests de contrato de clase**: La clase `BiophysicsEngine` se testa como integración de sus funciones puras.
3. **PIN Tests (regression guards)**: Valores exactos fijados en código — si una refactorización cambia el resultado numérico, el test falla. Ej: `scoreBiologicalAge(-3, 40) === 65`.
4. **Tests de determinismo**: Mismos inputs → mismo output exacto, N repeticiones.
5. **Tests de no-NaN**: Ningún path clínico puede producir `NaN`.
6. **Tests de fallback explícito**: Comportamiento con datos faltantes verificado como 100 (sin penalización silenciosa).

### Infraestructura aislada
Los tests de `preventive-score` y `referral.engine` usan stubs en `test-stubs/` para `db`, `redis`, `event-bus` y `logger`. Los tests son completamente offline.

---

## 5. Riesgos Pendientes

| Riesgo | Severidad | Acción Sugerida |
|--------|-----------|-----------------|
| `interpolateAge` usa ±halfSpread para búsqueda de bracket — puede matchear el mismo valor en dos rangos adyacentes | MEDIO | Añadir test de valor exacto en borde de rango; considerar bisección directa |
| Baremos femeninos aplican offset fijo (+7pp fat, +3pp hydration) hardcoded en código — no versionados en DB | MEDIO | Migrar offsets a tabla `board_adjustments` con `algorithmVersion` |
| `computedAt` en `BiophysicsResult` es inyectable solo en la clase — la función pura no la usa, pero quien llame a `compute()` sin pasar `_now` obtendrá `new Date()` en producción | BAJO | Documentar en JSDoc; aceptable para producción |
| `buildCtaUrl` genera token con `patientId` en base64 — no es un secreto criptográfico real | BAJO | En V1: reemplazar con HMAC-SHA256 firmado con clave de tenant |
| Tests del referral engine no cubren el path de `persistReferral` (solo la función pura) | BAJO | Añadir test de integración con DB mock cuando el schema lo permita |
| `preventive-score.service.ts` no persiste `outputSnapshot` — solo `inputSnapshot` | BAJO | Añadir `outputSnapshot` con los scores de componentes a la inserción en DB |
