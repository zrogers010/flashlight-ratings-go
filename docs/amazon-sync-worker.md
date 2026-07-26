# Amazon Sync Worker

## Command
```bash
DATABASE_URL=postgres://... \
AMAZON_REGION=US \
AMAZON_PARTNER_TAG=yourtag-20 \
AMAZON_CREATORS_CLIENT_ID=... \
AMAZON_CREATORS_CLIENT_SECRET=... \
go run ./cmd/amazon-sync
```

## Current status
- Worker uses the **Creators API** client (`internal/amazon/creators_client.go`).
  The old PA-API v5 SigV4 client was removed after Amazon shut down the
  endpoint (2026-05-15).
- Auth is OAuth2 client-credentials; tokens are cached for the hour they
  live. Requests are throttled to 1/second with backoff on 429.
- It loads active Amazon ASIN targets from `affiliate_links`.
- It persists snapshots to:
  - `amazon_product_snapshots`
  - `flashlight_price_snapshots`
- It enriches listing metadata:
  - canonical affiliate URL (by marketplace + partner tag)
  - description fallback from feature bullets
  - primary + variant images into `flashlight_media` (hiRes preferred)
- It deactivates listings when:
  - an ASIN is missing from the getItems response
  - brand/seller fails allowlist filters
- It calls `getItems` with images/itemInfo/offersV2/customerReviews
  resources. Note customerReviews is account-gated and usually null.

## Dry run
```bash
DATABASE_URL=postgres://... AMAZON_SYNC_DRY_RUN=true go run ./cmd/amazon-sync
```

## Tuning env vars
- `AMAZON_SYNC_BATCH_SIZE` (default `10` — also the getItems max)
- `AMAZON_SYNC_MAX_RETRIES` (default `2`)
- `AMAZON_SYNC_RETRY_BACKOFF_MS` (default `750`)
- `AMAZON_ALLOWED_BRANDS` (comma-separated, optional)
- `AMAZON_ALLOWED_SELLERS` (comma-separated, optional)

## Optional next implementation
1. Add sync metrics for observability (success/error/staleness).
2. `GetVariations` grouping of variant ASINs.

## If Creators API access lapses

Access requires ~10 qualifying sales in the trailing 30 days. On 401/403
the worker run fails; the CSV catalog sync (`cmd/rainforest-sync`) fails
over to Rainforest automatically, so the site stays fresh. See
`docs/associates-paapi-readiness.md`.
