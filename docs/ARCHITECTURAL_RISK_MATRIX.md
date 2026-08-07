# ARCHITECTURAL_RISK_MATRIX.md
> **Vytalix Platform — Sprint E4-D8 · Phase 5 · Architectural Risk Analysis**

| Campo | Valor |
|---|---|
| Sprint | E4-D8 · Fase 5 |
| Método | Riesgo de **producción real**, no conteo de errores TS |
| Fecha | 2026-06 |

> Escalas: Probabilidad / Impacto / Detectabilidad / consecuencias (Negocio, Operacional, Seguridad, Mantenibilidad) en Bajo/Medio/Alto. "Detectabilidad" alta = fácil de detectar (mejor).

---

## 1. Evaluación por deuda

### TD-21 — EventBus disconnect (9)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad (de manifestarse) | **Media** | Los emit lanzarían si se ejecutaran; hoy varias rutas están inertes (listeners comentados, funnel montado=no) |
| Impacto | **Alto** | Funcionalidad de eventos (re-score automático, webhook referral Disglobal) inactiva |
| Detectabilidad | Media | Fallo silencioso: listeners comentados no dan error; emit lanzaría en runtime |
| Negocio | **Alto** | Webhook de referral a Disglobal por eventos no se dispara (verificar vs piloto) |
| Operacional | Medio | Cadenas de pipeline no se ejecutan por evento |
| Seguridad | Bajo | — |
| Mantenibilidad | **Alto** | Dos sistemas de eventos confunden; deuda arquitectónica estructural |

### TD-20 — Runtime imports (3)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad | **Media-Alta** | `/usage` lanzaría 500 al ejecutar (import fuera de try); health-check event_bus siempre "no-saludable" |
| Impacto | Medio | Endpoint admin `/usage` roto; health-check engañoso; log de revocación ausente |
| Detectabilidad | **Alta** | 500 visible; health-check observable |
| Negocio | Medio | Facturación/usage (admin) roto |
| Operacional | **Alto** | Health-check event_bus reporta mal → señal operacional falsa |
| Seguridad | Bajo-Medio | Invalidación de cache de API key revocada no ocurre (mitigado: TTL 5min declarado) |
| Mantenibilidad | Medio | — |

### TD-18 — funnel `.rows` (5)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad | **Baja** | Router funnel **comentado en server.ts** → ruta muerta |
| Impacto | Medio (si se reactiva) | `TypeError` en creación de lead/booking |
| Detectabilidad | Alta | Fallaría inmediatamente al montar |
| Negocio | Medio | Funnel público no operativo (pero no montado) |
| Operacional | Bajo | No ejecutado |
| Seguridad | Bajo | — |
| Mantenibilidad | Bajo | Aislado |

### TD-19 — DTO/unknown (7/8)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad | Baja | `.detail` funciona en runtime (JS dinámico); DTO es solo tipo |
| Impacto | Bajo | Type-safety reducida en bordes |
| Detectabilidad | Alta | typecheck |
| Negocio | Bajo | — |
| Operacional | Bajo | — |
| Seguridad | Bajo | — |
| Mantenibilidad | Medio | Bordes DTO/error sin tipar |

### RC-5 — Legacy (9)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad | **Muy baja** | `src/legacy/` no ejecutado (no importado por server.ts) |
| Impacto | Bajo | Solo ruido en gate |
| Detectabilidad | Alta | typecheck |
| Negocio/Operacional/Seguridad | Bajo | Aislado |
| Mantenibilidad | Medio | Confusión; bloquea promoción del gate |

### Logger — `clinicalLog` (2)
| Dimensión | Nivel | Evidencia |
|---|---|---|
| Probabilidad | Baja | `assessmentCompleted?.` no-op; `funnelLead` en ruta funnel no montada |
| Impacto | Bajo | Traza de auditoría ausente |
| Detectabilidad | Alta | typecheck |
| Negocio | Bajo-Medio | Auditoría/observabilidad de funnel/assessment reducida |
| Operacional | Bajo | — |
| Seguridad | Bajo | — |
| Mantenibilidad | Bajo | — |

---

## 2. Matriz de prioridad (riesgo de producción)

```
              IMPACTO ALTO         IMPACTO MEDIO        IMPACTO BAJO
  PROB     ┌────────────────────┬────────────────────┬──────────────────┐
  ALTA/MA  │                    │ TD-20 (500/health) │                  │
           ├────────────────────┼────────────────────┼──────────────────┤
  PROB     │ TD-21 (eventos/    │                    │ TD-19 (types)    │
  MEDIA    │  webhook Disglobal)│                    │                  │
           ├────────────────────┼────────────────────┼──────────────────┤
  PROB     │                    │ TD-18 (funnel,     │ Logger, RC-5     │
  BAJA     │                    │  ruta muerta)      │ (aislados)       │
           └────────────────────┴────────────────────┴──────────────────┘
```

## 3. Ranking de prioridad (por riesgo de producción, NO por conteo TS)

| # | Deuda | Riesgo neto | Justificación |
|---|---|---|---|
| 1 | **TD-21** EventBus | **ALTO** | Impacto de negocio alto (webhook Disglobal/re-score inactivos) + deuda estructural + detectabilidad media (fallo silencioso) |
| 2 | **TD-20** Runtime imports | **MEDIO-ALTO** | Prob media-alta + consecuencia operacional alta (health-check engañoso, `/usage` 500) |
| 3 | **TD-18** funnel `.rows` | **MEDIO (latente)** | Alto impacto si se reactiva el funnel; hoy ruta muerta (prob baja) |
| 4 | **Logger** | **BAJO-MEDIO** | Auditoría reducida; aislado |
| 5 | **TD-19** DTO/unknown | **BAJO** | Sin impacto runtime; type-safety |
| 6 | **RC-5** Legacy | **BAJO** | No ejecutado; solo ruido en gate |

## 4. Observaciones de riesgo

- **El conteo de errores TS NO refleja el riesgo:** RC-5 (9 errores) es el de MENOR riesgo (off-runtime); TD-20 (3 errores) es de riesgo operacional alto (health-check).
- **Riesgo de detectabilidad más peligroso: TD-21** — fallo silencioso (listeners comentados no producen error visible; el sistema "parece" funcionar pero las cadenas de eventos no se ejecutan). Requiere validación explícita contra el comportamiento esperado del piloto.
- **Mitigaciones ya presentes:** TD-18/Logger(funnelLead) en rutas no montadas; API key revocation tiene TTL 5min declarado que mitiga la falta de invalidación de cache.

> Ver estrategia de ejecución en [ROADMAP_V2.md](./ROADMAP_V2.md) y resumen en [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md).
