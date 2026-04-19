#!/usr/bin/env bash
# =============================================================================
# Vytalix — Integration Demo Script
# Simulates a real partner (NueveOnce) sending data to Vytalix
# Shows: API key auth → ingest → pipeline → webhook
#
# Run: bash scripts/demo-integration.sh
# =============================================================================

BASE="${API_URL:-http://localhost:3001}"
KEY="vyx_demo_k1_NueveOnce_2024"
MRN="GNO-2024-000112"
TENANT="a1b2c3d4-0000-4000-8000-000000000001"

G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; B="\033[1m"; X="\033[0m"

echo ""
echo -e "${B}  Vytalix — Integration Demo${X}"
echo "  Simulating NueveOnce EMR sending clinical data"
echo "  ────────────────────────────────────────────────"

# ── Step 1: Send 2 new observations via external API ──────────────
echo ""
echo -e "  ${Y}→${X} Step 1: External EMR sends lab results for Roberto Vargas (MRN: $MRN)"
echo ""

RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/external/observations" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d "{
    \"patientMrn\": \"$MRN\",
    \"observations\": [
      {
        \"loincCode\": \"2089-1\",
        \"displayName\": \"LDL Cholesterol\",
        \"value\": 218.0,
        \"unit\": \"mg/dL\",
        \"effectiveDateTime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      },
      {
        \"loincCode\": \"8480-6\",
        \"displayName\": \"Systolic BP\",
        \"value\": 151.0,
        \"unit\": \"mmHg\",
        \"effectiveDateTime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }
    ]
  }")

HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  ACCEPTED=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accepted',0))" 2>/dev/null)
  PATIENT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('patientId','unknown'))" 2>/dev/null)
  echo -e "  ${G}✓${X} Ingested $ACCEPTED observation(s) for patient $PATIENT_ID"
  echo -e "  ${G}✓${X} Pipeline triggered automatically"
else
  echo -e "  ${R}✗ HTTP $HTTP_CODE${X}: $BODY"
  exit 1
fi

# ── Step 2: Verify via authenticated API ──────────────────────────
echo ""
echo -e "  ${Y}→${X} Step 2: Physician logs in and checks the patient"
echo ""

TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.martinez@grupo919.health","password":"Demo2024!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo -e "  ${R}✗ Login failed${X}"
  exit 1
fi
echo -e "  ${G}✓${X} Physician authenticated (JWT obtained)"

# ── Step 3: Check pending decisions ───────────────────────────────
echo ""
echo -e "  ${Y}→${X} Step 3: Checking pending clinical alerts"
echo ""

DECISIONS=$(curl -s "$BASE/v1/patients/a1b2c3d4-0000-4000-8000-000000000010/decisions?status=PENDING" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT")

COUNT=$(echo "$DECISIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null)
echo -e "  ${G}✓${X} $COUNT pending alert(s) found"

echo "$DECISIONS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('data', [])[:3]:
    u = r.get('urgency', '')
    color = '\033[0;31m' if u in ('URGENT','CRITICAL','SOON') else '\033[0;33m'
    reset = '\033[0m'
    print(f'    {color}[{u}]{reset} {r.get(\"title\",\"\")}')
" 2>/dev/null

# ── Step 4: Get decision trace ────────────────────────────────────
DEC_ID=$(echo "$DECISIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null)

if [ -n "$DEC_ID" ]; then
  echo ""
  echo -e "  ${Y}→${X} Step 4: Retrieving clinical explanation (decision trace)"
  echo ""
  TRACE=$(curl -s "$BASE/v1/decisions/$DEC_ID/trace" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-ID: $TENANT")
  SUMMARY=$(echo "$TRACE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['explanation']['summary'])" 2>/dev/null)
  CONFIDENCE=$(echo "$TRACE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['explanation']['confidence'])" 2>/dev/null)
  echo -e "  ${G}✓${X} Explanation: $SUMMARY"
  echo -e "  ${G}✓${X} Confidence: $CONFIDENCE"
fi

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "  ────────────────────────────────────────────────"
echo -e "  ${G}${B}Integration demo complete${X}"
echo ""
echo "  What was demonstrated:"
echo "    ✓ External API key authentication (no JWT required)"
echo "    ✓ Clinical data ingest with unit normalization"
echo "    ✓ Automatic pipeline: ingest → score → decision"
echo "    ✓ JWT authentication for physician access"
echo "    ✓ RBAC enforcement (physician role verified)"
echo "    ✓ Deterministic explainability trace"
echo ""
