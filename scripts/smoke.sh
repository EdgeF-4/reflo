#!/usr/bin/env bash
set -Eeuo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
checks=0
failure_context="starting the smoke check"
failure_action="start the demo with \`docker compose up --build\`, wait for API health, then retry."

on_error() {
  local status="$?"
  trap - ERR
  printf 'smoke check failed while %s (exit %s). Next: %s\n' \
    "$failure_context" "$status" "$failure_action" >&2
  exit "$status"
}
trap on_error ERR

need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'missing required command: %s. Next: install it with the operating system package manager, then rerun npm run test:smoke.\n' "$1" >&2
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
  failure_context="requesting ${label} from ${path}"
  failure_action="run \`docker compose ps\` and \`docker compose logs api\`, restore the API, then retry."
  response="$(curl --fail --silent -H "Authorization: Bearer $token" "$API_URL$path")"
  printf '%s' "$response" | jq -e "$filter" >/dev/null
  checks=$((checks + 1))
  printf 'ok %02d  %s\n' "$checks" "$label"
}

login() {
  local email="$1"
  failure_context="signing in ${email}"
  failure_action="verify the seeded credentials and API health, then retry."
  curl --fail --silent -H 'content-type: application/json' \
    -d "{\"tenantSlug\":\"northwind\",\"email\":\"${email}\",\"password\":\"demo1234\"}" \
    "$API_URL/auth/login"
}

expect_api_error() {
  local label="$1"
  local expected_status="$2"
  local method="$3"
  local path="$4"
  local token="$5"
  local data="$6"
  local raw body status
  local args=(--silent --request "$method" --write-out $'\n%{http_code}')
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$data" ]]; then
    args+=(-H 'content-type: application/json' --data "$data")
  fi
  failure_context="checking the documented ${label} failure"
  failure_action="inspect the API response contract and restore its message plus nextAction fields."
  raw="$(curl "${args[@]}" "$API_URL$path")"
  body="${raw%$'\n'*}"
  status="${raw##*$'\n'}"
  [[ "$status" == "$expected_status" ]]
  printf '%s' "$body" | jq -e \
    '.message | type == "string" and contains("Next:")' >/dev/null
  printf '%s' "$body" | jq -e \
    '.nextAction | type == "string" and length > 10' >/dev/null
  checks=$((checks + 1))
  printf 'ok %02d  actionable %s failure\n' "$checks" "$label"
}

failure_context="checking API health"
failure_action="start the demo, wait for the API health check, then retry."
curl --fail --silent "$API_URL/health" | jq -e '.status == "ok" and .database == "up"' >/dev/null
checks=$((checks + 1))
printf 'ok %02d  API health and database\n' "$checks"

failure_context="checking the web application"
failure_action="run \`docker compose ps web\` and \`docker compose logs web\`, restore the web service, then retry."
test "$(curl --silent -o /dev/null -w '%{http_code}' "$WEB_URL")" = "200"
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

expect_api_error 'missing bearer token' 401 GET '/offers' '' ''
expect_api_error 'invalid credentials' 401 POST '/auth/login' '' \
  '{"tenantSlug":"northwind","email":"admin@northwind.test","password":"wrong-password"}'
expect_api_error 'invalid login body' 400 POST '/auth/login' '' '{}'
expect_api_error 'forbidden partner role' 403 GET '/offers' "$partner_token" ''
expect_api_error 'unknown tracking key' 404 POST '/track/event' '' \
  '{"publicKey":"missing","type":"click","sourceSite":"creatorcollective.test"}'
expect_api_error 'disallowed source domain' 403 POST '/track/event' '' \
  '{"publicKey":"pk_live_pro_8f2a","type":"click","sourceSite":"unlisted.example"}'
expect_api_error 'missing ledger entry' 404 GET \
  '/ledger/entries/00000000-0000-0000-0000-000000000000/events' "$admin_token" ''

failure_context="selecting a terminal ledger entry for the transition failure"
failure_action="verify the seeded ledger contains a paid entry, then rerun the smoke check."
paid_entry_id="$(curl --fail --silent -H "Authorization: Bearer $admin_token" \
  "$API_URL/ledger/entries" | jq -er 'map(select(.state == "paid"))[0].id')"
expect_api_error 'illegal ledger transition' 400 POST \
  "/ledger/entries/${paid_entry_id}/transition" "$admin_token" '{"type":"confirmed"}'

printf '\n%d smoke checks passed. No session token was printed.\n' "$checks"
