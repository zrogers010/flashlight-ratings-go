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

COMMIT;
