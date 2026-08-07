# Vytalix Clinical Intelligence Engine

**Capa de inteligencia clínica** — convierte datos longitudinales en decisiones médicas accionables.

## Quickstart (3 comandos)

```bash
git clone <repo-url> vytalix && cd vytalix
cp .env.example .env
make setup && make demo
```

Sistema en http://localhost:3000 en menos de 10 minutos.

## Prerrequisitos

| Herramienta | Versión mínima | Verificar |
|-------------|---------------|-----------|
| Docker | 24.0+ | `docker --version` |
| Node.js | 20.0+ | `node --version` |

## Paso a paso

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Primera instalación completa (instala, migra, siembra)
make setup

# 3. Verificar
make check
# Todos los checks deben ser VERDES

# 4. Levantar demo
make demo
# Dashboard:   http://localhost:3000/dashboard
# API health:  http://localhost:3001/readiness
# API docs:    http://localhost:3001/docs
```

## Auth para pruebas API

La API expone dos modelos de acceso:

```bash
# 1. Funnel público — sin autenticación
curl -X POST http://localhost:3001/api/funnel/leads \
  -H "Content-Type: application/json" \
  -d '{"name":"Hans Muller","email":"hans@example.com",
       "interestType":"LONGEVIDAD_CLINICA","source":"HERO_CTA",
       "consentMarketing":true,"consentDataProcessing":true}'

# 2. API v2 para partners — cabecera X-API-Key
curl http://localhost:3001/api/v2/insights/cohort \
  -H "X-API-Key: <tu-api-key>"
```

Las API keys se emiten desde los endpoints administrativos
(`/admin/tenants/{tenantId}/api-keys`, documentados en `/docs`).
El webhook de pago no usa API key: se autentica por firma HMAC (ver abajo).

## Integración externa — Doctor Antivejez / Marketplace Vita App (Disglobal)

Este repositorio es el **Vytalix Clinical Intelligence Engine**, el proveedor
tecnológico. El producto comercializado en el **Marketplace Vita App** de
Disglobal es **Doctor Antivejez**, cuyos servicios del MVP Fase 1 son:

1. Escáner Facial (Biometría AWS Rekognition)
2. Cuestionario Preventivo Estructurado (Evaluación Express)
3. Consulta Médica Online (Teleconsulta)
4. Consulta Médica Presencial
5. Derivación Clínica
6. Flujo de Pago Integrado B2B (Split Payments)

> **Aviso obligatorio:** la Evaluación Digital Preventiva es una aproximación
> conductual y de hábitos. **No constituye un diagnóstico médico y no sustituye
> la consulta médica presencial.**

Con la plataforma levantada (`make demo`), un integrador no necesita leer el
código fuente:

| Recurso | URL |
|---------|-----|
| Documentación interactiva de la API | http://localhost:3001/docs |
| Contrato OpenAPI (importable en Postman/Insomnia) | http://localhost:3001/openapi.yaml |

### Webhook de pago (HMAC)

`POST /api/v2/webhooks/payment` se autentica con una firma **HMAC-SHA256** en el
campo `signature`, calculada sobre el cuerpo canónico con el secreto
`DISGLOBAL_WEBHOOK_SECRET`. Hay dos ejemplos ejecutables que ya hacen ese cálculo:

```bash
# Node.js
node scripts/examples/send-payment-webhook.js

# curl + openssl
./scripts/examples/send-payment-webhook.sh

# Contra otro entorno
BASE_URL=https://staging.vytalix.health \
DISGLOBAL_WEBHOOK_SECRET=tu-secreto \
node scripts/examples/send-payment-webhook.js
```

Respuestas: `200` el pago quedó registrado (COMMIT confirmado; `replayed: true`
si el `intentId` ya existía) · `401` firma inválida · `500` no se registró,
reintentar con el mismo `intentId` (la deduplicación lo hace seguro).

## Comandos

| Comando | Descripción |
|---------|-------------|
| `make setup` | Primera instalación |
| `make demo` | Validar + levantar todo |
| `make check` | Validación pre-demo |
| `make reset` | Re-sembrar datos |
| `make stop` | Detener servicios |
| `make logs` | Ver logs |

## Stack

Node.js 20 + TypeScript · PostgreSQL 15 + TimescaleDB · Redis · Next.js 14 App Router · Docker
