BEGIN;

INSERT INTO brands (name, slug, country_code, website_url)
VALUES
    ('Wurkkos', 'wurkkos', 'CN', 'https://wurkkos.com'),
    ('Sofirn', 'sofirn', 'CN', 'https://www.sofirnlight.com')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO flashlights (brand_id, name, slug, model_code, description, is_active)
SELECT b.id, 'FC11C', 'wurkkos-fc11c', 'FC11C', 'USB-C EDC flashlight with balanced flood/throw.', TRUE
FROM brands b
WHERE b.slug = 'wurkkos'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO flashlights (brand_id, name, slug, model_code, description, is_active)
SELECT b.id, 'IF22A', 'sofirn-if22a', 'IF22A', 'Compact throw-focused flashlight with high candela.', TRUE
FROM brands b
WHERE b.slug = 'sofirn'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO flashlight_specs (
    flashlight_id,
    max_lumens,
    max_candela,
    beam_distance_m,
    runtime_medium_min,
    runtime_high_min,
    battery_included,
    battery_rechargeable,
    usb_c_rechargeable,
    weight_g,
    length_mm,
    waterproof_rating,
    impact_resistance_m,
    has_strobe,
    has_lockout,
    has_pocket_clip
)
SELECT f.id, 1200, 12000, 220, 300, 95, TRUE, TRUE, TRUE, 79.0, 116.0, 'IPX7', 1.0, TRUE, TRUE, TRUE
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id) DO NOTHING;

INSERT INTO flashlight_specs (
    flashlight_id,
    max_lumens,
    max_candela,
    beam_distance_m,
    runtime_medium_min,
    runtime_high_min,
    battery_included,
    battery_rechargeable,
    usb_c_rechargeable,
    weight_g,
    length_mm,
    waterproof_rating,
    impact_resistance_m,
    has_strobe,
    has_lockout,
    has_pocket_clip
)
SELECT f.id, 2100, 85000, 680, 220, 75, TRUE, TRUE, TRUE, 126.0, 127.0, 'IPX8', 1.0, TRUE, TRUE, TRUE
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id) DO NOTHING;

INSERT INTO use_cases (name, slug)
VALUES
    ('Tactical', 'tactical'),
    ('Everyday Carry', 'edc')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO flashlight_use_cases (flashlight_id, use_case_id, confidence)
SELECT f.id, u.id, 0.95
FROM flashlights f
JOIN use_cases u ON u.slug = 'edc'
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id, use_case_id) DO NOTHING;

INSERT INTO flashlight_use_cases (flashlight_id, use_case_id, confidence)
SELECT f.id, u.id, 0.98
FROM flashlights f
JOIN use_cases u ON u.slug = 'tactical'
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id, use_case_id) DO NOTHING;

INSERT INTO affiliate_links (flashlight_id, provider, region_code, affiliate_url, asin, is_primary, is_active)
SELECT
    f.id,
    'amazon',
    'US',
    'https://www.amazon.com/dp/B0CJY12QZR?tag=flashlightrat-20',
    'B0CJY12QZR',
    TRUE,
    TRUE
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT DO NOTHING;

INSERT INTO affiliate_links (flashlight_id, provider, region_code, affiliate_url, asin, is_primary, is_active)
SELECT
    f.id,
    'amazon',
    'US',
    'https://www.amazon.com/dp/B09TZJ6CPN?tag=flashlightrat-20',
    'B09TZJ6CPN',
    TRUE,
    TRUE
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT DO NOTHING;

INSERT INTO flashlight_media (flashlight_id, media_type, url, alt_text, sort_order)
SELECT
    f.id,
    'image',
    'https://images.unsplash.com/photo-1536623975707-c4b3b2af565d?auto=format&fit=crop&w=1200&q=80',
    'Wurkkos FC11C flashlight',
    1
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT DO NOTHING;

INSERT INTO flashlight_media (flashlight_id, media_type, url, alt_text, sort_order)
SELECT
    f.id,
    'image',
    'https://images.unsplash.com/photo-1613665813446-82a78c468a1d?auto=format&fit=crop&w=1200&q=80',
    'Sofirn IF22A flashlight',
    1
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Moonlight', 2, 24000, 40, 12, 1
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Low', 150, 850, 1900, 88, 2
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'High', 800, 95, 9800, 198, 3
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Turbo', 1200, 60, 12000, 220, 4
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Low', 120, 1200, 2500, 100, 1
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Medium', 600, 210, 25000, 320, 2
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'High', 1200, 75, 48000, 438, 3
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_modes (flashlight_id, mode_name, output_lumens, runtime_min, candela, beam_distance_m, mode_order)
SELECT f.id, 'Turbo', 2100, 35, 85000, 680, 4
FROM flashlights f
WHERE f.slug = 'sofirn-if22a'
ON CONFLICT (flashlight_id, mode_name) DO NOTHING;

INSERT INTO flashlight_price_snapshots (flashlight_id, source, source_sku, currency_code, price, in_stock)
SELECT f.id, 'amazon', 'B0CJY12QZR', 'USD', 39.99, TRUE
FROM flashlights f
WHERE f.slug = 'wurkkos-fc11c';

INSERT INTO flashlight_price_snapshots (flashlight_id, source, source_sku, currency_code, price, in_stock)
SELECT f.id, 'amazon', 'B09TZJ6CPN', 'USD', 54.99, TRUE
FROM flashlights f
WHERE f.slug = 'sofirn-if22a';

WITH run AS (
    INSERT INTO scoring_runs (run_label, formula_version, status, initiated_by, completed_at, notes)
    VALUES ('demo-seed', 'v1', 'completed', 'seed', NOW(), 'Demo data for local development')
    RETURNING id
)
INSERT INTO flashlight_scores (run_id, flashlight_id, profile_id, score, rank_position, metric_breakdown)
SELECT run.id, f.id, p.id, s.score, s.rank_position, '{}'::jsonb
FROM run
CROSS JOIN (
    VALUES
        ('wurkkos-fc11c', 'tactical', 78.4::numeric, 2),
        ('sofirn-if22a', 'tactical', 89.2::numeric, 1),
        ('wurkkos-fc11c', 'edc', 91.5::numeric, 1),
        ('sofirn-if22a', 'edc', 73.0::numeric, 2),
        ('wurkkos-fc11c', 'value', 88.0::numeric, 1),
        ('sofirn-if22a', 'value', 79.2::numeric, 2),
        ('wurkkos-fc11c', 'throw', 69.1::numeric, 2),
        ('sofirn-if22a', 'throw', 95.4::numeric, 1),
        ('wurkkos-fc11c', 'flood', 84.5::numeric, 1),
        ('sofirn-if22a', 'flood', 76.8::numeric, 2),
        ('wurkkos-fc11c', 'overall', 88.1::numeric, 1),
        ('sofirn-if22a', 'overall', 86.7::numeric, 2)
) AS s(flashlight_slug, profile_slug, score, rank_position)
JOIN flashlights f ON f.slug = s.flashlight_slug
JOIN scoring_profiles p ON p.slug = s.profile_slug;

COMMIT;
