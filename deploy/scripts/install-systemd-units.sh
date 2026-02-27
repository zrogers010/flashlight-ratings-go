#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_DIR="${ROOT_DIR}/deploy/systemd"

install -m 0644 "${UNIT_DIR}/flashlight-api.service" /etc/systemd/system/flashlight-api.service
install -m 0644 "${UNIT_DIR}/flashlight-worker.service" /etc/systemd/system/flashlight-worker.service
install -m 0644 "${UNIT_DIR}/flashlight-web.service" /etc/systemd/system/flashlight-web.service

systemctl daemon-reload
echo "Installed units. Enable/start with:"
echo "  systemctl enable --now flashlight-api flashlight-worker flashlight-web"
