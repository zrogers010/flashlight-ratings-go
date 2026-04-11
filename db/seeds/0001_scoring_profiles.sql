BEGIN;

INSERT INTO scoring_profiles (slug, display_name, description, version) VALUES
('tactical', 'Tactical Score', 'Prioritizes candela, throw, durability, and high-output reliability.', 2),
('edc', 'EDC Score', 'Prioritizes carry comfort, usability, recharge convenience, and practical runtime.', 2),
('value', 'Value Score', 'Prioritizes performance and quality per dollar.', 2),
('throw', 'Throw Score', 'Prioritizes distance performance and intensity.', 2),
('flood', 'Flood Score', 'Prioritizes wide-area illumination and practical sustained output.', 2),
('overall', 'Overall Score', 'Amazon-anchored composite: 35% customer trust, 25% value, 25% performance, 15% build quality.', 2)
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description,
      version = EXCLUDED.version;

INSERT INTO scoring_metrics (slug, display_name, direction, normalization_method, unit, description) VALUES
('max_lumens', 'Max Lumens', 'higher_better', 'log', 'lm', 'Peak claimed output.'),
('max_candela', 'Max Candela', 'higher_better', 'log', 'cd', 'Peak intensity for throw and target identification.'),
('beam_distance_m', 'Beam Distance', 'higher_better', 'log', 'm', 'Claimed throw distance in meters.'),
('runtime_high_min', 'Runtime (High)', 'higher_better', 'log', 'min', 'Sustained usable runtime on high mode.'),
('runtime_medium_min', 'Runtime (Medium)', 'higher_better', 'log', 'min', 'Everyday runtime for practical carry.'),
('waterproof_rating', 'Waterproofing', 'higher_better', 'piecewise', 'ip', 'Ingress protection mapping to durability points.'),
('impact_resistance_m', 'Impact Resistance', 'higher_better', 'linear', 'm', 'Drop resistance rating.'),
('amazon_avg_rating', 'Amazon Rating', 'higher_better', 'linear', 'stars', 'Customer average star rating on Amazon (3.5-5.0 range).'),
('amazon_rating_count', 'Review Count', 'higher_better', 'log', 'reviews', 'Total Amazon customer review count as confidence signal.'),
('price_usd', 'Price', 'lower_better', 'linear', 'USD', 'Current Amazon price in USD.')
ON CONFLICT (slug) DO NOTHING;

-- Overall score weights (v2: Amazon-anchored)
-- overall = 0.35*amazon_trust + 0.25*value + 0.25*performance + 0.15*durability
-- amazon_trust = 0.60*amazon_avg_rating + 0.40*amazon_rating_count
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('amazon_avg_rating',    0.21000, 3.5::numeric, 4.5::numeric, 5.0::numeric),
    ('amazon_rating_count',  0.14000, 20::numeric,  1000::numeric, 5000::numeric),
    ('max_lumens',           0.09000, 100::numeric, 1500::numeric, 5000::numeric),
    ('max_candela',          0.06000, 1000::numeric, 30000::numeric, 100000::numeric),
    ('beam_distance_m',      0.05000, 50::numeric,  300::numeric, 700::numeric),
    ('runtime_high_min',     0.05000, 20::numeric,  120::numeric, 300::numeric),
    ('price_usd',            0.25000, 15::numeric,  100::numeric, 250::numeric),
    ('waterproof_rating',    0.10000, NULL::numeric, NULL::numeric, NULL::numeric),
    ('impact_resistance_m',  0.05000, 1::numeric,   1.5::numeric, 3::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'overall'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight,
      floor_value = EXCLUDED.floor_value,
      target_value = EXCLUDED.target_value,
      cap_value = EXCLUDED.cap_value;

-- Tactical weights (v2: includes Amazon trust at 15%)
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('max_candela',          0.25000, 1000::numeric, 30000::numeric, 100000::numeric),
    ('waterproof_rating',    0.20000, NULL::numeric, NULL::numeric, NULL::numeric),
    ('amazon_avg_rating',    0.09000, 3.5::numeric, 4.5::numeric, 5.0::numeric),
    ('amazon_rating_count',  0.06000, 20::numeric,  1000::numeric, 5000::numeric),
    ('runtime_high_min',     0.15000, 20::numeric,  120::numeric, 300::numeric),
    ('max_lumens',           0.10000, 100::numeric, 1500::numeric, 5000::numeric),
    ('impact_resistance_m',  0.15000, 1::numeric,   1.5::numeric, 3::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'tactical'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight;

-- EDC weights (v2: includes Amazon trust at 15%)
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('runtime_high_min',     0.25000, 20::numeric, 120::numeric, 300::numeric),
    ('price_usd',            0.20000, 15::numeric, 100::numeric, 250::numeric),
    ('amazon_avg_rating',    0.09000, 3.5::numeric, 4.5::numeric, 5.0::numeric),
    ('amazon_rating_count',  0.06000, 20::numeric, 1000::numeric, 5000::numeric),
    ('max_lumens',           0.15000, 100::numeric, 1000::numeric, 5000::numeric),
    ('waterproof_rating',    0.10000, NULL::numeric, NULL::numeric, NULL::numeric),
    ('impact_resistance_m',  0.15000, 1::numeric, 1.5::numeric, 3::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'edc'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight;

-- Throw weights (v2: includes Amazon trust at 15%)
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('max_candela',          0.35000, 1000::numeric, 30000::numeric, 100000::numeric),
    ('beam_distance_m',      0.25000, 50::numeric, 300::numeric, 700::numeric),
    ('amazon_avg_rating',    0.09000, 3.5::numeric, 4.5::numeric, 5.0::numeric),
    ('amazon_rating_count',  0.06000, 20::numeric, 1000::numeric, 5000::numeric),
    ('runtime_high_min',     0.15000, 20::numeric, 120::numeric, 300::numeric),
    ('waterproof_rating',    0.10000, NULL::numeric, NULL::numeric, NULL::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'throw'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight;

-- Flood weights (v2: includes Amazon trust at 15%)
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('max_lumens',           0.35000, 100::numeric, 1500::numeric, 5000::numeric),
    ('runtime_high_min',     0.20000, 60::numeric, 240::numeric, 900::numeric),
    ('amazon_avg_rating',    0.09000, 3.5::numeric, 4.5::numeric, 5.0::numeric),
    ('amazon_rating_count',  0.06000, 20::numeric, 1000::numeric, 5000::numeric),
    ('price_usd',            0.15000, 15::numeric, 100::numeric, 250::numeric),
    ('waterproof_rating',    0.15000, NULL::numeric, NULL::numeric, NULL::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'flood'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight;

-- Value weights (v2: performance/price blend)
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, '{}'::jsonb
FROM scoring_profiles p
CROSS JOIN (
    VALUES
    ('max_lumens',           0.22000, 100::numeric, 1500::numeric, 5000::numeric),
    ('runtime_high_min',     0.16500, 20::numeric, 120::numeric, 300::numeric),
    ('max_candela',          0.16500, 1000::numeric, 30000::numeric, 100000::numeric),
    ('price_usd',            0.45000, 15::numeric, 100::numeric, 250::numeric)
) AS w(metric_slug, weight, floor_v, target_v, cap_v)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'value'
ON CONFLICT (profile_id, metric_id) DO UPDATE
  SET weight = EXCLUDED.weight;

COMMIT;
