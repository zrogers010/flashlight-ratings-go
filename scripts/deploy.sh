#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────
APP_DIR="${APP_DIR:-$HOME/flashlight-ratings}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-https://github.com/zrogers010/flashlight-ratings-go.git}"
# Use docker-compose (V1) or docker compose (V2), whichever is available
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
DOMAIN="${DOMAIN:-flashlightratings.com}"

API_INTERNAL_URL="http://api:8080"
API_PUBLIC_URL="https://${DOMAIN}/api"

# ─── Usage ──────────────────────────────────────────────────────────
usage() {
  echo "Usage: $0 [setup|deploy|install-cron|install-cron-rotated|catalog-sync]"
  echo ""
  echo "  setup                  First-time server setup (run as ec2-user with sudo)"
  echo "  deploy                 Pull latest code and deploy (run as deploy user)"
  echo "  install-cron           Install frequent FULL-catalog Rainforest sync"
  echo "                          (default: 3×/day UTC — 06:00, 14:00, 22:00)"
  echo "  install-cron-rotated   Install daily cron that refreshes 1/N of the catalog"
  echo "                          (default N=1 = full catalog once/day; raise N for"
  echo "                          larger catalogs to spread Rainforest credits)"
  echo "  catalog-sync           Run a one-off catalog refresh (sync + import + restart)"
  echo ""
  echo "If no argument given, defaults to 'deploy'."
  exit 0
}

# ═════════════════════════════════════════════════════════════════════
# SETUP — run once as ec2-user (or any sudoer)
#   Usage:  sudo bash scripts/deploy.sh setup
# ═════════════════════════════════════════════════════════════════════
do_setup() {
  echo "═══ FlashlightRatings — Server Setup ═══"
  echo ""

  if [[ $EUID -ne 0 ]]; then
    echo "ERROR: setup must be run as root. Use:  sudo bash $0 setup"
    exit 1
  fi

  # ── Install Docker ────────────────────────────────────────────────
  echo "→ Installing Docker..."
  if ! command -v docker >/dev/null 2>&1; then
    yum update -y
    yum install -y docker git curl
    systemctl enable docker
    systemctl start docker
    echo "  ✓ Docker installed"
  else
    echo "  ✓ Docker already installed"
  fi

  # ── Install cron (Amazon Linux ships without it) ────────────────
  echo "→ Installing cron..."
  if ! command -v crontab >/dev/null 2>&1; then
    yum install -y cronie
    systemctl enable crond
    systemctl start crond
    echo "  ✓ cronie installed and crond started"
  else
    echo "  ✓ cron already installed"
    if ! systemctl is-active --quiet crond 2>/dev/null; then
      systemctl enable crond 2>/dev/null || true
      systemctl start crond 2>/dev/null || true
    fi
  fi

  # ── Install Docker Compose plugin ─────────────────────────────────
  echo "→ Installing Docker Compose plugin..."
  if ! docker compose version >/dev/null 2>&1; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    echo "  ✓ Docker Compose installed"
  else
    echo "  ✓ Docker Compose already installed"
  fi

  # ── Create deploy user ───────────────────────────────────────────
  echo "→ Creating deploy user..."
  if id deploy >/dev/null 2>&1; then
    echo "  ✓ deploy user already exists"
  else
    useradd -m -s /bin/bash deploy
    echo "  ✓ deploy user created"
  fi
  usermod -aG docker deploy

  # Copy SSH authorized_keys so you can: sudo su - deploy
  if [[ -f /home/ec2-user/.ssh/authorized_keys ]] && [[ ! -f /home/deploy/.ssh/authorized_keys ]]; then
    mkdir -p /home/deploy/.ssh
    cp /home/ec2-user/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo "  ✓ SSH keys copied to deploy user"
  fi

  # ── Clone repo ───────────────────────────────────────────────────
  echo "→ Setting up app directory..."
  mkdir -p "${APP_DIR}"
  chown deploy:deploy "${APP_DIR}"

  if [[ ! -d "${APP_DIR}/.git" ]]; then
    sudo -u deploy git clone "${REPO}" "${APP_DIR}"
    echo "  ✓ Repo cloned to ${APP_DIR}"
  else
    echo "  ✓ Repo already cloned"
  fi

  # ── Create env files from examples ───────────────────────────────
  echo "→ Creating env files..."
  cd "${APP_DIR}"
  if [[ ! -f .env ]]; then
    sudo -u deploy cp .env.example .env
    echo "  ✓ .env created — EDIT THIS: nano ${APP_DIR}/.env"
  else
    echo "  ✓ .env already exists"
  fi

  if [[ ! -f worker.env ]]; then
    sudo -u deploy cp deploy/env/worker.env.example worker.env
    echo "  ✓ worker.env created — EDIT THIS: nano ${APP_DIR}/worker.env"
  else
    echo "  ✓ worker.env already exists"
  fi

  # ── Install Caddy (reverse proxy with auto-TLS) ──────────────────
  echo "→ Installing Caddy..."
  if ! command -v caddy >/dev/null 2>&1; then
    yum install -y yum-plugin-copr 2>/dev/null || true
    yum copr enable -y @caddy/caddy 2>/dev/null || true
    yum install -y caddy 2>/dev/null || {
      echo "  ⚠ Caddy package not available — install manually:"
      echo "    https://caddyserver.com/docs/install#fedora-redhat-centos"
    }
    if command -v caddy >/dev/null 2>&1; then
      cp "${APP_DIR}/deploy/Caddyfile" /etc/caddy/Caddyfile
      systemctl enable caddy
      echo "  ✓ Caddy installed (start after DNS is pointed)"
    fi
  else
    cp "${APP_DIR}/deploy/Caddyfile" /etc/caddy/Caddyfile
    echo "  ✓ Caddy already installed, Caddyfile updated"
  fi

  # ── Install certbot renewal timer (only if certbot is installed) ──
  # If you front the site with nginx + a pip-installed certbot (instead
  # of Caddy), certbot does NOT ship a renewal timer and certs silently
  # expire after 90 days. Install one ourselves so renewals are
  # automatic. No-op if certbot isn't on the box (e.g. pure Caddy setup).
  if command -v certbot >/dev/null 2>&1; then
    echo "→ Installing certbot renewal timer..."
    cat > /etc/systemd/system/certbot-renew.service << 'EOF'
[Unit]
Description=Renew Let's Encrypt certificates
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF
    cat > /etc/systemd/system/certbot-renew.timer << 'EOF'
[Unit]
Description=Run certbot renew twice daily

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now certbot-renew.timer
    echo "  ✓ certbot-renew.timer enabled (runs twice daily)"
  else
    echo "  (skipping certbot renewal timer — certbot not installed)"
  fi

  echo ""
  echo "═══ Setup complete ═══"
  echo ""
  echo "Next steps:"
  echo "  1. Edit your secrets:"
  echo "     nano ${APP_DIR}/.env          # set POSTGRES_PASSWORD"
  echo "     nano ${APP_DIR}/worker.env    # leave DRY_RUN=true for now"
  echo ""
  echo "  2. Switch to deploy user and deploy:"
  echo "     sudo su - deploy"
  echo "     bash ${APP_DIR}/scripts/deploy.sh"
  echo ""
  echo "  3. Point DNS A record for ${DOMAIN} to this server's public IP"
  echo ""
  echo "  4. Start Caddy for HTTPS:"
  echo "     sudo systemctl start caddy"
  echo ""
}

# ═════════════════════════════════════════════════════════════════════
# DEPLOY — run as deploy user
#   Usage:  sudo su - deploy
#           bash ~/flashlight-ratings/scripts/deploy.sh
# ═════════════════════════════════════════════════════════════════════
do_deploy() {
  echo "═══ FlashlightRatings — Deploy ═══"
  echo "  dir:    ${APP_DIR}"
  echo "  branch: ${BRANCH}"
  echo "  domain: ${DOMAIN}"
  echo ""

  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not installed. Run setup first:  sudo bash $0 setup"
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: docker daemon not running or no permission."
    echo "  Is the deploy user in the docker group? (log out and back in after setup)"
    exit 1
  fi

  if [[ ! -d "${APP_DIR}/.git" ]]; then
    echo "ERROR: ${APP_DIR} is not a git repo. Run setup first:  sudo bash $0 setup"
    exit 1
  fi

  cd "${APP_DIR}"

  # ── Check secrets ────────────────────────────────────────────────
  for envfile in .env worker.env; do
    if [[ ! -f "${envfile}" ]]; then
      echo "ERROR: ${envfile} not found."
      echo "  cp ${envfile}.example ${envfile}  # then edit it"
      exit 1
    fi
  done

  set -a; source .env; set +a

  # ── Pull latest ──────────────────────────────────────────────────
  # Before `git reset --hard` blows away the working tree, preserve any
  # local refresh of data/manual_catalog.csv (written by the catalog-sync
  # cron). After reset we restore it ONLY IF upstream's catalog blob is
  # the same as the one we had before — i.e. the only diff was the cron's
  # price/rating refresh, not a real upstream catalog edit. If upstream
  # changed the catalog (added/removed ASINs, etc.), we keep upstream's
  # version and the next cron tick will re-refresh those rows.
  PRESERVED_CSV=""
  OLD_CATALOG_BLOB=""
  if [[ -f data/manual_catalog.csv ]] && ! git diff --quiet -- data/manual_catalog.csv 2>/dev/null; then
    PRESERVED_CSV="$(mktemp)"
    cp data/manual_catalog.csv "${PRESERVED_CSV}"
    OLD_CATALOG_BLOB="$(git rev-parse HEAD:data/manual_catalog.csv 2>/dev/null || echo '')"
    echo "→ Detected local CSV refresh; will restore if upstream catalog unchanged"
  fi

  echo "→ Pulling latest from origin/${BRANCH}..."
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  echo "  commit: $(git rev-parse --short HEAD)"

  if [[ -n "${PRESERVED_CSV}" ]]; then
    NEW_CATALOG_BLOB="$(git rev-parse HEAD:data/manual_catalog.csv 2>/dev/null || echo '')"
    if [[ "${NEW_CATALOG_BLOB}" == "${OLD_CATALOG_BLOB}" ]]; then
      cp "${PRESERVED_CSV}" data/manual_catalog.csv
      echo "  ✓ restored locally-refreshed CSV (upstream catalog unchanged)"
    else
      echo "  ⚠ upstream catalog changed — kept upstream version; next cron tick will re-refresh prices"
    fi
    rm -f "${PRESERVED_CSV}"
  fi
  echo ""

  # ── Build ────────────────────────────────────────────────────────
  echo "→ Building images..."
  NEXT_PUBLIC_API_BASE_URL="${API_PUBLIC_URL}" \
  API_BASE_URL="${API_INTERNAL_URL}" \
  ${COMPOSE} build

  # ── Deploy ───────────────────────────────────────────────────────
  echo "→ Stopping old containers..."
  ${COMPOSE} down --remove-orphans --timeout 30

  echo "→ Starting services..."
  ${COMPOSE} up -d

  echo "→ Waiting for database..."
  timeout 60 bash -c \
    'until docker inspect --format="{{.State.Health.Status}}" flashlight-db 2>/dev/null | grep -q healthy; do sleep 2; done' \
    || echo "WARNING: DB health check timed out"

  # ── Import catalog ─────────────────────────────────────────────
  echo "→ Building YAML catalog into database..."
  ${COMPOSE} run --rm catalog-build

  echo "→ Importing manual catalog CSV into database..."
  bash scripts/import-manual-catalog.sh data/manual_catalog.csv

  echo "→ Restarting worker (triggers scoring)..."
  ${COMPOSE} restart worker
  sleep 5

  # ── Re-prerender web with live data ─────────────────────────────
  # The web image's `npm run build` ran during `docker compose build`
  # above, when the build container had no network path to the api
  # container — every fetch failed and our prerenders got baked with
  # empty data (catch-fallback). Now that the api is up AND the db has
  # been populated by catalog-build + worker, re-run the build *inside*
  # the running web container, where it can reach `http://api:8080` on
  # the compose network, then restart Next to load the new .next/.
  # Without this, ISR-cached pages (/reviews, /brands, the homepage
  # CategoryStrips, etc.) stay empty until their 1-hour revalidate
  # window finally fires. Costs ~30-60s of extra deploy time.
  echo "→ Waiting for api to respond..."
  timeout 60 bash -c \
    'until curl -sf -o /dev/null http://localhost:8080/rankings; do sleep 2; done' \
    || echo "WARNING: api did not respond in time; web rebuild may produce empty pages"
  echo "→ Re-prerendering web with live api data..."
  ${COMPOSE} exec -T web npm run build
  echo "→ Restarting web to pick up fresh prerenders..."
  ${COMPOSE} restart web
  sleep 5

  # ── Health check ─────────────────────────────────────────────────
  echo ""
  echo "→ Health checks:"
  api_status=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080/rankings || echo "000")
  web_status=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/ || echo "000")
  echo "  API:  ${api_status}"
  echo "  Web:  ${web_status}"

  echo ""
  if [[ "${api_status}" == "200" && "${web_status}" == "200" ]]; then
    echo "✓ Deploy complete — all services healthy"
  else
    echo "⚠ Some services may be unhealthy. Check logs:"
    echo "  ${COMPOSE} logs --tail=50"
  fi

  # ── Reclaim disk: drop build cache older than a week ─────────────
  # Each build adds layers to the docker build cache and they're not
  # auto-pruned. On a 30 GB root volume this fills the disk in a few
  # months. Keep a week's worth (so quick "redeploy yesterday's image"
  # rebuilds stay cached) and drop everything older. Safe — does NOT
  # touch named volumes (e.g. pgdata) or images currently in use.
  echo ""
  echo "→ Reclaiming docker build cache older than 7 days..."
  reclaimed=$(docker builder prune -f --filter "until=168h" 2>&1 | grep -E "Total reclaimed|reclaimed space" || echo "  (nothing to reclaim)")
  echo "  ${reclaimed}"
  echo ""
}

# ═════════════════════════════════════════════════════════════════════
# CATALOG-SYNC — thin wrapper around scripts/catalog-sync.sh
#   Usage:  bash scripts/deploy.sh catalog-sync
# ═════════════════════════════════════════════════════════════════════
do_catalog_sync() {
  if [[ ! -d "${APP_DIR}" ]]; then
    echo "ERROR: ${APP_DIR} not found. Run setup first."
    exit 1
  fi
  cd "${APP_DIR}"
  bash scripts/catalog-sync.sh
}

# ═════════════════════════════════════════════════════════════════════
# INSTALL-CRON — frequent FULL-catalog Rainforest sync
#   Usage:  bash scripts/deploy.sh install-cron
#
# Default: refresh the entire catalog 3× per day (06:00 / 14:00 / 22:00 UTC).
# Tuned for a larger Rainforest plan where credits support full sweeps.
# SYNC_ROTATE_DAYS=0 means every run touches all ASINs.
#
# Override examples:
#   CRON_SCHEDULE="0 */6 * * *" bash scripts/deploy.sh install-cron   # every 6h
#   CRON_SCHEDULE="0 9 * * *"   bash scripts/deploy.sh install-cron   # once daily
#   PRUNE_THRESHOLD=2           bash scripts/deploy.sh install-cron
# ═════════════════════════════════════════════════════════════════════
do_install_cron() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo "ERROR: crontab is not installed on this system."
    echo "  On Amazon Linux:  sudo yum install -y cronie && sudo systemctl enable --now crond"
    echo "  Or re-run setup:  sudo bash $0 setup"
    exit 1
  fi
  if [[ ! -f "${APP_DIR}/scripts/catalog-sync.sh" ]]; then
    echo "ERROR: ${APP_DIR}/scripts/catalog-sync.sh not found. Pull latest code first."
    exit 1
  fi

  # 3×/day full catalog — keeps average price age ~4h for a ~100–300 ASIN set.
  CRON_SCHEDULE="${CRON_SCHEDULE:-0 6,14,22 * * *}"
  PRUNE_THRESHOLD="${PRUNE_THRESHOLD:-2}"
  CRON_LOG="${CRON_LOG:-${HOME}/catalog-sync.log}"
  CRON_TAG="# flashlightratings-catalog-sync"
  # Full catalog each run (no rotation). Soft-disable offers after N misses.
  CRON_CMD="cd ${APP_DIR} && SYNC_ROTATE_DAYS=0 PRUNE_THRESHOLD=${PRUNE_THRESHOLD} bash scripts/catalog-sync.sh >> ${CRON_LOG} 2>&1"
  CRON_LINE="${CRON_SCHEDULE} ${CRON_CMD} ${CRON_TAG}"

  echo "→ Installing frequent full-catalog cron entry:"
  echo "    ${CRON_LINE}"
  echo ""
  echo "  Each run refreshes the ENTIRE catalog (SYNC_ROTATE_DAYS=0)."
  echo "  Amazon CTAs are disabled after ${PRUNE_THRESHOLD} consecutive unavailable runs."
  echo "  Disabled listings stay monitored and recover automatically."

  # Replace any existing entry with the same tag, then append the new one.
  # Build the new crontab in a temp file so we don't rely on subshell exit
  # semantics — `set -euo pipefail` plus an empty existing crontab caused
  # earlier versions to silently install nothing.
  CRON_TMP="$(mktemp)"
  # Drop both sync cron tags. Match the full-sync tag with a trailing space /
  # end-of-line so we don't also eat the "-rotated" variant (which shares a
  # common prefix).
  crontab -l 2>/dev/null \
    | grep -vE '# flashlightratings-catalog-sync(-rotated)?( |$)' \
    > "${CRON_TMP}" || true
  echo "${CRON_LINE}" >> "${CRON_TMP}"
  crontab "${CRON_TMP}"
  rm -f "${CRON_TMP}"

  echo ""
  echo "✓ Cron installed. Verify with:  crontab -l"
  echo "  Logs will go to: ${CRON_LOG}"
  echo ""
  echo "  To trigger immediately for testing:"
  echo "    bash ${APP_DIR}/scripts/catalog-sync.sh"
  echo ""
  echo "  To remove later:"
  echo "    crontab -l | grep -vF '${CRON_TAG}' | crontab -"
}

# ═════════════════════════════════════════════════════════════════════
# INSTALL-CRON-ROTATED — install a daily cron that refreshes 1/N of catalog
#   Usage:  bash scripts/deploy.sh install-cron-rotated
#
# Installs (or replaces) a cron line that runs catalog-sync every day with
# SYNC_ROTATE_DAYS=N. The script picks a different ~1/N slice of ASINs each
# day based on UTC day-of-year, so the full catalog is refreshed every N days
# while only spending ~1/N of the Rainforest credits per run.
#
# Override with env vars:
#   ROTATE_DAYS=14   bash scripts/deploy.sh install-cron-rotated  # bi-weekly
#   CRON_SCHEDULE="0 4 * * *" bash scripts/deploy.sh install-cron-rotated
# ═════════════════════════════════════════════════════════════════════
do_install_cron_rotated() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo "ERROR: crontab is not installed on this system."
    echo "  On Amazon Linux:  sudo yum install -y cronie && sudo systemctl enable --now crond"
    echo "  Or re-run setup:  sudo bash $0 setup"
    exit 1
  fi
  if [[ ! -f "${APP_DIR}/scripts/catalog-sync.sh" ]]; then
    echo "ERROR: ${APP_DIR}/scripts/catalog-sync.sh not found. Pull latest code first."
    exit 1
  fi

  # Prefer install-cron (3×/day full) when credits allow. Use this path when
  # the catalog grows large enough that a full sweep per run is too expensive —
  # e.g. ROTATE_DAYS=3 spreads ~300+ ASINs across three daily shards.
  ROTATE_DAYS="${ROTATE_DAYS:-1}"
  PRUNE_THRESHOLD="${PRUNE_THRESHOLD:-2}"
  CRON_SCHEDULE="${CRON_SCHEDULE:-0 9 * * *}"
  CRON_LOG="${CRON_LOG:-${HOME}/catalog-sync.log}"
  # Use a distinct tag from install-cron so the two are independent and
  # uninstalling one doesn't clobber the other.
  CRON_TAG="# flashlightratings-catalog-sync-rotated"
  CRON_CMD="cd ${APP_DIR} && SYNC_ROTATE_DAYS=${ROTATE_DAYS} PRUNE_THRESHOLD=${PRUNE_THRESHOLD} bash scripts/catalog-sync.sh >> ${CRON_LOG} 2>&1"
  CRON_LINE="${CRON_SCHEDULE} ${CRON_CMD} ${CRON_TAG}"

  echo "→ Installing rotated cron entry:"
  echo "    ${CRON_LINE}"
  echo ""
  if [[ "${ROTATE_DAYS}" -le 1 ]]; then
    echo "  ROTATE_DAYS=${ROTATE_DAYS}: each run refreshes the full catalog (once per schedule)."
  else
    echo "  This will refresh ~1/${ROTATE_DAYS}th of the catalog each day,"
    echo "  giving full coverage every ${ROTATE_DAYS} days at ~1/${ROTATE_DAYS} the credit cost."
  fi
  echo "  Amazon CTAs are disabled after ${PRUNE_THRESHOLD} consecutive unavailable runs."
  echo "  Disabled listings stay monitored and recover automatically."

  # Build the new crontab in a temp file (see do_install_cron for why).
  CRON_TMP="$(mktemp)"
  # Drop both sync cron tags (see install-cron for the regex rationale).
  crontab -l 2>/dev/null \
    | grep -vE '# flashlightratings-catalog-sync(-rotated)?( |$)' \
    > "${CRON_TMP}" || true
  echo "${CRON_LINE}" >> "${CRON_TMP}"
  crontab "${CRON_TMP}"
  rm -f "${CRON_TMP}"

  echo ""
  echo "✓ Rotated cron installed. Verify with:  crontab -l"
  echo "  Logs will go to: ${CRON_LOG}"
  echo ""
  echo "  Prefer multi-times-per-day full sync? Use instead:"
  echo "    bash ${APP_DIR}/scripts/deploy.sh install-cron"
  echo ""
  echo "  To remove this rotated cron later:"
  echo "    crontab -l | grep -vF '${CRON_TAG}' | crontab -"
}

# ─── Entrypoint ─────────────────────────────────────────────────────
case "${1:-deploy}" in
  setup)                 do_setup                 ;;
  deploy)                do_deploy                ;;
  install-cron)          do_install_cron          ;;
  install-cron-rotated)  do_install_cron_rotated  ;;
  catalog-sync)          do_catalog_sync          ;;
  -h|--help|help) usage ;;
  *) echo "Unknown command: $1"; usage ;;
esac
