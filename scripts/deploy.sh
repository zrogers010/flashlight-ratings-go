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
  echo "Usage: $0 [setup|deploy]"
  echo ""
  echo "  setup   First-time server setup (run as ec2-user with sudo)"
  echo "  deploy  Pull latest code and deploy (run as deploy user)"
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
  echo "→ Pulling latest from origin/${BRANCH}..."
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  echo "  commit: $(git rev-parse --short HEAD)"
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

  # ── Import data ──────────────────────────────────────────────────
  echo "→ Importing catalog..."
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

# ─── Entrypoint ─────────────────────────────────────────────────────
case "${1:-deploy}" in
  setup)  do_setup  ;;
  deploy) do_deploy ;;
  -h|--help|help) usage ;;
  *) echo "Unknown command: $1"; usage ;;
esac
