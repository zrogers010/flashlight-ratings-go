# Multi-Merchant Affiliate Setup

FlashlightRatings supports three affiliate programs: Amazon Associates, Awin (for Olight), and AvantLink (for Fenix). The site automatically shows the best-paying merchant first, with Amazon as a fallback when brand-direct links aren't configured.

## Commission Rates & Cookie Duration

| Merchant | Commission | Cookie | Sign-Up URL |
|----------|-----------|--------|-------------|
| Amazon   | ~3%       | 1 day  | https://affiliate-program.amazon.com/ |
| Olight (Awin) | ~10% | 30 days | https://www.awin.com/gb/advertisers |
| Fenix (AvantLink) | ~7% | 60 days | https://www.avantlink.com/affiliates/signup |

## Setup Instructions

### 1. Amazon Associates (Required)

1. Sign up at https://affiliate-program.amazon.com/
2. Complete the application (you'll need a website with content)
3. Once approved, find your Associate Tag in your dashboard
4. Set environment variables:
   ```bash
   AMAZON_PARTNER_TAG=your-tag-20
   NEXT_PUBLIC_AMAZON_TAG=your-tag-20
   ```

### 2. Awin / Olight (Optional)

Olight uses Awin as their affiliate network.

1. Sign up at https://www.awin.com/gb/advertisers
2. Complete the application (requires existing website/traffic)
3. Once approved, search for "Olight" in the advertiser directory
4. Apply to the Olight program
5. After approval, find your Publisher ID and Olight's Merchant ID in your Awin dashboard
6. Set environment variables:
   ```bash
   NEXT_PUBLIC_AWIN_PUBLISHER_ID=12345
   NEXT_PUBLIC_AWIN_OLIGHT_MERCHANT_ID=67890
   ```

**Where to find IDs:**
- **Publisher ID**: In your Awin dashboard under "Account Details"
- **Olight Merchant ID**: In the advertiser details page for Olight

### 3. AvantLink / Fenix (Optional)

Fenix Lighting uses AvantLink as their affiliate network.

1. Sign up at https://www.avantlink.com/affiliates/signup
2. Complete the application
3. Once approved, search for "Fenix Lighting" in the merchant directory
4. Apply to the Fenix Lighting program
5. After approval, find your Website ID and Fenix's Merchant ID in your AvantLink dashboard
6. Set environment variables:
   ```bash
   NEXT_PUBLIC_AVANTLINK_WEBSITE_ID=abcd1234
   NEXT_PUBLIC_AVANTLINK_FENIX_MERCHANT_ID=10123
   ```

**Where to find IDs:**
- **Website ID**: In your AvantLink dashboard under "My Account" → "Websites"
- **Fenix Merchant ID**: In the merchant details page for Fenix Lighting

## How It Works

### Offer Priority

The site automatically orders affiliate offers by commission rate (highest first):

1. **Olight Direct** (10% commission) — shown for Olight products when Awin is configured
2. **Fenix Direct** (7% commission) — shown for Fenix products when AvantLink is configured
3. **Amazon** (3% commission) — shown for all products, always available

### Fallback Behavior

- If Awin/AvantLink credentials are **not configured**, the site behaves exactly as before: Amazon-only links
- If a product has no manufacturer URL in the catalog, only Amazon is shown
- The primary (highest-paying) merchant is shown as the main CTA button
- Secondary merchants appear as smaller links below

### Example

For a **Fenix PD36R Pro**:
- **Primary CTA**: "Check Price on Fenix Direct" (7% commission, 60-day cookie)
- **Secondary link**: "Amazon" (3% commission, 1-day cookie)

For a **SureFire** product (no direct affiliate program):
- **Primary CTA**: "Check Price on Amazon" (3% commission, 1-day cookie)
- No secondary links

## Testing Your Setup

1. Set your environment variables in `.env.local` (web) or your hosting platform
2. Rebuild the Next.js app: `cd web && npm run build`
3. Visit a product review page for:
   - An Olight product (e.g. `/reviews/olight-warrior-3s`)
   - A Fenix product (e.g. `/reviews/fenix-pd36r-pro`)
   - A non-Olight/Fenix product (e.g. `/reviews/streamlight-protac-hl-x`)
4. Verify:
   - Olight/Fenix products show brand-direct links when configured
   - Other products show Amazon-only
   - Affiliate disclosure mentions all three programs

## Adding Product URLs

Manufacturer URLs are stored in `data/catalog.yaml`:

```yaml
- brand: Fenix
  name: PD36R Pro
  manufacturer_url: https://www.fenixlighting.com/products/fenix-pd36r-pro-rechargeable-flashlight
  asin: B0BGMZ4YNC
  # ... other fields
```

When you run `catalog-build`, the `manufacturer_url` is persisted to the database and returned by the API.

**Only include URLs you can verify.** Never invent product URLs — if a manufacturer URL doesn't exist, leave the field empty and the product will be Amazon-only.

## Compliance

All affiliate links are marked `rel="sponsored nofollow"` per FTC guidelines. The affiliate disclosure on every page mentions all three programs when they're active.

## Troubleshooting

### Links still show Amazon-only

1. Check that environment variables are set correctly (use `NEXT_PUBLIC_` prefix for client-side access)
2. Verify the product's brand matches exactly: `"Olight"` or `"Fenix"` (case-insensitive)
3. Confirm the product has a `manufacturer_url` in the database:
   ```sql
   SELECT name, manufacturer_url FROM flashlights WHERE brand_id IN (
     SELECT id FROM brands WHERE name IN ('Olight', 'Fenix')
   );
   ```
4. Rebuild the Next.js app after changing environment variables

### Awin/AvantLink links don't work

- **Awin**: Verify the deep link format is correct: `https://www.awin1.com/cread.php?awinmid=MERCHANT_ID&awinaffid=PUBLISHER_ID&ued=PRODUCT_URL`
- **AvantLink**: Verify the deep link format is correct: `https://www.avantlink.com/click.php?tt=cl&merchant_id=MERCHANT_ID&website_id=WEBSITE_ID&url=PRODUCT_URL`
- Test the links manually in an incognito window
- Check that the product URL is URL-encoded

### Commission not tracking

- Ensure your affiliate accounts are fully approved and active
- Verify cookie duration hasn't expired (30 days for Awin, 60 days for AvantLink)
- Check affiliate network dashboards for tracking issues
- Some networks have minimum traffic requirements

## Future Expansion

This multi-merchant system is designed to be extensible. To add another brand:

1. Sign up for their affiliate program
2. Add environment variables for the network/merchant IDs
3. Update `web/lib/affiliate-links.ts` to handle the new brand
4. Add manufacturer URLs to `data/catalog.yaml`
5. Run `catalog-build` to persist the URLs to the database

The system automatically prioritizes by commission rate, so higher-paying merchants will always be shown first.
