# Listing Freshness + Amazon Compliance

## Goals
- Keep listing price/rating data accurate and up to date.
- Detect new listings and stale listings automatically.
- Stay compliant with Amazon Associate + PA-API rules.

## Status at a glance

| Concern | Implemented? | Where |
|---|---|---|
| Periodic price/rating refresh | ✅ Full catalog 3×/day (default) | `scripts/deploy.sh install-cron`, `internal/rainforest/sync.go` |
| Official-API price data (Creators API primary) | ✅ With Rainforest failover | `internal/amazon/creators_client.go`, `internal/amazon/catalog_source.go` |
| New ASIN discovery | ✅ Quality-gated, per brand x category | `internal/discovery/`, `-mode=discover` (legacy: `internal/rainforest/discover.go`) |
| Recoverable unavailable listings | ✅ Soft-disable after N misses; auto-re-enable | `internal/rainforest/sync.go` |
| Per-ASIN sync state (last check, miss streak) | ✅ Sidecar JSON | `internal/rainforest/state.go`, `data/manual_catalog.sync_state.json` (gitignored) |
| Amazon-CDN image healing | ✅ Auto-prefer `m.media-amazon.com` | `internal/rainforest/sync.go` (`isAmazonHostedImage`) |
| Tiered cadence by popularity / age | ❌ Future | uniform rotation today |
| Offer availability in API | ✅ `amazon_in_stock` from latest price snapshot | `internal/api/repository.go` |
| `amazon_product_snapshots` history table | ❌ Future | CSV is rewritten in place; no per-call snapshot row |
| HEAD-based link checker | ❌ Not needed — Rainforest call is the link check | — |

## How the refresh actually works (today)

1. **Source of truth:** `data/manual_catalog.csv` (rewritten in place each run).
   Postgres is reloaded from the CSV after every sync via
   `scripts/import-manual-catalog.sh`.

2. **Cadence (default after larger Rainforest plan):** full-catalog sync
   **3× per day** via `bash scripts/deploy.sh install-cron`
   (`CRON_SCHEDULE=0 6,14,22 * * *`, `SYNC_ROTATE_DAYS=0`).
   - Every run refreshes **all** ASINs — average age ~4 hours, worst case ~8h.
   - For very large catalogs, fall back to rotation with
     `bash scripts/deploy.sh install-cron-rotated` and `ROTATE_DAYS=N`
     (shard = `(UTC day-of-year - 1) mod N`, each ASIN once per N days).

3. **Per-row update.** For each ASIN in today's shard:
   - Primary source: **Creators API** `getItems` (batched 10 ASINs/call,
     free, official). Rainforest `type=product` reinforces star ratings the
     Creators API withholds and takes over the whole run if Creators
     credentials are rejected (`SYNC_SOURCE=auto`).
   - Require a positive buy-box price **and** an in-stock availability type
     before considering the offer purchasable.
   - Update `current_price_usd`, `rating_count`, `average_rating` if changed.
   - Migrate `image_url` to an Amazon-hosted CDN (`m.media-amazon.com` etc.)
     when the API returns a stable Amazon URL. Manufacturer/3rd-party CDN
     URLs drift and break, so we replace them on sight.
   - Refresh `amazon_url` with the canonical `https://www.amazon.com/dp/<ASIN>?tag=<partner>` form.

4. **Liveness signal = the API call itself.** Amazon almost never hard-404s a
   dead ASIN — they return 200 with a "couldn't find that page" body. So
   HEAD-checking the URL is useless. Instead the Rainforest response *is* the
   link check: if it returns `success=false`, or comes back with no buybox
   and no purchasable buy box, we record an unavailable run for that ASIN in
   the sidecar state (`data/manual_catalog.sync_state.json`).

5. **Recoverable soft-disable.** When `-prune-unavailable=N` is set (legacy
   flag name; the cron passes `PRUNE_THRESHOLD=2`), any ASIN whose unavailable
   streak reaches N consecutive sync runs gets `amazon_purchasable=false`.
   The database import deactivates its affiliate link and the UI replaces the
   CTA with “Currently unavailable.” The catalog row remains, so later syncs
   keep checking it and automatically restore the CTA after a purchasable
   response. With 3×/day full sync and `PRUNE_THRESHOLD=2`, a bad offer is
   hidden within ~16 hours.

6. **Persistence across deploys.** `scripts/deploy.sh` does
   `git reset --hard origin/main`, which would normally wipe the cron's
   refreshed CSV. To prevent that, `do_deploy` snapshots
   `data/manual_catalog.csv` before the reset and restores it afterwards
   — but only if the upstream blob hash is unchanged. If you push a real
   catalog edit (added/removed ASINs), upstream wins and the next cron tick
   re-refreshes those rows. No git-push from the server required.

## Tuning the cadence

For a catalog of ~110 ASINs (1 Rainforest credit ≈ 1 product call):

| Setup | Credits/day | Credits/month | Avg price age | Bad-offer disable |
|---|---|---|---|---|
| **`install-cron` 3×/day full (recommended)** | **~330** | **~10k** | **~4h** | **~16h** |
| `install-cron` every 6h (`0 */6 * * *`) | ~440 | ~13k | ~3h | ~12h |
| Daily full (`0 9 * * *`, rotate=0) | ~110 | ~3.3k | ~12h | ~2 days |
| Rotated `ROTATE_DAYS=3` once/day | ~37 | ~1.1k | ~36h | ~6 days |

Install / reinstall the recommended schedule on the server:

```bash
# After deploy — replaces older weekly / rotated entries
bash scripts/deploy.sh install-cron

# More aggressive (every 6 hours)
CRON_SCHEDULE="0 */6 * * *" bash scripts/deploy.sh install-cron

# Large catalog: spread credits with rotation instead
ROTATE_DAYS=3 bash scripts/deploy.sh install-cron-rotated
```

**UI copy:** price freshness labels say **“Last checked …”** (when Rainforest
last refreshed that ASIN), not “verified.” CTA remains **Check Price on Amazon**.

## Compliance guardrails
- Prices/availability/images now come from the **official Creators API**
  (see `docs/associates-paapi-readiness.md`), which is what the Operating
  Agreement expects. Rainforest is reinforcement/failover only.
- Pull and render images via API-sanctioned assets only. The sync auto-migrates
  to Amazon-hosted CDN URLs whenever possible.
- Show disclosure text on any page with Amazon links:
  - `As an Amazon Associate we earn from qualifying purchases.`
- Do not store or serve stale prices past allowed PA-API policy windows.
  The standard read of the policy is **24 hours**. With the recommended
  3×/day full sync, average age is ~4h and worst case ~8h — well inside
  that window. If you fall back to multi-day rotation, keep CTA copy as
  “Check Price on Amazon” and show honest “Last checked …” labels.
- CTA copy must be:
  - `Check Price on Amazon`
- Never use CTA copy:
  - `Buy Now`

## Link wiring checklist
- `amazon_url` is rewritten on every sync to the canonical
  `https://www.amazon.com/dp/<ASIN>?tag=<partner>` form, so changing
  `AMAZON_PARTNER_TAG` propagates within one rotation cycle.
- Use the centralized CTA component (`web/components/BuyOnAmazonButton.tsx`)
  with forced text `Check Price on Amazon`.
- Disclosure text appears on pages where Amazon links render
  (see `web/app/layout.tsx`).
- Dead-link defense is the soft-disable step, not a HEAD probe. If you notice
  Amazon links going to "couldn't find that page" pages for longer than
  `SYNC_ROTATE_DAYS × PRUNE_THRESHOLD` days, look at the sidecar state file
  for that ASIN's `unavailable_runs` and `last_reason`.
- Never delete unavailable catalog rows automatically. Keeping them allows
  Rainforest to detect recovery and reactivate the affiliate link.

## Future work (not implemented)

These are aspirational and intentionally **not** in code yet. Listed so the
ambition is documented but isn't confused with current behavior.

1. **Tiered cadence by popularity / freshness.**
   - Fast movers (top-20 by clicks or rating count): every 1–3 hours.
   - Mid/long tail: every 12–24 hours.
   - Newly discovered ASINs: every 30–60 minutes for the first 48 hours.
   - Implementation sketch: add a `tier` column to the CSV (or derive from
     `rating_count`) and have `newRowSelector` pick from multiple shards
     per run weighted by tier.
2. **`stale=true` flag in API responses + ranking confidence penalty.** The
   API now exposes current offer availability, but it does not yet identify
   listings whose last successful check is older than 24 hours.
3. **`amazon_product_snapshots` history table.** Today the CSV is mutated
   in place — no per-call snapshot. Adding a row-per-call to Postgres
   would unlock real price history, drop alerts, and review-velocity rollups.
4. ~~Migrate from Rainforest to PA-API.~~ **Done** — the Creators API
   (PA-API v5's successor) is now the primary source with Rainforest
   failover. See `docs/associates-paapi-readiness.md`.
5. **`GetVariations` grouping.** Group emitter/tint/color variant ASINs
   under one flashlight (discovery already dedupes on `parentASIN`).
