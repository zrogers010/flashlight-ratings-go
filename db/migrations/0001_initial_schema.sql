BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Core catalog ----------

CREATE TABLE brands (
    id BIGSERIAL PRIMARY KEY,
    name CITEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    country_code CHAR(2),
    website_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE flashlights (
    id BIGSERIAL PRIMARY KEY,
    brand_id BIGINT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    model_code TEXT,
    description TEXT,
    launch_date DATE,
    discontinued_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CHECK (discontinued_date IS NULL OR launch_date IS NULL OR discontinued_date >= launch_date)
);

CREATE TABLE flashlight_specs (
    flashlight_id BIGINT PRIMARY KEY REFERENCES flashlights(id) ON DELETE CASCADE,
    max_lumens INTEGER NOT NULL CHECK (max_lumens > 0),
    max_candela INTEGER CHECK (max_candela > 0),
    beam_distance_m INTEGER CHECK (beam_distance_m > 0),
    runtime_low_min INTEGER CHECK (runtime_low_min > 0),
    runtime_medium_min INTEGER CHECK (runtime_medium_min > 0),
    runtime_high_min INTEGER CHECK (runtime_high_min > 0),
    runtime_turbo_min INTEGER CHECK (runtime_turbo_min > 0),
    battery_included BOOLEAN NOT NULL DEFAULT FALSE,
    battery_rechargeable BOOLEAN NOT NULL DEFAULT FALSE,
    usb_c_rechargeable BOOLEAN NOT NULL DEFAULT FALSE,
    weight_g NUMERIC(8,2) CHECK (weight_g > 0),
    length_mm NUMERIC(8,2) CHECK (length_mm > 0),
    head_diameter_mm NUMERIC(8,2) CHECK (head_diameter_mm > 0),
    body_diameter_mm NUMERIC(8,2) CHECK (body_diameter_mm > 0),
    waterproof_rating TEXT CHECK (waterproof_rating IS NULL OR waterproof_rating ~ '^IP([0-6X])([0-9X])$'),
    impact_resistance_m NUMERIC(8,2) CHECK (impact_resistance_m > 0),
    has_strobe BOOLEAN NOT NULL DEFAULT FALSE,
    has_memory_mode BOOLEAN NOT NULL DEFAULT FALSE,
    has_lockout BOOLEAN NOT NULL DEFAULT FALSE,
    has_moonlight_mode BOOLEAN NOT NULL DEFAULT FALSE,
    has_magnetic_tailcap BOOLEAN NOT NULL DEFAULT FALSE,
    has_pocket_clip BOOLEAN NOT NULL DEFAULT FALSE,
    switch_type TEXT,
    led_model TEXT,
    cri INTEGER CHECK (cri BETWEEN 1 AND 100),
    cct_min_k INTEGER CHECK (cct_min_k >= 1500),
    cct_max_k INTEGER CHECK (cct_max_k >= 1500),
    CHECK (cct_max_k IS NULL OR cct_min_k IS NULL OR cct_max_k >= cct_min_k),
    CHECK (
        switch_type IS NULL OR
        switch_type IN ('tail', 'side', 'dual', 'rotary', 'twist')
    )
);

CREATE TABLE flashlight_modes (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    mode_name TEXT NOT NULL,
    output_lumens INTEGER CHECK (output_lumens > 0),
    runtime_min INTEGER CHECK (runtime_min > 0),
    candela INTEGER CHECK (candela > 0),
    beam_distance_m INTEGER CHECK (beam_distance_m > 0),
    mode_order SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (flashlight_id, mode_name)
);

CREATE TABLE battery_types (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    nominal_voltage NUMERIC(6,3),
    rechargeable BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (code ~ '^[A-Z0-9]+$'),
    CHECK (nominal_voltage IS NULL OR nominal_voltage > 0)
);

CREATE TABLE flashlight_battery_compatibility (
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    battery_type_id BIGINT NOT NULL REFERENCES battery_types(id) ON DELETE RESTRICT,
    quantity SMALLINT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    PRIMARY KEY (flashlight_id, battery_type_id)
);

CREATE TABLE flashlight_media (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (media_type IN ('image', 'video'))
);

-- ---------- Pricing + affiliate ----------

CREATE TABLE affiliate_links (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    region_code CHAR(2) NOT NULL DEFAULT 'US',
    affiliate_url TEXT NOT NULL,
    asin TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (provider IN ('amazon')),
    CHECK (asin IS NULL OR asin ~ '^[A-Z0-9]{10}$')
);

CREATE TABLE flashlight_price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_sku TEXT,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    price NUMERIC(12,2) NOT NULL CHECK (price > 0),
    in_stock BOOLEAN,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source IN ('amazon'))
);

-- ---------- Taxonomy for finder ----------

CREATE TABLE use_cases (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE flashlight_use_cases (
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    use_case_id BIGINT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0000 CHECK (confidence >= 0 AND confidence <= 1),
    PRIMARY KEY (flashlight_id, use_case_id)
);

-- ---------- Scoring system ----------

CREATE TABLE scoring_profiles (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE scoring_metrics (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    direction TEXT NOT NULL,
    normalization_method TEXT NOT NULL,
    unit TEXT,
    description TEXT,
    CHECK (direction IN ('higher_better', 'lower_better', 'boolean')),
    CHECK (normalization_method IN ('linear', 'log', 'boolean', 'piecewise'))
);

CREATE TABLE scoring_profile_metrics (
    profile_id BIGINT NOT NULL REFERENCES scoring_profiles(id) ON DELETE CASCADE,
    metric_id BIGINT NOT NULL REFERENCES scoring_metrics(id) ON DELETE RESTRICT,
    weight NUMERIC(6,5) NOT NULL CHECK (weight >= 0),
    floor_value NUMERIC(14,4),
    target_value NUMERIC(14,4),
    cap_value NUMERIC(14,4),
    config JSONB NOT NULL DEFAULT '{}'::JSONB,
    PRIMARY KEY (profile_id, metric_id)
);

CREATE TABLE scoring_runs (
    id BIGSERIAL PRIMARY KEY,
    run_label TEXT NOT NULL,
    formula_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    initiated_by TEXT NOT NULL DEFAULT 'system',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE TABLE flashlight_scores (
    run_id BIGINT NOT NULL REFERENCES scoring_runs(id) ON DELETE CASCADE,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    profile_id BIGINT NOT NULL REFERENCES scoring_profiles(id) ON DELETE CASCADE,
    score NUMERIC(6,3) NOT NULL CHECK (score >= 0 AND score <= 100),
    rank_position INTEGER CHECK (rank_position > 0),
    metric_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, flashlight_id, profile_id)
);

-- ---------- Performance indexes ----------

CREATE INDEX idx_flashlights_brand ON flashlights(brand_id);
CREATE INDEX idx_flashlights_active ON flashlights(is_active);
CREATE INDEX idx_specs_lumens ON flashlight_specs(max_lumens DESC);
CREATE INDEX idx_specs_candela ON flashlight_specs(max_candela DESC);
CREATE INDEX idx_specs_weight ON flashlight_specs(weight_g ASC);
CREATE INDEX idx_specs_ip ON flashlight_specs(waterproof_rating);
CREATE INDEX idx_price_latest ON flashlight_price_snapshots(flashlight_id, captured_at DESC);
CREATE INDEX idx_affiliate_lookup ON affiliate_links(flashlight_id, is_active, is_primary);
CREATE INDEX idx_scores_lookup ON flashlight_scores(profile_id, run_id, rank_position);
CREATE INDEX idx_scores_flashlight ON flashlight_scores(flashlight_id, run_id);

COMMIT;
