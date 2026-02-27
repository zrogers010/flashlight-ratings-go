BEGIN;

-- Amazon PA-API snapshots for rating counts, star ratings, and compliance-safe metadata.
CREATE TABLE amazon_product_snapshots (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    asin TEXT NOT NULL CHECK (asin ~ '^[A-Z0-9]{10}$'),
    rating_count INTEGER CHECK (rating_count >= 0),
    average_rating NUMERIC(3,2) CHECK (average_rating >= 0 AND average_rating <= 5),
    offer_price NUMERIC(12,2) CHECK (offer_price > 0),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_amazon_snapshots_flashlight_time
    ON amazon_product_snapshots(flashlight_id, captured_at DESC);

-- Daily review-velocity rollup to detect acceleration/deceleration in listing traction.
CREATE TABLE flashlight_review_velocity_daily (
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    rating_count INTEGER CHECK (rating_count >= 0),
    rating_count_delta_1d INTEGER,
    rating_count_delta_7d INTEGER,
    rating_count_delta_30d INTEGER,
    velocity_score NUMERIC(6,3) CHECK (velocity_score >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (flashlight_id, metric_date)
);

CREATE INDEX idx_review_velocity_score
    ON flashlight_review_velocity_daily(metric_date DESC, velocity_score DESC);

-- User-targeted price drop alerts.
CREATE TABLE price_drop_alerts (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    target_price NUMERIC(12,2) NOT NULL CHECK (target_price > 0),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'active',
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('active', 'paused', 'triggered', 'unsubscribed'))
);

CREATE INDEX idx_price_drop_alerts_lookup
    ON price_drop_alerts(flashlight_id, status, target_price);

-- Optional event stream for analytics/audit.
CREATE TABLE price_drop_events (
    id BIGSERIAL PRIMARY KEY,
    flashlight_id BIGINT NOT NULL REFERENCES flashlights(id) ON DELETE CASCADE,
    old_price NUMERIC(12,2) NOT NULL CHECK (old_price > 0),
    new_price NUMERIC(12,2) NOT NULL CHECK (new_price > 0),
    drop_percent NUMERIC(7,4) CHECK (drop_percent >= 0),
    source TEXT NOT NULL DEFAULT 'amazon',
    event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_drop_events_flashlight_time
    ON price_drop_events(flashlight_id, event_at DESC);

COMMIT;
