# Listing Freshness + Amazon Compliance

## Goals
- Keep listing price/rating data accurate and up to date.
- Detect new listings and stale listings automatically.
- Stay compliant with Amazon Associate + PA-API rules.

## Data refresh technique
1. Source of truth for Amazon fields:
`amazon_product_snapshots` (from PA-API, not scraped HTML).
2. Schedule:
- Fast movers: every 1-3 hours
- Mid/long tail: every 12-24 hours
- Newly discovered ASINs: every 30-60 minutes for first 48 hours
3. Staleness SLA:
- Mark listing `stale` if last snapshot is older than 24 hours.
- Exclude stale price from ranking formulas or apply confidence penalty.
4. New listing discovery:
- Daily crawler of tracked brands/models -> ASIN mapping candidates.
- Human/queue validation before publish.

## Metrics to add
- Amazon rating count: `amazon_product_snapshots.rating_count`
- Review velocity:
  - Daily rollup in `flashlight_review_velocity_daily`
  - Track 1d/7d/30d deltas and velocity score
- Price history:
  - Already present as `flashlight_price_snapshots`
  - Keep chart-ready timeseries for UI
- Price drop alerts:
  - `price_drop_alerts` + `price_drop_events`
  - Trigger when latest price <= user target and last notification cooldown passes

## Compliance guardrails
- Use Amazon Product Advertising API for product data.
- Pull and render images via API-sanctioned assets only.
- Show disclosure text:
  - `As an Amazon Associate we earn from qualifying purchases.`
- Do not store or serve stale prices past allowed PA-API policy windows.
- CTA copy must be:
  - `Check Price on Amazon`
- Never use CTA copy:
  - `Buy Now`

## Link wiring checklist
- Add `amazon_url` to detail/comparison payloads from active affiliate links.
- Add centralized CTA component with forced text `Check Price on Amazon`.
- Attach disclosure on pages where Amazon links appear.
- Ensure no server/page caches violate allowed price freshness windows.
