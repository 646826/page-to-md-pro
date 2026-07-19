#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/page-to-md-pro.zip"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/page-to-md-pro.XXXXXX")"
trap 'rm -rf "${STAGE}"' EXIT
export TZ=UTC

FILES=(
  LICENSE
  THIRD_PARTY_NOTICES.md
  assets/icon128.png
  assets/icon16.png
  assets/icon32.png
  assets/icon48.png
  lib/Readability.js
  licenses/Apache-2.0.txt
  manifest.json
  src/background.js
  src/content.js
  src/offscreen.html
  src/offscreen.js
  src/options.css
  src/options.html
  src/options.js
  src/shared.js
  src/storage.js
)

for file in "${FILES[@]}"; do
  mkdir -p "${STAGE}/$(dirname "${file}")"
  cp "${ROOT}/${file}" "${STAGE}/${file}"
  chmod 0644 "${STAGE}/${file}"
  touch -t 198001010000 "${STAGE}/${file}"
done

rm -f "${OUT}"
(
  cd "${STAGE}"
  LC_ALL=C printf '%s\n' "${FILES[@]}" | sort | zip -X -q "${OUT}" -@
)

echo "Created page-to-md-pro.zip ($(du -h "${OUT}" | cut -f1))"
