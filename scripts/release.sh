#!/usr/bin/env bash

# Build the current local workspace into an Android APK and publish that APK to
# GitHub Releases. This script intentionally does not inspect, commit, push, or
# synchronize the local Git worktree.

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly PACKAGE_LOCK="$REPO_ROOT/package-lock.json"
readonly APP_JSON="$REPO_ROOT/app.json"
readonly DEV_SECRET_PATH="$REPO_ROOT/src/services/credentials/dev-secret.ts"
# Release 同时产出四个 CPU 架构包和 universal 通用包：
# - 架构包适合手动下载，体积明显小于通用包；
# - universal 包保留给在线更新和未知设备兜底，保证任意支持的设备都能安装。
readonly RELEASE_APK_ABIS=(armeabi-v7a arm64-v8a x86 x86_64 universal)

BUMP="patch"
SKIP_CHECK=false
NO_VERSION=false
CLEAN_NATIVE=false
LOCAL_ONLY=false
DEV_SECRET_BACKUP=""
CREATED_DEV_SECRET=false

usage() {
  cat <<'USAGE'
Usage:
  npm run release -- [patch|minor|major|vX.Y.Z] [options]

Builds the current local workspace into Android Release APKs, then creates a
GitHub Release and uploads those APKs. It never checks, commits, pushes, or
syncs the local Git worktree.

Examples:
  npm run release                          # bump, build, and publish GitHub Release
  npm run release -- minor                 # bump minor, build, and publish
  npm run release -- v1.2.0                # use an explicit version, then publish
  npm run release -- --no-version          # build/publish with the current version
  npm run release -- --local-only          # build only; do not upload to GitHub

Options:
  --no-version     Do not change package/app versions.
  --local-only     Build APKs but do not create a GitHub Release.
  --clean-native   Delete and regenerate the Android project before building.
  --skip-check     Skip npm run check.
  -h, --help       Show this help text.

GitHub publishing requires GitHub CLI authentication:
  gh auth login
USAGE
}

fail() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$DEV_SECRET_BACKUP" && -f "$DEV_SECRET_BACKUP" ]]; then
    cp -- "$DEV_SECRET_BACKUP" "$DEV_SECRET_PATH"
    rm -f -- "$DEV_SECRET_BACKUP"
  elif [[ "$CREATED_DEV_SECRET" == true ]]; then
    rm -f -- "$DEV_SECRET_PATH"
  fi
}
trap cleanup EXIT

while (($# > 0)); do
  case "$1" in
    patch|minor|major|v[0-9]*|[0-9]*)
      [[ "$BUMP" == "patch" ]] || fail "Only one version argument may be provided."
      BUMP="$1"
      ;;
    --no-version)
      NO_VERSION=true
      ;;
    --local-only)
      LOCAL_ONLY=true
      ;;
    --clean-native)
      CLEAN_NATIVE=true
      ;;
    --skip-check)
      SKIP_CHECK=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      fail "Unknown option: $1"
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

cd -- "$REPO_ROOT"

for command_name in node npm npx java; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done

if [[ "$LOCAL_ONLY" == false ]]; then
  for command_name in gh curl; do
    command -v "$command_name" >/dev/null 2>&1 \
      || fail "Required command not found: $command_name (install it or use --local-only)"
  done
fi

[[ -n "${ANDROID_HOME:-}" ]] || fail "ANDROID_HOME is not set."
[[ -d "$ANDROID_HOME" ]] || fail "ANDROID_HOME does not exist: $ANDROID_HOME"

if [[ "$LOCAL_ONLY" == false ]]; then
  gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated. Run: gh auth login"
fi

if [[ "$NO_VERSION" == false ]]; then
  CURRENT_VERSION="$(node -e 'process.stdout.write(require("./package.json").version)')"
  NEXT_VERSION="$(CURRENT_VERSION="$CURRENT_VERSION" BUMP="$BUMP" node <<'NODE'
const current = process.env.CURRENT_VERSION;
const bump = process.env.BUMP.replace(/^v/, '');
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) throw new Error(`Unsupported current version: ${current}`);

let next;
if (['patch', 'minor', 'major'].includes(bump)) {
  let [, major, minor, patch] = match.map(Number);
  if (bump === 'major') { major += 1; minor = 0; patch = 0; }
  if (bump === 'minor') { minor += 1; patch = 0; }
  if (bump === 'patch') { patch += 1; }
  next = `${major}.${minor}.${patch}`;
} else {
  if (!/^\d+\.\d+\.\d+$/.test(bump)) {
    throw new Error(`Version must be patch, minor, major, or X.Y.Z; received: ${process.env.BUMP}`);
  }
  next = bump;
}
if (next === current) throw new Error(`Version is already ${current}`);
process.stdout.write(next);
NODE
  )" || fail "Unable to calculate the next version."

  printf '\n==> Updating local version %s -> %s\n' "$CURRENT_VERSION" "$NEXT_VERSION"
  NEXT_VERSION="$NEXT_VERSION" node <<'NODE'
const fs = require('node:fs');
const version = process.env.NEXT_VERSION;

function update(path, callback) {
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  callback(value);
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

update('package.json', (value) => { value.version = version; });
update('app.json', (value) => { value.expo.version = version; });
update('package-lock.json', (value) => {
  value.version = version;
  if (value.packages && value.packages['']) value.packages[''].version = version;
});
NODE
fi

printf '\n==> Using existing dependencies\n'
[[ -d node_modules ]] || fail "node_modules is missing; run npm ci once before releasing."

if [[ "$SKIP_CHECK" == false ]]; then
  printf '\n==> Running lint, typecheck, and tests\n'
  npm run check
else
  printf '\n==> Skipping code checks\n'
fi

if [[ -f "$DEV_SECRET_PATH" ]]; then
  DEV_SECRET_BACKUP="$(mktemp "${TMPDIR:-/tmp}/nanobot-dev-secret.XXXXXX")"
  chmod 600 "$DEV_SECRET_BACKUP"
  cp -- "$DEV_SECRET_PATH" "$DEV_SECRET_BACKUP"
else
  CREATED_DEV_SECRET=true
  mkdir -p -- "$(dirname -- "$DEV_SECRET_PATH")"
fi
printf 'export const DEV_BOOTSTRAP_SECRET = "";\nexport const DEV_SERVER_URL = "";\n' > "$DEV_SECRET_PATH"

# Release bundles must use production Expo/Metro behavior.
export NODE_ENV=production

printf '\n==> Preparing Android project\n'
if [[ "$CLEAN_NATIVE" == true ]]; then
  npx expo prebuild --platform android --no-install --clean
else
  npx expo prebuild --platform android --no-install
fi

printf '\n==> Building split Android Release APKs (incremental Gradle build)\n'
pushd android >/dev/null
./gradlew assembleRelease -Pnanobot.enableAbiSplits=true
popd >/dev/null

PACKAGE_VERSION="$(node -e 'process.stdout.write(require("./package.json").version)')"
TAG="v$PACKAGE_VERSION"
ARTIFACT_DIR="$REPO_ROOT/release-assets/$TAG"
APK_OUTPUT_DIR="$REPO_ROOT/android/app/build/outputs/apk/release"
RELEASE_APK_NAMES=()

printf '\n==> Packaging local artifacts\n'
rm -rf -- "$ARTIFACT_DIR"
mkdir -p -- "$ARTIFACT_DIR"
for abi in "${RELEASE_APK_ABIS[@]}"; do
  # Gradle 的 split 输出名固定为 app-${abi}-release.apk；这里显式检查每个期望产物，
  # 避免 glob 静默漏包后把不完整的 Release 发布出去。
  apk_source="$APK_OUTPUT_DIR/app-$abi-release.apk"
  apk_name="nanobot-$TAG-$abi.apk"
  [[ -f "$apk_source" ]] || fail "Android $abi APK was not produced at: $apk_source"
  cp -- "$apk_source" "$ARTIFACT_DIR/$apk_name"
  RELEASE_APK_NAMES+=("$apk_name")
done

pushd "$ARTIFACT_DIR" >/dev/null
# checksums.txt 覆盖所有 APK，方便手动下载任意架构包后逐个核对。
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum ./*.apk > checksums.txt
else
  shasum -a 256 ./*.apk > checksums.txt
fi
popd >/dev/null

printf '\nBuild complete.\nArtifacts: %s\n' "$ARTIFACT_DIR"

if [[ "$LOCAL_ONLY" == true ]]; then
  printf 'GitHub Release: skipped (--local-only)\n'
  exit 0
fi
printf '\n==> Publishing GitHub Release %s\n' "$TAG"
REPOSITORY="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# 手动包不包含 update.json，必须排除 Latest，避免覆盖 CI 的唯一更新入口。
# Ensure the release exists (this also creates the git tag on the remote).
if ! gh release view "$TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --repo "$REPOSITORY" \
    --latest=false \
    --title "nanobot $TAG" \
    --notes "Android Release APK built from the local workspace." \
    || fail "Unable to create GitHub Release $TAG."
fi

RELEASE_ID="$(gh api "repos/$REPOSITORY/releases/tags/$TAG" --jq '.id')" \
  || fail "Unable to resolve release id for $TAG."
GH_TOKEN="$(gh auth token)" || fail "Unable to read the GitHub authentication token."

# Remove assets with the same name before each upload attempt. This preserves
# the script's idempotent behavior and also cleans up assets created by uploads
# whose response was interrupted before curl received it.
delete_existing_assets() {
  local target_name="$1"
  local assets asset_id asset_name

  assets="$(gh api --paginate \
    "repos/$REPOSITORY/releases/$RELEASE_ID/assets?per_page=100" \
    --jq '.[] | [.id, .name] | @tsv')" || return 1

  while IFS=$'\t' read -r asset_id asset_name; do
    [[ -n "$asset_id" && "$asset_name" == "$target_name" ]] || continue
    gh api --method DELETE \
      "repos/$REPOSITORY/releases/assets/$asset_id" >/dev/null || return 1
  done <<< "$assets"
}

# Upload directly through the GitHub uploads API. Unlike `gh release upload`,
# curl has no interactive progress UI that can stall in non-interactive shells.
upload_asset() {
  local file="$1" name="$2" content_type="$3"
  local attempt code curl_status

  for attempt in 1 2 3 4 5; do
    if ! delete_existing_assets "$name"; then
      printf '  %s: attempt %d could not remove an existing asset.\n' \
        "$name" "$attempt" >&2
    else
      if code="$(curl -sS -o /dev/null -w '%{http_code}' \
        --connect-timeout 15 --max-time 7200 \
        -X POST \
        -H "Authorization: Bearer $GH_TOKEN" \
        -H 'Accept: application/vnd.github+json' \
        -H "Content-Type: $content_type" \
        --data-binary "@$file" \
        "https://uploads.github.com/repos/$REPOSITORY/releases/$RELEASE_ID/assets?name=$name")"; then
        curl_status=0
      else
        curl_status=$?
      fi

      if [[ "$curl_status" -eq 0 && "$code" == "201" ]]; then
        printf '  uploaded %s\n' "$name"
        return 0
      fi

      printf '  %s: attempt %d failed (HTTP %s, curl exit %d).\n' \
        "$name" "$attempt" "${code:-none}" "$curl_status" >&2
    fi

    if [[ "$attempt" -lt 5 ]]; then
      printf '  retrying in 5 seconds...\n' >&2
      sleep 5
    fi
  done

  return 1
}

# 逐个上传所有架构包和 universal 包；任何一个失败都停止，避免 Release 资产不完整。
for apk_name in "${RELEASE_APK_NAMES[@]}"; do
  upload_asset "$ARTIFACT_DIR/$apk_name" "$apk_name" 'application/vnd.android.package-archive' \
    || fail "Unable to upload APK to GitHub Release $TAG: $apk_name"
done
upload_asset "$ARTIFACT_DIR/checksums.txt" 'checksums.txt' 'text/plain' \
  || fail "Unable to upload checksums to GitHub Release $TAG."
unset GH_TOKEN

# Publish in case the existing release was a draft.
gh release edit "$TAG" --repo "$REPOSITORY" --draft=false >/dev/null \
  || fail "Unable to publish GitHub Release $TAG."

RELEASE_URL="$(gh release view "$TAG" --repo "$REPOSITORY" --json url --jq .url)"
printf '\nGitHub Release: %s\n' "$RELEASE_URL"
