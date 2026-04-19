# Vytalix — Auth Flow Documentation

## Architecture

```
Client → POST /auth/login
           ↓
         loginHandler (auth.middleware.ts)
           ↓ verify email/password (bcrypt)
           ↓ issue JWT (HS256, 8h TTL)
           ↓
         JWT payload: { sub, tenant_id, org_id, role, email }
           ↓
Client → GET /v1/patients (Authorization: Bearer <jwt>)
           ↓
         authMiddleware
           ↓ verify JWT signature
           ↓ validate UUID format of tenant_id
           ↓ attach req.user
           ↓
         tenantMiddleware
           ↓ verify X-Tenant-ID header matches JWT tenant_id (if provided)
           ↓
         handler → getTenantDb(req.user.tenant_id)
                     ↓
                   $tx() → SET LOCAL app.current_tenant = <uuid>
                     ↓
                   PostgreSQL RLS policy:
                   USING (tenant_id = current_setting('app.current_tenant')::uuid)
```

---

## Login flow

### Request

```bash
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.martinez@grupo919.health",
    "password": "Demo2024!"
  }'
```

### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "8h",
  "user": {
    "id": "a1b2c3d4-0000-4000-8000-000000000003",
    "email": "dr.martinez@grupo919.health",
    "role": "PHYSICIAN"
  }
}
```

### JWT payload (decoded)

```json
{
  "sub": "a1b2c3d4-0000-4000-8000-000000000003",
  "tenant_id": "a1b2c3d4-0000-4000-8000-000000000001",
  "org_id": "a1b2c3d4-0000-4000-8000-000000000002",
  "role": "PHYSICIAN",
  "email": "dr.martinez@grupo919.health",
  "iat": 1700000000,
  "exp": 1700028800,
  "iss": "vytalix-api",
  "aud": "vytalix-client"
}
```

---

## Using the token

```bash
export TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# List patients (RLS enforces tenant isolation automatically)
curl -s http://localhost:3001/v1/patients \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Get current user
curl -s http://localhost:3001/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Tenant isolation validation

This test proves that tenant A's token cannot read tenant B's data.

```bash
# 1. Get Tenant A token (demo tenant)
TOKEN_A=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Attempt to access with mismatched X-Tenant-ID header
curl -s http://localhost:3001/v1/patients \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "X-Tenant-ID: 99999999-0000-4000-8000-000000000000"
# Expected: 403 Forbidden — "X-Tenant-ID header does not match token tenant_id"

# 3. Attempt to use a token with a fake tenant_id (not a valid UUID)
INVALID_TOKEN=$(python3 -c "
import jwt, sys
payload = {'sub':'user1','tenant_id':'not-a-uuid','org_id':'x','role':'PHYSICIAN','email':'x@x.com'}
print(jwt.encode(payload, 'CHANGE_THIS_TO_A_RANDOM_STRING_OF_AT_LEAST_32_CHARACTERS', algorithm='HS256'))
" 2>/dev/null || echo "PYTHON_JWT_NOT_AVAILABLE")

curl -s http://localhost:3001/v1/patients \
  -H "Authorization: Bearer $INVALID_TOKEN"
# Expected: 401 Unauthorized — "Invalid tenant_id format in token"

# 4. RLS database-level test — proves the DB rejects cross-tenant queries
# Even if application code forgot the WHERE clause, RLS blocks the data
# This is verifiable in psql:
docker compose exec postgres psql -U vytalix -d vytalix_dev -c "
  SET app.current_tenant = '99999999-0000-4000-8000-000000000000';
  SELECT COUNT(*) FROM patients;
  -- Expected: 0 (RLS filters all rows for unknown tenant)
"
```

---

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| PHYSICIAN | dr.martinez@grupo919.health | Demo2024! |
| ORG_ADMIN | admin@grupo919.health | Admin2024! |

---

## Error responses

| Scenario | HTTP | Body |
|----------|------|------|
| Missing token | 401 | `{"title":"Unauthorized","detail":"Missing or malformed Authorization header"}` |
| Expired token | 401 | `{"title":"Unauthorized","detail":"Token expired — please re-authenticate"}` |
| Wrong tenant header | 403 | `{"title":"Forbidden","detail":"X-Tenant-ID header does not match token tenant_id"}` |
| Invalid role | 403 | `{"title":"Forbidden","detail":"Role 'VIEWER' is not authorized for this action"}` |
| Bad credentials | 401 | `{"title":"Unauthorized","detail":"Invalid credentials"}` |

---

## RBAC roles

| Role | Permissions |
|------|-------------|
| `ORG_ADMIN` | Full read/write for the organization. Can manage users and protocols. |
| `PHYSICIAN` | Full clinical access. Can review recommendations, ingest observations. |
| `CARE_COORDINATOR` | Read access + recommendation status updates (DEFERRED only). |
| `VIEWER` | Read-only. Dashboard and timeline access. No writes. |
| `SUPER_ADMIN` | Vytalix staff only. Cross-tenant support access. Audit trail required. |
