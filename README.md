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
# API health:  http://localhost:3001/health
# Demo status: http://localhost:3001/demo/status
```

## Auth para pruebas API

```bash
# Obtener token
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' | jq .token

# Usar token
curl http://localhost:3001/v1/patients \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: a1b2c3d4-0000-4000-8000-000000000001"
```

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
