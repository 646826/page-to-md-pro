#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="page-to-md-pro.zip"
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  src/ \
  lib/ \
  assets/ \
  -x "*.DS_Store"

echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
