-- Migration: Add multi-merchant support
-- This enables Olight (Awin) and Fenix (AvantLink) alongside Amazon.

-- Add manufacturer_url to flashlights for direct brand links
ALTER TABLE flashlights
  ADD COLUMN IF NOT EXISTS manufacturer_url TEXT;

COMMENT ON COLUMN flashlights.manufacturer_url IS 'Direct product page URL on manufacturer website (e.g. olightstore.com, fenixlighting.com)';

-- Extend affiliate_links to support multi-merchant offers
ALTER TABLE affiliate_links
  DROP CONSTRAINT IF EXISTS affiliate_links_provider_check;

ALTER TABLE affiliate_links
  ADD CONSTRAINT affiliate_links_provider_check
  CHECK (provider IN ('amazon', 'awin', 'avantlink'));

ALTER TABLE affiliate_links
  ADD COLUMN IF NOT EXISTS merchant_name TEXT;

ALTER TABLE affiliate_links
  ADD COLUMN IF NOT EXISTS commission_rate_pct NUMERIC(5,2);

ALTER TABLE affiliate_links
  ADD COLUMN IF NOT EXISTS cookie_duration_days INTEGER;

COMMENT ON COLUMN affiliate_links.merchant_name IS 'Brand or merchant name (e.g. Olight, Fenix)';
COMMENT ON COLUMN affiliate_links.commission_rate_pct IS 'Estimated commission rate as percentage (e.g. 10.0 for 10%)';
COMMENT ON COLUMN affiliate_links.cookie_duration_days IS 'Affiliate cookie lifetime in days';

-- Example: Olight via Awin = 10% commission, 30-day cookie
-- Example: Fenix via AvantLink = 7% commission, 60-day cookie
-- Example: Amazon = 3% commission, 1-day cookie
