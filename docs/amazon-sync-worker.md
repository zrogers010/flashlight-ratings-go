# Amazon Sync Worker

## Command
```bash
DATABASE_URL=postgres://... \
AMAZON_REGION=US \
AMAZON_PARTNER_TAG=yourtag-20 \
AMAZON_ACCESS_KEY_ID=... \
AMAZON_SECRET_ACCESS_KEY=... \
go run ./cmd/amazon-sync
```

## Current status
- Worker and PA-API v5 SigV4 client are implemented.
- It loads active Amazon ASIN targets from `affiliate_links`.
- It persists snapshots to:
  - `amazon_product_snapshots`
  - `flashlight_price_snapshots`
- It calls `GetItems` with selected resources (reviews/ratings/offers).

## Dry run
```bash
DATABASE_URL=postgres://... AMAZON_SYNC_DRY_RUN=true go run ./cmd/amazon-sync
```

## Tuning env vars
- `AMAZON_SYNC_BATCH_SIZE` (default `10`)
- `AMAZON_SYNC_MAX_RETRIES` (default `2`)
- `AMAZON_SYNC_RETRY_BACKOFF_MS` (default `750`)

## Optional next implementation
1. Add retry/backoff and ASIN batching.
2. Persist image URLs from PA-API into flashlight media records.
3. Add sync metrics for observability (success/error/staleness).
