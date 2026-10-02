-- FLR-QA-01: Deactivate dead ASINs that 404 on Amazon
-- NITECORE MH12 Pro (B0CJB1PLW9) and E4K (B0CGGPY1SX)
-- These items will be excluded from rankings and featured lists

-- Deactivate flashlights with dead ASINs
UPDATE flashlights
SET is_active = FALSE
WHERE slug IN ('nitecore-mh12-pro', 'nitecore-e4k');

-- Deactivate their affiliate links
UPDATE affiliate_links
SET is_active = FALSE
WHERE asin IN ('B0CJB1PLW9', 'B0CGGPY1SX');

-- Mark price snapshots as out of stock (for historical accuracy)
UPDATE flashlight_price_snapshots
SET in_stock = FALSE
WHERE source_sku IN ('B0CJB1PLW9', 'B0CGGPY1SX')
  AND in_stock = TRUE;
