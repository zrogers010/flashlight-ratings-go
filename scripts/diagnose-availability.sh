#!/usr/bin/env bash
#
# Diagnose availability semantics in production/staging database
#
# Usage:
#   bash scripts/diagnose-availability.sh [database-url]
#
# If database-url is not provided, attempts to use DATABASE_URL env var.
#
# This script:
# 1. Queries flashlight_price_snapshots to analyze in_stock distribution
# 2. Samples ASINs from each category (in_stock, out_of_stock, unknown)
# 3. Shows affiliate_links.is_active status for comparison
# 4. Identifies products that dropped from purchasable to non-purchasable recently

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "ERROR: Database URL required."
  echo ""
  echo "Usage:"
  echo "  bash scripts/diagnose-availability.sh postgresql://user:pass@host:5432/dbname"
  echo "  DATABASE_URL=postgresql://... bash scripts/diagnose-availability.sh"
  exit 1
fi

echo "========================================="
echo "Availability Status Diagnostic Report"
echo "========================================="
echo ""
echo "Database: ${DB_URL%%\?*}" # Hide password
echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Function to run psql queries
psql_query() {
  psql "$DB_URL" -t -A -F $'\t' -c "$1"
}

echo "========================================="
echo "1. Price Snapshot in_stock Distribution"
echo "========================================="
echo ""

psql_query "
SELECT 
  CASE 
    WHEN in_stock IS NULL THEN 'NULL (unknown)'
    WHEN in_stock = TRUE THEN 'TRUE (in_stock)'
    WHEN in_stock = FALSE THEN 'FALSE (out_of_stock)'
  END AS in_stock_status,
  COUNT(*) AS snapshot_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM flashlight_price_snapshots
WHERE currency_code = 'USD'
GROUP BY in_stock
ORDER BY in_stock DESC NULLS LAST;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "2. Latest Price Status per Flashlight"
echo "========================================="
echo ""

psql_query "
WITH latest_price AS (
  SELECT DISTINCT ON (flashlight_id)
    flashlight_id,
    in_stock,
    captured_at
  FROM flashlight_price_snapshots
  WHERE currency_code = 'USD'
  ORDER BY flashlight_id, captured_at DESC
)
SELECT 
  CASE 
    WHEN in_stock IS NULL THEN 'NULL (unknown)'
    WHEN in_stock = TRUE THEN 'TRUE (in_stock)'
    WHEN in_stock = FALSE THEN 'FALSE (out_of_stock)'
  END AS latest_in_stock,
  COUNT(*) AS flashlight_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM latest_price
GROUP BY in_stock
ORDER BY in_stock DESC NULLS LAST;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "3. Affiliate Link is_active Status"
echo "========================================="
echo ""

psql_query "
SELECT 
  CASE 
    WHEN is_active = TRUE THEN 'TRUE (active)'
    WHEN is_active = FALSE THEN 'FALSE (disabled)'
  END AS is_active_status,
  COUNT(*) AS affiliate_link_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM affiliate_links
WHERE provider = 'amazon'
  AND region_code = 'US'
GROUP BY is_active
ORDER BY is_active DESC;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "4. Sample ASINs by Status"
echo "========================================="
echo ""

echo "--- In Stock (TRUE) Sample (5 items) ---"
psql_query "
WITH latest_price AS (
  SELECT DISTINCT ON (p.flashlight_id)
    p.flashlight_id,
    p.in_stock,
    p.captured_at
  FROM flashlight_price_snapshots p
  WHERE p.currency_code = 'USD'
    AND p.in_stock = TRUE
  ORDER BY p.flashlight_id, p.captured_at DESC
)
SELECT 
  f.id,
  b.name AS brand,
  f.name AS model,
  al.asin,
  al.is_active,
  lp.captured_at::date AS last_checked
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN affiliate_links al ON al.flashlight_id = f.id 
  AND al.provider = 'amazon' 
  AND al.region_code = 'US'
LIMIT 5;
" | column -t -s $'\t'

echo ""
echo "--- Out of Stock (FALSE) Sample (5 items) ---"
psql_query "
WITH latest_price AS (
  SELECT DISTINCT ON (p.flashlight_id)
    p.flashlight_id,
    p.in_stock,
    p.captured_at
  FROM flashlight_price_snapshots p
  WHERE p.currency_code = 'USD'
    AND p.in_stock = FALSE
  ORDER BY p.flashlight_id, p.captured_at DESC
)
SELECT 
  f.id,
  b.name AS brand,
  f.name AS model,
  al.asin,
  al.is_active,
  lp.captured_at::date AS last_checked
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN affiliate_links al ON al.flashlight_id = f.id 
  AND al.provider = 'amazon' 
  AND al.region_code = 'US'
LIMIT 5;
" | column -t -s $'\t'

echo ""
echo "--- Unknown (NULL) Sample (5 items) ---"
psql_query "
WITH latest_price AS (
  SELECT DISTINCT ON (p.flashlight_id)
    p.flashlight_id,
    p.in_stock,
    p.captured_at
  FROM flashlight_price_snapshots p
  WHERE p.currency_code = 'USD'
    AND p.in_stock IS NULL
  ORDER BY p.flashlight_id, p.captured_at DESC
)
SELECT 
  f.id,
  b.name AS brand,
  f.name AS model,
  al.asin,
  al.is_active,
  lp.captured_at::date AS last_checked
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
JOIN latest_price lp ON lp.flashlight_id = f.id
LEFT JOIN affiliate_links al ON al.flashlight_id = f.id 
  AND al.provider = 'amazon' 
  AND al.region_code = 'US'
LIMIT 5;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "5. Recently Disabled Products (Last 7 Days)"
echo "========================================="
echo ""

psql_query "
WITH recent_disabled AS (
  SELECT DISTINCT ON (flashlight_id)
    flashlight_id,
    is_active,
    updated_at
  FROM affiliate_links
  WHERE provider = 'amazon'
    AND region_code = 'US'
    AND is_active = FALSE
    AND updated_at >= NOW() - INTERVAL '7 days'
  ORDER BY flashlight_id, updated_at DESC
),
latest_price AS (
  SELECT DISTINCT ON (flashlight_id)
    flashlight_id,
    in_stock,
    price,
    captured_at
  FROM flashlight_price_snapshots
  WHERE currency_code = 'USD'
  ORDER BY flashlight_id, captured_at DESC
)
SELECT 
  f.id,
  b.name AS brand,
  f.name AS model,
  al.asin,
  COALESCE(lp.in_stock::text, 'NULL') AS in_stock,
  COALESCE(lp.price::text, 'NULL') AS price_usd,
  rd.updated_at::date AS disabled_date
FROM recent_disabled rd
JOIN flashlights f ON f.id = rd.flashlight_id
JOIN brands b ON b.id = f.brand_id
LEFT JOIN affiliate_links al ON al.flashlight_id = f.id 
  AND al.provider = 'amazon' 
  AND al.region_code = 'US'
LEFT JOIN latest_price lp ON lp.flashlight_id = f.id
ORDER BY rd.updated_at DESC
LIMIT 10;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "6. Price Snapshot Transition Analysis"
echo "========================================="
echo ""

echo "Products that went from in_stock=TRUE to FALSE in last 7 days:"
psql_query "
WITH ranked_snapshots AS (
  SELECT 
    flashlight_id,
    in_stock,
    captured_at,
    LAG(in_stock) OVER (PARTITION BY flashlight_id ORDER BY captured_at) AS prev_in_stock,
    ROW_NUMBER() OVER (PARTITION BY flashlight_id ORDER BY captured_at DESC) AS rn
  FROM flashlight_price_snapshots
  WHERE currency_code = 'USD'
    AND captured_at >= NOW() - INTERVAL '7 days'
),
transitions AS (
  SELECT 
    flashlight_id,
    prev_in_stock,
    in_stock,
    captured_at
  FROM ranked_snapshots
  WHERE rn = 1
    AND prev_in_stock = TRUE
    AND in_stock = FALSE
)
SELECT 
  f.id,
  b.name AS brand,
  f.name AS model,
  al.asin,
  t.captured_at::date AS went_unavailable
FROM transitions t
JOIN flashlights f ON f.id = t.flashlight_id
JOIN brands b ON b.id = f.brand_id
LEFT JOIN affiliate_links al ON al.flashlight_id = f.id 
  AND al.provider = 'amazon' 
  AND al.region_code = 'US'
ORDER BY t.captured_at DESC
LIMIT 10;
" | column -t -s $'\t'

echo ""
echo "========================================="
echo "7. Recommendations"
echo "========================================="
echo ""
echo "To investigate further:"
echo ""
echo "1. Check raw Creators API responses for sample ASINs:"
echo "   - Capture OffersV2.Listings array"
echo "   - Check Availability.Type values"
echo "   - Verify price data"
echo ""
echo "2. Manual verification on Amazon.com:"
echo "   - Visit ASINs marked as unavailable"
echo "   - Check if they actually have buy boxes"
echo "   - Compare with what sync recorded"
echo ""
echo "3. Enable debug logging in sync:"
echo "   - Log unknown availability status values"
echo "   - Log when products with offers are marked unavailable"
echo "   - Track raw API responses for investigation"
echo ""
echo "4. Review recent sync logs for:"
echo "   - Error messages"
echo "   - Fallback to Rainforest events"
echo "   - Budget exhaustion warnings"
echo ""
