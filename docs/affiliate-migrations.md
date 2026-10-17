# Multi-Merchant Affiliate Migrations

## Database Migration

The multi-merchant feature adds a `manufacturer_url` column to the `flashlights` table.

**Migration file:** `db/migrations/0011_multi_merchant_offers.sql`

```sql
ALTER TABLE flashlights
  ADD COLUMN IF NOT EXISTS manufacturer_url TEXT;
```

## Deployment Order

⚠️ **IMPORTANT:** The migration runs **automatically** before `catalog-build`.

### Automated Deployment

The migration is applied idempotently in two places:

1. **Fresh database** (docker-compose up):
   - `docker-compose.yml` mounts `0011_multi_merchant_offers.sql` as `007_multi_merchant_offers.sql` in `/docker-entrypoint-initdb.d/`
   - Runs automatically on first container boot

2. **Existing deployment** (scripts/deploy.sh):
   - `deploy.sh` applies the migration before running `catalog-build`
   - Uses `IF NOT EXISTS`, safe to re-run

### Manual Migration (if needed)

```bash
psql $DATABASE_URL -f db/migrations/0011_multi_merchant_offers.sql
```

### Code Tolerance

The frontend handles missing manufacturer URLs gracefully:
- Returns `null` when column is absent or value is NULL
- Falls back to Amazon-only affiliate links

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
