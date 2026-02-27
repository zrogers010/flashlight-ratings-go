#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

docker compose up --build -d

cat <<'EOF'
Local stack is starting.
- Web: http://localhost:3000
- API: http://localhost:8080

Follow logs:
  docker compose logs -f --tail=100
EOF
