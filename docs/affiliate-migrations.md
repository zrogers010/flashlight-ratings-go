# Multi-Merchant Affiliate Migrations

## Database Migration

The multi-merchant feature adds a `manufacturer_url` column to the `flashlights` table.

**Migration file:** `db/migrations/0011_multi_merchant_offers.sql`

```sql
ALTER TABLE flashlights
  ADD COLUMN IF NOT EXISTS manufacturer_url TEXT;
```

## Deployment Order

⚠️ **IMPORTANT:** The migration must run **before** `catalog-build` and before the API serves requests.

### Manual Deployment Steps

1. **Apply migration:**
   ```bash
   psql $DATABASE_URL -f db/migrations/0011_multi_merchant_offers.sql
   ```

2. **Rebuild catalog** (to populate manufacturer_url):
   ```bash
   ./catalog-build
   ```

3. **Deploy API and web:**
   ```bash
   # Build and deploy as normal
   ```

### Code Tolerance

The Go code **tolerates** the missing column gracefully:
- `internal/catalog/builder.go`: Uses `IF NOT EXISTS` in migration
- `internal/api/repository.go`: Returns `manufacturer_url` as nullable `*string`
- Frontend: Treats missing `manufacturer_url` as `null`, falls back to Amazon-only

### Verification

After deployment, verify:

```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'flashlights' AND column_name = 'manufacturer_url';

-- Check populated rows
SELECT COUNT(*), COUNT(manufacturer_url) 
FROM flashlights;

-- Check Olight/Fenix specifically
SELECT brand, name, manufacturer_url 
FROM flashlights f
JOIN brands b ON b.id = f.brand_id
WHERE b.name IN ('Olight', 'Fenix');
```

## Environment Variables

The frontend needs these variables at **build time** (baked into the Next.js bundle):

```bash
# Optional - Amazon URLs already contain tag
NEXT_PUBLIC_AMAZON_TAG=flashlightrat-20

# Optional - Olight via Awin
NEXT_PUBLIC_AWIN_PUBLISHER_ID=12345
NEXT_PUBLIC_AWIN_OLIGHT_MERCHANT_ID=67890

# Optional - Fenix via AvantLink
NEXT_PUBLIC_AVANTLINK_WEBSITE_ID=abcd1234
NEXT_PUBLIC_AVANTLINK_FENIX_MERCHANT_ID=10123
```

When unset, the site works exactly as before: Amazon-only links using stored URLs.

## Rollback

If needed, the feature is backward-compatible:

1. The `manufacturer_url` column can remain (it's harmless)
2. Simply don't set the `NEXT_PUBLIC_AWIN_*` or `NEXT_PUBLIC_AVANTLINK_*` variables
3. Rebuild the Next.js app
4. Site reverts to Amazon-only behavior
