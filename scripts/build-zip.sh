#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="page-to-md-pro.zip"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  src/ \
  lib/ \
  -x "*.DS_Store"

zip "$OUT" \
  assets/icon16.png \
  assets/icon32.png \
  assets/icon48.png \
  assets/icon128.png \
  -x "*.DS_Store"

echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
