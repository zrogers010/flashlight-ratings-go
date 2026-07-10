#!/usr/bin/env bash
#
# catalog-sync.sh — refresh manual_catalog.csv from Amazon (via Rainforest API)
# and re-import it into the running database.
#
# Designed to be run on the deploy server (e.g. via cron) or locally for
# ad-hoc refreshes.
#
# Workflow:
#   1. Run the rainforest-sync container in `update` mode, which rewrites
#      data/manual_catalog.csv with current prices/ratings/images. It also
#      writes a local-only sidecar (data/manual_catalog.sync_state.json,
#      gitignored) tracking per-ASIN unavailable streaks.
#   2. Soft-disable Amazon CTAs after N consecutive non-purchasable runs
#      (PRUNE_THRESHOLD legacy env var). Listings remain in the catalog and
#      automatically recover after a successful check.
#   3. Re-import the freshly-updated CSV into Postgres.
#   4. Restart the worker so scoring picks up the new data.
#
# IMPORTANT: this script modifies data/manual_catalog.csv on disk. On a deploy
# server, the next run of `scripts/deploy.sh` will `git reset --hard` and
# discard those changes unless they are committed back to the repo. See
# CATALOG_AUTO_COMMIT below for the auto-commit option.
#
# Environment:
#   RAINFOREST_API_KEY     required (read from .env if present)
#   AMAZON_PARTNER_TAG     default: flashlightrat-20
#   PRUNE_THRESHOLD        default: 2 (0 = never disable; legacy name)
#   SYNC_DELAY             default: 1s   (delay between Rainforest API calls)
#   SYNC_MODE              default: update  (update | discover | both)
#   SYNC_ROTATE_DAYS       default: 0   (when >1, shard catalog into N daily
#                                         slices — only ~1/N of ASINs get
#                                         refreshed per run, full coverage
#                                         every N days. Use with daily cron
#                                         to spread Rainforest cost.)
#   SYNC_LIMIT             default: 0   (process at most N rows; 0 = all.
#                                         Ignored when SYNC_ROTATE_DAYS > 1.)
#   SYNC_OFFSET            default: 0   (skip first N rows; pairs with SYNC_LIMIT)
#   CATALOG_AUTO_COMMIT    default: 0   (set to 1 to git add+commit+push the
#                                         refreshed CSV after a successful run;
#                                         requires push credentials in $HOME)
#
# Usage:
#   bash scripts/catalog-sync.sh
#   PRUNE_THRESHOLD=5 bash scripts/catalog-sync.sh
#   CATALOG_AUTO_COMMIT=1 bash scripts/catalog-sync.sh
#   SYNC_ROTATE_DAYS=7 bash scripts/catalog-sync.sh   # 1/7th of catalog today

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "${APP_DIR}"

# Pick up RAINFOREST_API_KEY etc. from .env if present
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ -z "${RAINFOREST_API_KEY:-}" ]]; then
  echo "ERROR: RAINFOREST_API_KEY is not set."
  echo "  Add it to .env or export it before running this script."
  exit 1
fi

# docker-compose v1 vs v2 detection (mirrors deploy.sh)
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available"
  exit 1
fi

PRUNE_THRESHOLD="${PRUNE_THRESHOLD:-2}"
SYNC_MODE="${SYNC_MODE:-update}"
SYNC_DELAY="${SYNC_DELAY:-1s}"
SYNC_ROTATE_DAYS="${SYNC_ROTATE_DAYS:-0}"
SYNC_LIMIT="${SYNC_LIMIT:-0}"
SYNC_OFFSET="${SYNC_OFFSET:-0}"
CATALOG_AUTO_COMMIT="${CATALOG_AUTO_COMMIT:-0}"

echo "═══ Catalog Sync ═══"
echo "  app dir:     ${APP_DIR}"
echo "  mode:        ${SYNC_MODE}"
echo "  disable:     ${PRUNE_THRESHOLD} consecutive unavailable runs"
echo "  delay:       ${SYNC_DELAY}"
echo "  rotate-days: ${SYNC_ROTATE_DAYS}  (0 = full catalog each run)"
echo "  limit:       ${SYNC_LIMIT}  (0 = no limit)"
echo "  offset:      ${SYNC_OFFSET}"
echo "  auto-commit: ${CATALOG_AUTO_COMMIT}"
echo ""

# ── 1. Build (cheap on subsequent runs thanks to docker layer cache) ─────
echo "→ Building rainforest-sync image..."
${COMPOSE} --profile tools build rainforest-sync

# ── 2. Run sync ──────────────────────────────────────────────────────────
echo "→ Running rainforest-sync (mode=${SYNC_MODE}, disable=${PRUNE_THRESHOLD})..."
${COMPOSE} --profile tools run --rm \
  -e SYNC_ROTATE_DAYS="${SYNC_ROTATE_DAYS}" \
  -e SYNC_LIMIT="${SYNC_LIMIT}" \
  -e SYNC_OFFSET="${SYNC_OFFSET}" \
  rainforest-sync \
  -mode="${SYNC_MODE}" \
  -delay="${SYNC_DELAY}" \
  -prune-unavailable="${PRUNE_THRESHOLD}" \
  -f /app/data/manual_catalog.csv

# ── 3. Re-import into Postgres ───────────────────────────────────────────
echo "→ Re-importing manual_catalog.csv into Postgres..."
bash scripts/import-manual-catalog.sh data/manual_catalog.csv

# ── 4. Restart worker so scoring picks up the new data ──────────────────
echo "→ Restarting worker..."
${COMPOSE} restart worker
sleep 5

# ── 5. Optional: commit refreshed CSV back to git ──────────────────────
# (data/manual_catalog.sync_state.json is gitignored — it's a local-only
#  sidecar that rainforest-sync regenerates each run, and nothing on the
#  server consumes it. Don't try to commit it.)
if [[ "${CATALOG_AUTO_COMMIT}" == "1" ]]; then
  echo "→ Auto-committing CSV..."

  if ! git diff --quiet -- data/manual_catalog.csv 2>/dev/null; then
    git add data/manual_catalog.csv
    if git diff --cached --quiet; then
      echo "  (no changes to commit)"
    else
      ts=$(date -u +"%Y-%m-%dT%H:%MZ")
      git -c user.name="catalog-sync-bot" \
          -c user.email="catalog-sync@flashlightratings.local" \
          commit -m "chore(catalog): weekly Rainforest sync ${ts}"
      if git push 2>&1; then
        echo "  ✓ pushed"
      else
        echo "  ⚠ push failed — credentials missing? Commit is local only."
      fi
    fi
  else
    echo "  (no changes to commit)"
  fi
fi

echo ""
echo "✓ Catalog sync complete."
