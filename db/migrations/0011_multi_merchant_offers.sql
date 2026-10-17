-- Migration: Add multi-merchant support
-- This enables Olight (Awin) and Fenix (AvantLink) alongside Amazon.

-- Add manufacturer_url to flashlights for direct brand links
ALTER TABLE flashlights
  ADD COLUMN IF NOT EXISTS manufacturer_url TEXT;

COMMENT ON COLUMN flashlights.manufacturer_url IS 'Direct product page URL on manufacturer website (e.g. olightstore.com, fenixlighting.com)';
