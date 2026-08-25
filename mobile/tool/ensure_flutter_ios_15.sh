#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h:h}"
FLUTTER_ROOT="${PROJECT_ROOT}/.tools/flutter-sdk/flutter"
DARWIN_CONFIG="${FLUTTER_ROOT}/packages/flutter_tools/lib/src/darwin/darwin.dart"
FLUTTER_TOOLS_PUBSPEC="${FLUTTER_ROOT}/packages/flutter_tools/pubspec.yaml"

if [[ ! -f "${DARWIN_CONFIG}" ]]; then
  print -u2 "Không tìm thấy Flutter SDK cục bộ: ${DARWIN_CONFIG}"
  exit 1
fi

if grep -q "ios => Version(13, 0, null)" "${DARWIN_CONFIG}"; then
  perl -0pi -e 's/ios => Version\(13, 0, null\)/ios => Version(15, 0, null)/' "${DARWIN_CONFIG}"
  touch "${FLUTTER_TOOLS_PUBSPEC}"
  print "Đã đặt Swift Package mặc định của Flutter thành iOS 15."
elif grep -q "ios => Version(15, 0, null)" "${DARWIN_CONFIG}"; then
  print "Flutter SDK đã dùng iOS 15."
else
  print -u2 "Flutter SDK đã thay đổi cấu trúc; không tự động vá để tránh sửa sai."
  exit 1
fi

print "Tiếp theo chạy: ../.tools/flutter-sdk/flutter/bin/flutter pub get"
print "Sau đó chạy: ../.tools/flutter-sdk/flutter/bin/flutter build ios --config-only --dart-define-from-file=config.json"
