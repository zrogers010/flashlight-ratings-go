#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/flashlight-ratings-go}"
cd "${APP_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "go is required" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

if [ ! -d .git ]; then
  echo "APP_DIR does not look like a git checkout: ${APP_DIR}" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Deploying branch: ${BRANCH}"

git fetch origin "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

mkdir -p bin
CGO_ENABLED=0 go build -o bin/api ./cmd/api
CGO_ENABLED=0 go build -o bin/worker ./cmd/worker

if [ -f /etc/flashlight-ratings-go/api.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/flashlight-ratings-go/api.env
  set +a
fi

if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/migrations/0001_initial_schema.sql
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/migrations/0002_market_intelligence.sql
else
  echo "Skipping DB migrations (psql missing or DATABASE_URL not set)."
fi

pushd web >/dev/null
npm ci
npm run build
popd >/dev/null

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart flashlight-api flashlight-worker flashlight-web
  systemctl --no-pager --full status flashlight-api flashlight-worker flashlight-web || true
else
  echo "systemctl not found; restart services manually."
fi

echo "Deploy completed."
