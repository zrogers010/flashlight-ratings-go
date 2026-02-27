BEGIN;

INSERT INTO scoring_profiles (slug, display_name, description, version) VALUES
('tactical', 'Tactical Score', 'Prioritizes candela, throw, durability, and high-output reliability.', 1),
('edc', 'EDC Score', 'Prioritizes carry comfort, usability, recharge convenience, and practical runtime.', 1),
('value', 'Value Score', 'Prioritizes performance and quality per dollar.', 1),
('throw', 'Throw Score', 'Prioritizes distance performance and intensity.', 1),
('flood', 'Flood Score', 'Prioritizes wide-area illumination and practical sustained output.', 1),
('overall', 'Overall Score', 'Blends Tactical, EDC, and Value into a single ranking score.', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scoring_metrics (slug, display_name, direction, normalization_method, unit, description) VALUES
('max_lumens', 'Max Lumens', 'higher_better', 'log', 'lm', 'Peak claimed output.'),
('max_candela', 'Max Candela', 'higher_better', 'log', 'cd', 'Peak intensity for throw and target identification.'),
('beam_distance_m', 'Beam Distance', 'higher_better', 'log', 'm', 'Claimed throw distance in meters.'),
('runtime_high_min', 'Runtime (High)', 'higher_better', 'log', 'min', 'Sustained usable runtime on high mode.'),
('runtime_medium_min', 'Runtime (Medium)', 'higher_better', 'log', 'min', 'Everyday runtime for practical carry.'),
('weight_g', 'Weight', 'lower_better', 'linear', 'g', 'Carried mass in grams.'),
('length_mm', 'Length', 'lower_better', 'linear', 'mm', 'Overall pocket footprint.'),
('waterproof_rating', 'Waterproofing', 'higher_better', 'piecewise', 'ip', 'Ingress protection mapping to durability points.'),
('impact_resistance_m', 'Impact Resistance', 'higher_better', 'linear', 'm', 'Drop resistance rating.'),
('usb_c_rechargeable', 'USB-C Recharge', 'boolean', 'boolean', NULL, 'Direct charging support.'),
('has_strobe', 'Strobe Mode', 'boolean', 'boolean', NULL, 'Fast access disorienting mode for tactical use.'),
('has_lockout', 'Lockout', 'boolean', 'boolean', NULL, 'Prevents accidental activation in pocket/bag.'),
('has_pocket_clip', 'Pocket Clip', 'boolean', 'boolean', NULL, 'Pocket carry convenience.'),
('performance_per_dollar', 'Performance per Dollar', 'higher_better', 'log', 'score/usd', 'Derived metric from performance_core / latest_price_usd.'),
('subscore_tactical', 'Tactical Subscore', 'higher_better', 'linear', 'score', 'Derived tactical subscore used by Overall.'),
('subscore_edc', 'EDC Subscore', 'higher_better', 'linear', 'score', 'Derived EDC subscore used by Overall.'),
('subscore_value', 'Value Subscore', 'higher_better', 'linear', 'score', 'Derived Value subscore used by Overall.'),
('subscore_throw', 'Throw Subscore', 'higher_better', 'linear', 'score', 'Derived Throw subscore used by Overall.'),
('subscore_flood', 'Flood Subscore', 'higher_better', 'linear', 'score', 'Derived Flood subscore used by Overall.')
ON CONFLICT (slug) DO NOTHING;

-- Tactical weights
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, w.config::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('max_candela', 0.25000, 5000::numeric, 45000::numeric, 120000::numeric, '{}'),
    ('beam_distance_m', 0.18000, 80::numeric, 350::numeric, 650::numeric, '{}'),
    ('runtime_high_min', 0.14000, 30::numeric, 120::numeric, 300::numeric, '{}'),
    ('waterproof_rating', 0.12000, NULL::numeric, NULL::numeric, NULL::numeric, '{"ip_map":{"IPX4":35,"IPX6":65,"IPX7":80,"IPX8":95}}'),
    ('impact_resistance_m', 0.10000, 1::numeric, 1.5::numeric, 3::numeric, '{}'),
    ('has_strobe', 0.08000, NULL::numeric, NULL::numeric, NULL::numeric, '{}'),
    ('has_lockout', 0.07000, NULL::numeric, NULL::numeric, NULL::numeric, '{}'),
    ('max_lumens', 0.06000, 300::numeric, 1500::numeric, 5000::numeric, '{}')
) AS w(metric_slug, weight, floor_v, target_v, cap_v, config)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'tactical'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

-- EDC weights
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, w.config::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('weight_g', 0.20000, 180::numeric, 90::numeric, 45::numeric, '{}'),
    ('length_mm', 0.15000, 160::numeric, 125::numeric, 95::numeric, '{}'),
    ('runtime_medium_min', 0.18000, 60::numeric, 300::numeric, 900::numeric, '{}'),
    ('usb_c_rechargeable', 0.12000, NULL::numeric, NULL::numeric, NULL::numeric, '{}'),
    ('has_pocket_clip', 0.10000, NULL::numeric, NULL::numeric, NULL::numeric, '{}'),
    ('has_lockout', 0.07000, NULL::numeric, NULL::numeric, NULL::numeric, '{}'),
    ('max_lumens', 0.10000, 120::numeric, 800::numeric, 2500::numeric, '{}'),
    ('waterproof_rating', 0.07000, NULL::numeric, NULL::numeric, NULL::numeric, '{"ip_map":{"IPX4":30,"IPX6":60,"IPX7":80,"IPX8":95}}')
) AS w(metric_slug, weight, floor_v, target_v, cap_v, config)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'edc'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

-- Value weights
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, w.config::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('performance_per_dollar', 0.70000, 0.25::numeric, 1.10::numeric, 2.50::numeric, '{}'),
    ('runtime_medium_min', 0.15000, 60::numeric, 240::numeric, 900::numeric, '{}'),
    ('waterproof_rating', 0.10000, NULL::numeric, NULL::numeric, NULL::numeric, '{"ip_map":{"IPX4":25,"IPX6":55,"IPX7":75,"IPX8":90}}'),
    ('usb_c_rechargeable', 0.05000, NULL::numeric, NULL::numeric, NULL::numeric, '{}')
) AS w(metric_slug, weight, floor_v, target_v, cap_v, config)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'value'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

-- Throw weights
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, w.config::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('max_candela', 0.45000, 5000::numeric, 45000::numeric, 120000::numeric, '{}'),
    ('beam_distance_m', 0.30000, 80::numeric, 350::numeric, 700::numeric, '{}'),
    ('runtime_high_min', 0.15000, 30::numeric, 120::numeric, 300::numeric, '{}'),
    ('waterproof_rating', 0.10000, NULL::numeric, NULL::numeric, NULL::numeric, '{"ip_map":{"IPX4":35,"IPX6":65,"IPX7":80,"IPX8":95}}')
) AS w(metric_slug, weight, floor_v, target_v, cap_v, config)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'throw'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

-- Flood weights
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, w.floor_v, w.target_v, w.cap_v, w.config::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('max_lumens', 0.50000, 120::numeric, 1200::numeric, 5000::numeric, '{}'),
    ('runtime_medium_min', 0.25000, 60::numeric, 240::numeric, 900::numeric, '{}'),
    ('performance_per_dollar', 0.15000, 0.25::numeric, 1.10::numeric, 2.50::numeric, '{}'),
    ('waterproof_rating', 0.10000, NULL::numeric, NULL::numeric, NULL::numeric, '{"ip_map":{"IPX4":30,"IPX6":60,"IPX7":80,"IPX8":95}}')
) AS w(metric_slug, weight, floor_v, target_v, cap_v, config)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'flood'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

-- Overall score from subscores
INSERT INTO scoring_profile_metrics (profile_id, metric_id, weight, floor_value, target_value, cap_value, config)
SELECT p.id, m.id, w.weight, NULL, NULL, NULL, '{}'::jsonb
FROM scoring_profiles p
JOIN (
    VALUES
    ('subscore_tactical', 0.35000),
    ('subscore_edc', 0.35000),
    ('subscore_value', 0.20000),
    ('subscore_throw', 0.05000),
    ('subscore_flood', 0.05000)
) AS w(metric_slug, weight)
JOIN scoring_metrics m ON m.slug = w.metric_slug
WHERE p.slug = 'overall'
ON CONFLICT (profile_id, metric_id) DO NOTHING;

COMMIT;
