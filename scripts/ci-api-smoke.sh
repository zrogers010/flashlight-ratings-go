#!/usr/bin/env bash
# Smoke-test the API against a running local/CI stack.
# Expects API at http://127.0.0.1:8080 with demo seed data.
set -euo pipefail

API="${API_BASE_URL:-http://127.0.0.1:8080}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

check_json() {
  local path="$1"
  local jq_expr="$2"
  local label="$3"
  local body
  body="$(curl -sf "${API}${path}")" || fail "${label}: request failed (${path})"
  echo "${body}" | jq -e "${jq_expr}" >/dev/null \
    || fail "${label}: jq assertion failed (${jq_expr}) body=${body}"
  echo "OK  ${label}"
}

command -v jq >/dev/null || fail "jq is required"

echo "→ Smoke testing ${API}"

check_json "/flashlights?page=1&page_size=5" \
  '.items | type == "array" and length >= 1' \
  "list flashlights"

ID="$(curl -sf "${API}/flashlights?page=1&page_size=50" | jq -r '.items[0].id')"
[[ -n "${ID}" && "${ID}" != "null" ]] || fail "could not resolve a flashlight id"

check_json "/flashlights/${ID}" \
  '.id == '"${ID}"' and (.slug | type == "string")' \
  "flashlight detail"

check_json "/flashlights/${ID}" \
  'if .price_usd != null then (.amazon_in_stock | type == "boolean") else true end' \
  "detail includes offer availability"

check_json "/flashlights/${ID}" \
  '(.overall_score != null) or (.tactical_score != null)' \
  "detail includes scores"

check_json "/flashlights/${ID}" \
  '
    .metric_breakdown != null
    and (.metric_breakdown.formula_version | type == "string")
    and (.metric_breakdown.weighted | type == "object")
    and (.metric_breakdown.weighted | has("overall") or has("amazon_trust"))
  ' \
  "metric_breakdown shape"

check_json "/brands?detail=true" \
  'type == "array" and length >= 1' \
  "brands detail"

check_json "/rankings?use_case=tactical&page=1&page_size=5" \
  '.items | type == "array"' \
  "rankings tactical"

check_json "/compare?ids=${ID}" \
  '.items | type == "array" and length >= 1 and all(.[]; if .price_usd != null then (.amazon_in_stock | type == "boolean") else true end)' \
  "compare"

# Text search — demo seed includes Wurkkos FC11C / Sofirn IF22A
check_json "/flashlights?q=wurkkos&page=1&page_size=10" \
  '.items | type == "array" and length >= 1 and all(.[]; (.brand | test("wurkkos"; "i")) or (.name | test("wurkkos"; "i")) or (.slug | test("wurkkos"; "i")))' \
  "search q=wurkkos"

check_json "/flashlights?q=zzzz-no-such-model&page=1&page_size=5" \
  '.total == 0 and (.items | length == 0)' \
  "search empty results"

echo "→ All smoke checks passed"
