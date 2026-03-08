#!/usr/bin/env bash
set -euo pipefail

: "${CWS_ACCESS_TOKEN:?CWS_ACCESS_TOKEN is required}"
: "${CWS_PUBLISHER_ID:?CWS_PUBLISHER_ID is required}"
: "${CWS_EXTENSION_ID:?CWS_EXTENSION_ID is required}"

PACKAGE_FILE="${1:-page-to-md-pro.zip}"
PUBLISH_TYPE="${CWS_PUBLISH_TYPE:-UPLOAD_ONLY}"
SKIP_REVIEW="${CWS_SKIP_REVIEW:-false}"

if [[ ! -f "$PACKAGE_FILE" ]]; then
  echo "Package file not found: $PACKAGE_FILE" >&2
  exit 1
fi

item_name="publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}"
auth_header="Authorization: Bearer ${CWS_ACCESS_TOKEN}"
upload_url="https://chromewebstore.googleapis.com/upload/v2/${item_name}:upload"
status_url="https://chromewebstore.googleapis.com/v2/${item_name}:fetchStatus"
publish_url="https://chromewebstore.googleapis.com/v2/${item_name}:publish"

json_read() {
  node -e '
const fs = require("node:fs");
const path = process.argv[1];
const data = JSON.parse(fs.readFileSync(0, "utf8"));
let current = data;
for (const segment of path.split(".")) {
  current = current?.[segment];
}
if (current === undefined || current === null) {
  process.exit(1);
}
process.stdout.write(String(current));
' "$1"
}

echo "Uploading ${PACKAGE_FILE} to ${item_name}"
upload_response="$(curl --fail-with-body --silent --show-error \
  -H "${auth_header}" \
  -X POST \
  -T "${PACKAGE_FILE}" \
  "${upload_url}")"
printf '%s\n' "${upload_response}"

upload_state="$(printf '%s' "${upload_response}" | json_read 'uploadState' || true)"

if [[ "${upload_state}" == "IN_PROGRESS" ]]; then
  echo "Upload is processing asynchronously. Polling status..."
  for attempt in $(seq 1 30); do
    sleep 2
    status_response="$(curl --fail-with-body --silent --show-error \
      -H "${auth_header}" \
      -X GET \
      "${status_url}")"
    printf '%s\n' "${status_response}"

    upload_state="$(printf '%s' "${status_response}" | json_read 'lastAsyncUploadState' || true)"
    if [[ "${upload_state}" == "SUCCEEDED" ]]; then
      break
    fi
    if [[ "${upload_state}" == "FAILED" ]]; then
      echo "Upload failed while processing asynchronously." >&2
      exit 1
    fi
  done
fi

if [[ "${upload_state}" != "SUCCEEDED" ]]; then
  echo "Unexpected upload state: ${upload_state:-<empty>}" >&2
  exit 1
fi

echo "Upload finished successfully."

if [[ "${PUBLISH_TYPE}" == "UPLOAD_ONLY" ]]; then
  echo "Skipping publish step."
  exit 0
fi

request_body="$(node -e '
const publishType = process.argv[1];
const skipReview = process.argv[2] === "true";
process.stdout.write(JSON.stringify({ publishType, skipReview }));
' "${PUBLISH_TYPE}" "${SKIP_REVIEW}")"

echo "Submitting item with publishType=${PUBLISH_TYPE} skipReview=${SKIP_REVIEW}"
publish_response="$(curl --fail-with-body --silent --show-error \
  -H "${auth_header}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "${request_body}" \
  "${publish_url}")"
printf '%s\n' "${publish_response}"

publish_state="$(printf '%s' "${publish_response}" | json_read 'state' || true)"
if [[ -z "${publish_state}" ]]; then
  echo "Publish response did not contain a state." >&2
  exit 1
fi

echo "Submission state: ${publish_state}"
