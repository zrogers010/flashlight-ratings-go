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
#      data/manual_catalog.csv with current prices/ratings/images and updates
#      data/manual_catalog.sync_state.json with per-ASIN unavailable streaks.
#   2. Optionally prune any ASIN that has been unavailable for N consecutive
#      runs (PRUNE_THRESHOLD env var, default 3).
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
#   PRUNE_THRESHOLD        default: 3 (0 = never prune)
#   SYNC_DELAY             default: 1s   (delay between Rainforest API calls)
#   SYNC_MODE              default: update  (update | discover | both)
#   CATALOG_AUTO_COMMIT    default: 0   (set to 1 to git add+commit+push CSV
#                                         and state file after a successful run;
#                                         requires push credentials in $HOME)
#
# Usage:
#   bash scripts/catalog-sync.sh
#   PRUNE_THRESHOLD=5 bash scripts/catalog-sync.sh
#   CATALOG_AUTO_COMMIT=1 bash scripts/catalog-sync.sh

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

PRUNE_THRESHOLD="${PRUNE_THRESHOLD:-3}"
SYNC_MODE="${SYNC_MODE:-update}"
SYNC_DELAY="${SYNC_DELAY:-1s}"
CATALOG_AUTO_COMMIT="${CATALOG_AUTO_COMMIT:-0}"

echo "═══ Catalog Sync ═══"
echo "  app dir:    ${APP_DIR}"
echo "  mode:       ${SYNC_MODE}"
echo "  prune:      ${PRUNE_THRESHOLD} consecutive unavailable runs"
echo "  delay:      ${SYNC_DELAY}"
echo "  auto-commit ${CATALOG_AUTO_COMMIT}"
echo ""

# ── 1. Build (cheap on subsequent runs thanks to docker layer cache) ─────
echo "→ Building rainforest-sync image..."
${COMPOSE} --profile tools build rainforest-sync

# ── 2. Run sync ──────────────────────────────────────────────────────────
echo "→ Running rainforest-sync (mode=${SYNC_MODE}, prune=${PRUNE_THRESHOLD})..."
${COMPOSE} --profile tools run --rm rainforest-sync \
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

# ── 5. Optional: commit refreshed CSV + state file back to git ──────────
if [[ "${CATALOG_AUTO_COMMIT}" == "1" ]]; then
  echo "→ Auto-committing CSV + state file..."

  if ! git diff --quiet -- data/manual_catalog.csv data/manual_catalog.sync_state.json 2>/dev/null \
     || git ls-files --others --exclude-standard data/manual_catalog.sync_state.json | grep -q .; then
    git add data/manual_catalog.csv data/manual_catalog.sync_state.json
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
