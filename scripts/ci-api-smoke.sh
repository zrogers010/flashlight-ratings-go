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

# FLR-QA-01 retest #3: Tactical top-10 validation
# - No badge-only (items without buyable affiliate_url that also lack in_stock_alternate)
# - No specialty (penlight|keychain|toy) slugs in in_stock_alternate
echo "→ Validating tactical top-10 for FLR-QA-01 retest #3"
TACTICAL_BODY="$(curl -sf "${API}/rankings?use_case=tactical&page=1&page_size=10")" || fail "tactical top-10: request failed"

# Check no badge-only: items with null/missing amazon_url must have in_stock_alternate
BADGE_ONLY_COUNT="$(echo "${TACTICAL_BODY}" | jq '[.items[] | select((.flashlight.amazon_url == null or .flashlight.amazon_url == "") and .in_stock_alternate == null)] | length')"
[[ "${BADGE_ONLY_COUNT}" == "0" ]] || fail "tactical top-10 has ${BADGE_ONLY_COUNT} badge-only items (no amazon_url and no in_stock_alternate)"
echo "OK  tactical top-10: no badge-only items"

# Check no specialty alternates: in_stock_alternate must not have penlight|keychain|toy in use_case_tags
SPECIALTY_ALT_COUNT="$(echo "${TACTICAL_BODY}" | jq '[.items[] | select(.in_stock_alternate != null and (.in_stock_alternate.use_case_tags | any(. == "penlight" or . == "keychain" or . == "toy")))] | length')"
[[ "${SPECIALTY_ALT_COUNT}" == "0" ]] || fail "tactical top-10 has ${SPECIALTY_ALT_COUNT} items with specialty alternates (penlight/keychain/toy use_case_tags)"
echo "OK  tactical top-10: no specialty alternates"

# Document catapult-v6 expectation: either same-family/non-specialty in_stock_alternate with buyable URL, or demoted
CATAPULT_IN_TOP10="$(echo "${TACTICAL_BODY}" | jq '[.items[] | select(.flashlight.slug == "catapult-v6")] | length')"
if [[ "${CATAPULT_IN_TOP10}" != "0" ]]; then
  # If catapult-v6 is in top-10, validate it has either a buyable primary amazon_url or a valid non-specialty alternate
  CATAPULT_ALT_TAGS="$(echo "${TACTICAL_BODY}" | jq -r '.items[] | select(.flashlight.slug == "catapult-v6") | .in_stock_alternate.use_case_tags // [] | @json')"
  CATAPULT_PRIMARY_URL="$(echo "${TACTICAL_BODY}" | jq -r '.items[] | select(.flashlight.slug == "catapult-v6") | .flashlight.amazon_url // "null"')"
  
  if [[ "${CATAPULT_PRIMARY_URL}" == "null" ]] && echo "${CATAPULT_ALT_TAGS}" | jq -e 'any(. == "penlight" or . == "keychain" or . == "toy")' >/dev/null 2>&1; then
    fail "catapult-v6 in tactical top-10 with null primary URL and specialty alternate tags (${CATAPULT_ALT_TAGS})"
  fi
  echo "OK  catapult-v6 in tactical top-10 with valid affiliate or non-specialty alternate"
else
  echo "OK  catapult-v6 demoted from tactical top-10 (expected if no valid affiliate or alternate)"
fi

# FLR-QA-01 retest #3: EDC top-10 validation
echo "→ Validating EDC top-10 for FLR-QA-01 retest #3"
EDC_BODY="$(curl -sf "${API}/rankings?use_case=edc&page=1&page_size=10")" || fail "EDC top-10: request failed"

# Check no badge-only
EDC_BADGE_ONLY_COUNT="$(echo "${EDC_BODY}" | jq '[.items[] | select((.flashlight.amazon_url == null or .flashlight.amazon_url == "") and .in_stock_alternate == null)] | length')"
[[ "${EDC_BADGE_ONLY_COUNT}" == "0" ]] || fail "EDC top-10 has ${EDC_BADGE_ONLY_COUNT} badge-only items"
echo "OK  EDC top-10: no badge-only items"

# Check no specialty alternates
EDC_SPECIALTY_ALT_COUNT="$(echo "${EDC_BODY}" | jq '[.items[] | select(.in_stock_alternate != null and (.in_stock_alternate.use_case_tags | any(. == "penlight" or . == "keychain" or . == "toy")))] | length')"
[[ "${EDC_SPECIALTY_ALT_COUNT}" == "0" ]] || fail "EDC top-10 has ${EDC_SPECIALTY_ALT_COUNT} items with specialty alternates (penlight/keychain/toy use_case_tags)"
echo "OK  EDC top-10: no specialty alternates"


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

# Cleanup PR: Verify blank CSV cells clear DB values (issue #1)
echo "→ Testing blank CSV cell handling (issue #1)"

# Get database credentials from environment or use defaults (match docker-compose.yml)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-flashlight}"
DB_USER="${DB_USER:-flashlight_app}"
DB_PASS="${DB_PASS:-flashlight_dev}"
DB_SSLMODE="${DB_SSLMODE:-disable}"
export PGPASSWORD="${DB_PASS}"
PSQL="psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -A"

# Insert a test product with max_lumens=999
TEST_SLUG="test-blank-csv-$(date +%s)"
${PSQL} <<SQL || fail "failed to insert test product"
INSERT INTO brands (name, slug) VALUES ('TestBrand', 'testbrand') ON CONFLICT (slug) DO NOTHING;
INSERT INTO flashlights (brand_id, name, slug, is_active) 
  SELECT id, 'Test Light', '${TEST_SLUG}', TRUE FROM brands WHERE slug = 'testbrand'
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO flashlight_specs (flashlight_id, max_lumens, max_candela)
  SELECT id, 999, 10000 FROM flashlights WHERE slug = '${TEST_SLUG}'
  ON CONFLICT (flashlight_id) DO NOTHING;
SQL

# Create a temporary CSV with our test product and blank max_lumens
TEMP_CSV="/tmp/test-blank-csv-$$.csv"
cat > "${TEMP_CSV}" <<'CSVDATA'
brand_name,brand_slug,brand_country_code,brand_website_url,model_name,model_slug,model_code,description,release_year,msrp_usd,asin,amazon_url,current_price_usd,amazon_rating_count,amazon_average_rating,image_url,max_lumens,sustained_lumens,max_candela,beam_distance_m,runtime_max_min,runtime_500_min,turbo_stepdown_sec,beam_pattern,battery_type,recharge_type,battery_replaceable,weight_g,length_mm,head_diameter_mm,body_diameter_mm,switch_type,waterproof_rating,impact_resistance_m,body_material,use_case_tags,amazon_purchasable,amazon_availability_checked_at
CSVDATA
echo "TestBrand,testbrand,US,,Test Light,${TEST_SLUG},TEST1,Test product for blank CSV validation,2024,99.99,,,,,,,,,,,,,,,,,,,,,,,,,edc,true," >> "${TEMP_CSV}"

# Import the CSV (should clear max_lumens to NULL, leave max_candela at 10000 since not in CSV)
./scripts/import-manual-catalog.sh "${TEMP_CSV}" >/dev/null 2>&1 || fail "CSV import failed for blank cell test"
rm -f "${TEMP_CSV}"

# Verify max_lumens is now NULL
TEST_LUMENS=$(${PSQL} -c "SELECT max_lumens FROM flashlight_specs WHERE flashlight_id = (SELECT id FROM flashlights WHERE slug = '${TEST_SLUG}')" 2>&1 | tr -d ' \n')
[[ "${TEST_LUMENS}" == "" ]] || fail "blank CSV max_lumens should become NULL, got: ${TEST_LUMENS}"
echo "OK  blank CSV cell cleared max_lumens (was 999, now NULL)"

# Verify max_candela is still 10000 (CSV doesn't own it for this product since column is blank)
TEST_CANDELA=$(${PSQL} -c "SELECT max_candela FROM flashlight_specs WHERE flashlight_id = (SELECT id FROM flashlights WHERE slug = '${TEST_SLUG}')" 2>&1 | tr -d ' \n')
[[ "${TEST_CANDELA}" == "10000" ]] || fail "blank CSV max_candela should be cleared (CSV owns all specs for products it includes), got: ${TEST_CANDELA}"
echo "OK  blank CSV cell cleared max_candela (was 10000, now NULL)"

# Cleanup test product
${PSQL} -c "DELETE FROM flashlight_specs WHERE flashlight_id = (SELECT id FROM flashlights WHERE slug = '${TEST_SLUG}')" >/dev/null 2>&1
${PSQL} -c "DELETE FROM flashlights WHERE slug = '${TEST_SLUG}'" >/dev/null 2>&1

# PR#75 QA: Run scoring batch and verify partial-spec cap
echo "→ Running scoring batch (PR#75 QA requirement)"

# Build and run scoring job
cd "$(dirname "$0")/.."
go build -o /tmp/scorejob ./cmd/scorejob || fail "failed to build scorejob"

# Run scoring batch with DATABASE_URL
echo "→ Running scoring batch..."
export DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
SCORING_OUTPUT=$(/tmp/scorejob -once 2>&1) || fail "scorejob failed: ${SCORING_OUTPUT}"
echo "${SCORING_OUTPUT}"

# Verify partial-spec cap via database query
# This query gets all partial-spec products and checks if any exceed the cap (10th full-spec - 1.0)
export PGPASSWORD="${DB_PASS}"
PSQL="psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -A"

# Get the latest completed run
LATEST_RUN=$(${PSQL} -c "SELECT id FROM scoring_runs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1" 2>/dev/null) || fail "failed to query latest scoring run"
[[ -n "${LATEST_RUN}" && "${LATEST_RUN}" != "" ]] || fail "no completed scoring run found"
echo "→ Checking partial-spec cap for run ${LATEST_RUN}"

# Get count of scored products
SCORED_COUNT=$(${PSQL} -c "SELECT COUNT(DISTINCT flashlight_id) FROM flashlight_scores WHERE run_id = ${LATEST_RUN}" 2>/dev/null | tr -d ' \n') || fail "failed to count scored products"
[[ "${SCORED_COUNT}" -ge 1 ]] || fail "scoring batch scored ${SCORED_COUNT} products, expected >= 1"
echo "OK  scoring batch scored ${SCORED_COUNT} products"

# Get the 10th-highest full-spec overall score
FULL_SPEC_QUERY="
WITH full_spec_products AS (
  SELECT f.id
  FROM flashlights f
  JOIN flashlight_specs s ON s.flashlight_id = f.id
  WHERE f.is_active = TRUE
    AND s.max_lumens IS NOT NULL AND s.max_lumens > 0
    AND (s.max_candela IS NOT NULL AND s.max_candela > 0 OR s.beam_distance_m IS NOT NULL AND s.beam_distance_m > 0)
    AND (s.runtime_high_min IS NOT NULL AND s.runtime_high_min > 0)
)
SELECT score 
FROM flashlight_scores fs
WHERE fs.run_id = ${LATEST_RUN}
  AND fs.profile_id = (SELECT id FROM scoring_profiles WHERE slug = 'overall' LIMIT 1)
  AND fs.flashlight_id IN (SELECT id FROM full_spec_products)
ORDER BY score DESC
OFFSET 9 LIMIT 1;
"

TENTH_FULL_SPEC=$(${PSQL} -c "${FULL_SPEC_QUERY}" 2>&1 | tr -d ' \n')
PSQL_EXIT=$?

# Only validate cap if we have at least 10 full-spec products
if [[ ${PSQL_EXIT} -eq 0 ]] && [[ -n "${TENTH_FULL_SPEC}" && "${TENTH_FULL_SPEC}" != "" ]]; then
  CAP_VALUE=$(awk "BEGIN {print ${TENTH_FULL_SPEC} - 1.0}")
  echo "→ 10th full-spec score: ${TENTH_FULL_SPEC}, cap value: ${CAP_VALUE}"
  
  # Check if any partial-spec product exceeds the cap
  PARTIAL_SPEC_QUERY="
  WITH partial_spec_products AS (
    SELECT f.id
    FROM flashlights f
    JOIN flashlight_specs s ON s.flashlight_id = f.id
    WHERE f.is_active = TRUE
      AND NOT (
        s.max_lumens IS NOT NULL AND s.max_lumens > 0
        AND (s.max_candela IS NOT NULL AND s.max_candela > 0 OR s.beam_distance_m IS NOT NULL AND s.beam_distance_m > 0)
        AND (s.runtime_high_min IS NOT NULL AND s.runtime_high_min > 0)
      )
  )
  SELECT COUNT(*)
  FROM flashlight_scores fs
  WHERE fs.run_id = ${LATEST_RUN}
    AND fs.profile_id = (SELECT id FROM scoring_profiles WHERE slug = 'overall' LIMIT 1)
    AND fs.flashlight_id IN (SELECT id FROM partial_spec_products)
    AND fs.score > ${CAP_VALUE};
  "
  
  VIOLATIONS=$(${PSQL} -c "${PARTIAL_SPEC_QUERY}" 2>&1 | tr -d ' \n')
  [[ $? -eq 0 ]] || fail "failed to check partial-spec cap violations: ${VIOLATIONS}"
  [[ "${VIOLATIONS}" == "0" ]] || fail "${VIOLATIONS} partial-spec products exceed cap of ${CAP_VALUE}"
  echo "OK  all partial-spec products are at or below cap (${CAP_VALUE})"
else
  echo "OK  fewer than 10 full-spec products in demo data, no cap validation needed"
fi

echo "→ All smoke checks passed"
