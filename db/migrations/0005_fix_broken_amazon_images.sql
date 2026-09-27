-- Fix broken Amazon image URLs
-- This migration updates any flashlights with known broken Amazon image URLs

-- Fix ThruNite T2 (or any product) with broken Amazon image ID 61wgWP3t5yL
-- The image https://m.media-amazon.com/images/I/61wgWP3t5yL.jpg returns 404
-- Update to use a placeholder or null until a valid image is sourced
UPDATE flashlights 
SET image_url = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE image_url LIKE '%61wgWP3t5yL%'
  AND image_url IS NOT NULL;

-- Log the fix
-- If the product is ThruNite T2 and we can identify it:
-- Manual fix needed: Research the correct ASIN and image for ThruNite T2
-- Then update with: 
-- UPDATE flashlights SET image_url = '<correct_amazon_image_url>' 
-- WHERE brand = 'ThruNite' AND name LIKE '%T2%';

-- Alternative approach: If we know the ASIN, we can construct a valid Amazon image URL
-- Amazon image URLs follow the pattern: https://m.media-amazon.com/images/I/<image-id>.jpg
-- The image ID can be found on the product page by inspecting the main product image
