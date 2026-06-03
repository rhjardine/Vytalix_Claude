# Vytalix × Disglobal — Commercial Integration Package
## Propuesta técnica y comercial para Disglobal Marketplace / Insurtech

> **Audiencia**: Equipo técnico y comercial de Disglobal  
> **Versión**: 1.0 · Fase 2

---

## El producto que Disglobal recibe

Disglobal accede a la infraestructura clínica de Vytalix, validada médicamente por Doctor Antivejez,
como **servicios API consumibles** sin necesidad de construir ni mantener lógica clínica.

### Lo que Disglobal puede ofrecer a sus usuarios

| Feature para el usuario final | API que lo habilita | Valor percibido |
|------------------------------|--------------------|----|
| "Conoce tu edad biológica real" | `POST /api/v2/vitality/assess` | Alto engagement inicial |
| "Tu riesgo cardiovascular en 10 años" | `POST /api/v2/preventive/score` | Urgencia de acción |
| "Habla con un especialista en longevidad" | `GET /api/v2/referral/:id` | Derivación premium |
| Badge de progreso en bienestar | `POST /api/v2/engagement/events` | Retención de usuarios |
| Panel de salud de la población asegurada | `GET /api/v2/insights/cohort` | Valor para aseguradoras B2B |

---

## APIs más atractivas para público masivo

### 1. Vytalix BioAge API — El ancla de engagement

**Por qué funciona a escala masiva**:
- La pregunta "¿cuántos años tienes realmente?" tiene una curiosidad universal.
- Resultado numérico simple e inmediatamente comprensible.
- Genera sorpresa (diferencial positivo o negativo) que motiva acción.
- Se puede gamificar: "Mejora tu edad biológica 2 años este mes".

**Resultado en Disglobal**:
```
"Tu edad biológica: 42 años"
"Tu edad cronológica: 48 años"
"¡Estás 6 años más joven de lo que te toca! → Mantén el ritmo"
```

**Costo de API**: $0.15 por evaluación. Para 10,000 usuarios activos/mes: $1,500 USD.

### 2. Vytalix Smart Referral API — El monetizador

**Por qué funciona para el modelo de negocio**:
- Solo se activa cuando hay señales clínicas (no es spam).
- CTA contextual y con urgencia real ("diferencial de 7 años").
- URL trackeable con token para medir conversión.
- Revenue share automático en conversión.

**Resultado en Disglobal**:
```
⚡ "Tu edad biológica supera en 7 años a la cronológica"
   "Este nivel requiere atención especializada"
   [Agenda consulta prioritaria → doctorantivejez.com/ref/xxx]
```

### 3. Vytalix Population Insights API — El diferenciador B2B

**Por qué funciona para aseguradoras**:
- Datos agregados anónimos de su cohorte asegurada.
- "El 38% de tus asegurados entre 40-50 están rejuvenecidos".
- Input directo para diseño de pólizas de longevidad.
- Nadie más en el mercado ofrece esto con validación clínica real.

---

## Modelo de pricing para Disglobal

### Opción A — Revenue Share (recomendada para arranque)

```
Disglobal paga $0 de setup.
Por cada assessment de BioAge: $0.10 USD (vs $0.15 precio público).
Por cada referral CONVERTIDO: Vytalix retiene 30%, Disglobal retiene 70%.

Ejemplo con 50,000 usuarios activos/mes:
  BioAge calls:          50,000 × $0.10 = $5,000/mes
  Conversión 1%:         500 consultas × $200 avg
  Vytalix share (30%):   $3,000/mes
  Disglobal share (70%): $7,000/mes
  Total flujo generado:  $15,000/mes
```

### Opción B — SaaS Prepago

```
Paquete STARTER:   10,000 calls/mes  → $800/mes (flat)
Paquete GROWTH:   100,000 calls/mes  → $6,000/mes
Paquete SCALE:  1,000,000 calls/mes  → Custom
Referral share: 30% Vytalix / 70% Disglobal en todas las opciones
```

### Opción C — White-label (Fase 4)

```
Disglobal puede exponer la BioAge API con su propio branding.
Setup fee: $5,000 USD (configuración + DNS + cert).
Pricing mensual: Opción B + $500/mes de white-label fee.
```

---

## Integración técnica — Disglobal

### Tiempo de integración estimado: 1–3 días de desarrollo

**Paso 1: Instalar el SDK** (5 minutos)
```bash
npm install @vytalix/disglobal-sdk
# O simplemente copiar disglobal-client.ts al proyecto
```

**Paso 2: Configurar API Key** (30 minutos)
```typescript
import { DisgglobalVytalixClient } from '@vytalix/disglobal-sdk'

const vytalix = new DisgglobalVytalixClient({
  apiKey: process.env.VYTALIX_API_KEY,
  baseUrl: 'https://api.vytalix.health'
})
```

**Paso 3: Primer assessment** (2 horas de integración)
```typescript
// En el backend de Disglobal, cuando el usuario completa el cuestionario:
const resultado = await vytalix.assessBioAge({
  userId: usuario.id,           // pseudonymizado internamente por el SDK
  age:    usuario.edad,
  sex:    'MASCULINO',
  mediciones: {
    porcentajeGrasa: 22.5,
    imc: 26.1,
    reflejoDigital: { alto: 0.8, largo: 15.2, ancho: 8.1 },
    acomodacionVisual: 3.5,
    equilibrioEstatico: { alto: 12.0, largo: 30.5, ancho: 8.0 },
    hidratacionPiel: 42.0,
    presionSistolica: 128.0,
    presionDiastolica: 82.0
  }
})

// resultado incluye edadBiologica, edadDiferencial, estado, y CTA de derivación
if (resultado.derivacion?.elegible) {
  showReferralCTA(resultado.derivacion)
}
```

**Paso 4: Trackear conversiones** (1 hora)
```typescript
// Cuando el usuario hace click en la CTA:
await vytalix.trackCtaClick(usuario.id)

// Cuando el usuario completa la consulta:
await vytalix.trackConversion(usuario.id, 250.00) // USD valor de la consulta
```

---

## Seguridad y privacidad para usuarios Disglobal

| Preocupación | Solución |
|-------------|---------|
| "¿Se almacenan los datos de mis usuarios?" | Los datos clínicos se almacenan bajo el tenant Disglobal con RLS estricto. Nadie más puede acceder a ellos. |
| "¿Se puede identificar al usuario?" | No. Los userId de Disglobal se pseudonimizan con HMAC-SHA256. Vytalix solo ve "DISG-abc123". |
| "¿Cumple con GDPR?" | Sí. Consent record antes del primer assessment. DPA disponible para firmar. Derecho al olvido implementado. |
| "¿Qué pasa si Vytalix tiene un breach?" | Los datos de identidad y los datos clínicos están en tablas separadas. El breach expone datos clínicos pseudonimizados, no identificados. |

---

## SLA y soporte

| Métrica | Compromiso |
|---------|-----------|
| Uptime API | 99.5% mensual |
| Latencia p99 | < 500ms para BioAge, < 100ms para Referral (Redis) |
| Notificación de incidente | < 30 min para P0, < 2h para P1 |
| Soporte técnico | Slack channel dedicado + email support@vytalix.health |
| Datos de prueba | Sandbox con dataset demo disponible |

---

## Hoja de ruta conjunta Disglobal × Vytalix

| Hito | Fecha target | Entregable |
|------|-------------|-----------|
| Firma de DPA + acuerdo comercial | Semana 1 | Documento legal |
| Provision de API Key + acceso sandbox | Semana 1 | API Key + curl examples |
| Integración técnica piloto | Semanas 2-3 | 500 usuarios Disglobal |
| Revisión de resultados piloto | Semana 4 | Dashboard + métricas |
| Go-live público | Semana 6 | Lanzamiento en marketplace |
| Primera facturación / revenue share | Mes 2 | Invoice mensual |

---

## Contacto

Para comenzar la integración:

- **Técnico**: integrations@vytalix.health
- **Comercial**: partnerships@vytalix.health
- **Docs**: https://docs.vytalix.health/disglobal
- **Sandbox**: https://sandbox.api.vytalix.health
