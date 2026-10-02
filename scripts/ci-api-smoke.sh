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
  'if .price_usd != null then (.in_stock | type == "boolean") else true end' \
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
  '.items | type == "array" and length >= 1 and all(.[]; if .price_usd != null then (.in_stock | type == "boolean") else true end)' \
  "compare"

# Text search — demo seed includes Wurkkos FC11C / Sofirn IF22A
check_json "/flashlights?q=wurkkos&page=1&page_size=10" \
  '.items | type == "array" and length >= 1 and all(.[]; (.brand | test("wurkkos"; "i")) or (.name | test("wurkkos"; "i")) or (.slug | test("wurkkos"; "i")))' \
  "search q=wurkkos"

check_json "/flashlights?q=zzzz-no-such-model&page=1&page_size=5" \
  '.total == 0 and (.items | length == 0)' \
  "search empty results"

# FLR-QA-01 follow-up: weapon-mount list should not have OOS without alternates
check_json "/flashlights?use_case=weapon-mount&page=1&page_size=50" \
  '.items | map(select(.availability_status == "out_of_stock" and .in_stock_alternate == null)) | length == 0' \
  "weapon-mount: no OOS without alternates"

# FLR-QA-01 follow-up: weapon-mount list should not have low-lumen items
check_json "/flashlights?use_case=weapon-mount&page=1&page_size=50" \
  '.items | map(select(.max_lumens != null and .max_lumens < 100)) | length == 0' \
  "weapon-mount: no low-lumen items"

# FLR-QA-01 follow-up: in_stock_alternate field structure
check_json "/flashlights?use_case=weapon-mount&page=1&page_size=50" \
  'if (.items | map(select(.in_stock_alternate != null)) | length) > 0 then (.items[] | select(.in_stock_alternate != null) | .in_stock_alternate | type == "object" and has("id") and has("slug") and has("name") and has("brand_name")) else true end' \
  "weapon-mount: alternate structure valid"

# FLR-QA-01: rankings should not have OOS/unknown items without alternates
check_json "/rankings?use_case=tactical&page=1&page_size=50" \
  '.items | map(select(.flashlight.availability_status != "in_stock" and .in_stock_alternate == null)) | length == 0' \
  "tactical rankings: no OOS/unknown without alternates"

# FLR-QA-01: rankings top-10 should not have OOS without alternates
check_json "/rankings?use_case=tactical&page=1&page_size=10" \
  '.items | map(select(.flashlight.availability_status != "in_stock" and .in_stock_alternate == null)) | length == 0' \
  "tactical rankings top-10: no OOS/unknown without alternates"

# FLR-QA-01: EDC rankings should not have OOS/unknown items without alternates
check_json "/rankings?use_case=edc&page=1&page_size=50" \
  '.items | map(select(.flashlight.availability_status != "in_stock" and .in_stock_alternate == null)) | length == 0' \
  "edc rankings: no OOS/unknown without alternates"

echo "→ All smoke checks passed"
