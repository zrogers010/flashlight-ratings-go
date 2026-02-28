#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <csv_path>"
  exit 1
fi

CSV_PATH="$1"
if [[ ! -f "${CSV_PATH}" ]]; then
  echo "CSV file not found: ${CSV_PATH}"
  exit 1
fi

DB_SERVICE="${DB_SERVICE:-db}"
DB_NAME="${DB_NAME:-flashlight}"
DB_USER="${DB_USER:-flashlight_app}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi

echo "Importing manual catalog from ${CSV_PATH} ..."

{
  cat <<'SQL'
BEGIN;
ALTER TABLE flashlights
  ADD COLUMN IF NOT EXISTS msrp_usd NUMERIC(12,2) CHECK (msrp_usd > 0);

ALTER TABLE flashlight_specs
  ADD COLUMN IF NOT EXISTS sustained_lumens INTEGER CHECK (sustained_lumens > 0),
  ADD COLUMN IF NOT EXISTS runtime_500_min INTEGER CHECK (runtime_500_min > 0),
  ADD COLUMN IF NOT EXISTS turbo_stepdown_sec INTEGER CHECK (turbo_stepdown_sec > 0),
  ADD COLUMN IF NOT EXISTS beam_pattern TEXT CHECK (beam_pattern IN ('flood', 'throw', 'hybrid')),
  ADD COLUMN IF NOT EXISTS recharge_type TEXT CHECK (recharge_type IN ('usb-c', 'magnetic', 'none')),
  ADD COLUMN IF NOT EXISTS battery_replaceable BOOLEAN,
  ADD COLUMN IF NOT EXISTS body_material TEXT;

CREATE TEMP TABLE tmp_manual_catalog (
  brand_name TEXT NOT NULL,
  brand_slug TEXT,
  brand_country_code TEXT,
  brand_website_url TEXT,
  model_name TEXT NOT NULL,
  model_slug TEXT,
  model_code TEXT,
  description TEXT,
  release_year INTEGER,
  msrp_usd NUMERIC(12,2),
  asin TEXT,
  amazon_url TEXT,
  current_price_usd NUMERIC(12,2),
  amazon_rating_count INTEGER,
  amazon_average_rating NUMERIC(4,2),
  image_url TEXT,
  max_lumens INTEGER,
  sustained_lumens INTEGER,
  max_candela INTEGER,
  beam_distance_m INTEGER,
  runtime_max_min INTEGER,
  runtime_500_min INTEGER,
  turbo_stepdown_sec INTEGER,
  beam_pattern TEXT,
  battery_type TEXT,
  recharge_type TEXT,
  battery_replaceable BOOLEAN,
  weight_g NUMERIC(8,2),
  length_mm NUMERIC(8,2),
  head_diameter_mm NUMERIC(8,2),
  body_diameter_mm NUMERIC(8,2),
  switch_type TEXT,
  waterproof_rating TEXT,
  impact_resistance_m NUMERIC(8,2),
  body_material TEXT,
  use_case_tags TEXT
);
\copy tmp_manual_catalog FROM STDIN WITH (FORMAT csv, HEADER true);
SQL
  cat "${CSV_PATH}"
  cat <<'SQL'
\.

WITH cleaned AS (
  SELECT
    trim(brand_name) AS brand_name,
    COALESCE(NULLIF(trim(brand_slug), ''), lower(regexp_replace(trim(brand_name), '[^a-zA-Z0-9]+', '-', 'g'))) AS brand_slug,
    NULLIF(upper(trim(brand_country_code)), '') AS brand_country_code,
    NULLIF(trim(brand_website_url), '') AS brand_website_url,
    trim(model_name) AS model_name,
    COALESCE(NULLIF(trim(model_slug), ''), lower(regexp_replace(trim(brand_name || '-' || model_name), '[^a-zA-Z0-9]+', '-', 'g'))) AS model_slug,
    NULLIF(trim(model_code), '') AS model_code,
    NULLIF(trim(description), '') AS description,
    release_year,
    msrp_usd,
    NULLIF(upper(trim(asin)), '') AS asin,
    NULLIF(trim(amazon_url), '') AS amazon_url,
    current_price_usd,
    amazon_rating_count,
    amazon_average_rating,
    NULLIF(trim(image_url), '') AS image_url,
    max_lumens,
    sustained_lumens,
    max_candela,
    beam_distance_m,
    runtime_max_min,
    runtime_500_min,
    turbo_stepdown_sec,
    NULLIF(lower(trim(beam_pattern)), '') AS beam_pattern,
    NULLIF(upper(trim(battery_type)), '') AS battery_type,
    NULLIF(lower(trim(recharge_type)), '') AS recharge_type,
    battery_replaceable,
    weight_g,
    length_mm,
    head_diameter_mm,
    body_diameter_mm,
    NULLIF(lower(trim(switch_type)), '') AS switch_type,
    NULLIF(upper(trim(waterproof_rating)), '') AS waterproof_rating,
    impact_resistance_m,
    NULLIF(trim(body_material), '') AS body_material,
    COALESCE(use_case_tags, '') AS use_case_tags
  FROM tmp_manual_catalog
),
ins_brands AS (
  INSERT INTO brands (name, slug, country_code, website_url)
  SELECT DISTINCT
    c.brand_name,
    c.brand_slug,
    c.brand_country_code,
    c.brand_website_url
  FROM cleaned c
  ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      country_code = COALESCE(EXCLUDED.country_code, brands.country_code),
      website_url = COALESCE(EXCLUDED.website_url, brands.website_url)
  RETURNING id
),
upsert_flashlights AS (
  INSERT INTO flashlights (brand_id, name, slug, model_code, description, launch_date, msrp_usd, is_active, updated_at)
  SELECT
    b.id,
    c.model_name,
    c.model_slug,
    c.model_code,
    c.description,
    CASE WHEN c.release_year IS NULL THEN NULL ELSE make_date(c.release_year, 1, 1) END,
    c.msrp_usd,
    TRUE,
    NOW()
  FROM cleaned c
  JOIN brands b ON b.slug = c.brand_slug
  ON CONFLICT (slug) DO UPDATE
    SET
      brand_id = EXCLUDED.brand_id,
      name = EXCLUDED.name,
      model_code = COALESCE(EXCLUDED.model_code, flashlights.model_code),
      description = COALESCE(EXCLUDED.description, flashlights.description),
      launch_date = COALESCE(EXCLUDED.launch_date, flashlights.launch_date),
      msrp_usd = COALESCE(EXCLUDED.msrp_usd, flashlights.msrp_usd),
      is_active = TRUE,
      updated_at = NOW()
  RETURNING id, slug
),
upsert_specs AS (
  INSERT INTO flashlight_specs (
    flashlight_id,
    max_lumens,
    sustained_lumens,
    max_candela,
    beam_distance_m,
    runtime_high_min,
    runtime_500_min,
    turbo_stepdown_sec,
    beam_pattern,
    recharge_type,
    battery_replaceable,
    weight_g,
    length_mm,
    head_diameter_mm,
    body_diameter_mm,
    switch_type,
    waterproof_rating,
    impact_resistance_m,
    body_material
  )
  SELECT
    f.id,
    COALESCE(c.max_lumens, 1),
    c.sustained_lumens,
    c.max_candela,
    c.beam_distance_m,
    c.runtime_max_min,
    c.runtime_500_min,
    c.turbo_stepdown_sec,
    CASE
      WHEN c.beam_pattern IN ('flood', 'throw', 'hybrid') THEN c.beam_pattern
      ELSE NULL
    END,
    CASE
      WHEN c.recharge_type IN ('usb-c', 'magnetic', 'none') THEN c.recharge_type
      ELSE NULL
    END,
    c.battery_replaceable,
    c.weight_g,
    c.length_mm,
    c.head_diameter_mm,
    c.body_diameter_mm,
    CASE
      WHEN c.switch_type IN ('tail', 'side', 'dual', 'rotary', 'twist') THEN c.switch_type
      ELSE NULL
    END,
    c.waterproof_rating,
    c.impact_resistance_m,
    c.body_material
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  ON CONFLICT (flashlight_id) DO UPDATE
    SET
      max_lumens = COALESCE(EXCLUDED.max_lumens, flashlight_specs.max_lumens),
      sustained_lumens = COALESCE(EXCLUDED.sustained_lumens, flashlight_specs.sustained_lumens),
      max_candela = COALESCE(EXCLUDED.max_candela, flashlight_specs.max_candela),
      beam_distance_m = COALESCE(EXCLUDED.beam_distance_m, flashlight_specs.beam_distance_m),
      runtime_high_min = COALESCE(EXCLUDED.runtime_high_min, flashlight_specs.runtime_high_min),
      runtime_500_min = COALESCE(EXCLUDED.runtime_500_min, flashlight_specs.runtime_500_min),
      turbo_stepdown_sec = COALESCE(EXCLUDED.turbo_stepdown_sec, flashlight_specs.turbo_stepdown_sec),
      beam_pattern = COALESCE(EXCLUDED.beam_pattern, flashlight_specs.beam_pattern),
      recharge_type = COALESCE(EXCLUDED.recharge_type, flashlight_specs.recharge_type),
      battery_replaceable = COALESCE(EXCLUDED.battery_replaceable, flashlight_specs.battery_replaceable),
      weight_g = COALESCE(EXCLUDED.weight_g, flashlight_specs.weight_g),
      length_mm = COALESCE(EXCLUDED.length_mm, flashlight_specs.length_mm),
      head_diameter_mm = COALESCE(EXCLUDED.head_diameter_mm, flashlight_specs.head_diameter_mm),
      body_diameter_mm = COALESCE(EXCLUDED.body_diameter_mm, flashlight_specs.body_diameter_mm),
      switch_type = COALESCE(EXCLUDED.switch_type, flashlight_specs.switch_type),
      waterproof_rating = COALESCE(EXCLUDED.waterproof_rating, flashlight_specs.waterproof_rating),
      impact_resistance_m = COALESCE(EXCLUDED.impact_resistance_m, flashlight_specs.impact_resistance_m),
      body_material = COALESCE(EXCLUDED.body_material, flashlight_specs.body_material)
  RETURNING flashlight_id
),
ins_battery_types AS (
  INSERT INTO battery_types (code, rechargeable)
  SELECT DISTINCT c.battery_type, TRUE
  FROM cleaned c
  WHERE c.battery_type IS NOT NULL
  ON CONFLICT (code) DO NOTHING
  RETURNING id
),
upsert_battery_map AS (
  INSERT INTO flashlight_battery_compatibility (flashlight_id, battery_type_id, quantity, is_primary, notes)
  SELECT
    f.id,
    bt.id,
    1,
    TRUE,
    'manual catalog import'
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  JOIN battery_types bt ON bt.code = c.battery_type
  WHERE c.battery_type IS NOT NULL
  ON CONFLICT (flashlight_id, battery_type_id) DO UPDATE
    SET
      quantity = EXCLUDED.quantity,
      is_primary = TRUE,
      notes = EXCLUDED.notes
  RETURNING flashlight_id
),
updated_affiliate AS (
  UPDATE affiliate_links al
  SET
    affiliate_url = c.amazon_url,
    asin = c.asin,
    is_primary = TRUE,
    is_active = TRUE,
    updated_at = NOW()
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  WHERE c.amazon_url IS NOT NULL
    AND al.flashlight_id = f.id
    AND al.provider = 'amazon'
    AND al.region_code = 'US'
    AND al.is_primary = TRUE
  RETURNING al.flashlight_id
),
ins_affiliate AS (
  INSERT INTO affiliate_links (flashlight_id, provider, region_code, affiliate_url, asin, is_primary, is_active, updated_at)
  SELECT
    f.id,
    'amazon',
    'US',
    c.amazon_url,
    c.asin,
    TRUE,
    TRUE,
    NOW()
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  WHERE c.amazon_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM affiliate_links al
      WHERE al.flashlight_id = f.id
        AND al.provider = 'amazon'
        AND al.region_code = 'US'
        AND al.is_primary = TRUE
    )
  RETURNING flashlight_id
),
ins_prices AS (
  INSERT INTO flashlight_price_snapshots (flashlight_id, source, source_sku, currency_code, price, in_stock, captured_at)
  SELECT
    f.id,
    'amazon',
    c.asin,
    'USD',
    c.current_price_usd,
    TRUE,
    NOW()
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  WHERE c.current_price_usd IS NOT NULL
  RETURNING flashlight_id
),
ins_amazon_snapshots AS (
  INSERT INTO amazon_product_snapshots (
    flashlight_id,
    asin,
    rating_count,
    average_rating,
    offer_price,
    currency_code,
    raw_payload,
    captured_at
  )
  SELECT
    f.id,
    c.asin,
    c.amazon_rating_count,
    c.amazon_average_rating,
    c.current_price_usd,
    'USD',
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'manual-import',
        'title', c.model_name,
        'brand', c.brand_name,
        'listing_url', c.amazon_url,
        'image_url', c.image_url
      )
    ),
    NOW()
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  WHERE c.asin IS NOT NULL
    AND (c.amazon_rating_count IS NOT NULL OR c.amazon_average_rating IS NOT NULL OR c.current_price_usd IS NOT NULL OR c.image_url IS NOT NULL)
  RETURNING flashlight_id
),
ins_use_cases AS (
  INSERT INTO use_cases (name, slug)
  SELECT DISTINCT
    initcap(replace(tag_slug, '-', ' ')) AS name,
    tag_slug
  FROM (
    SELECT
      lower(regexp_replace(trim(tag), '[^a-zA-Z0-9]+', '-', 'g')) AS tag_slug
    FROM cleaned c
    CROSS JOIN LATERAL regexp_split_to_table(c.use_case_tags, ',') AS tag
  ) t
  WHERE t.tag_slug <> ''
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
),
ins_use_case_map AS (
  INSERT INTO flashlight_use_cases (flashlight_id, use_case_id, confidence)
  SELECT
    f.id,
    u.id,
    0.9
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  CROSS JOIN LATERAL regexp_split_to_table(c.use_case_tags, ',') AS tag
  JOIN use_cases u ON u.slug = lower(regexp_replace(trim(tag), '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE trim(c.use_case_tags) <> ''
  ON CONFLICT (flashlight_id, use_case_id) DO UPDATE
    SET confidence = EXCLUDED.confidence
  RETURNING flashlight_id
),
ins_media AS (
  INSERT INTO flashlight_media (flashlight_id, media_type, url, alt_text, sort_order)
  SELECT
    f.id,
    'image',
    c.image_url,
    c.brand_name || ' ' || c.model_name,
    1
  FROM cleaned c
  JOIN flashlights f ON f.slug = c.model_slug
  WHERE c.image_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM flashlight_media m
      WHERE m.flashlight_id = f.id
        AND m.media_type = 'image'
        AND m.url = c.image_url
    )
  RETURNING flashlight_id
)
SELECT
  (SELECT count(*) FROM cleaned) AS imported_rows,
  (SELECT count(*) FROM upsert_flashlights) AS flashlight_rows,
  (SELECT count(*) FROM upsert_specs) AS spec_rows,
  ((SELECT count(*) FROM updated_affiliate) + (SELECT count(*) FROM ins_affiliate)) AS affiliate_rows,
  (SELECT count(*) FROM ins_prices) AS price_rows,
  (SELECT count(*) FROM ins_use_case_map) AS use_case_rows,
  (SELECT count(*) FROM ins_media) AS media_rows;

COMMIT;
SQL
} | docker compose exec -T "${DB_SERVICE}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}"

echo "Manual catalog import complete."
echo "Next: restart worker to trigger sync+scoring on startup:"
echo "  docker compose restart worker"
echo "  docker compose logs -f --tail=200 worker"
