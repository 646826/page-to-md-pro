# Chrome Web Store Pipeline

The repository has two complementary workflows:

1. **CI** runs on every push and pull request, tests the extractor, builds the ZIP, validates its file allowlist, and stores it as a temporary artifact.
2. **Chrome Web Store Release** runs on `main` and by manual dispatch.

## Normal `main` behavior

The normal release mode implements cautious option B delivery:

1. Read the version from `manifest.json`.
2. Check for tag `v<version>`.
3. Skip automatically when the tag already exists.
4. Run the full Node and Playwright verification suite.
5. Build and validate `page-to-md-pro.zip`.
6. Authenticate with the Chrome Web Store API.
7. Upload with `CWS_PUBLISH_TYPE=UPLOAD_ONLY` and `CWS_SKIP_REVIEW=false`.
8. Create the GitHub tag and Release only after upload success.

`UPLOAD_ONLY` never calls the publish endpoint. It leaves submission and publication decisions in the Developer Dashboard.

## Manual dispatch

Manual dispatch retains three modes:

- `UPLOAD_ONLY` — upload without submission;
- `STAGED_PUBLISH` — submit and wait for manual publication after approval;
- `DEFAULT_PUBLISH` — submit for publication under the store's configured behavior.

A manual run may re-upload an existing version when the store allows it. Manual dispatch never creates a GitHub tag or Release; official releases are created only by the verified `main` push path.

## Initial item setup

The workflow updates an existing Chrome Web Store item. Create the first item, listing, privacy disclosure, distribution settings, and extension ID manually in the Developer Dashboard before using automation.

## Authentication

The `chrome-web-store` GitHub environment supports:

### Preferred: Workload Identity Federation

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

### Fallback: service account key

- `GOOGLE_CREDENTIALS`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

Treat key JSON as a password. Prefer short-lived Workload Identity Federation credentials.

## Operational safeguards

- Protect the `chrome-web-store` environment with required reviewers when appropriate.
- Never change permissions, privacy claims, and release mode in the same unreviewed change.
- Keep `main` version changes intentional: an absent tag triggers upload automation.
- Do not create the GitHub Release before store upload success.
- For a failed upload, fix the exact failure and rerun; do not create a tag manually unless the store state is understood.
- Use a separate item for beta distribution rather than reusing production visibility.

## Relevant files

- [CI workflow](../.github/workflows/ci.yml)
- [Release workflow](../.github/workflows/chrome-web-store-release.yml)
- [Chrome Web Store uploader](../scripts/cws-release.sh)
- [Package validator](../scripts/validate-package.mjs)
- [Release checklist](./release-checklist.md)
