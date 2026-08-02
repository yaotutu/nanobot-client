# docs/

Documentation and committed verification evidence for `nanobot-client`.

## Layout

- `android-release.md` — Android Release APK 打包、GitHub Release 发布、缓存和清理说明。
- `verification/` — sanitized device acceptance evidence (screenshots, acceptance notes). Each subdirectory is one run, named `<kind>-<date>` (e.g. `acceptance-2026-08-01-lan/`, `release-build-2026-08-01/`).

## Local-only artifacts

Raw logs, pre-sanitization screenshots, and `adb logcat` captures do **not** belong here. They live under `.local/verification-raw/` and are gitignored. Sanitize before promoting anything into `verification/`.
