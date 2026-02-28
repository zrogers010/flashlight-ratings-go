# Manual Catalog Import (No PA-API Required)

Use this when your Associates account is not yet PA-API eligible.

## What this gives you now

- Real Amazon affiliate URLs on product cards and detail pages.
- Real ASIN mapping in `affiliate_links` for future PA-API sync.
- Rich detail fields from manufacturer/public sources in `flashlight_specs`.
- Pricing/rating snapshots from your manual data for display continuity.

## 1) Prepare CSV

Copy the template:

```bash
cp data/manual_catalog.template.csv data/manual_catalog.csv
```

Fill `data/manual_catalog.csv` with real products:

- `amazon_url`: use your SiteStripe affiliate URL with your `tag=...`.
- `asin`: 10-char ASIN from the product page.
- `image_url`: official product image URL you are allowed to use.
- `description` and specs: manufacturer spec sheet / official docs.
- `use_case_tags`: comma-separated (example: `edc,camping,tactical`).

## 2) Import

```bash
./scripts/import-manual-catalog.sh data/manual_catalog.csv
```

## 3) Recompute rankings

```bash
docker compose restart worker
docker compose logs -f --tail=200 worker
```

## 4) Verify

```bash
curl -i http://localhost:8080/flashlights
curl -i http://localhost:8080/rankings?use_case=overall
curl -i http://localhost:3000/flashlights
```

## Notes

- Keep `AMAZON_SYNC_DRY_RUN=true` until PA-API access is approved.
- Do not scrape Amazon HTML for prices/ratings; use manual updates or PA-API when eligible.
- This importer is idempotent for brand/model/spec mappings and can be re-run as you improve data.
