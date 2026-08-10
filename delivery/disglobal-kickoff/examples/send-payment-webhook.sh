#!/usr/bin/env bash
# Runnable example — POST /api/v2/webhooks/payment (curl + openssl)
#
#   ./scripts/examples/send-payment-webhook.sh
#   BASE_URL=https://staging.vytalix.health \
#   DISGLOBAL_WEBHOOK_SECRET=your-secret \
#   ./scripts/examples/send-payment-webhook.sh
#
# The signature is the hex HMAC-SHA256 of the CANONICAL body: exactly these
# keys, in this order, excluding `signature`:
#   event, intentId, amount, currency, timestamp, subjectRef, metadata
# Any change in key order or whitespace changes the digest → 401.
#
# Replaying the same intentId is safe: it returns 200 with "replayed": true.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
SECRET="${DISGLOBAL_WEBHOOK_SECRET:-sandbox-webhook-secret-v1}"
INTENT_ID="${INTENT_ID:-intent-$(date +%s)}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# 1. Canonical body — compact JSON, no spaces, fixed key order.
CANONICAL=$(printf '{"event":"payment.confirmed","intentId":"%s","amount":4900,"currency":"USD","timestamp":"%s","subjectRef":"DISG-8c1e5a","metadata":{"product":"FACIAL_SCAN"}}' \
  "$INTENT_ID" "$TIMESTAMP")

# 2. Sign it.
SIGNATURE=$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')

# 3. Send the same fields plus the signature.
BODY=$(printf '{"event":"payment.confirmed","intentId":"%s","amount":4900,"currency":"USD","timestamp":"%s","subjectRef":"DISG-8c1e5a","metadata":{"product":"FACIAL_SCAN"},"signature":"%s"}' \
  "$INTENT_ID" "$TIMESTAMP" "$SIGNATURE")

echo "POST ${BASE_URL}/api/v2/webhooks/payment  (intentId=${INTENT_ID})"
curl -sS -w '\nHTTP %{http_code}\n' \
  -X POST "${BASE_URL}/api/v2/webhooks/payment" \
  -H 'Content-Type: application/json' \
  -d "$BODY"

# 200 → recorded (or already known). 401 → signature mismatch: check the secret
# and the canonical key order. 500 → not recorded, retry the same request.
