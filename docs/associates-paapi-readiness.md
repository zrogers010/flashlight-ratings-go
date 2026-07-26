# Amazon Creators API Runbook

The Creators API replaced PA-API v5 (endpoint shut down 2026-05-15) and is
now the primary product data source for both the CSV catalog sync
(`cmd/rainforest-sync`) and the DB snapshot worker (`cmd/amazon-sync`,
`cmd/worker`). Rainforest remains configured as ratings reinforcement and
automatic failover.

## Credentials

1. Register the application in Associates Central (Tools -> Creators API).
   Only the primary account owner can register.
2. Copy the Credential ID and Secret into:
   - `.env` — `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`
     (used by `scripts/catalog-sync.sh` / the rainforest-sync container)
   - `worker.env` — same variables (used by the worker / amazon-sync)
3. Auth is OAuth2 client-credentials against
   `https://api.amazon.com/auth/o2/token` (NA region); tokens last 1 hour
   and are cached in-process. No AWS keys are involved anymore.

## Eligibility risk (why Rainforest stays)

Creators API access requires roughly 10 qualifying referred sales in the
trailing 30 days. If sales dip and Amazon revokes access, API calls return
401/403. The sync detects this (`ErrAuthDenied` -> `ErrSourceUnavailable`)
and transparently fails over to Rainforest for the rest of the run — the
site never goes stale. Watch the sync logs for:

```
WARNING: creators-api unavailable (...) — failing over to rainforest
```

If that appears, check Associates Central for eligibility status and expect
Rainforest spend to rise until access is restored.

## Ratings gating

`customerReviews.count` / `customerReviews.starRating` are requested on
every call but Amazon only returns them for accounts enrolled in a limited
program. When absent, the sync reinforces ratings with one Rainforest
lookup per row (`-ratings-source=rainforest`, the default). To control
Rainforest spend, run frequent price-only syncs with `-ratings-source=off`
and a weekly full run with ratings on.

## Rate limits

The client enforces 1 request/second and retries on 429 with exponential
backoff. getItems batches 10 ASINs per request, so a full 110-row catalog
refresh is ~11 requests. Discovery (24 brands x 6 categories) is ~150
requests, ~2.5 minutes.

## Keeping eligibility (unchanged)

- Keep affiliate disclosures visible on every page with links.
- Publish high-intent pages (budget tiers, thrower vs flooder, use cases).
- Remove broken/out-of-stock links quickly (the sync's soft-disable does
  this automatically).
- No fake prices or reviews; keep links accurate to the exact ASIN.

## Worker switch-over checklist

1. Set `AMAZON_CREATORS_CLIENT_ID` / `AMAZON_CREATORS_CLIENT_SECRET` in
   `worker.env` and `AMAZON_SYNC_DRY_RUN=false`.
2. Restart: `docker compose up -d --build worker`
3. Verify: `docker compose logs -f --tail=200 worker`
4. Confirm fresh rows in `amazon_product_snapshots` and
   `flashlight_price_snapshots`.
