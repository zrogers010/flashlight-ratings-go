BEGIN;

CREATE TABLE intelligence_runs (
    id BIGSERIAL PRIMARY KEY,
    intended_use TEXT NOT NULL,
    budget_usd NUMERIC(12,2) NOT NULL CHECK (budget_usd > 0),
    battery_preference TEXT NOT NULL,
    size_constraint TEXT NOT NULL,
    algorithm_version TEXT NOT NULL DEFAULT 'v1',
    top_results JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intelligence_runs_created_at
    ON intelligence_runs(created_at DESC);

COMMIT;
