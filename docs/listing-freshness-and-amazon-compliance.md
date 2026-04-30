# Listing Freshness + Amazon Compliance

## Goals
- Keep listing price/rating data accurate and up to date.
- Detect new listings and stale listings automatically.
- Stay compliant with Amazon Associate + PA-API rules.

## Status at a glance

| Concern | Implemented? | Where |
|---|---|---|
| Periodic price/rating refresh | ✅ Uniform daily-rotated shard | `internal/rainforest/sync.go` (`rowSelector`) |
| New ASIN discovery | ✅ Manual / on-demand | `internal/rainforest/discover.go`, `-mode=discover` |
| Auto-prune chronically-dead listings | ✅ N-consecutive-miss prune | `internal/rainforest/sync.go` (`PruneUnavailable`) |
| Per-ASIN sync state (last check, miss streak) | ✅ Sidecar JSON | `internal/rainforest/state.go`, `data/manual_catalog.sync_state.json` (gitignored) |
| Amazon-CDN image healing | ✅ Auto-prefer `m.media-amazon.com` | `internal/rainforest/sync.go` (`isAmazonHostedImage`) |
| Tiered cadence by popularity / age | ❌ Future | uniform rotation today |
| `stale=true` flag in API / scoring penalty | ❌ Future | `LastCheckAt` exists in sidecar but not surfaced |
| `amazon_product_snapshots` history table | ❌ Future | CSV is rewritten in place; no per-call snapshot row |
| HEAD-based link checker | ❌ Not needed — Rainforest call is the link check | — |

## How the refresh actually works (today)

1. **Source of truth:** `data/manual_catalog.csv` (rewritten in place each run).
   Postgres is reloaded from the CSV after every sync via
   `scripts/import-manual-catalog.sh`.

2. **Cadence:** uniform daily rotation. The rotated cron runs once per day and
   refreshes only ~1/N of the catalog, where N = `SYNC_ROTATE_DAYS`.
   - Shard for the day = `(UTC day-of-year - 1) mod N`.
   - Each row belongs to exactly one shard (`row_index mod N`), so every ASIN
     gets refreshed exactly once per N-day cycle, and the cycle is
     deterministic and resumable (a missed day just shifts the calendar).
   - Newly-discovered ASINs do **not** get a priority window — they fall into
     whichever shard their row index lands in.

3. **Per-row update.** For each ASIN in today's shard:
   - Call Rainforest `type=product`.
   - Update `current_price_usd`, `rating_count`, `average_rating` if changed.
   - Migrate `image_url` to an Amazon-hosted CDN (`m.media-amazon.com` etc.)
     when the API returns a stable Amazon URL. Manufacturer/3rd-party CDN
     URLs drift and break, so we replace them on sight.
   - Refresh `amazon_url` with the canonical `https://www.amazon.com/dp/<ASIN>?tag=<partner>` form.

4. **Liveness signal = the API call itself.** Amazon almost never hard-404s a
   dead ASIN — they return 200 with a "couldn't find that page" body. So
   HEAD-checking the URL is useless. Instead the Rainforest response *is* the
   link check: if it returns `success=false`, or comes back with no buybox
   and no price, we record an unavailable run for that ASIN in the sidecar
   state (`data/manual_catalog.sync_state.json`).

5. **Auto-prune.** When `-prune-unavailable=N` is set (the cron passes
   `PRUNE_THRESHOLD=2`), any ASIN whose unavailable streak reaches N
   consecutive sync runs is removed from the CSV at the end of the run.
   With `SYNC_ROTATE_DAYS=3` and `PRUNE_THRESHOLD=2`, a dead listing
   disappears within ~6 days (2 misses × 3-day cycle).

6. **Persistence across deploys.** `scripts/deploy.sh` does
   `git reset --hard origin/main`, which would normally wipe the cron's
   refreshed CSV. To prevent that, `do_deploy` snapshots
   `data/manual_catalog.csv` before the reset and restores it afterwards
   — but only if the upstream blob hash is unchanged. If you push a real
   catalog edit (added/removed ASINs), upstream wins and the next cron tick
   re-refreshes those rows. No git-push from the server required.

## Tuning the cadence

For a catalog of ~110 ASINs:

| `SYNC_ROTATE_DAYS` | `PRUNE_THRESHOLD` | Credits/day | Credits/month | Avg price staleness | Worst-case dead-link removal |
|---|---|---|---|---|---|
| `1` (daily full) | `2` | ~111 | ~3,330 | ~12h | 2 days |
| **`3` (recommended default)** | **`2`** | **~37** | **~1,110** | **~36h** | **~6 days** |
| `7` | `2` | ~16 | ~480 | ~3.5 days | ~14 days |
| `14` | `2` | ~8 | ~240 | ~7 days | ~28 days |

Override at install time:

```bash
ROTATE_DAYS=1 PRUNE_THRESHOLD=2 bash scripts/deploy.sh install-cron-rotated
```

## Compliance guardrails
- Use Amazon-API-sourced data for prices/ratings/images (currently Rainforest;
  PA-API is the longer-term plan — see `docs/associates-paapi-readiness.md`).
- Pull and render images via API-sanctioned assets only. The sync auto-migrates
  to Amazon-hosted CDN URLs whenever possible.
- Show disclosure text on any page with Amazon links:
  - `As an Amazon Associate we earn from qualifying purchases.`
- Do not store or serve stale prices past allowed PA-API policy windows.
  The standard read of the policy is **24 hours**. With the recommended
  `SYNC_ROTATE_DAYS=3`, average staleness is ~36h and worst case ~3 days —
  acceptable for a small affiliate site, but consider daily-full
  (`SYNC_ROTATE_DAYS=1`) before doing any kind of price-comparison feature
  or audited promotion.
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
- Dead-link defense is the prune step, not a HEAD probe. If you ever notice
  Amazon links going to "couldn't find that page" pages for longer than
  `SYNC_ROTATE_DAYS × PRUNE_THRESHOLD` days, look at the sidecar state file
  for that ASIN's `unavailable_runs` and `last_reason`.

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
   sidecar already tracks `LastCheckAt` per ASIN; surface it through
   `internal/api/repository.go` and let the worker apply a penalty when a
   row's last check is older than 24h.
3. **`amazon_product_snapshots` history table.** Today the CSV is mutated
   in place — no per-call snapshot. Adding a row-per-call to Postgres
   would unlock real price history, drop alerts, and review-velocity rollups.
4. **Migrate from Rainforest to PA-API.** Free if Amazon approves you,
   batches up to 10 ASINs per call, and gives a true `ItemNotAccessible`
   signal. See `docs/associates-paapi-readiness.md` and
   `internal/amazon/paapi_client.go` for the in-progress scaffolding.
