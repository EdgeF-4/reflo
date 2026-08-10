#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
checks=0

need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'missing required command: %s\n' "$1" >&2
    exit 1
  }
}

need curl
need jq

expect_json() {
  local label="$1"
  local path="$2"
  local token="$3"
  local filter="$4"
  local response
  response="$(curl -fsS -H "Authorization: Bearer $token" "$API_URL$path")"
  printf '%s' "$response" | jq -e "$filter" >/dev/null
  checks=$((checks + 1))
  printf 'ok %02d  %s\n' "$checks" "$label"
}

login() {
  local email="$1"
  curl -fsS -H 'content-type: application/json' \
    -d "{\"tenantSlug\":\"northwind\",\"email\":\"${email}\",\"password\":\"demo1234\"}" \
    "$API_URL/auth/login"
}

curl -fsS "$API_URL/health" | jq -e '.status == "ok" and .database == "up"' >/dev/null
checks=$((checks + 1))
printf 'ok %02d  API health and database\n' "$checks"

test "$(curl -fsS -o /dev/null -w '%{http_code}' "$WEB_URL")" = "200"
checks=$((checks + 1))
printf 'ok %02d  web application\n' "$checks"

admin_login="$(login 'admin@northwind.test')"
admin_token="$(printf '%s' "$admin_login" | jq -er '.token | select(type == "string" and length > 20)')"
printf '%s' "$admin_login" | jq -e '.user.role == "admin"' >/dev/null
checks=$((checks + 1))
printf 'ok %02d  admin login\n' "$checks"

expect_json 'seeded offers' '/offers' "$admin_token" 'type == "array" and length > 0'
expect_json 'seeded partners' '/partners' "$admin_token" 'type == "array" and length > 0'
expect_json 'append-only ledger data' '/ledger/entries' "$admin_token" 'type == "array" and length > 0'
expect_json 'summary report' '/reports/summary' "$admin_token" 'type == "object" and length > 0'
expect_json 'partner report' '/reports/partners' "$admin_token" 'type == "array" and length > 0'
expect_json 'fraud review data' '/reports/fraud' "$admin_token" 'type == "array" and length > 0'
expect_json 'audit data' '/reports/audit' "$admin_token" 'type == "array" and length > 0'
expect_json 'deterministic insights status' '/insights/status' "$admin_token" 'type == "object"'
expect_json 'deterministic partner insights' '/insights/partners' "$admin_token" 'type == "object"'

partner_login="$(login 'partner@northwind.test')"
partner_token="$(printf '%s' "$partner_login" | jq -er '.token | select(type == "string" and length > 20)')"
printf '%s' "$partner_login" | jq -e '.user.role == "partner"' >/dev/null
checks=$((checks + 1))
printf 'ok %02d  partner login\n' "$checks"

expect_json 'partner overview' '/portal/overview' "$partner_token" 'type == "object" and length > 0'
expect_json 'partner-scoped ledger' '/portal/ledger' "$partner_token" 'type == "array" and length > 0'
expect_json 'partner-scoped offers' '/portal/offers' "$partner_token" 'type == "array" and length > 0'

printf '\n%d smoke checks passed. No session token was printed.\n' "$checks"
