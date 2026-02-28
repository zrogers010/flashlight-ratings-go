#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/flashlight-ratings}"
BRANCH="${BRANCH:-main}"
COMPOSE="docker compose"
DOMAIN="${DOMAIN:-flashlightratings.com}"

# Build args baked into the web container at image build time
API_INTERNAL_URL="http://api:8080"
API_PUBLIC_URL="https://${DOMAIN}/api"

# ─── Preflight ──────────────────────────────────────────────────────
echo "═══ FlashlightRatings deploy ═══"
echo "  dir:    ${APP_DIR}"
echo "  branch: ${BRANCH}"
echo "  domain: ${DOMAIN}"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon not running (or no permission — is this user in the docker group?)"
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "ERROR: ${APP_DIR} does not exist. Clone the repo first:"
  echo "  sudo mkdir -p ${APP_DIR}"
  echo "  sudo chown deploy:deploy ${APP_DIR}"
  echo "  git clone git@github.com:YOUR_USER/flashlight-ratings-go.git ${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"

# ─── Check secrets ──────────────────────────────────────────────────
for envfile in .env worker.env; do
  if [[ ! -f "${envfile}" ]]; then
    echo "ERROR: ${envfile} not found. Copy from the example and fill in secrets:"
    echo "  cp deploy/env/${envfile/\.env/}.env.example ${envfile} 2>/dev/null || cp .env.example ${envfile}"
    echo "  nano ${envfile}"
    exit 1
  fi
done

# Source .env so docker compose picks up variables
set -a; source .env; set +a

# ─── Pull latest code ──────────────────────────────────────────────
echo "→ Pulling latest from origin/${BRANCH}..."
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"
echo "  commit: $(git rev-parse --short HEAD)"
echo ""

# ─── Build and deploy ──────────────────────────────────────────────
echo "→ Building images..."
${COMPOSE} build \
  --build-arg NEXT_PUBLIC_API_BASE_URL="${API_PUBLIC_URL}" \
  --build-arg API_BASE_URL="${API_INTERNAL_URL}"

echo "→ Stopping old containers..."
${COMPOSE} down --remove-orphans --timeout 30

echo "→ Starting services..."
${COMPOSE} up -d

echo "→ Waiting for database health check..."
timeout 60 bash -c 'until docker inspect --format="{{.State.Health.Status}}" flashlight-db 2>/dev/null | grep -q healthy; do sleep 2; done' \
  || { echo "WARNING: DB health check timed out"; }

# ─── Import catalog data ───────────────────────────────────────────
echo "→ Importing manual catalog..."
bash scripts/import-manual-catalog.sh data/manual_catalog.csv

echo "→ Restarting worker (triggers scoring)..."
${COMPOSE} restart worker
sleep 5

# ─── Verify ─────────────────────────────────────────────────────────
echo ""
echo "→ Health checks:"

api_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/rankings 2>/dev/null || echo "000")
echo "  API /rankings:       ${api_status}"

web_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
echo "  Web /:               ${web_status}"

echo ""
if [[ "${api_status}" == "200" && "${web_status}" == "200" ]]; then
  echo "✓ Deploy complete — all services healthy"
else
  echo "⚠ Deploy finished but some services may be unhealthy. Check logs:"
  echo "  ${COMPOSE} logs --tail=50"
fi

echo ""
echo "Reminder: set up a reverse proxy (nginx/caddy) to forward:"
echo "  ${DOMAIN}     → localhost:3000"
echo "  ${DOMAIN}/api → localhost:8080"
echo ""
