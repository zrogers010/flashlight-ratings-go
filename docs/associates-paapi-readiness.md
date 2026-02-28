# Amazon Associates -> PA-API Readiness Playbook

Use this while running manual catalog mode.

## Goal

Unlock PA-API access so the worker can refresh real listings automatically.

## Track weekly

- `qualified_clicks`
- `ordered_items`
- `shipped_items`
- `conversion_rate`
- `top_pages_by_clicks`

Keep this in a simple sheet and update every week.

## Site actions that improve eligibility

1. Keep all affiliate disclosures visible on every page with links.
2. Publish high-intent pages:
   - best EDC flashlights under budget tiers
   - thrower vs flooder comparison pages
   - use-case landing pages (camping, tactical, search & rescue)
3. Add clear CTA placements above the fold and in comparison rows.
4. Remove broken/out-of-stock links quickly.
5. Focus on fewer trusted brands first to improve conversion quality.

## Compliance guardrails

- No fake prices or fake reviews.
- Avoid copied Amazon text/images unless explicitly permitted.
- Use manufacturer/public specs and your own editorial copy.
- Keep links accurate to the exact product model and ASIN.

## Operational workflow until approval

1. Keep `AMAZON_SYNC_DRY_RUN=true`.
2. Refresh catalog weekly via:
   - `docs/manual-catalog-import.md`
3. Re-run score job after each catalog update.
4. Validate top pages and links before publishing.

## Switch-over checklist after approval

1. Generate PA-API-enabled access key/secret in Associates credentials.
2. Update `worker.env`:
   - `AMAZON_ACCESS_KEY_ID`
   - `AMAZON_SECRET_ACCESS_KEY`
   - `AMAZON_PARTNER_TAG`
   - `AMAZON_SYNC_DRY_RUN=false`
3. Restart worker:
   - `docker compose up -d --build worker`
4. Verify first successful run:
   - `docker compose logs -f --tail=200 worker`
5. Confirm snapshots update:
   - latest rows in `amazon_product_snapshots`
   - latest rows in `flashlight_price_snapshots`
