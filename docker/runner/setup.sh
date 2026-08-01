#!/bin/bash
# Bootstrap script for Ugreen NAS (or any Docker host with x86_64).
#
#   1. Get RUNNER_TOKEN from GitHub:
#      https://github.com/yaotutu/nanobot-client/settings/actions/runners/new
#   2. Export it:  export RUNNER_TOKEN=ABC123...
#   3. Run:        bash setup.sh
#
# The script is idempotent: rerun safely after wiping volumes.

set -euo pipefail

if [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "ERROR: RUNNER_TOKEN is not set." >&2
  echo "Get it from: https://github.com/yaotutu/nanobot-client/settings/actions/runners/new" >&2
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/volume1/docker/nanobot-runner}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo ">> Fetching Dockerfile + compose.yaml from repo ..."
curl -sSL -o Dockerfile       https://raw.githubusercontent.com/yaotutu/nanobot-client/main/docker/runner/Dockerfile
curl -sSL -o compose.yaml     https://raw.githubusercontent.com/yaotutu/nanobot-client/main/docker/runner/compose.yaml

echo "RUNNER_TOKEN=$RUNNER_TOKEN" > .env

echo ">> Building image (first run ~10 min, one-time) ..."
docker build -t nanobot-runner:latest .

echo ">> Starting runner ..."
docker compose up -d

echo ""
echo "=== Runner started ==="
docker compose ps
echo ""
echo "Verify it's online at:"
echo "   https://github.com/yaotutu/nanobot-client/settings/actions/runners"
