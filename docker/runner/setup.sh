#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  nanobot-client · Self-hosted GitHub Actions runner bootstrap
# ════════════════════════════════════════════════════════════════════════
#
#  ARCHITECTURE (so the host-vs-container boundary is explicit):
#
#    ┌───────────────────────────────────────────────────────────────┐
#    │  Your NAS (host)                                              │
#    │                                                               │
#    │  setup.sh  ← this script. runs ONCE. only bootstraps Docker.  │
#    │     │                                                         │
#    │     ├── checks docker is installed + running                  │
#    │     ├── writes ./Dockerfile + ./compose.yaml + ./.env         │
#    │     ├── docker build -t nanobot-runner:latest .               │
#    │     └── docker compose up -d                                  │
#    │                                                               │
#    │  ─────── after this finishes, NOTHING runs on the host ───────│
#    │                                                               │
#    │  ┌─────────────────────────────────────────────────────────┐  │
#    │  │  Container: nanobot-runner                               │  │
#    │  │                                                          │  │
#    │  │   • GitHub Actions runner (long-running)                 │  │
#    │  │   • JDK 17 · Node 22 · Android SDK 36 · NDK · ccache     │  │
#    │  │   • Gradle / ccache / Android SDK persisted via volumes  │  │
#    │  │   • All assembleRelease / expo export work happens here  │  │
#    │  └─────────────────────────────────────────────────────────┘  │
#    └───────────────────────────────────────────────────────────────┘
#
#  The ONLY footprint on your host is:  /volume1/docker/nanobot-runner/
#
# ──────────────────────────────────────────────────────────────────────
#  Usage:
#    1. Get RUNNER_TOKEN:
#         https://github.com/yaotutu/nanobot-client/settings/actions/runners/new
#    2. export RUNNER_TOKEN=ABC123XYZ...
#    3. bash setup.sh
#
#  Idempotent: rerun safely. Re-running rebuilds the image and recreates
#  the container. Volumes (gradle/ccache/SDK) are preserved.
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 1. Pre-flight ─────────────────────────────────────────────────
if [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "✗ RUNNER_TOKEN not set." >&2
  echo "" >&2
  echo "  1. Visit:" >&2
  echo "       https://github.com/yaotutu/nanobot-client/settings/actions/runners/new" >&2
  echo "  2. Copy the token shown on that page." >&2
  echo "  3. Rerun:" >&2
  echo "       export RUNNER_TOKEN=ABC123XYZ..." >&2
  echo "       bash setup.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ docker CLI not found in PATH." >&2
  echo "" >&2
  echo "  On UGOS (Ugreen NAS):" >&2
  echo "    控制面板 → 容器管理 / Container Manager → 安装并启用服务" >&2
  echo "    (Control Panel → Container Manager → install + start the service)" >&2
  echo "" >&2
  echo "  After it's running, SSH back in and rerun this script." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ docker daemon unreachable. Start the Container Manager service first." >&2
  exit 1
fi

# ─── 2. Prepare install dir ────────────────────────────────────────
INSTALL_DIR="${INSTALL_DIR:-/volume1/docker/nanobot-runner}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo ""
echo "▶ Install dir: $INSTALL_DIR"
echo "▶ Hostname:    $(hostname)"
echo "▶ Kernel:      $(uname -r)"
echo "▶ Arch:        $(uname -m)"

# ─── 3. Write Dockerfile (baked into setup.sh — no network fetch) ──
cat > Dockerfile <<'DOCKERFILE_EOF'
# Self-hosted GitHub Actions runner for nanobot-client
# Base: official myoung34/github-runner (handles registration/cleanup)
# Adds: JDK 17, Node 22, Android SDK 36, NDK, ccache — baked into image
# so the container is fully provisioned on first start.

FROM myoung34/github-runner:latest

USER root

ENV DEBIAN_FRONTEND=noninteractive

# JDK 17 + ccache + basics
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless \
        ca-certificates \
        curl \
        unzip \
        git \
        ccache \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (matches the CI version)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Android command-line tools + SDK 36 + build-tools + NDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && cd ${ANDROID_HOME}/cmdline-tools \
    && curl -sSL -o cmdline-tools.zip \
       https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q cmdline-tools.zip && mv cmdline-tools latest && rm cmdline-tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" \
    && sdkmanager "ndk;26.1.10909125"

# ccache config (capped at 2GB; the persistent volume keeps it across runs)
RUN mkdir -p /home/runner/.ccache \
    && ccache --set-config=max_size=2G \
    && chown -R runner:runner /home/runner/.ccache

# Make sure the runner user can read/write the SDK
RUN chown -R runner:runner ${ANDROID_HOME}

USER runner
DOCKERFILE_EOF

# ─── 4. Write compose.yaml (baked into setup.sh) ───────────────────
cat > compose.yaml <<'COMPOSE_EOF'
# Self-hosted GitHub Actions runner for nanobot-client
# All builds happen INSIDE this container, never on the host.

services:
  runner:
    build:
      context: .
      dockerfile: Dockerfile
    image: nanobot-runner:latest
    container_name: nanobot-runner
    restart: unless-stopped
    environment:
      REPO_URL: "https://github.com/yaotutu/nanobot-client"
      RUNNER_TOKEN: "${RUNNER_TOKEN}"
      RUNNER_NAME: "n100-nas"
      RUNNER_LABELS: "self-hosted,linux,x64,n100"
      RUNNER_REPLACE_EXISTING: "true"
      DISABLE_WAIT_FOR_DEBUGGER: "true"
    volumes:
      - ./work:/work
      - ./gradle:/home/runner/.gradle
      - ./ccache:/home/runner/.ccache
      - ./android-sdk:/opt/android-sdk
COMPOSE_EOF

# ─── 5. Write .env (unquoted heredoc → RUNNER_TOKEN gets expanded) ─
cat > .env <<ENV_EOF
RUNNER_TOKEN=${RUNNER_TOKEN}
ENV_EOF
chmod 600 .env

# ─── 6. Build image + start container ─────────────────────────────
echo ""
echo "▶ Building image (first run ~10 min — installs JDK, Node, Android SDK, NDK) ..."
docker build -t nanobot-runner:latest .

echo ""
echo "▶ Starting runner container ..."
docker compose up -d

# ─── 7. Report status ──────────────────────────────────────────────
sleep 5
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✓ Runner container started"
echo "════════════════════════════════════════════════════════"
docker compose ps
echo ""
echo "▶ Verify runner is online (registration takes ~10–30 s):"
echo "    https://github.com/yaotutu/nanobot-client/settings/actions/runners"
echo ""
echo "▶ Stream runner logs:"
echo "    cd $INSTALL_DIR && docker compose logs -f"
echo ""
echo "▶ Stop the runner:"
echo "    cd $INSTALL_DIR && docker compose down"
echo ""
echo "▶ When ready, push a tag to trigger a build:"
echo "    git tag -a v1.0.0 -m 'Release v1.0.0'"
echo "    git push origin v1.0.0"
echo ""
echo "▶ The runner picks up jobs labeled: [self-hosted, linux, x64, n100]"
echo "════════════════════════════════════════════════════════"
