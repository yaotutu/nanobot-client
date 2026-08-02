#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  nanobot-client · Self-hosted GitHub Actions runner — Mac-side builder
# ════════════════════════════════════════════════════════════════════════
#
#  ★★★ RUN THIS ON YOUR MAC, NEVER ON THE NAS ★★★
#
#  This script builds the runner Docker image on your Mac (Docker Desktop)
#  and pushes it to the NAS. The NAS never runs a custom shell script —
#  you only operate it through the UGOS Container Manager UI.
#
#  ┌───────────────────────────────────────────────────────────────────┐
#  │  Your Mac (this script)                                           │
#  │    1. Verify Docker Desktop is running                            │
#  │    2. docker build -t nanobot-runner:latest .   (~10 min)         │
#  │    3. docker save  | ssh NAS  docker load       (no host scripts)  │
#  └───────────────────────────────────────────────────────────────────┘
#  ┌───────────────────────────────────────────────────────────────────┐
#  │  NAS — only via UGOS Container Manager UI (no shell on host)      │
#  │    1. Confirm image appears in 镜像 (Images)                      │
#  │    2. 创建容器 → image = nanobot-runner:latest                    │
#  │    3. Set env vars + mount volumes (script prints them below)     │
#  │    4. Start container                                             │
#  └───────────────────────────────────────────────────────────────────┘
#
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 1. Pre-flight: Docker on the caller's machine ─────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker CLI not found." >&2
  echo "  Install Docker Desktop for Mac: https://www.docker.com/products/docker-desktop/" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker daemon not running. Start Docker Desktop and try again." >&2
  exit 1
fi

# ─── 2. Refuse to run on NAS (defensive) ────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  echo "⚠ This script is meant for macOS. You're on: $(uname)" >&2
  echo "  Continue anyway? (y/N)" >&2
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

# ─── 3. Resolve script dir (where Dockerfile lives) ────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ─── 4. NAS SSH target (override with NAS_SSH=user@host) ───────────
NAS_SSH="${NAS_SSH:-yaotutu@nas.local}"
echo ""
echo "▶ Docker:  $(docker --version)"
echo "▶ NAS SSH: $NAS_SSH  (override: NAS_SSH=user@host)"
echo "▶ Hostname:$(hostname)  Arch:$(uname -m)"
echo ""

# ─── 5. Build the image ─────────────────────────────────────────────
echo "▶ Building nanobot-runner:latest"
echo "  (first run ~10 min — installs JDK 17, Node 22, Android SDK 36,"
echo "   NDK 26.1, ccache. Subsequent builds are cached.)"
echo ""
docker build -t nanobot-runner:latest .

# ─── 6. Transfer to NAS via SSH pipe ────────────────────────────────
echo ""
echo "▶ Transferring image to NAS via SSH pipe ..."
echo "  (image is ~3 GB, may take a few minutes over LAN)"
echo ""
docker save nanobot-runner:latest | ssh "$NAS_SSH" "docker load"

# ─── 7. Print Container Manager setup instructions ──────────────────
cat <<INSTRUCTIONS

════════════════════════════════════════════════════════════════════
 ✓ Image built and loaded on NAS
════════════════════════════════════════════════════════════════════

NEXT STEP — finish in UGOS Container Manager UI (zero shell on NAS):

1. Get RUNNER_TOKEN (registration token, ~1 hour TTL):
     https://github.com/yaotutu/nanobot-client/settings/actions/runners/new
     (click "New self-hosted runner", copy the token shown)

2. Open UGOS Container Manager (容器管理) on the NAS.

3. 镜像 (Images) → confirm "nanobot-runner:latest" is listed.
   If not listed, run on Mac instead:
       docker save -o nanobot-runner.tar nanobot-runner:latest
       scp nanobot-runner.tar $NAS_SSH:/volume1/docker/
       ssh $NAS_SSH docker load -i /volume1/docker/nanobot-runner.tar
   then return to step 2.

4. 容器 (Containers) → 创建 (Create) → set:

   Image:           nanobot-runner:latest
   Container name:  nanobot-runner
   Restart policy:  unless-stopped

5. Environment variables (环境变量):

   REPO_URL                 = https://github.com/yaotutu/nanobot-client
   RUNNER_TOKEN             = <paste token from step 1>
   RUNNER_NAME              = n100-nas
   RUNNER_LABELS            = self-hosted,linux,x64,n100
   RUNNER_REPLACE_EXISTING  = true
   DISABLE_WAIT_FOR_DEBUGGER = true

6. Volumes (卷) — create the host dirs first if missing:

   /volume1/docker/nanobot-runner/gradle       → /home/runner/.gradle
   /volume1/docker/nanobot-runner/ccache       → /home/runner/.ccache
   /volume1/docker/nanobot-runner/android-sdk  → /opt/android-sdk

   (the ./work volume in compose.yaml is unused — see docker/runner/README.md)

7. Start the container. Within ~30 s the runner should appear online at:
     https://github.com/yaotutu/nanobot-client/settings/actions/runners
   (status = Idle, green dot, labels include "self-hosted")

Once the runner is green, ping me — I'll trigger the smoke test then the
first release build (nanobot-v1.0.0.apk + web zip + checksums).
INSTRUCTIONS
