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
  echo "  install-cron           Install weekly cron that refreshes the FULL catalog"
  echo "  install-cron-rotated   Install daily cron that refreshes 1/N of the catalog"
  echo "                          (default N=3, full coverage every 3 days, prunes"
  echo "                          dead listings after 2 misses ~= 6 days)"
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
# INSTALL-CRON — install a weekly cron entry for catalog-sync
#   Usage:  bash scripts/deploy.sh install-cron
#
# Installs (or replaces) a single cron line that runs catalog-sync every
# Monday at 09:00 UTC and appends output to ~/catalog-sync.log. The script
# is idempotent — running it multiple times leaves exactly one entry.
#
# Override schedule with CRON_SCHEDULE env var, e.g.:
#   CRON_SCHEDULE="0 4 * * *" bash scripts/deploy.sh install-cron   # daily 04:00
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

  CRON_SCHEDULE="${CRON_SCHEDULE:-0 9 * * 1}"
  CRON_LOG="${CRON_LOG:-${HOME}/catalog-sync.log}"
  CRON_TAG="# flashlightratings-catalog-sync"
  CRON_CMD="cd ${APP_DIR} && bash scripts/catalog-sync.sh >> ${CRON_LOG} 2>&1"
  CRON_LINE="${CRON_SCHEDULE} ${CRON_CMD} ${CRON_TAG}"

  echo "→ Installing cron entry:"
  echo "    ${CRON_LINE}"

  # Replace any existing entry with the same tag, then append the new one
  ( crontab -l 2>/dev/null | grep -vF "${CRON_TAG}" ; echo "${CRON_LINE}" ) | crontab -

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

  # Defaults chosen for a ~100-300 ASIN catalog: every ASIN refreshed every
  # ~3 days (~1/3 of catalog touched per run), and a dead listing is pruned
  # after 2 consecutive misses (~6 days of being unavailable). Override with
  # ROTATE_DAYS / PRUNE_THRESHOLD env vars at install time.
  ROTATE_DAYS="${ROTATE_DAYS:-3}"
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
  echo "  This will refresh ~1/${ROTATE_DAYS}th of the catalog each day,"
  echo "  giving full coverage every ${ROTATE_DAYS} days at ~1/${ROTATE_DAYS} the credit cost."
  echo "  Listings unavailable for ${PRUNE_THRESHOLD} consecutive runs (~${PRUNE_THRESHOLD}× ${ROTATE_DAYS} days) get pruned."

  ( crontab -l 2>/dev/null | grep -vF "${CRON_TAG}" ; echo "${CRON_LINE}" ) | crontab -

  echo ""
  echo "✓ Rotated cron installed. Verify with:  crontab -l"
  echo "  Logs will go to: ${CRON_LOG}"
  echo ""
  echo "  Heads-up: if you previously installed the weekly full-catalog cron"
  echo "  (install-cron), it's still active. Remove it to avoid double-spending:"
  echo "    crontab -l | grep -vF '# flashlightratings-catalog-sync ' | crontab -"
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
