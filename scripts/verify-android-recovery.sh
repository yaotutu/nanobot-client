#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${NANOBOT_ANDROID_PACKAGE:-com.anonymous.nanobotclient}"
WAIT_SECONDS="${NANOBOT_RECOVERY_WAIT_SECONDS:-5}"
UI_TIMEOUT_SECONDS="${NANOBOT_RECOVERY_UI_TIMEOUT_SECONDS:-60}"
POLL_SECONDS="${NANOBOT_RECOVERY_POLL_SECONDS:-2}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is required" >&2
  exit 1
fi

DEVICES=()
while IFS= read -r device; do
  [[ -n "$device" ]] && DEVICES+=("$device")
done < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if [[ ${#DEVICES[@]} -ne 1 ]]; then
  echo "Expected exactly one connected Android device, found ${#DEVICES[@]}" >&2
  adb devices -l >&2
  exit 1
fi

DEVICE="${DEVICES[0]}"
ADB=(adb -s "$DEVICE")
ARTIFACT_DIR=".local/verification-raw/android-recovery-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ARTIFACT_DIR"

APP_PID=""
WIFI_DISABLED=0

capture_window() {
  local label="$1"
  local remote_path="/sdcard/nanobot-${label}.xml"
  "${ADB[@]}" shell uiautomator dump "$remote_path" >/dev/null 2>&1 || return 1
  "${ADB[@]}" exec-out cat "$remote_path" > "$ARTIFACT_DIR/window-${label}.xml" 2>/dev/null
}

capture_state() {
  "${ADB[@]}" shell dumpsys activity activities > "$ARTIFACT_DIR/activity.txt" 2>/dev/null || true
  "${ADB[@]}" shell pidof "$PACKAGE_NAME" > "$ARTIFACT_DIR/pid.txt" 2>/dev/null || true
  "${ADB[@]}" exec-out screencap -p > "$ARTIFACT_DIR/final-screen.png" 2>/dev/null || true
  capture_window final || true
  "${ADB[@]}" logcat -d -v threadtime > "$ARTIFACT_DIR/logcat.txt" 2>/dev/null || true
}

fatal_log_pattern() {
  local patterns=(
    "FATAL EXCEPTION"
    "AndroidRuntime.*Process: ${PACKAGE_NAME}"
    "Maximum update depth exceeded"
    "Process ${PACKAGE_NAME}.*has died"
    ">>> ${PACKAGE_NAME} <<<"
  )
  if [[ -n "$APP_PID" ]]; then
    patterns+=("Fatal signal [0-9]+.*pid ${APP_PID}")
  else
    patterns+=("Fatal signal [0-9]+.*nanobotclient")
  fi

  local joined
  joined="$(IFS='|'; echo "${patterns[*]}")"
  printf '%s' "$joined"
}

assert_no_fatal_errors() {
  local pattern
  pattern="$(fatal_log_pattern)"
  if grep -E "$pattern" "$ARTIFACT_DIR/logcat.txt"; then
    echo "Detected fatal application error; logs: $ARTIFACT_DIR/logcat.txt" >&2
    return 1
  fi
}

cleanup() {
  local exit_code=$?
  if [[ "$WIFI_DISABLED" -eq 1 ]]; then
    "${ADB[@]}" shell svc wifi enable >/dev/null 2>&1 || true
  fi
  capture_state
  if ! assert_no_fatal_errors; then
    exit_code=1
  fi
  if [[ "$exit_code" -ne 0 ]]; then
    echo "Android recovery verification failed. Raw artifacts: $ARTIFACT_DIR" >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT

wait_for_process() {
  local deadline=$((SECONDS + 20))
  while (( SECONDS < deadline )); do
    APP_PID="$("${ADB[@]}" shell pidof "$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true)"
    if [[ -n "$APP_PID" ]]; then
      echo "$APP_PID" > "$ARTIFACT_DIR/launched-pid.txt"
      return 0
    fi
    sleep 1
  done
  echo "Application process did not start within 20 seconds" >&2
  return 1
}

assert_process_alive() {
  local label="$1"
  local current_pid
  current_pid="$("${ADB[@]}" shell pidof "$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "$current_pid" ]]; then
    echo "Application process is not alive after ${label}" >&2
    return 1
  fi
  if [[ -n "$APP_PID" && "$current_pid" != "$APP_PID" ]]; then
    echo "Application process restarted after ${label}: ${APP_PID} -> ${current_pid}" >&2
    return 1
  fi
}

assert_activity_resumed() {
  local label="$1"
  local activity_dump="$ARTIFACT_DIR/activity-${label}.txt"
  "${ADB[@]}" shell dumpsys activity activities > "$activity_dump"
  if ! grep -E "(mResumedActivity|topResumedActivity).*${PACKAGE_NAME}/\.MainActivity" "$activity_dump" >/dev/null; then
    echo "MainActivity is not resumed after ${label}; see ${activity_dump}" >&2
    return 1
  fi
}

has_usable_ui_marker() {
  local xml_path="$1"
  # ready、鉴权页和不可达页都至少包含一个属于本应用的可点击控件；纯白页和启动占位没有。
  grep -E "package=\"${PACKAGE_NAME}\"[^>]*clickable=\"true\"" "$xml_path" >/dev/null
}

wait_for_usable_ui() {
  local label="$1"
  local deadline=$((SECONDS + UI_TIMEOUT_SECONDS))
  local attempt=0
  while (( SECONDS < deadline )); do
    assert_process_alive "$label"
    attempt=$((attempt + 1))
    if capture_window "${label}-${attempt}"; then
      local xml_path="$ARTIFACT_DIR/window-${label}-${attempt}.xml"
      if has_usable_ui_marker "$xml_path"; then
        cp "$xml_path" "$ARTIFACT_DIR/window-${label}.xml"
        assert_activity_resumed "$label"
        return 0
      fi
    fi
    sleep "$POLL_SECONDS"
  done
  echo "Application did not expose a usable UI within ${UI_TIMEOUT_SECONDS}s after ${label}" >&2
  return 1
}

# 先结束旧进程再清日志，避免把本次测试主动 force-stop 误判为运行期进程死亡。
"${ADB[@]}" shell am force-stop "$PACKAGE_NAME"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null
wait_for_process
wait_for_usable_ui cold-start

# 使用明确的 sleep/wakeup keycode 验证锁屏后台恢复，避免 KEYCODE_POWER 因当前屏幕状态不同而反向切换。
"${ADB[@]}" shell input keyevent 223
sleep "$WAIT_SECONDS"
"${ADB[@]}" shell input keyevent 224
"${ADB[@]}" shell input keyevent 82 || true
wait_for_usable_ui screen-unlock

# 某些真机会限制 svc wifi；不支持时记录为跳过，不伪造网络恢复成功。
if "${ADB[@]}" shell svc wifi disable >/dev/null 2>&1; then
  WIFI_DISABLED=1
  sleep "$WAIT_SECONDS"
  assert_process_alive wifi-disabled
  "${ADB[@]}" shell svc wifi enable >/dev/null 2>&1 || true
  WIFI_DISABLED=0
  wait_for_usable_ui wifi-restored
else
  echo "Wi-Fi control unavailable on this device; skipped network toggle" \
    | tee "$ARTIFACT_DIR/network-skip.txt"
fi

capture_state
assert_no_fatal_errors
trap - EXIT
echo "Android recovery verification passed. Raw artifacts: $ARTIFACT_DIR"
