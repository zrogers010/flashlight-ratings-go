#!/usr/bin/env bash
#
# export-orphans-to-csv.sh — rescue DB-only ("orphan") flashlights back into
# manual_catalog.csv so the catalog sync owns their price/availability again.
#
# Orphans are flashlights that exist in Postgres (from older imports) but have
# no row in the catalog CSV. Their review pages render with frozen prices
# because the sync only refreshes CSV rows. This script reverses the mapping
# in scripts/import-manual-catalog.sh: it exports every ACTIVE orphan that has
# an Amazon ASIN as a manual_catalog.csv-format row.
#
# Output: data/orphan_rescue.csv (header + rows).
# Review it, then append the data rows to the live catalog:
#
#   tail -n +2 data/orphan_rescue.csv >> data/manual_catalog.csv
#   bash scripts/catalog-sync.sh     # refresh prices + reimport
#
# Rows are skipped when:
#   - the product is marked inactive (is_active = false), or
#   - the ASIN already appears in the catalog CSV (duplicate listing), or
#   - the product has no Amazon ASIN at all.
#
# Usage:
#   bash scripts/export-orphans-to-csv.sh [path/to/manual_catalog.csv]

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "${APP_DIR}"

CSV_PATH="${1:-data/manual_catalog.csv}"
OUT_PATH="${OUT_PATH:-data/orphan_rescue.csv}"

# Pick up POSTGRES_USER / POSTGRES_DB from .env if present
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ ! -f "${CSV_PATH}" ]]; then
  echo "ERROR: catalog CSV not found at ${CSV_PATH}" >&2
  exit 1
fi

# docker-compose v1 vs v2 detection (mirrors deploy.sh)
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  COMPOSE="docker compose"
fi

# Build SQL-quoted exclusion lists from the current catalog CSV.
SLUG_LIST=$(python3 - "${CSV_PATH}" <<'PY'
import csv, sys
rows = list(csv.reader(open(sys.argv[1])))
i = rows[0].index("model_slug")
slugs = sorted({r[i].strip() for r in rows[1:] if r[i].strip()})
print(",".join("'" + s.replace("'", "''") + "'" for s in slugs))
PY
)
ASIN_LIST=$(python3 - "${CSV_PATH}" <<'PY'
import csv, sys
rows = list(csv.reader(open(sys.argv[1])))
i = rows[0].index("asin")
asins = sorted({r[i].strip() for r in rows[1:] if r[i].strip()})
print(",".join("'" + a + "'" for a in asins))
PY
)

# Server-side COPY TO STDOUT: unlike \copy, plain COPY may span multiple
# lines, and psql streams the result to stdout.
SQL=$(cat <<EOF
COPY (
  SELECT
    b.name                                        AS brand_name,
    b.slug                                        AS brand_slug,
    b.country_code                                AS brand_country_code,
    b.website_url                                 AS brand_website_url,
    f.name                                        AS model_name,
    f.slug                                        AS model_slug,
    f.model_code                                  AS model_code,
    f.description                                 AS description,
    EXTRACT(YEAR FROM f.launch_date)::int         AS release_year,
    f.msrp_usd                                    AS msrp_usd,
    al.asin                                       AS asin,
    al.affiliate_url                              AS amazon_url,
    price.price                                   AS current_price_usd,
    snap.rating_count                             AS amazon_rating_count,
    snap.average_rating                           AS amazon_average_rating,
    media.url                                     AS image_url,
    s.max_lumens                                  AS max_lumens,
    s.sustained_lumens                            AS sustained_lumens,
    s.max_candela                                 AS max_candela,
    s.beam_distance_m                             AS beam_distance_m,
    s.runtime_high_min                            AS runtime_max_min,
    s.runtime_500_min                             AS runtime_500_min,
    s.turbo_stepdown_sec                          AS turbo_stepdown_sec,
    s.beam_pattern                                AS beam_pattern,
    bt.code                                       AS battery_type,
    s.recharge_type                               AS recharge_type,
    CASE WHEN s.battery_replaceable IS NULL THEN NULL
         WHEN s.battery_replaceable THEN 'true' ELSE 'false' END
                                                  AS battery_replaceable,
    s.weight_g                                    AS weight_g,
    s.length_mm                                   AS length_mm,
    s.head_diameter_mm                            AS head_diameter_mm,
    s.body_diameter_mm                            AS body_diameter_mm,
    s.switch_type                                 AS switch_type,
    s.waterproof_rating                           AS waterproof_rating,
    s.impact_resistance_m                         AS impact_resistance_m,
    s.body_material                               AS body_material,
    COALESCE(tags.tag_list, '')                   AS use_case_tags,
    'true'                                        AS amazon_purchasable,
    NULL::text                                    AS amazon_availability_checked_at
  FROM flashlights f
  JOIN brands b ON b.id = f.brand_id
  JOIN LATERAL (
    SELECT asin, affiliate_url
    FROM affiliate_links
    WHERE flashlight_id = f.id AND provider = 'amazon' AND asin IS NOT NULL
    ORDER BY is_primary DESC, is_active DESC, updated_at DESC
    LIMIT 1
  ) al ON TRUE
  LEFT JOIN flashlight_specs s ON s.flashlight_id = f.id
  LEFT JOIN LATERAL (
    SELECT price
    FROM flashlight_price_snapshots
    WHERE flashlight_id = f.id
    ORDER BY captured_at DESC
    LIMIT 1
  ) price ON TRUE
  LEFT JOIN LATERAL (
    SELECT rating_count, average_rating
    FROM amazon_product_snapshots
    WHERE flashlight_id = f.id
    ORDER BY captured_at DESC
    LIMIT 1
  ) snap ON TRUE
  LEFT JOIN LATERAL (
    SELECT url
    FROM flashlight_media
    WHERE flashlight_id = f.id AND media_type = 'image'
    ORDER BY sort_order, id
    LIMIT 1
  ) media ON TRUE
  LEFT JOIN LATERAL (
    SELECT bt2.code
    FROM flashlight_battery_compatibility fbc
    JOIN battery_types bt2 ON bt2.id = fbc.battery_type_id
    WHERE fbc.flashlight_id = f.id
    ORDER BY fbc.is_primary DESC
    LIMIT 1
  ) bt ON TRUE
  LEFT JOIN LATERAL (
    SELECT string_agg(u.slug, ',' ORDER BY u.slug) AS tag_list
    FROM flashlight_use_cases fuc
    JOIN use_cases u ON u.id = fuc.use_case_id
    WHERE fuc.flashlight_id = f.id
  ) tags ON TRUE
  WHERE f.is_active = TRUE
    AND f.slug NOT IN (${SLUG_LIST})
    AND al.asin NOT IN (${ASIN_LIST})
  ORDER BY b.name, f.name
) TO STDOUT WITH CSV
EOF
)

HEADER=$(head -n 1 "${CSV_PATH}")

echo "→ Exporting active orphan flashlights not present in ${CSV_PATH}..."
echo "${HEADER}" > "${OUT_PATH}"
echo "${SQL}" | ${COMPOSE} exec -T db psql \
  -U "${POSTGRES_USER:-flashlight_app}" \
  -d "${POSTGRES_DB:-flashlight}" \
  -v ON_ERROR_STOP=1 >> "${OUT_PATH}"

COUNT=$(( $(wc -l < "${OUT_PATH}") - 1 ))
echo "✓ Wrote ${COUNT} orphan rows to ${OUT_PATH}"
echo ""
echo "Next steps:"
echo "  1. Review ${OUT_PATH} (spot-check ASINs, specs, tags)."
echo "  2. Append to the live catalog:  tail -n +2 ${OUT_PATH} >> ${CSV_PATH}"
echo "  3. Refresh + reimport:          bash scripts/catalog-sync.sh"
echo ""
echo "Housekeeping for INACTIVE orphans (hidden pages, links still active):"
echo "  ${COMPOSE} exec -T db psql -U \${POSTGRES_USER:-flashlight_app} -d \${POSTGRES_DB:-flashlight} -c \\"
echo "    \"UPDATE affiliate_links al SET is_active = FALSE, updated_at = NOW()"
echo "      FROM flashlights f WHERE f.id = al.flashlight_id AND f.is_active = FALSE;\""
